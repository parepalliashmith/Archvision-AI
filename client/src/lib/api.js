import { API_BASE } from './config.js';
import { getToken, clearSession } from './auth.js';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson(res) {
  const data = await res.json().catch(() => ({}));
  // Only an expired/invalid SESSION signs the user out — a wrong password or code is also a 401.
  if (res.status === 401 && /log in to continue|no longer exists/i.test(data.error || '')) clearSession();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { code: data.code, status: res.status, data });
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
  builderId, builderName, intent, location, design,
}) {
  return fetch(`${API_BASE}/api/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      customerName, customerEmail, customerPhone, message, designSummary,
      builderId, builderName, intent, location, design,
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

// Accounts: email + password, email-code verification, phone-code verification (see server.js /api/auth/*).
const postPublic = (path, body) => fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(asJson);
const postAuthed = (path, body) => fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(asJson);
export const registerAccount = (fields) => postPublic('/api/auth/register', fields);
export const verifyEmail = ({ email, role, code }) => postPublic('/api/auth/verify-email', { email, role, code });
export const resendEmailCode = ({ email, role }) => postPublic('/api/auth/resend-code', { email, role });
export const loginWithPassword = ({ email, role, password }) => postPublic('/api/auth/login', { email, role, password });
export const forgotPassword = ({ email, role }) => postPublic('/api/auth/forgot', { email, role });
export const resetPassword = ({ email, role, code, newPassword }) => postPublic('/api/auth/reset', { email, role, code, newPassword });
export const changePassword = ({ currentPassword, newPassword }) => postAuthed('/api/auth/password', { currentPassword, newPassword });
export const requestPhoneCode = (phone) => postAuthed('/api/auth/phone/request', { phone });
export const verifyPhoneCode = (phone, code) => postAuthed('/api/auth/phone/verify', { phone, code });

// Builder verification (documents reviewed by an admin) and the admin review screens.
export const getBuilderVerification = () => fetch(API_BASE + '/api/builder/verification', { headers: authHeaders() }).then(asJson);
export const submitBuilderVerification = (formData) => fetch(API_BASE + '/api/builder/verification', { method: 'POST', headers: authHeaders(), body: formData }).then(asJson);
export const listVerifications = (status) => fetch(API_BASE + '/api/admin/verifications' + (status ? '?status=' + status : ''), { headers: authHeaders() }).then(asJson);
export const decideVerification = (id, decision, note) => postAuthed('/api/admin/verifications/' + id + '/decision', { decision, note });
export async function openVerificationDoc(id, which) {
  const res = await fetch(API_BASE + '/api/admin/verifications/' + id + '/doc/' + which, { headers: authHeaders() });
  if (!res.ok) throw new Error('Could not open the document.');
  window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
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

// Connection lifecycle: builder accepts/declines and sends a quotation; customer answers it.
function postJson(path, body) {
  return fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(asJson);
}
export const respondToRequest = (id, action, token) => postJson('/api/inquiries/' + id + '/respond', { action, token });
export const sendQuotation = (id, { amount, weeks, notes }, token) => postJson('/api/inquiries/' + id + '/quotation', { amount, weeks, notes, token });
export const respondToQuotation = (id, action) => postJson('/api/inquiries/' + id + '/quotation/respond', { action });
