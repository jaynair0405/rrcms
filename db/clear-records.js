#!/usr/bin/env node
/**
 * Clear the RECORDS made at a running room, leaving its setup alone.
 *
 *   node db/clear-records.js <RR-CODE>          -- show what would go
 *   node db/clear-records.js <RR-CODE> --yes    -- do it
 *
 * WHAT THIS IS FOR. Testing leaves a trail -- a muster marked, a dispatch sent,
 * a fault reported, a deficiency raised. Before the contract starts on
 * 10.09.2026 that trail has to go, or the first month's certification pack will
 * count a bed sheet somebody sent to the laundry to see whether the button
 * worked.
 *
 * WHAT IT KEEPS, AND WHY. The difference is between what somebody SET UP and
 * what somebody RECORDED. The establishment, the contract's terms, the asset
 * register, the staff on the roll, the day of the week the weekly cleaning
 * falls on -- those were decisions, not entries, and re-making them by hand is
 * exactly the work this is meant to save. Every kept table is named below with
 * its reason; anything not named is treated as a record and goes.
 *
 * The list of tables is READ FROM THE DATABASE, not written out here. A table
 * added next month is cleared without anybody remembering to update this file,
 * which is the opposite of how the pilot loader's roster guard was forgotten.
 */
require('dotenv').config();
const db = require('../src/db');

/* SETUP, not records. Each line is an argument, not a list entry. */
const KEEP = {
  running_rooms:          'the running room itself',
  running_room_manpower:  'the sanctioned establishment — 107 from the contract at IGP',
  contract_running_rooms: 'which agreement holds this site, and since when',
  staff:                  'the men on the roll; use db/clear-staff.js if you want those gone too',
  assets:                 'the asset register — the Part-C equipment the contract buys',
  cleaning_weekly_day:    'the day the Railway set for the weekly cleaning items',
  running_room_vendors:   'the approved washing centre and pest control operator',
  cctv_cameras:           'cameras registered at the site',
  call_sheet_trains:      'the running room\'s list of trains — a master, not a record',
  users:                  'logins are not records of work',
  food_licences:          'the FSSAI licence is a document, not an entry',
};

const CODE = (process.argv[2] || '').toUpperCase();
const GO = process.argv.includes('--yes');

(async () => {
  if (!CODE) {
    console.error('\n  usage: node db/clear-records.js <RR-CODE> [--yes]');
    console.error('  e.g.   node db/clear-records.js RR013 --yes\n');
    process.exit(1);
  }
  const rr = await db.one('SELECT id, code, name FROM running_rooms WHERE code = ?', [CODE]);
  if (!rr) { console.error(`\n  No running room with code ${CODE}.\n`); process.exit(1); }

  const tables = (await db.query(`
    SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'running_room_id'
     ORDER BY TABLE_NAME`)).map(r => r.t).filter(t => !KEEP[t]);

  console.log(`\n  ${rr.name} (${rr.code}) — records made here\n`);
  const counts = {};
  let total = 0;
  for (const t of tables) {
    const [row] = await db.query(`SELECT COUNT(*) AS c FROM \`${t}\` WHERE running_room_id = ?`, [rr.id]);
    counts[t] = row.c; total += row.c;
    if (row.c) console.log(`    ${String(row.c).padStart(6)}  ${t}`);
  }
  if (!total) { console.log('    nothing recorded here.\n'); process.exit(0); }
  console.log(`    ${String(total).padStart(6)}  in all`);

  console.log('\n  Left alone:');
  Object.entries(KEEP).forEach(([t, why]) => console.log(`            ${t.padEnd(24)} ${why}`));

  if (!GO) {
    console.log(`\n  Nothing has been changed. Add --yes to clear these records:`);
    console.log(`    node db/clear-records.js ${rr.code} --yes\n`);
    process.exit(0);
  }

  /* DELETE IN WHATEVER ORDER THE FOREIGN KEYS ALLOW.
   *
   * Children are deleted before parents, and the dependency order is not
   * written down here -- it is discovered by trying. A pass deletes everything
   * it can; anything a foreign key refuses is left for the next pass, and the
   * passes repeat while progress is being made. Turning foreign key checks off
   * would be quicker and would leave orphans in tables that have no
   * running_room_id of their own to find them by.
   */
  let left = tables.filter(t => counts[t]);
  const done = {};
  for (let pass = 1; left.length && pass <= 12; pass++) {
    const failed = [];
    for (const t of left) {
      try {
        const r = await db.execute(`DELETE FROM \`${t}\` WHERE running_room_id = ?`, [rr.id]);
        done[t] = (done[t] || 0) + r.affectedRows;
      } catch (e) {
        if (/foreign key|FOREIGN KEY|1451/i.test(e.message)) { failed.push(t); continue; }
        throw e;
      }
    }
    if (failed.length === left.length) {
      console.error(`\n  Stuck: ${failed.join(', ')} could not be cleared — something outside this`);
      console.error('  running room still refers to those rows. Nothing further was deleted.\n');
      process.exit(1);
    }
    left = failed;
  }

  console.log('\n  Cleared:');
  Object.entries(done).filter(([, n]) => n)
    .forEach(([t, n]) => console.log(`    ${String(n).padStart(6)}  ${t}`));
  console.log(`\n  ${rr.name} is ready for a clean test. Setup untouched.\n`);
  process.exit(0);
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
