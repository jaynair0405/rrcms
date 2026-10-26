#!/usr/bin/env node
/**
 * Says, in words, why the "receive" link is or is not on the laundry screen
 * for a given running room and user. Reads the same tables the screen reads
 * and applies the same test the template applies, so its answer and the
 * screen's answer cannot disagree.
 *
 *   node tools/why-no-receive.js [running-room-code] [username]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const RR = (process.argv[2] || 'IGP').toUpperCase();
const USER = process.argv[3] || null;

(async () => {
  const rr = await db.one(
    'SELECT id, code, name FROM running_rooms WHERE code = ? OR name = ?', [RR, RR]);
  if (!rr) { console.log('No running room called ' + RR); process.exit(1); }
  console.log('Running room: ' + rr.name + ' (id ' + rr.id + ')\n');

  // 1. the file the server reads
  const view = path.join(__dirname, '..', 'src', 'views', 'facility', 'laundry.ejs');
  const src = fs.readFileSync(view, 'utf8');
  console.log('1. The screen file');
  console.log('   ' + view);
  console.log('   changed ' + fs.statSync(view).mtime.toISOString().slice(0, 16).replace('T', ' '));
  console.log('   carries the receive link: ' + (src.includes('class="retlink"') ? 'YES' : 'NO'));

  // 2. the permission the link is behind
  console.log('\n2. Who is allowed to receive (permission stay.manage)');
  const roles = await db.query(`
    SELECT r.code, r.name,
           MAX(CASE WHEN p.code = 'stay.manage' THEN 1 ELSE 0 END) AS has_it
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    GROUP BY r.id ORDER BY r.code`);
  roles.forEach(r => console.log('   ' + (r.has_it ? 'yes' : 'NO ') + '  ' + r.code));

  if (USER) {
    const u = await db.one(`
      SELECT u.username, u.is_active, r.code AS role_code, u.running_room_id
      FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ?`, [USER]);
    if (!u) console.log('\n   no user called ' + USER);
    else {
      const ok = await db.scalar(`
        SELECT COUNT(*) FROM users u
        JOIN role_permissions rp ON rp.role_id = u.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE u.username = ? AND p.code = 'stay.manage'`, [USER]);
      console.log('\n   ' + u.username + ' is ' + u.role_code +
        ', posted to running room ' + (u.running_room_id ?? 'none') +
        ', may receive: ' + (ok ? 'YES' : 'NO'));
    }
  }

  // 3. the rows, and the test the template applies to each
  console.log('\n3. Consignments on record at this running room (most recent 40)');
  const rows = await db.query(`
    SELECT id, dispatch_date, item_type, quantity_sent, quantity_returned
    FROM laundry_dispatch WHERE running_room_id = ?
    ORDER BY dispatch_date DESC, id DESC LIMIT 40`, [rr.id]);
  if (!rows.length) console.log('   none — nothing has been sent to the wash from here');
  rows.forEach(r => {
    const open = r.quantity_returned < r.quantity_sent;
    console.log('   #' + r.id + '  ' + String(r.dispatch_date).slice(0, 10) + '  ' +
      String(r.item_type).padEnd(16) + ' sent ' + r.quantity_sent +
      ', back ' + r.quantity_returned + '  -> ' +
      (open ? 'receive link SHOWS' : 'fully back, no link'));
  });

  const open = rows.filter(r => r.quantity_returned < r.quantity_sent).length;
  console.log('\n   ' + open + ' consignment(s) still out.');
  if (!open && rows.length) {
    console.log('   Every consignment is already fully back, so there is nothing to receive');
    console.log('   and the link is correctly absent.');
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
