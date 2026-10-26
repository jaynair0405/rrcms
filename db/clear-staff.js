#!/usr/bin/env node
/**
 * Clear a running room's roster.
 *
 *   node db/clear-staff.js <RR-CODE>          -- show what would go
 *   node db/clear-staff.js <RR-CODE> --yes    -- do it
 *
 * WHY THIS EXISTS. When a contract changes hands the men change with it. IGP's
 * contractor changes on 10.09.2026, so the 31 names loaded from the old
 * roster describe nobody who will be there. Leaving them would put a muster in
 * front of a supervisor listing men who do not work for him.
 *
 * WHAT IT DOES NOT DO. It does not touch any other running room, and it will
 * not run without the room's register code -- not its name, which can be
 * ambiguous. It prints what will go and refuses unless --yes is given.
 *
 * WAGE PAYMENTS BLOCK IT. A man with a recorded wage payment is a man the
 * Railway has a record about, and `wage_payments` deliberately has no cascade:
 * deleting him would take the evidence with him. Those are reported and the
 * whole run refuses. Stand the men down instead -- `is_active = 0` -- which is
 * what a real handover does anyway.
 *
 * After a successful clear the running room is marked ROSTER CLEARED so
 * db/seed-pilot.js will not quietly load the old names back on its next run.
 */
require('dotenv').config();
const db = require('../src/db');

const CODE = (process.argv[2] || '').toUpperCase();
const GO = process.argv.includes('--yes');

(async () => {
  if (!CODE) {
    console.error('\n  usage: node db/clear-staff.js <RR-CODE> [--yes]');
    console.error('  e.g.   node db/clear-staff.js RR013 --yes\n');
    process.exit(1);
  }
  const rr = await db.one('SELECT id, code, name FROM running_rooms WHERE code = ?', [CODE]);
  if (!rr) { console.error(`\n  No running room with code ${CODE}.\n`); process.exit(1); }

  const staff = await db.query(
    'SELECT id, staff_code, full_name, is_active FROM staff WHERE running_room_id = ?', [rr.id]);
  console.log(`\n  ${rr.name} (${rr.code}) — ${staff.length} on the roster\n`);
  if (!staff.length) { console.log('  Nothing to clear.\n'); process.exit(0); }

  const ids = staff.map(s => s.id);
  const marks = ids.map(() => '?').join(',');

  // Everything hanging off those men, counted before anything is touched.
  const counts = {};
  for (const [label, sql] of [
    ['muster (attendance) rows', `SELECT COUNT(*) c FROM attendance_daily WHERE staff_id IN (${marks})`],
    ['documents',            `SELECT COUNT(*) c FROM staff_documents WHERE staff_id IN (${marks})`],
    ['monthly ratings',      `SELECT COUNT(*) c FROM staff_ratings WHERE staff_id IN (${marks})`],
    ['wage payments',        `SELECT COUNT(*) c FROM wage_payments WHERE staff_id IN (${marks})`],
  ]) {
    try { const [r] = await db.query(sql, ids); counts[label] = r ? r.c : 0; }
    catch { counts[label] = null; }   // table not in this build
  }
  Object.entries(counts).forEach(([k, v]) => {
    if (v !== null) console.log(`    ${String(v).padStart(5)}  ${k}`);
  });

  if (counts['wage payments']) {
    console.error(`\n  REFUSED. ${counts['wage payments']} wage payment(s) are recorded against`);
    console.error('  these men. Deleting them would delete the record of what they were paid,');
    console.error('  and wage_payments has no cascade for exactly that reason.');
    console.error('\n  Stand them down instead — that is what a handover actually does:');
    console.error(`    UPDATE staff SET is_active = 0, date_of_leaving = CURDATE()`);
    console.error(`     WHERE running_room_id = ${rr.id} AND is_active = 1;\n`);
    process.exit(1);
  }

  if (!GO) {
    console.log(`\n  Nothing has been changed. Add --yes to clear the roster:`);
    console.log(`    node db/clear-staff.js ${rr.code} --yes\n`);
    process.exit(0);
  }

  // The rest cascade or null out on their own; the staff rows go last.
  const del = await db.execute(`DELETE FROM staff WHERE running_room_id = ?`, [rr.id]);

  /* Leave a mark so the pilot loader does not put the old names back.
   *
   * In its own column, not in `remarks`: the loader's merge step rewrites
   * remarks on every run and erased the first version of this mark before the
   * roster step could read it. See migration 045. */
  await db.execute(
    'UPDATE running_rooms SET roster_cleared_on = CURDATE() WHERE id = ?', [rr.id]);

  console.log(`\n  ${del.affectedRows} staff row(s) removed from ${rr.name}.`);
  console.log(`  ${rr.code} marked roster-cleared today — db/seed-pilot.js will not reload the old`);
  console.log(`  names. Use ROSTER=reload if you ever want them back.\n`);
  process.exit(0);
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
