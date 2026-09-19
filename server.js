// ArchVision AI: turn a client's house requirements (or an uploaded floor plan, or a
// plain-language change request) into a structured layout, which the browser renders
// as an interactive 3D house with Three.js. Uses Google Gemini (free tier) for every
// AI step; cost estimation and layout validation are deliberately plain, deterministic
// code — not AI — so the numbers and geometry stay explainable and reliable.
//
// IMPORTANT: this is a design-assistance / visualization tool, not a replacement for a
// licensed architect or structural engineer. Nothing it produces is construction-ready.

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { estimateCost, estimateDetailedCost } = require('./costEstimator');
const { generateHouseDesign } = require('./designGenerator');
const { buildFloorPlans } = require('./floorPlan2D');
const { sanitizeIntent, applyIntent, interpretIntentHeuristically, buildIntentPrompt } = require('./designModifier');
const store = require('./store');
const { issueToken, verifyToken } = require('./authTokens');

const app = express();
const PORT = process.env.PORT || 3000;

// Support several free keys (comma-separated) so we can rotate when one hits its
// daily limit — that multiplies the free quota at zero cost.
const GEMINI_KEYS = (process.env.GEMINI_API_KEY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const GEMINI_API_KEY = GEMINI_KEYS[0] || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// "Get a Builder Quote" emails — either provider works, whichever key is set
// (Resend checked first). Neither configured just means inquiries still save
// (see /api/inquiries) but no email goes out — same graceful-degradation
// story as the Gemini key above.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const EMAIL_CONFIGURED = !!(RESEND_API_KEY || BREVO_API_KEY);
const BUILDER_EMAIL = process.env.BUILDER_EMAIL || 'abhiparepalli@gmail.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'ArchVision AI <onboarding@resend.dev>';

// The React client (client/) runs on Vite's own dev server (port 5173) during
// development, separate from this API's port — so those requests are cross-origin.
// In production the built client is served by this same Express app, so this is a
// no-op there. No third-party cors package needed for one static allowed origin.
const DEV_CLIENT_ORIGIN = 'http://localhost:5173';
app.use((req, res, next) => {
  if (req.headers.origin === DEV_CLIENT_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', DEV_CLIENT_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Memory storage only (never written to disk) and capped at one 15MB file. The
// `accept` attribute on the client's <input> is a UX hint, not a security
// boundary — anyone can POST any bytes here directly, so the real filter has to
// live server-side: reject anything that isn't an image or PDF before it's ever
// held in memory or sent to the Gemini API (which costs real quota per call).
const ALLOWED_UPLOAD_TYPES = /^image\/(png|jpe?g|webp|gif)$|^application\/pdf$/;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_UPLOAD_TYPES.test(file.mimetype)) {
      return cb(Object.assign(new Error('Only image (PNG/JPG/WEBP/GIF) or PDF files are accepted.'), { status: 415 }));
    }
    cb(null, true);
  },
});

// Minimal per-IP throttle for the routes that call the Gemini API — these cost
// real quota per request, unlike the deterministic rule-based routes. Deliberately
// simple (in-memory, fixed window, no external dependency) rather than a full
// rate-limiting library: good enough to blunt accidental hammering (e.g. a
// retry loop) or casual abuse on a single-instance deployment; a multi-instance
// deployment would need a shared store instead, which is a reasonable future
// improvement rather than something this app currently needs.
const AI_RATE_LIMIT = { windowMs: 60_000, max: 12 };
const aiRequestLog = new Map(); // ip -> timestamps[]
function aiRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const hits = (aiRequestLog.get(ip) || []).filter((t) => now - t < AI_RATE_LIMIT.windowMs);
  if (hits.length >= AI_RATE_LIMIT.max) {
    return res.status(429).json({ error: 'Too many AI requests — please wait a minute and try again.' });
  }
  hits.push(now);
  aiRequestLog.set(ip, hits);
  next();
}

// Small server-side copy of the vocab client/src/data/builders.js defines,
// so a builder profile submission can be validated without trusting
// whatever the client sends — same "duplicate a tiny constant list for
// server-side validation" pattern already used for ROOM_TYPES etc.
const SPECIALIZATIONS = ['Modern', 'Traditional', 'Contemporary', 'Farmhouse', 'Compact urban'];
const SERVICE_LOCATIONS = ['Hyderabad', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi NCR', 'Kochi', 'Coimbatore'];

// Email-OTP login. requireAuth 401s when there's no valid session; the
// separate getOptionalAccount(req) (used only by the inquiry/message routes)
// returns null instead, since those routes must keep working for a
// logged-out visitor holding a demo-builder token link.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Please log in to continue.' });
  req.account = payload;
  next();
}

function getOptionalAccount(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return verifyToken(token);
}

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true, configured: !!GEMINI_API_KEY, model: GEMINI_MODEL, storage: store.storageMode(),
    emailConfigured: EMAIL_CONFIGURED,
  })
);

