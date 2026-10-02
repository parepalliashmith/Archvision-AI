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
const EMAIL_FROM = process.env.EMAIL_FROM || 'BuildBridge AI <onboarding@resend.dev>';

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

// Resolves the signed session token to req.account (or null). The token carries the account's
// session version, so changing/resetting a password signs out every older session.
app.use(async (req, _res, next) => {
  req.account = null;
  const header = req.headers.authorization || '';
  const payload = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : null);
  if (payload) {
    try {
      const sec = await store.getAccountSecrets(payload.accountId);
      if (sec && (sec.sessionVersion || 0) === (payload.sv || 0)) req.account = payload;
    } catch { /* treated as logged out */ }
  }
  next();
});
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
const AVAILABILITY = ['available', 'busy', 'booked'];
const BUILDER_SERVICES = ['Full construction', 'Civil engineering', 'Interior work', 'Renovation', 'Structural design', 'Project management'];
const SERVICE_LOCATIONS = ['Hyderabad', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi NCR', 'Kochi', 'Coimbatore'];

// Email-OTP login. requireAuth 401s when there's no valid session; the
// separate getOptionalAccount(req) (used only by the inquiry/message routes)
// returns null instead, since those routes must keep working for a
// logged-out visitor holding a demo-builder token link.
function requireAuth(req, res, next) {
  if (!req.account) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

function getOptionalAccount(req) {
  return req.account || null;
}

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true, configured: !!GEMINI_API_KEY, model: GEMINI_MODEL, storage: store.storageMode(),
    emailConfigured: EMAIL_CONFIGURED, smsConfigured: SMS_CONFIGURED,
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
        sender: { email: EMAIL_FROM.replace(/^.*<(.+)>$/, '$1'), name: 'BuildBridge AI' },
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

// Normalizes a phone number to E.164 (+<country><number>): a bare 10-digit number
// is assumed Indian (+91), and "0"/"91" prefixes are handled. Returns null if it
// doesn't look like a real number — accounts only ever store the normalized form.
function normalizePhone(raw) {
  let v = String(raw || '').trim().replace(/[\s().-]/g, '');
  if (!v) return null;
  if (v.startsWith('00')) v = '+' + v.slice(2);
  if (!v.startsWith('+')) {
    if (/^0\d{10}$/.test(v)) v = v.slice(1);
    if (/^\d{10}$/.test(v)) v = '+91' + v;
    else if (/^91\d{10}$/.test(v)) v = '+' + v;
    else return null;
  }
  return /^\+\d{10,15}$/.test(v) ? v : null;
}

// Where a builder's notifications go: a real signed-up builder's own inbox,
// otherwise the single configured BUILDER_EMAIL used for the demo directory.
async function builderInbox(builderAccountId) {
  if (builderAccountId) {
    const acc = await store.getAccountById(builderAccountId);
    if (acc?.email) return acc.email;
  }
  return BUILDER_EMAIL;
}

// ---------------------------------------------------------------------------
// Accounts: email + password, with email-code verification, password reset, phone-code
// verification and (for builders) document verification reviewed by an admin.
// Passwords are hashed with scrypt; five wrong passwords lock the account for 15 minutes;
// changing a password invalidates every older session (see the session middleware above).
// ---------------------------------------------------------------------------

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';
const SMS_CONFIGURED = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const scryptAsync = require('util').promisify(crypto.scrypt);

async function sendSms(to, text) {
  if (!SMS_CONFIGURED) return { sent: false };
  const body = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: text });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { sent: r.ok };
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
async function checkPassword(pw, stored) {
  if (!stored || !String(stored).startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
let DUMMY_HASH = null; // compared against when the account does not exist, so timing does not reveal it
hashPassword('not-a-real-password-0').then((h) => { DUMMY_HASH = h; });
function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (p.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Password needs at least one letter and one number.';
  return null;
}

// Separate, more generous per-IP limit for the auth routes (a person signing up makes several calls).
const AUTH_RATE = { windowMs: 60_000, max: Number(process.env.AUTH_RATE_MAX) || 40 };
const authLog = new Map();
function authRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const hits = (authLog.get(ip) || []).filter((t) => now - t < AUTH_RATE.windowMs);
  if (hits.length >= AUTH_RATE.max) return res.status(429).json({ error: 'Too many attempts — please wait a minute and try again.' });
  hits.push(now); authLog.set(ip, hits);
  next();
}

// One-time codes, keyed by purpose so a code for one use can never serve another. Five wrong guesses
// burn the code.
const codeFails = new Map();
async function issueCode(purpose, subject, role) {
  const key = `${purpose}:${subject}`;
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(code + key).digest('hex');
  await store.saveOtpCode({ email: key, role, codeHash, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
  codeFails.delete(key);
  return code;
}
async function checkCode(purpose, subject, role, code) {
  const key = `${purpose}:${subject}`;
  const fails = codeFails.get(key) || 0;
  if (fails >= 5) return false;
  const ok = await store.consumeOtpCode({ email: key, role, code: String(code || '').trim() });
  if (ok) codeFails.delete(key); else codeFails.set(key, fails + 1);
  return ok;
}

function roleFrom(raw, email) {
  if (raw === 'builder') return 'builder';
  if (raw === 'admin') return ADMIN_EMAILS.includes(email) ? 'admin' : null;
  return 'customer';
}

async function sessionFor(account) {
  const sec = await store.getAccountSecrets(account.id);
  const token = issueToken({ accountId: account.id, role: account.role, sv: sec?.sessionVersion || 0 });
  const builderProfile = account.role === 'builder' ? await store.getBuilderProfile(account.id) : null;
  return { ok: true, token, account, builderProfile, needsBuilderProfile: account.role === 'builder' && !builderProfile };
}

async function mailCode(to, subject, intro, code) {
  if (EMAIL_CONFIGURED) {
    await sendEmail({
      to, subject,
      html: `<p>${intro}</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
    }).catch(() => {});
  } else {
    console.log(`[dev] ${subject}: ${code}`);
  }
}

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const role = roleFrom(b.role, email);
  if (!role) return res.status(403).json({ error: 'That email is not authorized for staff access.' });
  const name = String(b.name || '').trim();
  const location = String(b.location || '').trim();
  const phone = normalizePhone(b.phone);
  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!phone) return res.status(400).json({ error: 'Enter a valid phone number (10 digits, or with country code).' });
  if (location.length < 2) return res.status(400).json({ error: 'Enter your location.' });
  const pwProblem = passwordProblem(b.password);
  if (pwProblem) return res.status(400).json({ error: pwProblem });
  let company = null; let yearsExperience = null;
  if (role === 'builder') {
    company = String(b.company || '').trim().slice(0, 80);
    if (company.length < 2) return res.status(400).json({ error: 'Enter your company or firm name.' });
    const y = Number(b.yearsExperience);
    yearsExperience = Number.isFinite(y) && y >= 0 && y <= 70 ? Math.round(y) : null;
  }

  const existing = await store.getAccountByEmail(email, role);
  if (existing) {
    const sec = await store.getAccountSecrets(existing.id);
    if (existing.emailVerified && sec?.passwordHash) return res.status(409).json({ error: 'An account with this email already exists. Please sign in.', code: 'EXISTS' });
    if (existing.emailVerified && !sec?.passwordHash) return res.status(409).json({ error: 'This email has an older account without a password. Use "Forgot password" to set one.', code: 'NEEDS_PASSWORD' });
    // Registered earlier but never verified: refresh the details and send a new code.
    await store.updateAccount(existing.id, { name, location, phone, company, yearsExperience, passwordHash: await hashPassword(b.password) });
  } else {
    await store.saveAccount({ email, role, name, location, phone, company, yearsExperience, passwordHash: await hashPassword(b.password), emailVerified: false });
  }
  const code = await issueCode('verify-email', email, role);
  await mailCode(email, `Your BuildBridge AI verification code: ${code}`, 'Welcome to BuildBridge AI. Your email verification code is:', code);
  res.json({ ok: true, needsEmailVerification: true, devCode: EMAIL_CONFIGURED ? undefined : code });
});

app.post('/api/auth/resend-code', authRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = roleFrom(req.body?.role, email) || 'customer';
  const acc = EMAIL_RE.test(email) ? await store.getAccountByEmail(email, role) : null;
  let code;
  if (acc && !acc.emailVerified) {
    code = await issueCode('verify-email', email, role);
    await mailCode(email, `Your BuildBridge AI verification code: ${code}`, 'Your email verification code is:', code);
  }
  res.json({ ok: true, devCode: EMAIL_CONFIGURED ? undefined : code });
});

app.post('/api/auth/verify-email', authRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = roleFrom(req.body?.role, email) || 'customer';
  const acc = await store.getAccountByEmail(email, role);
  if (!acc || !(await checkCode('verify-email', email, role, req.body?.code))) return res.status(401).json({ error: 'Invalid or expired code.' });
  const updated = await store.updateAccount(acc.id, { emailVerified: true });
  res.json(await sessionFor(updated));
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = roleFrom(req.body?.role, email) || 'customer';
  const password = String(req.body?.password || '');
  const generic = { error: 'Incorrect email or password.' };
  const acc = EMAIL_RE.test(email) ? await store.getAccountByEmail(email, role) : null;
  if (!acc) { await checkPassword(password, DUMMY_HASH); return res.status(401).json(generic); }

  const sec = await store.getAccountSecrets(acc.id);
  if (sec.lockedUntil && new Date(sec.lockedUntil) > new Date()) {
    return res.status(429).json({ error: 'Too many wrong passwords. Try again in a few minutes, or reset your password.', code: 'LOCKED' });
  }
  if (!sec.passwordHash) return res.status(409).json({ error: 'This account has no password yet. Use "Forgot password" to set one.', code: 'NEEDS_PASSWORD' });
  if (!(await checkPassword(password, sec.passwordHash))) {
    const fails = (sec.failedLogins || 0) + 1;
    await store.updateAccount(acc.id, fails >= 5 ? { failedLogins: 0, lockedUntil: new Date(Date.now() + 15 * 60_000).toISOString() } : { failedLogins: fails });
    return res.status(401).json(generic);
  }
  if (!acc.emailVerified) {
    const code = await issueCode('verify-email', email, role);
    await mailCode(email, `Your BuildBridge AI verification code: ${code}`, 'Your email verification code is:', code);
    return res.status(403).json({ error: 'Verify your email first. We sent a new code.', code: 'EMAIL_NOT_VERIFIED', devCode: EMAIL_CONFIGURED ? undefined : code });
  }
  await store.updateAccount(acc.id, { failedLogins: 0, lockedUntil: null });
  res.json(await sessionFor(acc));
});

app.post('/api/auth/forgot', authRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = roleFrom(req.body?.role, email) || 'customer';
  const acc = EMAIL_RE.test(email) ? await store.getAccountByEmail(email, role) : null;
  let code;
  if (acc) {
    code = await issueCode('reset', email, role);
    await mailCode(email, `Your BuildBridge AI password reset code: ${code}`, 'Use this code to set a new password:', code);
  }
  // Same answer whether or not the account exists, so this cannot be used to discover who has one.
  res.json({ ok: true, devCode: EMAIL_CONFIGURED ? undefined : code });
});

app.post('/api/auth/reset', authRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = roleFrom(req.body?.role, email) || 'customer';
  const pwProblem = passwordProblem(req.body?.newPassword);
  if (pwProblem) return res.status(400).json({ error: pwProblem });
  const acc = await store.getAccountByEmail(email, role);
  if (!acc || !(await checkCode('reset', email, role, req.body?.code))) return res.status(401).json({ error: 'Invalid or expired code.' });
  const sec = await store.getAccountSecrets(acc.id);
  const updated = await store.updateAccount(acc.id, {
    passwordHash: await hashPassword(req.body.newPassword), emailVerified: true, failedLogins: 0, lockedUntil: null, sessionVersion: (sec.sessionVersion || 0) + 1,
  });
  res.json(await sessionFor(updated));
});

app.post('/api/auth/password', requireAuth, authRateLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const pwProblem = passwordProblem(newPassword);
  if (pwProblem) return res.status(400).json({ error: pwProblem });
  const sec = await store.getAccountSecrets(req.account.accountId);
  if (sec.passwordHash && !(await checkPassword(String(currentPassword || ''), sec.passwordHash))) return res.status(401).json({ error: 'Current password is incorrect.' });
  const updated = await store.updateAccount(req.account.accountId, { passwordHash: await hashPassword(newPassword), sessionVersion: (sec.sessionVersion || 0) + 1 });
  res.json(await sessionFor(updated));
});

// Phone verification by a 6-digit code. With an SMS provider configured the code is texted to the number.
// Without one the app runs in demo mode: the code is shown on screen and the result is recorded as a
// "demo" confirmation, which the interface labels honestly (it proves nothing about who owns the number).
const phoneSends = new Map();
app.post('/api/auth/phone/request', requireAuth, authRateLimit, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid phone number (10 digits, or with country code).' });
  const now = Date.now();
  const sends = (phoneSends.get(req.account.accountId) || []).filter((t) => now - t < 3_600_000);
  if (sends.length >= 5) return res.status(429).json({ error: 'Too many codes requested. Try again in an hour.' });
  sends.push(now); phoneSends.set(req.account.accountId, sends);
  const code = await issueCode('phone', `${req.account.accountId}:${phone}`, req.account.role);
  let sent = false;
  if (SMS_CONFIGURED) sent = (await sendSms(phone, `Your BuildBridge AI verification code is ${code}. It expires in 10 minutes.`).catch(() => ({ sent: false }))).sent;
  else console.log(`[dev] phone code for ${phone}: ${code}`);
  res.json({ ok: true, phone, smsConfigured: SMS_CONFIGURED, sent, devCode: SMS_CONFIGURED ? undefined : code });
});

app.post('/api/auth/phone/verify', requireAuth, authRateLimit, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (!(await checkCode('phone', `${req.account.accountId}:${phone}`, req.account.role, req.body?.code))) return res.status(401).json({ error: 'Invalid or expired code.' });
  await store.updateAccount(req.account.accountId, { phone });
  const account = await store.updateAccount(req.account.accountId, { phoneVerified: true, phoneVerifiedVia: SMS_CONFIGURED ? 'sms' : 'demo' });
  res.json({ ok: true, account });
});

app.post('/api/auth/phone', requireAuth, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid phone number (10 digits, or with country code).' });
  const account = await store.updateAccountPhone(req.account.accountId, phone);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  res.json({ ok: true, account });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const account = await store.getAccountById(req.account.accountId);
  if (!account) return res.status(401).json({ error: 'Account no longer exists.' });
  const builderProfile = account.role === 'builder' ? await store.getBuilderProfile(account.id) : null;
  res.json({ ok: true, account, builderProfile, smsConfigured: SMS_CONFIGURED });
});

app.post('/api/builder/profile', requireAuth, async (req, res) => {
  if (req.account.role !== 'builder') return res.status(403).json({ error: 'Builder account required.' });
  const { name, specializations, serviceLocations, about, priceRange, yearsExperience, phone: rawPhone, availability, services } = req.body || {};
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return res.status(400).json({ error: 'Business name is required.' });
  // A builder's phone is how customers reach them once an enquiry connects the two.
  const existing = await store.getAccountById(req.account.accountId);
  const phone = normalizePhone(rawPhone) || existing?.phone || null;
  if (!phone) return res.status(400).json({ error: 'A valid phone number is required.' });
  const account = phone !== existing?.phone ? await store.updateAccountPhone(req.account.accountId, phone) : existing;

  const profile = await store.saveBuilderProfile({
    accountId: req.account.accountId,
    name: trimmedName.slice(0, 80),
    specializations: Array.isArray(specializations) ? specializations.filter((s) => SPECIALIZATIONS.includes(s)) : [],
    serviceLocations: Array.isArray(serviceLocations) ? serviceLocations.filter((l) => SERVICE_LOCATIONS.includes(l)) : [],
    about: String(about || '').slice(0, 600),
    priceRange: Array.isArray(priceRange) && priceRange.length === 2 ? priceRange.map(Number) : null,
    yearsExperience: Number(yearsExperience) || null,
    availability: AVAILABILITY.includes(availability) ? availability : 'available',
    services: Array.isArray(services) ? services.filter((x) => BUILDER_SERVICES.includes(x)) : [],
  });
  res.json({ ok: true, builderProfile: profile, account });
});

// ---------------------------------------------------------------------------
// Builder verification: the builder submits firm details plus an ID and a licence/registration
// document; an admin reviews them. Only an approval sets the public "Verified" badge.
// ---------------------------------------------------------------------------
const verifyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => (ALLOWED_UPLOAD_TYPES.test(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Only image or PDF files are accepted.'), { status: 415 }))),
}).fields([{ name: 'idDoc', maxCount: 1 }, { name: 'licenseDoc', maxCount: 1 }]);

const toDoc = (file) => (file ? { name: String(file.originalname).slice(0, 120), type: file.mimetype, size: file.size, data: file.buffer.toString('base64') } : null);
const docMeta = (d) => (d ? { name: d.name, type: d.type, size: d.size } : null);

app.post('/api/builder/verification', requireAuth, (req, res, next) => verifyUpload(req, res, (err) => (err ? res.status(err.status || 400).json({ error: err.message }) : next())), async (req, res) => {
  if (req.account.role !== 'builder') return res.status(403).json({ error: 'Builder account required.' });
  const profile = await store.getBuilderProfile(req.account.accountId);
  if (!profile) return res.status(400).json({ error: 'Complete your builder profile first.' });
  const existing = await store.listVerificationRequests({ accountId: req.account.accountId });
  if (existing.some((v) => v.status === 'pending')) return res.status(409).json({ error: 'You already have a verification request under review.' });
  if (profile.verified) return res.status(409).json({ error: 'Your profile is already verified.' });
  const idDoc = toDoc(req.files?.idDoc?.[0]); const licenseDoc = toDoc(req.files?.licenseDoc?.[0]);
  if (!idDoc || !licenseDoc) return res.status(400).json({ error: 'Upload both a government ID and a licence or registration document.' });
  const b = req.body || {};
  const firmName = String(b.firmName || '').trim().slice(0, 120);
  const registrationNo = String(b.registrationNo || '').trim().slice(0, 60);
  if (!firmName || !registrationNo) return res.status(400).json({ error: 'Firm name and registration / licence number are required.' });
  const rec = await store.saveVerificationRequest({ accountId: req.account.accountId, details: { firmName, registrationNo, licenseType: String(b.licenseType || '').slice(0, 60), notes: String(b.notes || '').slice(0, 800) }, idDoc, licenseDoc });
  res.json({ ok: true, id: rec.id, status: rec.status });
});

app.get('/api/builder/verification', requireAuth, async (req, res) => {
  if (req.account.role !== 'builder') return res.status(403).json({ error: 'Builder account required.' });
  const profile = await store.getBuilderProfile(req.account.accountId);
  const list = await store.listVerificationRequests({ accountId: req.account.accountId });
  const latest = list[0] ? { id: list[0].id, status: list[0].status, details: list[0].details, reviewerNote: list[0].reviewerNote, submittedAt: list[0].submittedAt, reviewedAt: list[0].reviewedAt } : null;
  res.json({ ok: true, verified: !!profile?.verified, verifiedAt: profile?.verifiedAt || null, latest });
});

async function requireAdmin(req, res, next) {
  if (!req.account || req.account.role !== 'admin') return res.status(403).json({ error: 'Staff access required.' });
  const acc = await store.getAccountById(req.account.accountId);
  if (!acc || !ADMIN_EMAILS.includes(acc.email)) return res.status(403).json({ error: 'Staff access required.' });
  next();
}

app.get('/api/admin/verifications', requireAuth, requireAdmin, async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : undefined;
  const list = await store.listVerificationRequests({ status });
  const out = await Promise.all(list.map(async (v) => {
    const acc = await store.getAccountById(v.accountId);
    const prof = await store.getBuilderProfile(v.accountId);
    return {
      id: v.id, status: v.status, details: v.details, reviewerNote: v.reviewerNote, submittedAt: v.submittedAt, reviewedAt: v.reviewedAt,
      idDoc: docMeta(v.idDoc), licenseDoc: docMeta(v.licenseDoc),
      builder: { name: prof?.name || acc?.company || acc?.name, owner: acc?.name, email: acc?.email, phone: acc?.phone, phoneVerified: acc?.phoneVerified, phoneVerifiedVia: acc?.phoneVerifiedVia, location: acc?.location, yearsExperience: prof?.yearsExperience ?? acc?.yearsExperience },
    };
  }));
  res.json({ ok: true, verifications: out });
});

app.get('/api/admin/verifications/:id/doc/:which', requireAuth, requireAdmin, async (req, res) => {
  const v = await store.getVerificationRequest(req.params.id);
  const doc = v && (req.params.which === 'id' ? v.idDoc : req.params.which === 'license' ? v.licenseDoc : null);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  res.set({ 'Content-Type': doc.type, 'Content-Disposition': `inline; filename="${String(doc.name).replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(doc.data, 'base64'));
});

app.post('/api/admin/verifications/:id/decision', requireAuth, requireAdmin, async (req, res) => {
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject.' });
  const v = await store.getVerificationRequest(req.params.id);
  if (!v) return res.status(404).json({ error: 'Request not found.' });
  if (v.status !== 'pending') return res.status(409).json({ error: 'This request was already reviewed.' });
  const note = String(req.body?.note || '').slice(0, 600);
  if (decision === 'reject' && !note.trim()) return res.status(400).json({ error: 'Give the builder a reason for the rejection.' });
  await store.reviewVerificationRequest(v.id, { status: decision === 'approve' ? 'approved' : 'rejected', reviewerNote: note });
  if (decision === 'approve') await store.setBuilderVerified(v.accountId, true);
  const acc = await store.getAccountById(v.accountId);
  if (EMAIL_CONFIGURED && acc?.email) {
    sendEmail({
      to: acc.email,
      subject: `Your BuildBridge AI verification was ${decision === 'approve' ? 'approved' : 'not approved'}`,
      html: decision === 'approve'
        ? '<p>Your documents were reviewed and your profile now shows the Verified badge.</p>'
        : `<p>We could not approve your verification request.</p><p><strong>Reason:</strong> ${escapeHtml(note)}</p><p>You can submit it again from your Verification page.</p>`,
    }).catch(() => {});
  }
  res.json({ ok: true });
});

// Real signed-up builders — merged client-side with the static demo
// directory (client/src/data/builders.js). Public, no auth: this is the
// same "browsable directory" visibility the demo builders already have.
app.get('/api/builders', async (_req, res) => {
  const builders = await store.listBuilderAccounts();
  const accs = await Promise.all(builders.map((b) => store.getAccountById(b.accountId)));
  res.json({
    builders: builders.map((b, i) => ({
      phoneVerified: !!accs[i]?.phoneVerified, phoneVerifiedVia: accs[i]?.phoneVerifiedVia || null,
      id: b.accountId, name: b.name, specializations: b.specializations,
      serviceLocations: b.serviceLocations, about: b.about, priceRange: b.priceRange,
      yearsExperience: b.yearsExperience, availability: b.availability, services: b.services, verified: !!b.verified, source: 'account',
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
  const { customerName, customerEmail, customerPhone, location, message, designSummary, builderId, builderName, intent, design } = req.body || {};
  const name = String(customerName || '').trim();
  const email = String(customerEmail || '').trim();
  if (!name || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A name and a valid email are required.' });
  }
  // The customer's registered phone: required, saved on their account, and shared
  // with the builder alongside their email.
  const phone = normalizePhone(customerPhone);
  if (!phone) return res.status(400).json({ error: 'A valid phone number is required so the builder can reach you.' });
  const me = await store.getAccountById(req.account.accountId);
  if (!me?.phoneVerified || (me.phone && me.phone !== phone)) return res.status(403).json({ error: 'Verify your phone number before sending a project request.', code: 'PHONE_NOT_VERIFIED' });
  const customerAccount = (await store.getAccountById(req.account.accountId));
  const savedAccount = customerAccount && customerAccount.phone !== phone
    ? await store.updateAccountPhone(req.account.accountId, phone)
    : customerAccount;

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
  // The design snapshot (layout + cost) that the builder reviews. Size-capped: it is stored with the request.
  let designSnapshot = null;
  if (design && design.layout) {
    if (JSON.stringify(design).length > 600000) return res.status(413).json({ error: 'That design is too large to attach.' });
    designSnapshot = { layout: design.layout, cost: design.cost || null, requirements: design.requirements || null, title: String(design.title || design.layout.title || 'House design').slice(0, 120) };
  }
  const id = store.newId();
  const builderToken = crypto.randomBytes(24).toString('hex');

  const builderTo = await builderInbox(builderAccountId);

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
      to: builderTo,
      subject: `New house-design inquiry from ${name}`,
      html: `
        <h2>New inquiry via BuildBridge AI</h2>
        ${builderLine}${intentLine}
        <p><strong>Name:</strong> ${safeName}<br/>
        ${builderAccountId ? '' : `<strong>Email:</strong> ${escapeHtml(email)}<br/>`}
        ${locationLine}
        ${builderAccountId ? '<em>Email and phone are shared once you accept this request.</em>' : `<strong>Phone:</strong> ${escapeHtml(phone)}`}</p>
        ${safeMessage ? `<p><strong>Message:</strong><br/>${safeMessage}</p>` : ''}
        ${summaryLines ? `<h3>Design summary</h3><ul>${summaryLines}</ul>` : ''}
        <p><a href="${replyLink}">Reply to ${safeName} in BuildBridge AI</a></p>
      `.trim(),
    }).catch(() => ({ sent: false }));

    const customerResult = await sendEmail({
      to: email,
      subject: 'We received your house-design request — BuildBridge AI',
      html: `
        <h2>Thanks, ${safeName}!</h2>
        <p>We've received your request${builderName ? ` for ${escapeHtml(builderName)}` : ''}. You will be notified when the builder responds; contact details are shared once they accept.</p>
        ${summaryLines ? `<h3>Your design</h3><ul>${summaryLines}</ul>` : ''}
        <p style="color:#666;font-size:13px;">This is an approximate concept-stage design, not a construction-ready plan.</p>
      `.trim(),
    }).catch(() => ({ sent: false }));

    emailSent = builderResult.sent && customerResult.sent;
  }

  try {
    const record = await store.saveInquiry({
      id, accountId: req.account.accountId, customerName: name, customerEmail: email, customerPhone: phone, location, message,
      designSummary, builderId, builderName, builderAccountId, intent, builderToken, emailSent, design: designSnapshot,
    });
    res.json({ ok: true, id: record.id, emailSent, account: savedAccount });
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

// Once a real builder account has accepted, the two parties may see each other's email and phone.
// Demo builders (no account) keep the old behaviour: they only ever see what the enquiry carried.
const CONTACT_STATUSES = ['accepted', 'quotation', 'project'];
function contactEnabled(inquiry) {
  return !inquiry.builderAccountId || CONTACT_STATUSES.includes(inquiry.status);
}

// What a viewer may see of an inquiry. A builder does not receive the customer's email or phone
// before accepting; the customer always sees their own details. The token and the (large)
// design snapshot never travel in list responses.
function sanitizeInquiry(inquiry, role = 'customer') {
  const { builderToken, design, ...safe } = inquiry;
  safe.hasDesign = !!design;
  if (role === 'builder' && !contactEnabled(inquiry)) {
    safe.customerEmail = null;
    safe.customerPhone = null;
  }
  return safe;
}

// The seven connection stages shown on the timeline. Each flag is derived from stored records.
function connectionStages(inquiry, msgs) {
  const accepted = CONTACT_STATUSES.includes(inquiry.status);
  return {
    requested: true,
    reviewing: inquiry.status !== 'requested' || !!inquiry.viewedAt,
    accepted,
    contact: accepted,
    discussion: accepted && msgs.length > 0,
    quotation: inquiry.status === 'quotation' || inquiry.status === 'project',
    project: inquiry.status === 'project',
    declined: inquiry.status === 'declined',
  };
}

// A customer's own inquiries, for the "My Enquiries" list page.
// Adds the customer <-> builder relationship summary to each inquiry: how far the
// conversation has got (used for the progress timeline on both dashboards).
async function withRelationship(inquiries, role = 'customer') {
  return Promise.all(inquiries.map(async (inq) => {
    const msgs = await store.listMessages(inq.id);
    const last = msgs[msgs.length - 1] || null;
    return {
      ...sanitizeInquiry(inq, role),
      quotation: inq.quotation || null,
      relationship: {
        stages: connectionStages(inq, msgs),
        designShared: !!inq.designSummary,
        builderReplied: msgs.some((m) => m.senderRole === 'builder'),
        contactShared: !!inq.builderAccountId,
        messageCount: msgs.length,
        lastMessage: last ? { senderRole: last.senderRole, senderName: last.senderName, body: String(last.body).slice(0, 140), createdAt: last.createdAt } : null,
      },
    };
  }));
}

app.get('/api/inquiries', requireAuth, async (req, res) => {
  const inquiries = await store.listInquiriesByAccount(req.account.accountId);
  res.json({ ok: true, inquiries: await withRelationship(inquiries, 'customer') });
});

// A builder's own inquiries, for their dashboard.
app.get('/api/builder/inquiries', requireAuth, async (req, res) => {
  if (req.account.role !== 'builder') return res.status(403).json({ error: 'Builder account required.' });
  const inquiries = await store.listInquiriesForBuilderAccount(req.account.accountId);
  res.json({ ok: true, inquiries: await withRelationship(inquiries, 'builder') });
});

// Single inquiry, for context on the builder-reply page or a customer's thread view.
app.get('/api/inquiries/:id', async (req, res) => {
  try {
    let { inquiry, role } = await authorizeInquiryAccess(req.params.id, { account: getOptionalAccount(req), token: req.query.token });
    // The builder opening a new request moves it to "reviewing".
    if (role === 'builder' && inquiry.builderAccountId && inquiry.status === 'requested') {
      inquiry = (await store.updateInquiry(inquiry.id, { status: 'reviewing', viewedAt: new Date().toISOString() })) || inquiry;
    }
    // Each side gets the OTHER party's contact details only once contact is enabled.
    let contact = null;
    if (contactEnabled(inquiry)) {
      if (role === 'builder') {
        const ca = inquiry.accountId ? await store.getAccountById(inquiry.accountId) : null;
        contact = { name: inquiry.customerName, email: inquiry.customerEmail, phone: inquiry.customerPhone || null, emailVerified: ca ? ca.emailVerified : undefined, phoneVerified: ca ? ca.phoneVerified : undefined, phoneVerifiedVia: ca?.phoneVerifiedVia || null };
      } else if (inquiry.builderAccountId) {
        const b = await store.getAccountById(inquiry.builderAccountId);
        if (b) contact = { name: inquiry.builderName, email: b.email, phone: b.phone || null, emailVerified: b.emailVerified, phoneVerified: b.phoneVerified, phoneVerifiedVia: b.phoneVerifiedVia || null };
      }
    }
    const msgs = await store.listMessages(inquiry.id);
    res.json({
      ok: true,
      inquiry: sanitizeInquiry(inquiry, role),
      viewerRole: role,
      contact,
      design: inquiry.design || null,
      quotation: inquiry.quotation || null,
      relationship: { stages: connectionStages(inquiry, msgs), messageCount: msgs.length },
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Builder accepts or declines a project request. Accepting is what enables direct contact.
app.post('/api/inquiries/:id/respond', async (req, res) => {
  try {
    const { inquiry, role } = await authorizeInquiryAccess(req.params.id, { account: getOptionalAccount(req), token: req.body?.token });
    if (role !== 'builder') return res.status(403).json({ error: 'Only the builder can respond to a request.' });
    const action = req.body?.action;
    if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline.' });
    if (!['requested', 'reviewing'].includes(inquiry.status)) return res.status(409).json({ error: 'This request has already been answered.' });
    if (action === 'accept' && inquiry.builderAccountId) {
      const bAcc = await store.getAccountById(inquiry.builderAccountId);
      if (!bAcc?.phoneVerified) return res.status(403).json({ error: 'Verify your phone number before accepting requests.', code: 'PHONE_NOT_VERIFIED' });
    }
    const updated = await store.updateInquiry(inquiry.id, { status: action === 'accept' ? 'accepted' : 'declined', respondedAt: new Date().toISOString() });
    if (EMAIL_CONFIGURED) {
      const link = `${appOrigin(req)}/?view=my-enquiry&inquiry=${inquiry.id}`;
      sendEmail({
        to: inquiry.customerEmail,
        subject: `${inquiry.builderName || 'The builder'} ${action === 'accept' ? 'accepted' : 'declined'} your project request — BuildBridge AI`,
        html: action === 'accept'
          ? `<p><strong>${escapeHtml(inquiry.builderName || 'The builder')}</strong> accepted your project request. You can now see their contact details and message them.</p><p><a href="${link}">Open the project</a></p>`
          : `<p><strong>${escapeHtml(inquiry.builderName || 'The builder')}</strong> is not able to take this project right now. You can send it to another builder.</p>`,
      }).catch(() => {});
    }
    res.json({ ok: true, status: updated.status });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Builder sends (or revises) a quotation once the request is accepted.
app.post('/api/inquiries/:id/quotation', async (req, res) => {
  try {
    const { inquiry, role } = await authorizeInquiryAccess(req.params.id, { account: getOptionalAccount(req), token: req.body?.token });
    if (role !== 'builder') return res.status(403).json({ error: 'Only the builder can send a quotation.' });
    if (!['accepted', 'quotation'].includes(inquiry.status)) return res.status(409).json({ error: 'Accept the request before sending a quotation.' });
    const amount = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e11) return res.status(400).json({ error: 'Enter a valid quotation amount.' });
    const weeks = req.body?.weeks ? Math.max(1, Math.min(520, Math.round(Number(req.body.weeks)))) : null;
    const quotation = { amount, weeks, notes: String(req.body?.notes || '').slice(0, 1500), sentAt: new Date().toISOString() };
    const updated = await store.updateInquiry(inquiry.id, { status: 'quotation', quotation });
    res.json({ ok: true, status: updated.status, quotation });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Customer accepts the quotation (the project starts) or asks the builder to revise it.
app.post('/api/inquiries/:id/quotation/respond', async (req, res) => {
  try {
    const { inquiry, role } = await authorizeInquiryAccess(req.params.id, { account: getOptionalAccount(req), token: null });
    if (role !== 'customer') return res.status(403).json({ error: 'Only the customer can respond to a quotation.' });
    if (inquiry.status !== 'quotation') return res.status(409).json({ error: 'There is no quotation to respond to.' });
    const action = req.body?.action;
    if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline.' });
    const updated = await store.updateInquiry(inquiry.id, { status: action === 'accept' ? 'project' : 'accepted' });
    res.json({ ok: true, status: updated.status });
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
    if (!contactEnabled(inquiry)) return res.status(403).json({ error: inquiry.status === 'declined' ? 'The builder declined this request.' : 'Messaging opens once the builder accepts your request.' });
    const senderName = role === 'builder' ? (inquiry.builderName || 'Builder') : inquiry.customerName;
    const record = await store.saveMessage({ inquiryId: inquiry.id, senderRole: role, senderName, body: text });

    if (EMAIL_CONFIGURED) {
      const origin = appOrigin(req);
      if (role === 'customer') {
        const link = `${origin}/?view=builder-reply&inquiry=${inquiry.id}&token=${inquiry.builderToken}`;
        const contactLine = inquiry.customerPhone ? `<p>Phone: ${escapeHtml(inquiry.customerPhone)} &middot; Email: ${escapeHtml(inquiry.customerEmail)}</p>` : '';
        builderInbox(inquiry.builderAccountId).then((to) => sendEmail({
          to,
          subject: `New reply from ${senderName} — BuildBridge AI`,
          html: `<p><strong>${escapeHtml(senderName)}</strong> replied:</p><p>${escapeHtml(text)}</p>${contactLine}<p><a href="${link}">Open the conversation</a></p>`,
        })).catch(() => {});
      } else {
        const link = `${origin}/?view=my-enquiry&inquiry=${inquiry.id}`;
        sendEmail({
          to: inquiry.customerEmail,
          subject: `New reply${inquiry.builderName ? ` from ${inquiry.builderName}` : ''} — BuildBridge AI`,
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
