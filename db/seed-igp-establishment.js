#!/usr/bin/env node
/**
 * IGP's establishment, as the executed contract states it.
 *
 *   node db/seed-igp-establishment.js
 *
 * RR-CMS derives sanctioned strength from the tender's Schedule-A bed bands.
 * That is the right default for a running room whose contract nobody has read.
 * IGP's contract has now been read — GEMC-511687722391404, Part-A, pages 66-67 —
 * and it states the establishment directly: 107 men a day across nine posts,
 * for the five blocks IGP is entered as.
 *
 * WHY THIS MATTERS BEYOND TIDINESS. The monthly certification pack computes
 * man-days DUE against man-days PRESENT, and the difference is a shortfall the
 * Railway acts on. If "due" comes from a bed-band norm while the contract bought
 * something else, the shortfall is wrong — in whichever direction the norm
 * happens to differ — and it is wrong on a document that goes to an officer.
 *
 * The norm is not erased. `norm_count` keeps the derived figure, `is_overridden`
 * is set, and `override_reason` names the contract, so the difference stays on
 * the record rather than being quietly replaced.
 *
 * Idempotent: run it twice and nothing changes the second time.
 */
require('dotenv').config();
const db = require('../src/db');

const CONTRACT = 'GEMC-511687722391404';
const REASON = `As per ${CONTRACT} Part-A (pp. 66-67) — 107 per day across five blocks`;

// The contract's own table, in its own order.
const PART_A = [
  ['head_cook',      3,  'Head Cook (skilled), 24 Hrs, monitors all running room kitchens'],
  ['cook_veg',       8,  'Cooks (semi-skilled) 15 Nos over three shifts for 05 running rooms — split veg/non-veg'],
  ['cook_nonveg',    7,  'Cooks (semi-skilled) 15 Nos over three shifts for 05 running rooms — split veg/non-veg'],
  ['kitchen_helper', 15, 'Kitchen helper (semi-skilled), 24 Hrs in three shifts'],
  ['supervisor',     2,  'Canteen Supervisor (skilled), one per shift except night'],
  ['housekeeping',   25, 'Housekeeping (unskilled), 2 per shift per running room, 1 at night'],
  ['table_boy',      15, 'Table Boys (semi-skilled), 1 per shift per running room, veg and non-veg'],
  ['utensil_wash',   15, 'Utensils cleaner (unskilled), 1 per shift per running room'],
  ['rr_bearer',      15, 'Running room bearers (unskilled), 1 per shift per running room'],
  ['security',       2,  'Security Guard without arms — 1 at RR-3, 1 at RR-4'],
];

/* The contract gives Cooks as one cadre of 15. RR-CMS splits cooks into veg and
   non-veg because Schedule-A does and because the clause on separate utensils
   turns on it. 8 and 7 is a SPLIT OF THE CONTRACT'S FIFTEEN, not two figures
   from the paper, and it is recorded as such in the reason against each row so
   nobody later reads it as something the contract said. */