const ROOM_TYPES = [
  'living', 'bedroom', 'kitchen', 'bathroom', 'dining',
  'garage', 'hallway', 'balcony', 'study', 'utility', 'other',
];
const WALL_SIDES = ['north', 'south', 'east', 'west'];

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildJsonShape(floorCount) {
  return (
    `Respond with STRICT JSON only (no markdown, no code fences) in this exact shape:\n` +
    `{\n` +
    `  "title": "short project title",\n` +
    `  "summary": "1-2 sentence design summary",\n` +
    `  "widthMeters": number,\n` +
    `  "depthMeters": number,\n` +
    `  "floors": [\n` +
    `    {\n` +
    `      "level": 0,\n` +
    `      "rooms": [\n` +
    `        { "name": "Living Room", "type": "one of: ${ROOM_TYPES.join('|')}", "x": number, "y": number, "width": number, "depth": number }\n` +
    `      ]\n` +
    `    }\n` +
    `  ],\n` +
    `  "doors": [\n` +
    `    { "floor": 0, "room": "Living Room", "wall": "one of: ${WALL_SIDES.join('|')}", "offset": number, "width": number }\n` +
    `  ],\n` +
    `  "windows": [ { "floor": 0, "room": "Living Room", "wall": "north", "offset": number, "width": number } ],\n` +
    `  "stairs": [ { "fromFloor": 0, "x": number, "y": number, "width": number, "depth": number } ]\n` +
    `}\n` +
    `Rules:\n` +
    `- x/y/width/depth/widthMeters/depthMeters are all in meters. x,y is a room's top-left corner ` +
    `measured from the top-left of the building footprint (a top-down plan view).\n` +
    `- Rooms on each floor must tile that floor's footprint like a real plan — adjoining, sharing ` +
    `walls, no large gaps, no rooms outside the footprint. Use realistic room sizes (a bedroom is ` +
    `roughly 3-4m per side, a bathroom 2-3m, etc). Include 3-10 rooms per floor.\n` +
    `- "wall" + "offset" for a door/window means: measured from that room's top-left corner, moving ` +
    `left-to-right along the north/south wall or top-to-bottom along the east/west wall.\n` +
    `- Include at least 2-4 doors connecting rooms (or a room to the exterior), and at least one ` +
    `window on an exterior wall for every bedroom, living room, and kitchen.\n` +
    `- A door to the exterior needs only one entry. A doorway between two adjoining rooms needs TWO ` +
    `entries — one for each room, both at the exact same shared-wall location (matching offset/width) ` +
    `— otherwise only one side of the wall will open.\n` +
    `- You must output exactly ${floorCount} entries in "floors" (level 0 to ${floorCount - 1}).` +
    (floorCount > 1
      ? ` Only include "stairs" entries when floors > 1 — place each one inside a room (e.g. a hallway) ` +
        `that exists at the same x/y/width/depth on both the fromFloor and the floor above it, so the ` +
        `staircase lines up between floors.`
      : ` Omit "stairs" (leave it as an empty array) since there is only one floor.`)
  );
}

function buildImagePrompt() {
  return (
    `You are an expert architect reading a 2D floor plan image (a sketch, blueprint, scanned drawing, ` +
    `or CAD export). Identify every distinct room/space and its approximate position and size, every ` +
    `door and window and which room and wall they belong to, any staircase, and use any printed ` +
    `dimensions or room labels in the image to calibrate real-world scale and names. Reconstruct the ` +
    `overall footprint as a single-floor, top-down plan (assume floor 0 only).\n\n` +
    buildJsonShape(1) +
    `\nIf the image is not a floor plan / has no readable layout, return {"error":"no_content"}.`
  );
}

function buildRequirementsPrompt(reqs) {
  const bits = [];
  if (reqs.plotAreaSqm) bits.push(`Plot size: about ${reqs.plotAreaSqm} sqm`);
  if (reqs.budget) bits.push(`Target construction budget: about ₹${Number(reqs.budget).toLocaleString('en-IN')}`);
  if (reqs.bedrooms) bits.push(`Bedrooms: ${reqs.bedrooms}`);
  if (reqs.bathrooms) bits.push(`Bathrooms: ${reqs.bathrooms}`);
  const floors = Math.min(Math.max(parseInt(reqs.floors, 10) || 1, 1), 3);
  bits.push(`Number of floors: ${floors}`);
  if (reqs.parking) bits.push(`Needs covered parking for at least one car`);
  if (reqs.kitchenType) bits.push(`Kitchen preference: ${reqs.kitchenType}`);
  if (reqs.livingRoomSize) bits.push(`Living room size preference: ${reqs.livingRoomSize}`);
  if (reqs.garden) bits.push(`Wants a garden / open outdoor space`);
  if (reqs.style) bits.push(`Architectural style preference: ${reqs.style}`);
  if (reqs.notes) bits.push(`Additional notes from the client: "${reqs.notes}"`);

  return (
    `You are an expert residential architect designing a ${floors}-storey house from a client's ` +
    `requirements.\n\n${bits.join('\n')}\n\n` +
    `Design a sensible, buildable layout that satisfies these requirements as closely as possible. ` +
    (floors > 1
      ? `Distribute rooms sensibly across all ${floors} floors (e.g. living room, kitchen, and parking ` +
        `on the ground floor; bedrooms upstairs) and connect the floors with a stairs entry. `
      : '') +
    `If a budget was given, keep the total built-up area realistic for that budget — prefer a smaller, ` +
    `well-designed home over an oversized one that would blow the budget.\n\n` +
    buildJsonShape(floors)
  );
}

