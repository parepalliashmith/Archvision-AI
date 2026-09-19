// Stateless session tokens for the email-OTP login system — signed with
// HMAC-SHA256 (crypto.createHmac, the same primitive server.js already uses
// for the per-inquiry builderToken) rather than a JWT library, since a plain
// signed-and-expiring payload is all a demo-scale login needs.

const crypto = require('crypto');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — re-login via OTP after this, no refresh flow.

const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn(
    '  WARNING: SESSION_SECRET not set — using a random secret generated at boot. ' +
    'All existing sessions are invalidated on every restart. Set SESSION_SECRET in production.'
  );
  return generated;
})();

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function issueToken({ accountId, role }) {
  return sign({ accountId, role, exp: Date.now() + TOKEN_TTL_MS });
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload; // { accountId, role, exp }
}

module.exports = { issueToken, verifyToken };
