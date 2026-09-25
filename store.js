// Storage layer for saved designs:
//   - PostgreSQL when DATABASE_URL is set (production) — survives redeploys
//   - a local JSON file otherwise (dev) — zero setup
//
// Designs/inquiries are scoped to a real verified account (see accounts
// table below, and authTokens.js for how a session maps to one) — the old
// browser-generated clientId identity has been retired; pre-existing rows
// saved under it are simply orphaned (documented limitation, not migrated).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'designs.json');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const BUILDER_PROFILES_FILE = path.join(DATA_DIR, 'builder_profiles.json');
const OTP_CODES_FILE = path.join(DATA_DIR, 'otp_codes.json');

let pool = null;
let usePg = false;

async function init() {
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = require('pg');
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        // Managed Postgres (Render/Neon/Supabase/etc.) requires SSL.
        ssl: { rejectUnauthorized: false },
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS designs (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          title TEXT,
          layout JSONB NOT NULL,
          cost JSONB,
          requirements JSONB,
          parent_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS designs_client_id_idx ON designs (client_id)');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS inquiries (
          id TEXT PRIMARY KEY,
          client_id TEXT,
          customer_name TEXT NOT NULL,
          customer_email TEXT NOT NULL,
          customer_phone TEXT,
          location TEXT,
          message TEXT,
          design_summary JSONB,
          builder_id TEXT,
          builder_name TEXT,
          intent TEXT,
          email_sent BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // Added after the table above may already exist in a deployed DB —
      // CREATE TABLE IF NOT EXISTS alone wouldn't add this column to it.
      await pool.query('ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS builder_token TEXT');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          inquiry_id TEXT NOT NULL,
          sender_role TEXT NOT NULL,
          sender_name TEXT,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS messages_inquiry_id_idx ON messages (inquiry_id)');

      // Accounts (email-OTP login) — added after designs/inquiries already
      // existed in deployed DBs, so those two gain a nullable account_id
      // alongside their old (now-legacy) client_id column.
      await pool.query('ALTER TABLE designs ALTER COLUMN client_id DROP NOT NULL');
      await pool.query('ALTER TABLE designs ADD COLUMN IF NOT EXISTS account_id TEXT');
      await pool.query('ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS account_id TEXT');
      await pool.query('ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS builder_account_id TEXT');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_role_idx ON accounts (email, role)');
      await pool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone TEXT');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS builder_profiles (
          account_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          specializations JSONB,
          service_locations JSONB,
          about TEXT,
          price_range JSONB,
          years_experience INTEGER,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS otp_codes (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          purpose TEXT NOT NULL DEFAULT 'login',
          expires_at TIMESTAMPTZ NOT NULL,
          consumed BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS otp_codes_email_role_idx ON otp_codes (email, role)');
      usePg = true;
      console.log('  Storage: PostgreSQL (persistent)');
      return;
    } catch (e) {
      console.error('  Postgres init failed, falling back to local file:', e.message);
    }
  }
  ensureFileStore();
  console.log('  Storage: local JSON file');
}

function storageMode() {
  return usePg ? 'postgres' : 'local-file';
}

// ---- local-file backend ----

function ensureFileStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
  if (!fs.existsSync(INQUIRIES_FILE)) fs.writeFileSync(INQUIRIES_FILE, '[]');
  if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, '[]');
  if (!fs.existsSync(BUILDER_PROFILES_FILE)) fs.writeFileSync(BUILDER_PROFILES_FILE, '[]');
  if (!fs.existsSync(OTP_CODES_FILE)) fs.writeFileSync(OTP_CODES_FILE, '[]');
}