function buildTextPrompt({ description, bedrooms, areaSqm, style }) {
  const bits = [];
  if (description) bits.push(`Client brief: "${description}"`);
  if (bedrooms) bits.push(`Target bedroom count: ${bedrooms}`);
  if (areaSqm) bits.push(`Target total floor area: about ${areaSqm} sqm`);
  if (style) bits.push(`Architectural style preference: ${style}`);
  return (
    `You are an expert residential architect designing a single-storey house floor plan from a ` +
    `client's brief.\n\n${bits.join('\n')}\n\n` +
    `Design a sensible, buildable single-floor layout that satisfies the brief as closely as ` +
    `possible.\n\n` +
    buildJsonShape(1)
  );
}

function buildModifyPrompt(currentLayout, instruction) {
  const floorCount = Array.isArray(currentLayout.floors) ? currentLayout.floors.length : 1;
  return (
    `You are an expert architect revising an existing house design based on client feedback.\n\n` +
    `Current design (JSON):\n${JSON.stringify(currentLayout)}\n\n` +
    `Client's requested change: "${instruction}"\n\n` +
    `Apply this change, keeping everything else about the design as close to the original as ` +
    `possible (same overall style, same room count and positions where they aren't affected). If the ` +
    `change requires resizing or shifting other rooms to keep the plan realistic (no overlaps, no ` +
    `gaps, walls still line up), make the minimal adjustments needed. Return the FULL updated design, ` +
    `not just the changed part.\n\n` +
    buildJsonShape(floorCount)
  );
}

function withAvoidance(promptText, avoidList) {
  if (!avoidList || !avoidList.length) return promptText;
  return (
    promptText +
    `\n\nThe client has already seen these designs and specifically wants something noticeably ` +
    `different this time:\n` +
    avoidList.map((s) => `- ${s}`).join('\n') +
    `\nProduce a meaningfully different room arrangement (and optionally footprint), not a minor tweak.`
  );
}

// ---------------------------------------------------------------------------
// Gemini call plumbing (unchanged pattern: key rotation + model fallback)
// ---------------------------------------------------------------------------

function parseLayout(text) {
  if (!text) throw new Error('Empty response from model.');
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON.');
  return JSON.parse(s.slice(start, end + 1));
}

const MODEL_CHAIN = [
  GEMINI_MODEL,
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
].filter((m, i, a) => m && a.indexOf(m) === i);

async function generateLayout(prompt, file) {
  let lastErr;
  for (const key of GEMINI_KEYS) {
    for (const model of MODEL_CHAIN) {
      try {
        return await generateWithModel(model, key, prompt, file);
      } catch (e) {
        lastErr = e;
        if (e.code !== 'AI_LIMIT') throw e;
      }
    }
  }
  throw lastErr;
}

async function generateWithModel(model, key, prompt, file) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts = [{ text: prompt }];
  if (file) {
    parts.push({
      inline_data: { mime_type: file.mimetype || 'image/jpeg', data: file.buffer.toString('base64') },
    });
  }
  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message || `Gemini failed (${r.status})`;
    if (
      r.status === 429 ||
      r.status === 503 ||
      /quota|rate limit|resource has been exhausted|high demand|overloaded|unavailable/i.test(msg)
    ) {
      const e = new Error('The free AI is busy or its daily limit was reached. Please try again in a minute.');
      e.code = 'AI_LIMIT';
      throw e;
    }
    throw new Error(msg);
  }
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return parseLayout(text);
}

// ---------------------------------------------------------------------------
// Email — "Get a Builder Quote" (see /api/inquiries below). Same "raw fetch,
// no SDK" approach as the Gemini calls above. Whichever provider key is set
// is used (Resend checked first); if neither is set this just resolves
// { sent: false } rather than throwing, so the inquiry still saves either way.
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function sendEmail({ to, subject, html }) {
  if (RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      console.error('Resend send failed:', data?.message || r.status);
      return { sent: false };
    }
    return { sent: true };
  }
  if (BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
      body: JSON.stringify({
        sender: { email: EMAIL_FROM.replace(/^.*<(.+)>$/, '$1'), name: 'ArchVision AI' },
        to: [{ email: to }],
        subject, htmlContent: html,
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      console.error('Brevo send failed:', data?.message || r.status);
      return { sent: false };
    }
    return { sent: true };
  }
  return { sent: false };
}

