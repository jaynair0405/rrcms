#!/usr/bin/env node
/**
 * Why is there no "Admit provisionally" button?
 *
 *   node tools/why-no-admit.js [username]        # default: igp_cli
 *
 * READ ONLY. It changes nothing.
 *
 * Four quite different things all look identical from the screen -- a page with
 * no button on it -- and only the database can say which one it is:
 *
 *   the seed has not been run     `staff.admit` does not exist yet
 *   the seed ran, the server did  permissions are cached PER ROLE inside the
 *     not restart                 running process, so a grant made while the
 *                                 server is up is not seen until it restarts.
 *                                 This one is invisible: the database is right
 *                                 and the screen is still wrong.
 *   nobody is pending             the card only appears when somebody is
 *                                 actually waiting, and the button on a man's
 *                                 own page only when he is not already approved
 *   the role does not hold it     the grant went to some other role
 */
require('dotenv').config();
const db = require('../src/db');

const USER = process.argv[2] || 'igp_cli';

(async () => {
  const where = await db.one('SELECT DATABASE() AS db, @@port AS port');
  console.log(`\n  Database "${where.db}" on port ${where.port}\n`);

  const perm = await db.one('SELECT id FROM permissions WHERE code = ?', ['staff.admit']);
  if (!perm) {
    console.log('  VERDICT — the permission `staff.admit` is not in the database at all.\n'
              + '  The seed has not been run since stage 77 arrived:\n\n'
              + '      npm run seed\n\n'
              + '  then STOP the server and start it again.\n');
    process.exit(0);
  }
  const holders = (await db.query(`
    SELECT r.code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
     WHERE rp.permission_id = ? ORDER BY r.code`, [perm.id])).map(r => r.code);
  console.log(`  staff.admit is granted to: ${holders.join(', ') || '(nobody)'}`);

  const u = await db.one(`
    SELECT u.id, u.username, u.is_active, r.code AS role_code, r.name AS role_name
      FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ?`, [USER]);
  if (!u) { console.log(`\n  There is no user called "${USER}". Pass the right username.\n`); process.exit(1); }
  const has = holders.includes(u.role_code);
  console.log(`  ${u.username} is ${u.role_name} (${u.role_code}) — ${has ? 'HOLDS it' : 'does NOT hold it'}\n`);

  /* Which running rooms he can see, and what his rosters look like. The card
     needs somebody pending; the button on a man's own page needs him not to be
     approved already. */
  /* ONLY THE ROOMS HE CAN SEE. An RR In-charge is scoped to one running room,
     and printing the other forty-four would bury the answer he came for. */
  const { runningRoomScope } = require('../src/middleware/scope');
  const full = await db.one(`
    SELECT u.*, r.scope_level FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [u.id]);
  const sc = runningRoomScope(full, 'rr');
  const rooms = await db.query(`
    SELECT rr.id, rr.code, rr.name FROM running_rooms rr
     WHERE ${sc.sql} ORDER BY rr.name`, sc.params);
  console.log(`  He can see ${rooms.length} running room(s).\n`);
  const scoped = await db.query(`
    SELECT st.running_room_id, st.screening_status, COUNT(*) AS n
      FROM staff st WHERE st.is_active = 1
     GROUP BY st.running_room_id, st.screening_status`);
  const byRoom = {};
  scoped.forEach(r => { (byRoom[r.running_room_id] || (byRoom[r.running_room_id] = {}))[r.screening_status] = +r.n; });

  console.log('  ROSTERS, by screening status');
  let anyPending = 0;
  for (const rr of rooms) {
    const c = byRoom[rr.id]; if (!c) continue;
    const bits = Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ');
    anyPending += c.pending || 0;
    console.log(`    ${String(rr.code).padEnd(8)} ${String(rr.name).padEnd(34)} ${bits}`);
  }
  if (!Object.keys(byRoom).length) console.log('    no staff on any roster');

  console.log();
  if (!has) {
    console.log('  VERDICT — his role does not hold the permission. Run `npm run seed`,\n'
              + '  then stop the server and start it again.\n');
  } else if (!anyPending) {
    console.log('  VERDICT — the permission is granted and NOBODY IS PENDING. There is\n'
              + '  nothing to admit, which is why no card and no button appear. A man who\n'
              + '  is already approved or already provisional shows no button on his own\n'
              + '  page either — the panel is for a decision that has not been taken.\n');
  } else {
    console.log('  VERDICT — the permission is granted and ' + anyPending + ' are pending, so the\n'
              + '  card SHOULD be on the staff list. If it is not, the running server is\n'
              + '  older than the grant: permissions are cached per role inside the process.\n\n'
              + '      stop the server, then:   npm start\n');
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
