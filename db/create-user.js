#!/usr/bin/env node
/**
 * Create or reset a user.
 *
 *   node db/create-user.js <username> <role-code> "<Full Name>" [scope] [password]
 *
 *   node db/create-user.js admin   sysadmin       "System Administrator"
 *   node db/create-user.js jayakumar div_officer  "Jayakumar"     BB
 *   node db/create-user.js igp_cli rr_incharge    "IGP In-charge" RR013
 *   node db/create-user.js pre_sup contractor_sup "Prabhakar Sup" PRE
 *
 * WHY THE SCOPE ARGUMENT EXISTS.
 *
 * A role decides what a user may DO; the scope column decides WHICH running
 * rooms he may do it to. This script used to set the role and leave the scope
 * column NULL -- and every scoped role then matched no running room at all.
 * The user could log in, the menu appeared in full, and every page answered
 * "Not permitted. That running room is outside your access."
 *
 * Nothing said the account was unusable. It looked like a permissions bug in
 * the application, and it was found by a Contractor Supervisor login that could
 * not open the cleaning register he is the only person meant to fill.
 *
 * So the scope is now REQUIRED for a scoped role, given as the thing an officer
 * would actually name -- a division code, a running room code, a contractor
 * code -- and checked against the register before the account is written. A
 * role that is division-wide or Railway-wide takes no scope and refuses one.
 */
const crypto = require('crypto');
const mysql = require('mysql2/promise');
require('dotenv').config();
const { hashPassword } = require('../src/auth/local');

// What each scope level needs, how to find it, and what to call it when asking.
const SCOPES = {
  cr:           { column: null },
  self:         { column: null },
  division:     { column: 'division_id',     what: 'a division code',
                  sql: 'SELECT id, name FROM divisions WHERE code = ?',
                  list: 'SELECT code, name FROM divisions ORDER BY sort_order' },
  running_room: { column: 'running_room_id', what: 'a running room code',
                  sql: 'SELECT id, name FROM running_rooms WHERE code = ?',
                  list: `SELECT rr.code, rr.name FROM running_rooms rr
                          WHERE rr.status = 'operational' ORDER BY rr.code` },
  contractor:   { column: 'contractor_id',   what: 'a contractor code',
                  sql: 'SELECT id, name FROM contractors WHERE code = ?',
                  list: 'SELECT code, name FROM contractors WHERE is_active = 1 ORDER BY code' },
};

(async () => {
  const [username, roleCode, fullName, a4, a5] = process.argv.slice(2);
  if (!username || !roleCode || !fullName) {
    console.error('\nusage: node db/create-user.js <username> <role-code> "<Full Name>" [scope] [password]');
    console.error('roles: hq | div_officer | rr_incharge | contractor_sup | crew | sysadmin\n');
    process.exit(1);
  }
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

  const [[role]] = await db.query('SELECT id, name, scope_level FROM roles WHERE code = ?', [roleCode]);
  if (!role) { console.error(`\n  Unknown role "${roleCode}".\n`); process.exit(1); }

  const scope = SCOPES[role.scope_level];
  let scopeArg = a4, password = a5;
  // A role that takes no scope leaves the fourth argument free for the password.
  if (!scope.column) { password = a4 || a5; scopeArg = null; }

  let scopeId = null, scopeName = null;
  if (scope.column) {
    if (!scopeArg) {
      console.error(`\n  ${role.name} is scoped to one ${role.scope_level.replace('_', ' ')},`);
      console.error(`  so this account needs ${scope.what}. Without it the user can log in`);
      console.error(`  and every page answers "outside your access".\n`);
      const [rows] = await db.query(scope.list);
      rows.slice(0, 60).forEach(r => console.error(`    ${String(r.code).padEnd(10)} ${r.name}`));
      console.error('');
      process.exit(1);
    }
    const [[found]] = await db.query(scope.sql, [scopeArg]);
    if (!found) { console.error(`\n  No ${scope.what.replace('a ', '')} "${scopeArg}" on the register.\n`); process.exit(1); }
    scopeId = found.id; scopeName = found.name;
  } else if (scopeArg && !password) {
    // Guard against `create-user.js x hq "Name" BB` silently making BB a password.
    console.error(`\n  ${role.name} sees everything and takes no scope, but "${scopeArg}" was given.`);
    console.error('  If that was meant to be the password, pass it as the fourth argument alone.\n');
    process.exit(1);
  }

  password = password || crypto.randomBytes(9).toString('base64url');

  /* A CONTRACTOR SUPERVISOR IS ALSO A FIRM'S MAN.
   *
   * He is scoped to the running room he is posted to (migration 044), but the
   * record should still say whose employee he is. It is derived from the live
   * contract at that room rather than asked for: there is exactly one answer,
   * and asking would let the two disagree. */
  let contractorId = null;
  if (roleCode === 'contractor_sup') {
    const [[firm]] = await db.query(`
      SELECT ct.id, ct.name FROM contract_running_rooms crr
      JOIN contracts c   ON c.id  = crr.contract_id
      JOIN contractors ct ON ct.id = c.contractor_id
      WHERE crr.running_room_id = ?
        AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
      ORDER BY crr.effective_from DESC LIMIT 1`, [scopeId]);
    if (!firm) {
      console.error(`\n  No contractor holds ${scopeArg} today, so there is no firm to`);
      console.error('  attach this supervisor to. Record the agreement first.\n');
      process.exit(1);
    }
    contractorId = firm.id; scopeName = `${scopeName} — ${firm.name}`;
  }

  const col = scope.column;
  const cols = [col, contractorId ? 'contractor_id' : null].filter(Boolean);
  const vals = [scopeId, contractorId].filter(v => v !== null);
  await db.query(
    `INSERT INTO users (username, full_name, password_hash, role_id,
                        ${cols.map(c => c + ', ').join('')}is_active, must_change_pw)
     VALUES (?,?,?,?,${cols.map(() => '?, ').join('')}1,1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role_id = VALUES(role_id),
       full_name = VALUES(full_name),
       ${cols.map(c => c + ' = VALUES(' + c + '), ').join('')}
       is_active = 1, failed_logins = 0, locked_until = NULL`,
    [username, fullName, hashPassword(password), role.id, ...vals]);

  /* PROVE THE ACCOUNT CAN SEE SOMETHING before saying it was created. The whole
   * point of this rewrite is that "created successfully" used to be true and
   * useless at the same time. */
  const [[u]] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  const { runningRoomScope } = require('../src/middleware/scope');
  const s = runningRoomScope({ ...u, scope_level: role.scope_level }, 'rr');
  const [[seen]] = await db.query(
    `SELECT COUNT(*) AS n FROM running_rooms rr WHERE ${s.sql}`, s.params);

  console.log(`\n  user     ${username}`);
  console.log(`  role     ${role.name}`);
  if (scopeName) console.log(`  scope    ${scopeArg} — ${scopeName}`);
  console.log(`  sees     ${seen.n} running room(s)`);
  console.log(`  password ${password}`);
  if (role.scope_level !== 'self' && Number(seen.n) === 0) {
    console.log(`\n  ! This account can see NO running room, so every page will answer`);
    console.log(`    "outside your access". For a contractor that usually means the firm`);
    console.log(`    holds no live contract yet.`);
  }
  console.log(a5 || (!scope.column && a4) ? '' : '\n  (generated — copy it now, it is not stored in plain text)\n');
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