// ---------------------------------------------------------------------------
// Layout sanitization — plain code, not AI. The AI's JSON is untrusted input:
// validate/clamp everything before it reaches the 3D engine or gets stored.
// ---------------------------------------------------------------------------

function sanitizeRoomList(rooms) {
  return (Array.isArray(rooms) ? rooms : [])
    .filter((r) => r && r.width > 0 && r.depth > 0)
    .map((r) => ({
      name: String(r.name || 'Room').slice(0, 40),
      type: ROOM_TYPES.includes(r.type) ? r.type : 'other',
      x: Number(r.x) || 0,
      y: Number(r.y) || 0,
      width: Math.max(1, Number(r.width) || 3),
      depth: Math.max(1, Number(r.depth) || 3),
    }));
}

function sanitizeOpenings(list, floors) {
  return (Array.isArray(list) ? list : [])
    .map((o) => {
      const floor = Math.max(0, Math.min(Number(o.floor) || 0, floors.length - 1));
      const roomsOnFloor = floors[floor]?.rooms || [];
      const room = roomsOnFloor.find((r) => r.name === o.room) || roomsOnFloor[0];
      if (!room) return null;
      const wall = WALL_SIDES.includes(o.wall) ? o.wall : 'south';
      const span = wall === 'north' || wall === 'south' ? room.width : room.depth;
      const width = Math.min(Math.max(0.6, Number(o.width) || 0.9), span);
      const offset = Math.min(Math.max(0, Number(o.offset) || 0), Math.max(0, span - width));
      return { floor, room: room.name, wall, offset, width };
    })
    .filter(Boolean);
}

function sanitizeStairs(list, floorCount) {
  if (floorCount < 2) return [];
  return (Array.isArray(list) ? list : [])
    .filter((s) => s && s.width > 0 && s.depth > 0)
    .map((s) => ({
      fromFloor: Math.max(0, Math.min(Number(s.fromFloor) || 0, floorCount - 2)),
      x: Number(s.x) || 0,
      y: Number(s.y) || 0,
      width: Math.max(1, Number(s.width) || 1.2),
      depth: Math.max(1, Number(s.depth) || 3),
    }));
}

function sanitizeLayout(layout, style) {
  if (!layout) {
    throw Object.assign(new Error('The AI did not return a usable layout. Try again.'), { status: 422 });
  }
  const floorsInput = Array.isArray(layout.floors) && layout.floors.length
    ? layout.floors
    : [{ level: 0, rooms: layout.rooms }];

  const floors = floorsInput
    .map((f, i) => ({ level: i, rooms: sanitizeRoomList(f.rooms) }))
    .filter((f) => f.rooms.length);

  if (!floors.length) {
    throw Object.assign(new Error('The AI did not return a usable layout. Try again.'), { status: 422 });
  }

  const allRooms = floors.flatMap((f) => f.rooms);
  const maxX = Math.max(...allRooms.map((r) => r.x + r.width), 1);
  const maxY = Math.max(...allRooms.map((r) => r.y + r.depth), 1);

  return {
    title: String(layout.title || 'AI House Design').slice(0, 80),
    summary: String(layout.summary || '').slice(0, 300),
    widthMeters: Math.max(Number(layout.widthMeters) || maxX, maxX),
    depthMeters: Math.max(Number(layout.depthMeters) || maxY, maxY),
    // Same style field the rule-based generator sets — drives roof shape/wall
    // color in the 3D viewer (see client/src/three/houseModel.js). Not something
    // the AI is asked for or trusted to invent; it's just the client's own
    // requested style, carried through.
    style: String(style || '').slice(0, 40),
    floors,
    rooms: floors[0].rooms, // backward-compatible mirror of the ground floor
    doors: sanitizeOpenings(layout.doors, floors),
    windows: sanitizeOpenings(layout.windows, floors),
    stairs: sanitizeStairs(layout.stairs, floors.length),
  };
}

