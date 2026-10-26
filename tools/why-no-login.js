#!/usr/bin/env node
/**
 * Why will this account not sign in?
 *
 *   node tools/why-no-login.js officer              # read only, changes nothing
 *   node tools/why-no-login.js officer --unlock     # clears a lock-out only
 *
 * Four quite different things look identical from the login page, and two of
 * them do not even say so honestly -- the message is deliberately the same
 * whether an account exists or not, so the form cannot be used to discover
 * usernames. Right for a stranger at the door, useless to the man who owns the
 * system. So this asks the database.
 *
 *   LOCKED       five wrong tries lock the account for fifteen minutes. Much
 *                the commonest: two wrong, three more to check the caps lock,
 *                and the account is shut for a quarter of an hour.
 *   NOT ACTIVE   is_active = 0. It exists and will never let anybody in.
 *   NO SUCH USER a typo, or a different username than the one remembered.
 *   WRONG PASSWORD  all in order, and what is typed is not what is stored.
 *
 * EVERY DATE COMPARISON HERE IS THE DATABASE'S. A DATETIME read back from this
 * pool carries the running room's wall time (the pool is set to Asia/Kolkata);
 * a Node process on a UTC server reads that as UTC and is five and a half hours
 * out. The first version of this tool printed "-330 minutes ago" and called a
 * live lock-out "not locked" -- which is how the same fault was found in
 * src/auth/local.js, where it made a fifteen-minute lock last five hours on any
 * server not set to IST.
 *
 * --unlock clears the lock-out and the failed count and NOTHING else. It does
 * not touch the password: an unlock is not a way in, only a way to stop
 * waiting before trying again.
 */
require('dotenv').config();
const db = require('../src/db');

const USER = process.argv[2];
const UNLOCK = process.argv.includes('--unlock');

if (!USER) {
  console.log('\n  usage: node tools/why-no-login.js <username> [--unlock]\n');
  process.exit(1);
}

const ago = mins => {
  if (mins === null || mins === undefined) return 'never';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hour(s) ago`;
  return `${Math.round(mins / 1440)} day(s) ago`;
};

(async () => {
  const where = await db.one('SELECT DATABASE() AS db, NOW() AS now');
  console.log(`\n  Database "${where.db}"  ·  server clock ${String(where.now).slice(0, 19)}\n`);

  const u = await db.one(`
    SELECT u.*, r.code AS role_code, r.name AS role_name,
           (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS is_locked,
           TIMESTAMPDIFF(MINUTE, NOW(), u.locked_until)  AS lock_mins,
           TIMESTAMPDIFF(MINUTE, u.updated_at, NOW())    AS changed_mins,
           TIMESTAMPDIFF(MINUTE, u.last_login_at, NOW()) AS login_mins
      FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ?`, [USER]);

  if (!u) {
    const all = await db.query('SELECT username FROM users ORDER BY username LIMIT 40');
    console.log(`  VERDICT — there is no account called "${USER}".\n`);
    console.log('  The usernames that DO exist:\n    ' + all.map(r => r.username).join(', ') + '\n');
    process.exit(0);
  }

  const locked = !!u.is_locked;
  console.log(`  ${u.username}  —  ${u.full_name}`);
  console.log(`    role            ${u.role_name} (${u.role_code})`);
  console.log(`    active          ${u.is_active ? 'yes' : 'NO — this account is switched off'}`);
  console.log(`    failed tries    ${u.failed_logins}`);
  console.log(`    locked          ${locked ? `YES for another ${Math.max(1, u.lock_mins)} minute(s)` : 'no'}`);
  console.log(`    must change pw  ${u.must_change_pw ? 'yes — it will ask on the way in' : 'no'}`);
  console.log(`    last signed in  ${ago(u.login_mins)}`);
  console.log(`    record changed  ${ago(u.changed_mins)}   (a password change moves this)`);

  console.log();
  if (!u.is_active) {
    console.log('  VERDICT — the account is switched off. No password will get in until it is\n'
              + '  made active again.\n');
  } else if (locked) {
    console.log(`  VERDICT — locked out for another ${Math.max(1, u.lock_mins)} minute(s) after five\n`
              + '  wrong tries. Nothing is wrong with the account. Wait, or clear it now:\n\n'
              + `      node tools/why-no-login.js ${USER} --unlock\n`);
  } else {
    const scope = u.running_room_id ? ' <running-room-code>' : u.division_id ? ' <division-code>' : '';
    console.log('  VERDICT — the account is fine and not locked, so what is being typed is not\n'
              + '  what is stored. A password cannot be read back — it is kept as a scrypt hash,\n'
              + '  which is the whole point of one — so the way out is to set a new one:\n\n'
              + `      node db/create-user.js ${USER} ${u.role_code} "${u.full_name}"${scope} <new-password>\n\n`
              + '  That re-writes the password and leaves everything else as it is.\n\n'
              + `  The record was last changed ${ago(u.changed_mins)}. If that is NOT when you\n`
              + '  changed the password, the change never saved and the old one still stands.\n');
  }

  if (UNLOCK) {
    if (!locked && !u.failed_logins) {
      console.log('  --unlock: nothing to clear.\n');
    } else {
      await db.execute('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [u.id]);
      console.log('  --unlock: the lock and the failed count are cleared. The password is\n'
                + '  untouched — an unlock is not a way in, only a way to stop waiting.\n');
    }
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
