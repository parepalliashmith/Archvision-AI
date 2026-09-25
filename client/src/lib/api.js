import { API_BASE } from './config.js';
import { getToken, clearSession } from './auth.js';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson(res) {
  const data = await res.json();
  if (res.status === 401) clearSession();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export function checkHealth() {
  return fetch(`${API_BASE}/api/health`).then(asJson);
}

// Rule-based / constraint-based generator — no AI call, instant, deterministic.
// See designGenerator.js on the backend for the algorithm.
export function generateRuleBasedDesign(requirements) {
  return fetch(`${API_BASE}/api/design/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requirements),
  }).then(asJson);
}

// Conversational edits ("make the kitchen bigger", "add one more bedroom", ...).
// See server.js's /api/design/chat-modify and designModifier.js for the pipeline:
// AI (or a keyword fallback) interprets the message into a small structured
// intent, a deterministic engine applies it to `requirements`, and the SAME
// rule-based generator used everywhere else produces the new layout — never the
// LLM directly.
export function chatModifyDesign({ message, requirements }) {
  return fetch(`${API_BASE}/api/design/chat-modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, requirements }),
  }).then(asJson);
}

// payload is either a plain object (sent as JSON) or a FormData (file upload).
export function generateDesign(payload) {
  if (payload instanceof FormData) {
    return fetch(`${API_BASE}/api/design`, { method: 'POST', body: payload }).then(asJson);
  }
  return fetch(`${API_BASE}/api/design`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(asJson);
}

// Pure geometry, no AI — converts a structured design into a per-floor 2D drawing
// model (walls, doors, windows, stairs, dimensions) for FloorPlan2D.jsx to render.
export function getFloorPlans(design) {
  return fetch(`${API_BASE}/api/design/floorplan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ design }),
  }).then(asJson);
}

// Standalone construction cost estimate — no design/layout needed, just plain
// numbers/enums. See costEstimator.js's estimateDetailedCost for the formula.
export function estimateCost(inputs) {
  return fetch(`${API_BASE}/api/cost/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  }).then(asJson);
}

export function modifyDesign({ layout, instruction, requirements }) {
  return fetch(`${API_BASE}/api/design/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout, instruction, requirements }),
  }).then(asJson);
}

// Below here, every route requires a logged-in session (see auth.js) —
// the old anonymous clientId identity has been retired.

export function saveDesign({ layout, cost, requirements, parentId, title }) {
  return fetch(`${API_BASE}/api/designs/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ layout, cost, requirements, parentId, title }),
  }).then(asJson);
}

export function listDesigns() {
  return fetch(`${API_BASE}/api/designs`, { headers: authHeaders() }).then(asJson);
}

export function deleteDesign(id) {
  return fetch(`${API_BASE}/api/designs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).then(asJson);
}

// "Get a Builder Quote" / project enquiries — see server.js's /api/inquiries.
// Always saves the inquiry; `emailSent` in the response says whether mail
// actually went out (the builder's email provider might not be configured
// yet). `builderId`/`builderName`/`intent`/`location` are optional — present
// when the enquiry came from a specific builder's profile (ProjectEnquiryForm)
// rather than the generic "Talk to a Construction Expert" quote box.
export function requestBuilderQuote({
  customerName, customerEmail, customerPhone, message, designSummary,
  builderId, builderName, intent, location,
}) {
  return fetch(`${API_BASE}/api/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      customerName, customerEmail, customerPhone, message, designSummary,
      builderId, builderName, intent, location,
    }),
  }).then(asJson);
}

// Messaging thread on an inquiry — see server.js's /api/inquiries/:id* routes.
// Access is via exactly one credential: the logged-in session (customer or
// real builder account), or a demo builder's per-inquiry `token` (from the
// emailed reply link) — the only credential a curated demo builder ever has.
export function getInquiry({ id, token }) {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  return fetch(`${API_BASE}/api/inquiries/${id}?${params}`, { headers: authHeaders() }).then(asJson);
}

export function listMyInquiries() {
  return fetch(`${API_BASE}/api/inquiries`, { headers: authHeaders() }).then(asJson);
}

export function listBuilderInquiries() {
  return fetch(`${API_BASE}/api/builder/inquiries`, { headers: authHeaders() }).then(asJson);
}

export function listMessages({ inquiryId, token }) {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  return fetch(`${API_BASE}/api/inquiries/${inquiryId}/messages?${params}`, { headers: authHeaders() }).then(asJson);
}

export function sendMessage({ inquiryId, token, body }) {
  return fetch(`${API_BASE}/api/inquiries/${inquiryId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ token, body }),
  }).then(asJson);
}

// Email-OTP login — see server.js's /api/auth/* routes.
export function requestOtp({ email, role }) {
  return fetch(`${API_BASE}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  }).then(asJson);
}

export function verifyOtp({ email, role, code }) {
  return fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role, code }),
  }).then(asJson);
}

export function getMe() {
  return fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() }).then(asJson);
}

export function saveBuilderProfile(profile) {
  return fetch(`${API_BASE}/api/builder/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(profile),
  }).then(asJson);
}

// Real signed-up builders — merged client-side with the static demo directory.
export function listBuilders() {
  return fetch(`${API_BASE}/api/builders`).then(asJson);
}

// Edit the registered phone number on the signed-in account.
export function savePhone(phone) {
  return fetch(`${API_BASE}/api/auth/phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ phone }),
  }).then(asJson);
}