function readAll() {
  ensureFileStore();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAll(list) {
  ensureFileStore();
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function readAllInquiries() {
  ensureFileStore();
  try {
    return JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAllInquiries(list) {
  ensureFileStore();
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(list, null, 2));
}

function readAllMessages() {
  ensureFileStore();
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAllMessages(list) {
  ensureFileStore();
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(list, null, 2));
}

function readAllAccounts() {
  ensureFileStore();
  try {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAllAccounts(list) {
  ensureFileStore();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2));
}

function readAllBuilderProfiles() {
  ensureFileStore();
  try {
    return JSON.parse(fs.readFileSync(BUILDER_PROFILES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAllBuilderProfiles(list) {
  ensureFileStore();
  fs.writeFileSync(BUILDER_PROFILES_FILE, JSON.stringify(list, null, 2));
}

function readAllOtpCodes() {
  ensureFileStore();
  try {
    return JSON.parse(fs.readFileSync(OTP_CODES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAllOtpCodes(list) {
  ensureFileStore();
  fs.writeFileSync(OTP_CODES_FILE, JSON.stringify(list, null, 2));
}

function newId() {
  return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function rowToRecord(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    layout: row.layout,
    cost: row.cost,
    requirements: row.requirements,
    parentId: row.parent_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function rowToInquiryRecord(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    location: row.location,
    message: row.message,
    designSummary: row.design_summary,
    builderId: row.builder_id,
    builderName: row.builder_name,
    builderAccountId: row.builder_account_id,
    intent: row.intent,
    emailSent: row.email_sent,
    builderToken: row.builder_token,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function rowToMessageRecord(row) {
  return {
    id: row.id,
    inquiryId: row.inquiry_id,
    senderRole: row.sender_role,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function rowToAccountRecord(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    phone: row.phone || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function rowToBuilderProfileRecord(row) {
  return {
    accountId: row.account_id,
    name: row.name,
    specializations: row.specializations,
    serviceLocations: row.service_locations,
    about: row.about,
    priceRange: row.price_range,
    yearsExperience: row.years_experience,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

// ---- public API (all async, regardless of backend) ----

async function saveDesign({ accountId, layout, cost, requirements, parentId, title }) {
  if (!accountId) throw Object.assign(new Error('Missing accountId.'), { status: 400 });
  const record = {
    id: newId(),
    accountId,
    title: title || layout?.title || 'Untitled design',
    layout,
    cost: cost || null,
    requirements: requirements || null,
    parentId: parentId || null,
    createdAt: new Date().toISOString(),
  };

  if (usePg) {
    await pool.query(
      `INSERT INTO designs (id, account_id, title, layout, cost, requirements, parent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id, record.accountId, record.title,
        JSON.stringify(record.layout), record.cost ? JSON.stringify(record.cost) : null,
        record.requirements ? JSON.stringify(record.requirements) : null,
        record.parentId, record.createdAt,
      ]
    );
    return record;
  }
  const list = readAll();
  list.push(record);
  writeAll(list);
  return record;
}

async function listDesignsByAccount(accountId) {
  if (usePg) {
    const res = await pool.query(
      'SELECT * FROM designs WHERE account_id = $1 ORDER BY created_at DESC',
      [accountId]
    );
    return res.rows.map(rowToRecord);
  }
  return readAll()
    .filter((d) => d.accountId === accountId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function getDesign(id) {
  if (usePg) {
    const res = await pool.query('SELECT * FROM designs WHERE id = $1', [id]);
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }
  return readAll().find((d) => d.id === id) || null;
}

async function deleteDesign(id, accountId) {
  if (usePg) {
    const res = await pool.query('DELETE FROM designs WHERE id = $1 AND account_id = $2', [id, accountId]);
    return res.rowCount > 0;
  }
  const list = readAll();
  const next = list.filter((d) => !(d.id === id && d.accountId === accountId));
  const removed = next.length !== list.length;
  writeAll(next);
  return removed;
}

// "Get a Builder Quote" inquiries — a customer's contact details plus a
// snapshot of the design they were looking at, kept even when email delivery
// isn't configured so nothing is lost while the site owner sets that up.
async function saveInquiry({ id, accountId, customerName, customerEmail, customerPhone, location, message, designSummary, builderId, builderName, builderAccountId, intent, builderToken, emailSent }) {
  const record = {
    id: id || newId(),
    accountId: accountId || null,
    customerName,
    customerEmail,
    customerPhone: customerPhone || null,
    location: location || null,
    message: message || null,
    designSummary: designSummary || null,
    builderId: builderId || null,
    builderName: builderName || null,
    builderAccountId: builderAccountId || null,
    intent: intent || null,
    builderToken: builderToken || null,
    emailSent: !!emailSent,
    createdAt: new Date().toISOString(),
  };

  if (usePg) {
    await pool.query(
      `INSERT INTO inquiries (id, account_id, customer_name, customer_email, customer_phone, location, message, design_summary, builder_id, builder_name, intent, email_sent, created_at, builder_token, builder_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        record.id, record.accountId, record.customerName, record.customerEmail, record.customerPhone, record.location,
        record.message, record.designSummary ? JSON.stringify(record.designSummary) : null,
        record.builderId, record.builderName, record.intent,
        record.emailSent, record.createdAt, record.builderToken, record.builderAccountId,
      ]
    );
    return record;
  }
  const list = readAllInquiries();
  list.push(record);
  writeAllInquiries(list);
  return record;
}

async function getInquiry(id) {
  if (usePg) {
    const res = await pool.query('SELECT * FROM inquiries WHERE id = $1', [id]);
    return res.rows[0] ? rowToInquiryRecord(res.rows[0]) : null;
  }
  return readAllInquiries().find((i) => i.id === id) || null;
}

async function listInquiriesByAccount(accountId) {
  if (usePg) {
    const res = await pool.query(
      'SELECT * FROM inquiries WHERE account_id = $1 ORDER BY created_at DESC',
      [accountId]
    );
    return res.rows.map(rowToInquiryRecord);
  }
  return readAllInquiries()
    .filter((i) => i.accountId === accountId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function listInquiriesForBuilderAccount(builderAccountId) {
  if (usePg) {
    const res = await pool.query(
      'SELECT * FROM inquiries WHERE builder_account_id = $1 ORDER BY created_at DESC',
      [builderAccountId]
    );
    return res.rows.map(rowToInquiryRecord);
  }
  return readAllInquiries()
    .filter((i) => i.builderAccountId === builderAccountId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Two-way messages on an inquiry thread — a customer (matched by clientId) and
// a builder (matched by the inquiry's own unguessable builderToken, emailed
// once) rather than real accounts for either side.
async function saveMessage({ inquiryId, senderRole, senderName, body }) {
  const record = {
    id: newId(),
    inquiryId,
    senderRole,
    senderName: senderName || null,
    body,
    createdAt: new Date().toISOString(),
  };

  if (usePg) {
    await pool.query(
      `INSERT INTO messages (id, inquiry_id, sender_role, sender_name, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.id, record.inquiryId, record.senderRole, record.senderName, record.body, record.createdAt]
    );
    return record;
  }
  const list = readAllMessages();
  list.push(record);
  writeAllMessages(list);
  return record;
}

async function listMessages(inquiryId) {
  if (usePg) {
    const res = await pool.query(
      'SELECT * FROM messages WHERE inquiry_id = $1 ORDER BY created_at ASC',
      [inquiryId]
    );
    return res.rows.map(rowToMessageRecord);
  }
  return readAllMessages()
    .filter((m) => m.inquiryId === inquiryId)
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

// ---- accounts / builder profiles / OTP (email-OTP login) ----

async function getAccountByEmail(email, role) {
  if (usePg) {
    const res = await pool.query('SELECT * FROM accounts WHERE email = $1 AND role = $2', [email, role]);
    return res.rows[0] ? rowToAccountRecord(res.rows[0]) : null;
  }
  return readAllAccounts().find((a) => a.email === email && a.role === role) || null;
}

async function getAccountById(id) {
  if (usePg) {
    const res = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
    return res.rows[0] ? rowToAccountRecord(res.rows[0]) : null;
  }
  return readAllAccounts().find((a) => a.id === id) || null;
}

// Find-or-create — an OTP verify always resolves to an account, creating one
// on first-ever login for that (email, role) pair.
async function saveAccount({ email, role }) {
  const existing = await getAccountByEmail(email, role);
  if (existing) return existing;

  const record = { id: newId(), email, role, createdAt: new Date().toISOString() };
  if (usePg) {
    await pool.query(
      'INSERT INTO accounts (id, email, role, created_at) VALUES ($1, $2, $3, $4)',
      [record.id, record.email, record.role, record.createdAt]
    );
    return record;
  }
  const list = readAllAccounts();
  list.push(record);
  writeAllAccounts(list);
  return record;
}

// The account's registered phone number (E.164, already normalized by server.js).
// Shared with the other party only once an enquiry connects the two.
async function updateAccountPhone(id, phone) {
  if (usePg) {
    const res = await pool.query('UPDATE accounts SET phone = $2 WHERE id = $1 RETURNING *', [id, phone]);
    return res.rows[0] ? rowToAccountRecord(res.rows[0]) : null;
  }
  const list = readAllAccounts();
  const acc = list.find((a) => a.id === id);
  if (!acc) return null;
  acc.phone = phone;
  writeAllAccounts(list);
  return acc;
}

async function getBuilderProfile(accountId) {
  if (usePg) {
    const res = await pool.query('SELECT * FROM builder_profiles WHERE account_id = $1', [accountId]);
    return res.rows[0] ? rowToBuilderProfileRecord(res.rows[0]) : null;
  }
  return readAllBuilderProfiles().find((p) => p.accountId === accountId) || null;
}

async function saveBuilderProfile({ accountId, name, specializations, serviceLocations, about, priceRange, yearsExperience }) {
  const record = {
    accountId,
    name,
    specializations: specializations || [],
    serviceLocations: serviceLocations || [],
    about: about || null,
    priceRange: priceRange || null,
    yearsExperience: yearsExperience || null,
    updatedAt: new Date().toISOString(),
  };

  if (usePg) {
    await pool.query(
      `INSERT INTO builder_profiles (account_id, name, specializations, service_locations, about, price_range, years_experience, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (account_id) DO UPDATE SET
         name = $2, specializations = $3, service_locations = $4, about = $5, price_range = $6, years_experience = $7, updated_at = $8`,
      [
        record.accountId, record.name, JSON.stringify(record.specializations), JSON.stringify(record.serviceLocations),
        record.about, record.priceRange ? JSON.stringify(record.priceRange) : null, record.yearsExperience, record.updatedAt,
      ]
    );
    return record;
  }
  const list = readAllBuilderProfiles();
  const idx = list.findIndex((p) => p.accountId === accountId);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  writeAllBuilderProfiles(list);
  return record;
}

// Real signed-up builders (accounts with a completed profile) for the "Find
// Builders" directory merge — see client/src/pages/FindBuilders.jsx.
async function listBuilderAccounts() {
  if (usePg) {
    const res = await pool.query(`
      SELECT a.id AS account_id, a.email, bp.name, bp.specializations, bp.service_locations, bp.about, bp.price_range, bp.years_experience
      FROM accounts a
      JOIN builder_profiles bp ON bp.account_id = a.id
      WHERE a.role = 'builder'
    `);
    return res.rows.map(rowToBuilderProfileRecord).map((p, i) => ({ ...p, email: res.rows[i].email }));
  }
  const profiles = readAllBuilderProfiles();
  const builderAccountIds = new Set(readAllAccounts().filter((a) => a.role === 'builder').map((a) => a.id));
  const accountsById = new Map(readAllAccounts().map((a) => [a.id, a]));
  return profiles
    .filter((p) => builderAccountIds.has(p.accountId))
    .map((p) => ({ ...p, email: accountsById.get(p.accountId)?.email }));
}

// One-time login codes — hashed at rest, 10-minute expiry, single-use.
// Opportunistically prunes anything more than a day past expiry on each save
// so the local-file backend doesn't grow unbounded in a long-running demo.
async function saveOtpCode({ email, role, codeHash, expiresAt }) {
  const record = {
    id: newId(), email, role, codeHash, purpose: 'login',
    expiresAt, consumed: false, createdAt: new Date().toISOString(),
  };

  if (usePg) {
    await pool.query("DELETE FROM otp_codes WHERE expires_at < now() - interval '1 day'");
    await pool.query(
      `INSERT INTO otp_codes (id, email, role, code_hash, purpose, expires_at, consumed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [record.id, record.email, record.role, record.codeHash, record.purpose, record.expiresAt, record.consumed, record.createdAt]
    );
    return record;
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const list = readAllOtpCodes().filter((o) => new Date(o.expiresAt).getTime() > cutoff);
  list.push(record);
  writeAllOtpCodes(list);
  return record;
}

// Verifies + marks consumed in one step — returns true only for a matching,
// unconsumed, unexpired code. Never reveals *why* a code was rejected.
async function consumeOtpCode({ email, role, code }) {
  const codeHash = crypto.createHash('sha256').update(code + email).digest('hex');

  if (usePg) {
    const res = await pool.query(
      `UPDATE otp_codes SET consumed = true
       WHERE id = (
         SELECT id FROM otp_codes
         WHERE email = $1 AND role = $2 AND code_hash = $3 AND consumed = false AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1
       )
       RETURNING id`,
      [email, role, codeHash]
    );
    return res.rowCount > 0;
  }

  const now = Date.now();
  const list = readAllOtpCodes();
  const candidates = list.filter((o) =>
    o.email === email && o.role === role && o.codeHash === codeHash &&
    !o.consumed && new Date(o.expiresAt).getTime() > now
  );
  if (candidates.length === 0) return false;
  const target = candidates.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  target.consumed = true;
  writeAllOtpCodes(list);
  return true;
}

module.exports = {
  init, storageMode, saveDesign, listDesignsByAccount, getDesign, deleteDesign,
  saveInquiry, getInquiry, listInquiriesByAccount, listInquiriesForBuilderAccount,
  saveMessage, listMessages, newId,
  getAccountByEmail, getAccountById, saveAccount, updateAccountPhone,
  getBuilderProfile, saveBuilderProfile, listBuilderAccounts,
  saveOtpCode, consumeOtpCode,
};