(async () => {
  /* BY REGISTER CODE, NOT BY NAME.
   *
   * TWO register entries are named "IGP": RR013, the Mumbai-division site the
   * pilot merges the five Igatpuri blocks into, and RR020, a separate 67-bed
   * entry in Bhusawal division. Matching on the name picked whichever came
   * first; matching on name plus "the one with more beds" was worse still,
   * because a `migrate.js seed` run resets RR013 to its unmerged 44 beds and
   * the tie-break then silently chose the WRONG DIVISION'S running room.
   *
   * A code does not move. */
  const rr = await db.one(
    `SELECT id, name, total_beds, status FROM running_rooms WHERE code = 'RR013'`);
  if (!rr) {
    console.error('\n  No running room RR013.');
    console.error('  Run db/seed-pilot.js first — it merges the five blocks and renames the survivor.\n');
    process.exit(1);
  }
  /* The BAND these rows belong to, read off the room's existing rows rather
   * than recomputed. A post the bed-band table has no row for still has to say
   * which band it was bought under: seed-pilot asks whether every live row
   * agrees on the band before deciding to re-derive, and a row carrying the bed
   * COUNT instead of the BAND made that check fire on every single run. */
  const b = await db.one(`
    SELECT band_beds FROM running_room_manpower
    WHERE running_room_id = ? AND effective_to IS NULL
    ORDER BY band_beds DESC LIMIT 1`, [rr.id]);
  const band = b ? b.band_beds : (rr.total_beds || 0);

  const total = PART_A.reduce((a, r) => a + r[1], 0);
  console.log(`\n  ${rr.name} (id ${rr.id}, ${rr.total_beds} beds) — establishment from ${CONTRACT}\n`);

  let changed = 0, same = 0;
  for (const [code, count, note] of PART_A) {
    const dg = await db.one('SELECT id, name FROM designations WHERE code = ?', [code]);
    if (!dg) { console.log(`  ! no designation "${code}" — run node db/migrate.js seed first`); continue; }

    const cur = await db.one(`
      SELECT * FROM running_room_manpower
      WHERE running_room_id = ? AND designation_id = ? AND effective_to IS NULL`, [rr.id, dg.id]);

    if (cur && cur.sanctioned_count === count && cur.is_overridden) { same++; continue; }

    if (cur) {
      // The derived figure stays in norm_count. Only what the Railway actually
      // bought moves.
      await db.execute(`
        UPDATE running_room_manpower
           SET sanctioned_count = ?, is_overridden = 1, override_reason = ?
         WHERE id = ?`, [count, `${REASON}. ${note}`, cur.id]);
      console.log(`  ${dg.name.padEnd(22)} ${String(cur.sanctioned_count).padStart(3)} -> ${String(count).padStart(3)}   (norm ${cur.norm_count})`);
    } else {
      // A post the bed-band norm never gave this room. band_beds and norm_count
      // record that plainly: the norm for this post here was nil.
      await db.execute(`
        INSERT INTO running_room_manpower
          (running_room_id, designation_id, band_beds, norm_count, sanctioned_count,
           is_scaled, is_overridden, override_reason, effective_from)
        VALUES (?,?,?,0,?,0,1,?,CURDATE())`,
        [rr.id, dg.id, band, count, `${REASON}. ${note}`]);
      console.log(`  ${dg.name.padEnd(22)}   —  -> ${String(count).padStart(3)}   (no norm for this post)`);
    }
    changed++;
  }

  /* POSTS THE CONTRACT DOES NOT BUY ARE STOOD DOWN TO NIL.
   *
   * The contract is the whole answer for the running rooms it covers. That is
   * the rule everywhere else in RR-CMS -- penalty clauses, cleaning schedule,
   * meal rates, newspapers, linen -- and manpower is where it matters most,
   * because sanctioned strength is what a shortfall is measured against on the
   * monthly certification pack.
   *
   * Five posts sit on the tender's bed-band table for a room this size and are
   * not in this contract's Part-A at all: Manager, Asstt. Cook, Call Boy,
   * Gardner, Sweeper. Leaving them sanctioned made the establishment read 128
   * where the contract buys 107, and no amount of labelling fixed that -- an
   * officer reading 128 is reading a number the Railway is not paying for.
   *
   * They are set to NIL, not deleted. `norm_count` keeps what the bed-band
   * table would have given and `override_reason` says why it does not apply, so
   * the question "the norm wants a Call Boy and the contract bought none" stays
   * answerable from the record. */
  const inContract = PART_A.map(r => r[0]);
  const others = await db.query(`
    SELECT m.id, m.sanctioned_count, m.norm_count, dg.name, dg.code
    FROM running_room_manpower m JOIN designations dg ON dg.id = m.designation_id
    WHERE m.running_room_id = ? AND m.effective_to IS NULL
      AND dg.code NOT IN (${inContract.map(() => '?').join(',')})`, [rr.id, ...inContract]);
  let stood = 0;
  for (const o of others) {
    if (Number(o.sanctioned_count) === 0 && o.is_overridden) continue;
    await db.execute(`
      UPDATE running_room_manpower
         SET sanctioned_count = 0, is_overridden = 1, override_reason = ?
       WHERE id = ?`,
      [`Not bought by ${CONTRACT}. The bed-band table gives ${o.norm_count} for a room `
       + 'this size; this contract\'s Part-A does not include the post.', o.id]);
    if (Number(o.sanctioned_count) !== 0) {
      console.log(`  ${o.name.padEnd(22)} ${String(o.sanctioned_count).padStart(3)} ->   0   (not in the contract)`);
      stood++;
    }
  }
  if (stood) console.log(`\n  ${stood} post(s) stood down to nil — the contract does not buy them.`);

  const now = await db.one(`
    SELECT COALESCE(SUM(sanctioned_count),0) AS n FROM running_room_manpower
    WHERE running_room_id = ? AND effective_to IS NULL`, [rr.id]);
  console.log(`\n  ${changed} changed, ${same} already correct.`);
  console.log(`  Sanctioned strength now ${now.n}; the contract's Part-A total is ${total}.`);
  if (Number(now.n) !== total) {
    console.log(`\n  ! These should be equal. Something outside Part-A is still sanctioned`);
    console.log(`    at this running room. Check running_room_manpower for rows with`);
    console.log(`    sanctioned_count > 0 whose designation is not in the contract.`);
    process.exit(1);
  }
  console.log();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
