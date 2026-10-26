/**
 * Local authentication: this application owns users, passwords and sessions.
 *
 * Sessions are a signed cookie carrying an opaque id, with state in the
 * sessions table — so a session can be revoked server-side, which a stateless
 * JWT could not do. Password hashing is scrypt from node:crypto; no third-party
 * dependency, and it is the algorithm Node itself recommends.
 */
const crypto = require('crypto');
const db = require('../db');
const cfg = require('../config');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(plain, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, N, r, p, salt, key] = stored.split('$');
  const derived = crypto.scryptSync(plain, salt, SCRYPT.keylen, { N: +N, r: +r, p: +p });
  const expected = Buffer.from(key, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// --- signed cookie ---------------------------------------------------------
function sign(value) {
  const mac = crypto.createHmac('sha256', cfg.sessionSecret || 'dev-only-secret')
    .update(value).digest('base64url');
  return `${value}.${mac}`;
}
function unsign(signed) {
  if (!signed || !signed.includes('.')) return null;
  const i = signed.lastIndexOf('.');
  const value = signed.slice(0, i);
  const expected = sign(value);
  const a = Buffer.from(signed), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// --- adapter surface -------------------------------------------------------
async function getCurrentUser(req) {
  const signed = readCookie(req, cfg.sessionCookie);
  const sid = signed && unsign(signed);
  if (!sid) return null;

  const row = await db.one(`
    SELECT u.id, u.username, u.full_name, u.designation, u.role_id, u.division_id,
           u.running_room_id, u.contractor_id, u.must_change_pw,
           r.code AS role_code, r.name AS role_name, r.scope_level
    FROM sessions s
    JOIN users u ON u.id = s.user_id AND u.is_active = 1
    JOIN roles r ON r.id = u.role_id
    WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()`, [sid]);
  if (!row) return null;
  row.sessionId = sid;
  return row;
}

async function login(req, res, username, password) {
  /* THE LOCK IS JUDGED BY THE DATABASE, not by JavaScript.
     `locked_until` is a DATETIME with no zone in it, and the pool is set to
     Asia/Kolkata (src/db.js), so what comes back is IST wall time. Reading it
     with `new Date(...)` on a server whose own clock is UTC -- which every
     Linux server is unless somebody changed it -- treats that wall time as UTC
     and puts the lock five and a half hours further into the future than it
     was ever meant to be. A fifteen-minute lock-out becomes a five-hour one,
     on the production server only, where nobody is watching a console.

     It never showed here because a Mac in Mumbai is on IST, so the two agreed.
     That is exactly how the September date faults hid: the machine doing the
     testing shared the mistake. Asking the database removes the question. */
  const user = await db.one(
    `SELECT id, password_hash, is_active, failed_logins,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
       FROM users WHERE username = ?`, [username]);

  // Same message and comparable timing whether the user exists or not, so the
  // form cannot be used to enumerate usernames.
  if (!user) { crypto.scryptSync(password, 'decoy', SCRYPT.keylen, SCRYPT); return { ok: false, reason: 'invalid' }; }
  if (user.is_locked) return { ok: false, reason: 'locked' };
  if (!user.is_active) return { ok: false, reason: 'inactive' };

  if (!verifyPassword(password, user.password_hash)) {
    const fails = user.failed_logins + 1;
    const lock = fails >= cfg.maxLoginAttempts;
    await db.execute(
      `UPDATE users SET failed_logins = ?, locked_until = ${lock ? `DATE_ADD(NOW(), INTERVAL ${cfg.lockMinutes} MINUTE)` : 'NULL'} WHERE id = ?`,
      [lock ? 0 : fails, user.id]);
    return { ok: false, reason: lock ? 'locked' : 'invalid' };
  }

  const sid = crypto.randomUUID();
  await db.execute(
    `INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at)
     VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [sid, user.id, req.ip || null, (req.headers['user-agent'] || '').slice(0, 255), cfg.sessionHours]);
  await db.execute(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?`, [user.id]);

  res.setHeader('Set-Cookie',
    `${cfg.sessionCookie}=${encodeURIComponent(sign(sid))}; Path=${cfg.basePath || '/'}; HttpOnly; SameSite=Lax; Max-Age=${cfg.sessionHours * 3600}` +
    (cfg.env === 'production' ? '; Secure' : ''));
  return { ok: true, userId: user.id, sessionId: sid };
}

async function logout(req, res) {
  const sid = unsign(readCookie(req, cfg.sessionCookie));
  if (sid) await db.execute(`UPDATE sessions SET revoked_at = NOW() WHERE id = ?`, [sid]);
  res.setHeader('Set-Cookie', `${cfg.sessionCookie}=; Path=${cfg.basePath || '/'}; HttpOnly; Max-Age=0`);
}

module.exports = { getCurrentUser, login, logout, hashPassword, verifyPassword };