function parseMaybeJSON(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Rule-based / constraint-based generator: converts structured house requirements
// directly into a fully-dimensioned, non-overlapping floor plan via a geometric
// algorithm (see designGenerator.js) — no AI call, no external dependency, instant
// and deterministic. This is intentionally separate from /api/design below, which
// still uses Gemini for the tasks that genuinely need language/vision understanding
// (reading an uploaded plan image, or a free-text description).
// Standalone construction cost estimator — takes plain numbers/enums directly (no
// design generation involved), so it works as its own quick-estimate tool. Same
// "deterministic, not AI" principle as the rest of the cost/geometry code.
app.post('/api/cost/estimate', (req, res) => {
  try {
    res.json(estimateDetailedCost(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not compute a cost estimate.' });
  }
});

app.post('/api/design/generate', (req, res) => {
  const requirements = req.body || {};
  if (!requirements.plotWidthFt || !requirements.plotDepthFt) {
    return res.status(400).json({ error: 'Provide plotWidthFt and plotDepthFt.' });
  }
  try {
    const design = generateHouseDesign(requirements);
    res.json(design);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Could not generate a design from those requirements.' });
  }
});

// Conversational modification: "make the kitchen bigger", "add one more bedroom",
// "move the staircase", etc. The pipeline is exactly the one the product spec asks
// for — user message -> AI interprets it into a small structured intent -> that
// intent is validated against a closed vocabulary (sanitizeIntent) -> a
// deterministic function turns it into modified requirements (applyIntent) ->
// those requirements go through the SAME generateHouseDesign() used everywhere
// else, which regenerates rooms/doors/windows/stairs and the cost estimate
// together (the 2D plan and 3D model are just this same `layout` re-rendered
// client-side, same as any other new design). The LLM never sees or produces a
// coordinate — see designModifier.js's header comment for the full rationale.
//
// When GEMINI_API_KEY isn't configured (or the call fails/times out), this falls
// back to a small keyword parser (also in designModifier.js) covering the same
// request shapes, so the feature works either way rather than hard-failing.
app.post('/api/design/chat-modify', aiRateLimit, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const requirements = req.body?.requirements || {};
  if (!message) {
    return res.status(400).json({ error: 'Type a request first, e.g. "make the kitchen bigger."' });
  }
  if (!requirements.plotWidthFt || !requirements.plotDepthFt) {
    return res.status(400).json({ error: "Missing the current design's requirements — generate a design first." });
  }

  let intent = null;
  let usedAI = false;
  if (GEMINI_API_KEY) {
    try {
      const raw = await generateLayout(buildIntentPrompt(message, requirements), null);
      intent = sanitizeIntent(raw);
      usedAI = true;
    } catch {
      intent = null; // fall through to the heuristic parser below
    }
  }
  if (!intent) intent = sanitizeIntent(interpretIntentHeuristically(message));

  const { requirements: newRequirements, changed, message: resultMessage } = applyIntent(intent, requirements);

  try {
    const design = generateHouseDesign(newRequirements);
    res.json({
      intent, usedAI, changed, message: resultMessage,
      layout: design, cost: design.estimated_cost, requirements: newRequirements,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Could not apply that change.' });
  }
});

// Converts any structured design (rule-based, or in future AI/upload-derived) into
// a per-floor 2D drawing model — see floorPlan2D.js. Pure geometry, no AI call.
// Runs full validation first and refuses to draw invalid input (overlaps, out-of-
// bounds rooms, bad dimensions) rather than silently rendering a broken plan.
app.post('/api/design/floorplan', (req, res) => {
  const design = req.body?.design;
  if (!design) return res.status(400).json({ error: 'Missing design.' });
  try {
    const floorPlans = buildFloorPlans(design);
    res.json({ floorPlans });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.details });
  }
});

app.post('/api/design', aiRateLimit, upload.single('floorplan'), async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'The design AI is not configured yet — set GEMINI_API_KEY on the server.' });
  }
  const file = req.file || null;
  const requirements = parseMaybeJSON(req.body.requirements, null);
  const avoid = parseMaybeJSON(req.body.avoid, []);
  const description = (req.body.description || '').trim();
  const bedrooms = (req.body.bedrooms || '').trim();
  const areaSqm = (req.body.areaSqm || '').trim();
  const style = (req.body.style || '').trim();

  if (!file && !requirements && !description) {
    return res.status(400).json({ error: 'Upload a floor plan image, or provide your house requirements.' });
  }

  try {
    let prompt;
    if (file) {
      prompt = buildImagePrompt();
    } else if (requirements) {
      prompt = withAvoidance(buildRequirementsPrompt(requirements), avoid);
    } else {
      prompt = withAvoidance(buildTextPrompt({ description, bedrooms, areaSqm, style }), avoid);
    }

    const raw = await generateLayout(prompt, file);
    if (raw.error === 'no_content') {
      return res.status(422).json({ error: "Couldn't read a floor plan in that image — try a clearer photo or scan." });
    }
    const layout = sanitizeLayout(raw, requirements?.style || style);
    const cost = estimateCost(layout, requirements || {});
    res.json({ layout, cost });
  } catch (e) {
    res.status(e.code === 'AI_LIMIT' ? 429 : e.status || 502).json({ error: e.message });
  }
});

app.post('/api/design/modify', aiRateLimit, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'The design AI is not configured yet — set GEMINI_API_KEY on the server.' });
  }
  const layout = req.body.layout;
  const instruction = String(req.body.instruction || '').trim();
  const requirements = req.body.requirements || null;

  if (!layout || !Array.isArray(layout.rooms)) {
    return res.status(400).json({ error: 'Missing the current design to modify.' });
  }
  if (!instruction) {
    return res.status(400).json({ error: 'Describe the change you want, e.g. "make the living room bigger".' });
  }

  try {
    const prompt = buildModifyPrompt(layout, instruction);
    const raw = await generateLayout(prompt, null);
    const newLayout = sanitizeLayout(raw, requirements?.style || layout.style);
    const cost = estimateCost(newLayout, requirements || {});
    res.json({ layout: newLayout, cost });
  } catch (e) {
    res.status(e.code === 'AI_LIMIT' ? 429 : e.status || 502).json({ error: e.message });
  }
});

