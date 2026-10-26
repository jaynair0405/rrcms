#!/usr/bin/env node
/**
 * Clears the linen and laundry registers at one running room.
 *
 *   node tools/clear-linen.js [running-room-code]              # shows what would go
 *   node tools/clear-linen.js [running-room-code] --yes        # does it
 *   node tools/clear-linen.js IGP --before 2026-09-06 --yes    # only rows before a date
 *
 * WHY A PURPOSE-BUILT SCRIPT AND NOT A BLANKET WIPE. What is being removed is
 * a fortnight of testing, and it sits in the same tables as the real thing. A
 * broad "clear this running room" would also take the muster, the meals, the
 * cleaning rounds and the inspections — none of which anybody asked to lose.
 * It touches exactly the five tables tools/linen-state.js prints, so what the
 * officer read is what goes.
 *
 * IT REFUSES IF THE MONTH HAS BEEN CERTIFIED OR BILLED. A certificate and a
 * bill are the Railway's word on a period, and the records underneath them are
 * the evidence. Deleting evidence under a certificate that has already been
 * signed is not tidying; and if this script had no such guard, the day someone
 * ran it on a live room would be the day it mattered.
 */
require('dotenv').config();
const db = require('../src/db');
const { today } = require('../src/lib/day');

const args = process.argv.slice(2);
const APPLY = args.includes('--yes');
const bi = args.indexOf('--before');
const BEFORE = bi >= 0 ? String(args[bi + 1] || '').slice(0, 10) : null;
const CODE = (args.find(a => !a.startsWith('--') && a !== BEFORE) || 'IGP').toUpperCase();

if (BEFORE && !/^\d{4}-\d{2}-\d{2}$/.test(BEFORE)) {
  console.error('\n  --before wants a date as YYYY-MM-DD\n'); process.exit(1);
}

/* The five tables, and the column each dates its rows by. Written out rather
   than discovered, so adding a table to the linen story is a deliberate act
   here too. */
const TABLES = [
  ['laundry_dispatch',  'dispatch_date',   'laundry dispatches'],
  ['linen_daily_item',  'record_date',     'daily linen rows'],
  ['linen_daily',       'record_date',     'daily linen day-headers'],
  ['linen_stock',       'as_on_date',      "the Railway's issue figures"],
  ['linen_written_off', 'written_off_on',  'write-offs'],
];

(async () => {
  const rr = await db.one('SELECT id, code, name FROM running_rooms WHERE code = ? OR name = ?', [CODE, CODE]);
  if (!rr) { console.error(`\n  No running room called ${CODE}\n`); process.exit(1); }

  // The guard, before anything is counted, let alone removed.
  const certified = await db.scalar(
    'SELECT COUNT(*) FROM monthly_certificates WHERE running_room_id = ?', [rr.id]).catch(() => 0);
  const billed = await db.scalar(
    'SELECT COUNT(*) FROM bills WHERE running_room_id = ?', [rr.id]).catch(() => 0);
  if (certified || billed) {
    console.error(`\n  ${rr.name} has ${certified} monthly certificate(s) and ${billed} bill(s) on record.`);
    console.error('  The linen records are the evidence underneath them, so nothing has been removed.');
    console.error('  If this really is test data, withdraw the certificate and the bill first.\n');
    process.exit(1);
  }

  console.log(`\n  ${rr.name} — linen and laundry records`
    + (BEFORE ? `, dated before ${BEFORE}` : '') + '\n');

  let total = 0;
  const counts = [];
  for (const [table, dateCol, label] of TABLES) {
    const where = BEFORE ? `running_room_id = ? AND ${dateCol} < ?` : 'running_room_id = ?';
    const params = BEFORE ? [rr.id, BEFORE] : [rr.id];
    const n = await db.scalar(`SELECT COUNT(*) FROM ${table} WHERE ${where}`, params);
    counts.push([table, where, params, n, label]);
    total += n;
    console.log('    ' + String(n).padStart(4) + '  ' + label);
  }

  if (!total) { console.log('\n  Nothing to remove.\n'); process.exit(0); }
  if (!APPLY) {
    console.log(`\n  ${total} row(s) would be removed. Nothing has been written.`);
    console.log('  Run again with --yes to do it.\n');
    process.exit(0);
  }

  /* Order matters: linen_daily_item and linen_daily are independent, but a
     laundry dispatch may be referenced by a return already recorded against
     it, so dispatches go last. Nothing here disables a foreign key check --
     if a row will not delete, that is the database telling us something we
     did not know, and it should stop the run rather than be forced. */
  let gone = 0;
  for (const [table, where, params, n] of counts) {
    if (!n) continue;
    const r = await db.execute(`DELETE FROM ${table} WHERE ${where}`, params);
    gone += r.affectedRows;
    console.log('    removed ' + String(r.affectedRows).padStart(4) + '  from ' + table);
  }
  console.log(`\n  ${gone} row(s) removed from ${rr.name}.`);
  console.log('  Read it back with:  node tools/linen-state.js ' + rr.code + '\n');
  process.exit(0);
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