app.post('/api/designs/save', requireAuth, async (req, res) => {
  const { layout, cost, requirements, parentId, title } = req.body || {};
  if (!layout) {
    return res.status(400).json({ error: 'Missing layout to save.' });
  }
  try {
    const record = await store.saveDesign({ accountId: req.account.accountId, layout, cost, requirements, parentId, title });
    res.json({ design: record });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/designs', requireAuth, async (req, res) => {
  res.json({ designs: await store.listDesignsByAccount(req.account.accountId) });
});

// Scoped by accountId, same as list/delete below — every other design route
// already checks this; without it, anyone who obtains (or guesses) a design id
// could read another account's saved design. Not currently called by the
// frontend (My Designs/Compare use the list endpoint), but it's a live,
// reachable route, so it gets the same access check regardless.
app.get('/api/designs/:id', requireAuth, async (req, res) => {
  const design = await store.getDesign(req.params.id);
  if (!design || design.accountId !== req.account.accountId) return res.status(404).json({ error: 'Design not found.' });
  res.json({ design });
});

app.delete('/api/designs/:id', requireAuth, async (req, res) => {
  const removed = await store.deleteDesign(req.params.id, req.account.accountId);
  if (!removed) return res.status(404).json({ error: 'Design not found.' });
  res.json({ ok: true });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Email-OTP login — the only auth this app has. No passwords, ever: an email
// is verified by proving control of the inbox via a one-time code. Reuses
// sendEmail() below and the same aiRateLimit per-IP throttle already used to
// guard the inquiry routes against real-world abuse (here, inbox-spamming).
// ---------------------------------------------------------------------------

app.post('/api/auth/request-otp', aiRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = req.body?.role === 'builder' ? 'builder' : 'customer';
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(code + email).digest('hex');
  await store.saveOtpCode({ email, role, codeHash, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });

  if (EMAIL_CONFIGURED) {
    await sendEmail({
      to: email,
      subject: `Your ArchVision AI login code: ${code}`,
      html: `<p>Your one-time login code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    }).catch(() => {});
  } else {
    // Dev fallback — same graceful-degradation story as EMAIL_CONFIGURED
    // elsewhere: without an email provider set, the code is logged AND
    // returned in the response so local dev/testing never needs real email.
    console.log(`[dev] OTP for ${email} (${role}): ${code}`);
  }
  res.json({ ok: true, devCode: EMAIL_CONFIGURED ? undefined : code });
});

app.post('/api/auth/verify-otp', aiRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = req.body?.role === 'builder' ? 'builder' : 'customer';
  const code = String(req.body?.code || '').trim();
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid email or code.' });
  }

  const ok = await store.consumeOtpCode({ email, role, code });
  if (!ok) return res.status(401).json({ error: 'Invalid or expired code.' });

  let account = await store.getAccountByEmail(email, role);
  const isNewAccount = !account;
  if (!account) account = await store.saveAccount({ email, role });

  let builderProfile = null;
  if (role === 'builder') builderProfile = await store.getBuilderProfile(account.id);

  const token = issueToken({ accountId: account.id, role: account.role });
  res.json({
    ok: true, token, account, isNewAccount,
    needsBuilderProfile: role === 'builder' && !builderProfile,
    builderProfile,
  });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const account = await store.getAccountById(req.account.accountId);
  if (!account) return res.status(401).json({ error: 'Account no longer exists.' });
  const builderProfile = account.role === 'builder' ? await store.getBuilderProfile(account.id) : null;
  res.json({ ok: true, account, builderProfile });
});

app.post('/api/builder/profile', requireAuth, async (req, res) => {
  if (req.account.role !== 'builder') return res.status(403).json({ error: 'Builder account required.' });
  const { name, specializations, serviceLocations, about, priceRange, yearsExperience } = req.body || {};
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return res.status(400).json({ error: 'Business name is required.' });

  const profile = await store.saveBuilderProfile({
    accountId: req.account.accountId,
    name: trimmedName.slice(0, 80),
    specializations: Array.isArray(specializations) ? specializations.filter((s) => SPECIALIZATIONS.includes(s)) : [],
    serviceLocations: Array.isArray(serviceLocations) ? serviceLocations.filter((l) => SERVICE_LOCATIONS.includes(l)) : [],
    about: String(about || '').slice(0, 600),
    priceRange: Array.isArray(priceRange) && priceRange.length === 2 ? priceRange.map(Number) : null,
    yearsExperience: Number(yearsExperience) || null,
  });
  res.json({ ok: true, builderProfile: profile });
});

// Real signed-up builders — merged client-side with the static demo
// directory (client/src/data/builders.js). Public, no auth: this is the
// same "browsable directory" visibility the demo builders already have.
app.get('/api/builders', async (_req, res) => {
  const builders = await store.listBuilderAccounts();
  res.json({
    builders: builders.map((b) => ({
      id: b.accountId, name: b.name, specializations: b.specializations,
      serviceLocations: b.serviceLocations, about: b.about, priceRange: b.priceRange,
      yearsExperience: b.yearsExperience, source: 'account',
    })),
  });
});

// "Get a Builder Quote": a customer's contact details + a snapshot of the
// design they're looking at. Always saved (see store.saveInquiry) so nothing
// is lost even if email isn't configured yet; best-effort emails both the
// builder (the lead) and the customer (a confirmation) when it is. Behind
// aiRateLimit — not an AI cost here, but it's real-world abuse (spamming a
// builder's inbox) worth the same per-IP guard.
function appOrigin(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

app.post('/api/inquiries', requireAuth, aiRateLimit, async (req, res) => {
  if (req.account.role !== 'customer') return res.status(403).json({ error: 'Customer account required.' });
  const { customerName, customerEmail, customerPhone, location, message, designSummary, builderId, builderName, intent } = req.body || {};
  const name = String(customerName || '').trim();
  const email = String(customerEmail || '').trim();
  if (!name || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A name and a valid email are required.' });
  }

  // builderId may point at a real signed-up builder account (id === accountId)
  // rather than a static demo profile — if so, this inquiry becomes visible
  // on that builder's dashboard via builderAccountId, in addition to the
  // token-link email every inquiry still gets.
  let builderAccountId = null;
  if (builderId) {
    const builderAccount = await store.getAccountById(builderId);
    if (builderAccount && builderAccount.role === 'builder') builderAccountId = builderAccount.id;
  }

  // Generated up front (not left to store.saveInquiry) so the builder's
  // reply-thread link can be embedded in the notification email below —
  // the token is this build's only "builder credential" for that thread,
  // since builders don't have real accounts (see client/src/data/builders.js).
  const id = store.newId();
  const builderToken = crypto.randomBytes(24).toString('hex');

  let emailSent = false;
  if (EMAIL_CONFIGURED) {
    const safeName = escapeHtml(name);
    const safeMessage = message ? escapeHtml(message) : '';
    const summaryLines = designSummary
      ? Object.entries(designSummary).map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`).join('')
      : '';
    // These builder profiles are curated demo data, not real onboarded
    // accounts with their own inboxes yet (see client/src/data/builders.js) —
    // delivery still goes to the one configured BUILDER_EMAIL, but the body
    // says plainly which demo builder the customer meant to reach, so this
    // never quietly pretends to have delivered mail to a real business.
    const builderLine = builderName ? `<p><strong>Intended builder:</strong> ${escapeHtml(builderName)} (demo profile)</p>` : '';
    const intentLine = intent ? `<p><strong>Intent:</strong> ${escapeHtml(intent)}</p>` : '';
    const locationLine = location ? `<strong>Location:</strong> ${escapeHtml(location)}<br/>` : '';
    const replyLink = `${appOrigin(req)}/?view=builder-reply&inquiry=${id}&token=${builderToken}`;

    const builderResult = await sendEmail({
      to: BUILDER_EMAIL,
      subject: `New house-design inquiry from ${name}`,
      html: `
        <h2>New inquiry via ArchVision AI</h2>
        ${builderLine}${intentLine}
        <p><strong>Name:</strong> ${safeName}<br/>
        <strong>Email:</strong> ${escapeHtml(email)}<br/>
        ${locationLine}
        ${customerPhone ? `<strong>Phone:</strong> ${escapeHtml(customerPhone)}<br/>` : ''}</p>
        ${safeMessage ? `<p><strong>Message:</strong><br/>${safeMessage}</p>` : ''}
        ${summaryLines ? `<h3>Design summary</h3><ul>${summaryLines}</ul>` : ''}
        <p><a href="${replyLink}">Reply to ${safeName} in ArchVision AI</a></p>
      `.trim(),
    }).catch(() => ({ sent: false }));

    const customerResult = await sendEmail({
      to: email,
      subject: 'We received your house-design request — ArchVision AI',
      html: `
        <h2>Thanks, ${safeName}!</h2>
        <p>We've received your request${builderName ? ` for ${escapeHtml(builderName)}` : ''} and a builder will reach out to you shortly to discuss your design.</p>
        ${summaryLines ? `<h3>Your design</h3><ul>${summaryLines}</ul>` : ''}
        <p style="color:#666;font-size:13px;">This is an approximate concept-stage design, not a construction-ready plan.</p>
      `.trim(),
    }).catch(() => ({ sent: false }));

    emailSent = builderResult.sent && customerResult.sent;
  }

  try {
    const record = await store.saveInquiry({
      id, accountId: req.account.accountId, customerName: name, customerEmail: email, customerPhone, location, message,
      designSummary, builderId, builderName, builderAccountId, intent, builderToken, emailSent,
    });
    res.json({ ok: true, id: record.id, emailSent });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Two "lightweight identity" credentials: a real logged-in account (customer
// or builder), or the demo builder's unguessable per-inquiry token (emailed
// once, never echoed back by the API, and the ONLY credential a curated demo
// builder — client/src/data/builders.js, no real account — can ever have).
// Exactly one must match or access is refused.
async function authorizeInquiryAccess(inquiryId, { account, token }) {
  const inquiry = await store.getInquiry(inquiryId);
  if (!inquiry) throw Object.assign(new Error('Inquiry not found.'), { status: 404 });
  if (token && inquiry.builderToken && token === inquiry.builderToken) return { inquiry, role: 'builder' };
  if (account?.role === 'customer' && inquiry.accountId && account.accountId === inquiry.accountId) return { inquiry, role: 'customer' };
  if (account?.role === 'builder' && inquiry.builderAccountId && account.accountId === inquiry.builderAccountId) return { inquiry, role: 'builder' };
  throw Object.assign(new Error('Not authorized to view this inquiry.'), { status: 403 });
}

function sanitizeInquiry(inquiry) {
  const { builderToken, ...safe } = inquiry;
  return safe;
}

// A customer's own inquiries, for the "My Enquiries" list page.
app.get('/api/inquiries', requireAuth, async (req, res) => {
  const inquiries = await store.listInquiriesByAccount(req.account.accountId);
  res.json({ ok: true, inquiries: inquiries.map(sanitizeInquiry) });
});

// A builder's own inquiries, for their dashboard.
app.get('/api/builder/inquiries', requireAuth, async (req, res) => {
  if (req.account.role !== 'builder') return res.status(403).json({ error: 'Builder account required.' });
  const inquiries = await store.listInquiriesForBuilderAccount(req.account.accountId);
  res.json({ ok: true, inquiries: inquiries.map(sanitizeInquiry) });
});

// Single inquiry, for context on the builder-reply page or a customer's thread view.
app.get('/api/inquiries/:id', async (req, res) => {
  try {
    const { inquiry, role } = await authorizeInquiryAccess(req.params.id, { account: getOptionalAccount(req), token: req.query.token });
    res.json({ ok: true, inquiry: sanitizeInquiry(inquiry), viewerRole: role });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/inquiries/:id/messages', async (req, res) => {
  try {
    const { role } = await authorizeInquiryAccess(req.params.id, { account: getOptionalAccount(req), token: req.query.token });
    const messages = await store.listMessages(req.params.id);
    res.json({ ok: true, messages, viewerRole: role });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Behind aiRateLimit — same real-world-abuse reuse as /api/inquiries above.
app.post('/api/inquiries/:id/messages', aiRateLimit, async (req, res) => {
  const { token, body } = req.body || {};
  const text = String(body || '').trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > 4000) return res.status(400).json({ error: 'Message is too long.' });

  try {
    const { inquiry, role } = await authorizeInquiryAccess(req.params.id, { account: getOptionalAccount(req), token });
    const senderName = role === 'builder' ? (inquiry.builderName || 'Builder') : inquiry.customerName;
    const record = await store.saveMessage({ inquiryId: inquiry.id, senderRole: role, senderName, body: text });

    if (EMAIL_CONFIGURED) {
      const origin = appOrigin(req);
      if (role === 'customer') {
        const link = `${origin}/?view=builder-reply&inquiry=${inquiry.id}&token=${inquiry.builderToken}`;
        sendEmail({
          to: BUILDER_EMAIL,
          subject: `New reply from ${senderName} — ArchVision AI`,
          html: `<p><strong>${escapeHtml(senderName)}</strong> replied:</p><p>${escapeHtml(text)}</p><p><a href="${link}">Open the conversation</a></p>`,
        }).catch(() => {});
      } else {
        const link = `${origin}/?view=my-enquiry&inquiry=${inquiry.id}`;
        sendEmail({
          to: inquiry.customerEmail,
          subject: `New reply${inquiry.builderName ? ` from ${inquiry.builderName}` : ''} — ArchVision AI`,
          html: `<p><strong>${escapeHtml(senderName)}</strong> replied:</p><p>${escapeHtml(text)}</p><p><a href="${link}">Open the conversation</a></p>`,
        }).catch(() => {});
      }
    }

    res.json({ ok: true, message: record });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Catches multer's fileFilter/size-limit rejections (and any other error passed
// to next()) as JSON — without this, Express's default handler would return an
// HTML stack-trace page, which the frontend's asJson() can't parse.
app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

store.init().then(() => {
  app.listen(PORT, () => console.log(`ArchVision AI running on http://localhost:${PORT}`));
});
