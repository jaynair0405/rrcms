#!/usr/bin/env node
/**
 * Loads the pilot: IGP, LNL, ROHA and JNPT, with the rosters the Railway
 * supplied.
 *
 *   node db/seed-pilot.js            load the pilot alongside whatever is there
 *   node db/seed-pilot.js --only     clear the generated sample data first, so
 *                                    the database holds the pilot and nothing else
 *
 * Three things this script will not do, because each would put a number on a
 * screen that nobody can vouch for:
 *
 *   - It invents no dates of joining, no bank accounts, no EPF or ESIC
 *     numbers. Those columns stay NULL and every person loads at screening
 *     status 'pending', which is the truth: they have not been screened.
 *
 *   - It invents no contractor. The four placeholder firms are named as
 *     placeholders and their agreement numbers begin PLACEHOLDER/, so the
 *     records that need correcting can be found with one grep.
 *
 *   - It creates no FSSAI licence. IGP, LNL, ROHA and JNPT all serve food and
 *     all four will show as unlicensed until the certificates are lodged.
 *     That is a finding, and hiding it would defeat the purpose of the module.
 *
 * Re-running is safe. Staff are matched on (running room, name, designation),
 * so a second run corrects rather than duplicates.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const DATA = path.join(__dirname, '..', 'data', 'pilot');
const SITES = JSON.parse(fs.readFileSync(path.join(DATA, 'sites.json'), 'utf8'));
const STAFF = JSON.parse(fs.readFileSync(path.join(DATA, 'staff.json'), 'utf8'));
const CONTRACTORS = JSON.parse(fs.readFileSync(path.join(DATA, 'contractors.json'), 'utf8'));

const ONLY = process.argv.includes('--only');
const log = (...a) => console.log(' ', ...a);

/** Schedule A bands the tender tabulates. */
const bandOf = b => b < 50 ? 50 : b <= 110 ? 100 : b <= 160 ? 150 : b <= 210 ? 200 : 250;
/** The register's own category rule, read off the 44 sites: A is 35 beds up. */
const categoryOf = b => b >= 35 ? 'A' : b >= 25 ? 'B' : 'C';

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, multipleStatements: true,
  });
  const q = async (sql, p = []) => (await db.query(sql, p))[0];
  const one = async (sql, p = []) => (await q(sql, p))[0] || null;

  /**
   * Finds a running room by name WITHIN THE PILOT DIVISION, and refuses to
   * guess. Names repeat across Central Railway -- the register holds an IGP
   * in Mumbai and another in Bhusaval -- and a loader that quietly took the
   * first match would put Igatpuri's roster into the wrong division's site
   * with nothing on any screen to show it had happened.
   */
  const DIV = SITES.division;
  // By CODE. A register code is stable across a merge; a name is not, and every
  // lookup that used a name had to guess which side of a merge it was on.
  async function roomByCode(code) {
    const rows = await q(`
      SELECT rr.* FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      WHERE rr.code = ? AND d.code = ?`, [code, DIV]);
    return rows[0] || null;
  }

  async function room(name) {
    const rows = await q(`
      SELECT rr.* FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      WHERE rr.name = ? AND d.code = ?`, [name, DIV]);
    if (rows.length > 1) {
      throw new Error(`"${name}" matches ${rows.length} running rooms in ${DIV}. `
        + 'Give it a distinct name in the register before loading the pilot.');
    }
    return rows[0] || null;
  }

  console.log('\n  Pilot load — IGP, LNL, ROHA, JNPT\n');

  /* ---------------------------------------------------------- clear out */
  if (ONLY) {
    // Order matters: children before parents. Everything here is generated
    // sample data; the register, the norms and the reference tables stay.
    const wipe = ['certificate_deficiencies', 'monthly_certificates', 'bill_documents', 'bills',
      'food_inspection_items', 'food_inspections', 'food_licence_returns', 'food_licences',
      'inspection_items', 'inspections', 'deficiencies',
      'feedback_photos', 'feedback', 'feedback_coverage', 'monthly_grading', 'staff_ratings',
      'complaints', 'call_book', 'linen_daily_item', 'linen_daily', 'linen_stock', 'deployment_daily',
      'attendance_daily', 'occupancy_monthly',
      'asset_breakdowns', 'assets', 'consumable_issues', 'pest_control_log', 'laundry_dispatch',
      'kitchen_compliance', 'running_room_vendors', 'vendors',
      'staff_replacements', 'staff_issues', 'staff_documents', 'staff',
      'crew', 'contract_schedule_values', 'contract_running_rooms', 'contracts', 'contractors'];
    await q('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of wipe) await q(`DELETE FROM \`${t}\``);
    await q('SET FOREIGN_KEY_CHECKS = 1');
    log(`cleared ${wipe.length} tables of generated sample data`);
  }

  /* ------------------------------------------------------------ merges
   *
   * RESOLVED BY CODE, AND RE-APPLIED EVERY RUN.
   *
   * This used to look the survivor up by name and skip the whole merge if a
   * room already carried the merged name. Both halves were wrong together, and
   * the pair of them cost 87 beds.
   *
   * A merge RENAMES the survivor: after the first run "IGP - LP Mail" no longer
   * exists, so a name lookup could only ever find it once. The skip was added to
   * stop the second run reporting that as a failure -- and from then on the
   * merge never ran again. Meanwhile db/seeds/03 carries the register's own
   * figures and resets total_beds and physical_rooms on EVERY
   * `node db/migrate.js seed`. So each seed run put IGP back to its 44-bed
   * register entry and the merge, seeing a room named "IGP", declined to fix
   * it. IGP read 44 beds instead of 131 and LNL 42 instead of 72, on a screen
   * that also carries the occupancy denominator and the linen-per-bed counts.
   * Nothing reported anything.
   *
   * Codes never change, so the merge is keyed on them and simply recomputes
   * every time. Running it twice cannot drift, and running it after a seed
   * repairs what the seed undid. */
  for (const m of SITES.merges) {
    const survivor = await roomByCode(m.survivor_code);
    if (!survivor) { log(`! survivor ${m.survivor_code} not found — skipping merge`); continue; }

    const absorbed = [];
    for (const c of m.absorb_codes) {
      const r = await roomByCode(c);
      if (r) absorbed.push(r);
    }
    /* THE SURVIVOR'S CONTRIBUTION COMES FROM sites.json, NOT FROM THE DATABASE.
     *
     * The merge writes the combined figures INTO the survivor's row, so after
     * the first run that row no longer holds its own register value. Summing it
     * again adds the parts to a total that already contains them: IGP went
     * 44 -> 131 -> 218 on a third run. The absorbed rooms are never mutated,
     * only closed, so they can be read from the database as they stand. */
    const reg = m.survivor_register;
    const merged = survivor.name === m.rename_to;

    // Not yet merged? Then the row still holds its register figures, and they
    // must match what sites.json restates. If db/seeds/03 has been corrected and
    // this file has not, stop rather than quietly write a stale total.
    if (!merged) {
      const drift = Object.keys(reg).filter(k => survivor[k] !== reg[k]);
      if (drift.length) {
        throw new Error(
          `${m.survivor_code} in the register no longer matches survivor_register `
          + `in data/pilot/sites.json (${drift.map(k => `${k}: ${survivor[k]} vs ${reg[k]}`).join(', ')}). `
          + 'Correct sites.json to match db/seeds/03 before loading the pilot.');
      }
    }

    const parts = [reg, ...absorbed];
    const beds  = parts.reduce((a, r) => a + r.total_beds, 0);
    /* THE ROOM COUNT COMES FROM THE BUILDINGS WHERE THEY ARE STATED.
       Summing physical_rooms off the register gave 25 for Igatpuri; the
       officer's list of the actual buildings gives 23, and the register was
       stale. Taking it here rather than correcting it afterwards means the
       merge and the block list agree in the same pass — a correction applied
       after the fact would report a repair on every single run, which is how
       a step that has silently stopped working looks identical to one that is
       doing its job. */
    const rooms = Array.isArray(m.blocks) && m.blocks.length
      ? m.blocks.reduce((a, b) => a + (b.physical_rooms || 0), 0)
      : parts.reduce((a, r) => a + r.physical_rooms, 0);
    const fem   = parts.reduce((a, r) => a + r.female_rooms, 0);
    const crews = parts.reduce((a, r) => a + r.ref_crews_per_day, 0);
    const peak  = parts.reduce((a, r) => a + r.ref_peak_occupancy, 0);

    await q(`UPDATE running_rooms SET name = ?, station_code = ?, category = ?,
                 physical_rooms = ?, total_beds = ?, female_rooms = ?,
                 ref_crews_per_day = ?, ref_peak_occupancy = ?, remarks = ?
               WHERE id = ?`,
        [m.rename_to, m.station_code, categoryOf(beds), rooms, beds, fem, crews, peak,
         `Merged for the pilot from ${parts.length} register entries: `
           + `${[m.survivor, ...absorbed.map(p => p.name)].join(', ')}. ${m.reason}`,
         survivor.id]);

    for (const r of absorbed) {
      await q(`UPDATE running_rooms SET status = 'closed', remarks = ?
               WHERE id = ?`,
        [`Absorbed into ${m.rename_to} for the pilot. Register entry retained, not deleted.`, r.id]);
    }
    // Say whether this run actually moved anything. A merge that silently
    // re-applies the same figures every time is indistinguishable from one that
    // has stopped running, which is exactly how the last fault hid.
    const moved = survivor.total_beds !== beds || survivor.physical_rooms !== rooms
                  || survivor.name !== m.rename_to;
    log(`${m.rename_to}: ${parts.length} register entries merged → ${beds} beds, ${rooms} rooms, `
      + `band ${bandOf(beds)}`
      + (moved ? `  (REPAIRED — was ${survivor.name}, ${survivor.total_beds} beds)` : '  (unchanged)'));
  }

  /* ------------------------------------------------------------- blocks
   *
   * A merged running room OCCUPIES THE BUILDINGS IT WAS MERGED FROM, and the
   * merge register already holds exactly the list. Igatpuri is one running
   * room of 131 beds standing in five buildings some distance apart; the
   * kitchen, the food licence, the staff and the 107 sanctioned posts are one,
   * because that is how the site actually works and how the contract states
   * it. What is per building is what is fixed in a building: the water cooler,
   * the camera, the cleaning round, the linen store, the place an inspector
   * found what he found.
   *
   * The blocks are DERIVED here rather than typed anywhere, for the same
   * reason the merge is: a second hand-kept copy of the register is a second
   * place for it to be wrong. Re-running this recomputes them.
   *
   * The sum is checked. Five blocks that do not add up to the running room's
   * own bed count mean the register and the merge have drifted apart, and a
   * block list that quietly disagrees with the room above it is worse than no
   * block list at all. */
  for (const m of SITES.merges) {
    const survivor = await roomByCode(m.survivor_code);
    if (!survivor) continue;
    const reg = m.survivor_register;

    /* WHERE THE BUILDING LIST COMES FROM.
       The register entries the merge is made of are a good FIRST guess at the
       buildings, and for Lonavla they are still the best thing there is. They
       were wrong for Igatpuri, and the officer said so: "change is there. this
       time my fault. the dashboard data was stale." The TRO dashboard listed
       five entries by crew type; the site is four buildings, and the posts
       have been renamed besides — Train Manager is what a Guard is now called.

       So where sites.json states the buildings, they govern, and the register
       becomes history rather than an authority. Where it does not, they are
       derived from the register as before. Either way the sum is checked, so a
       stale list cannot pass silently a second time. */
    const fromOfficer = Array.isArray(m.blocks) && m.blocks.length;
    const parts = fromOfficer
      ? m.blocks.map(b => ({ code: b.code, name: b.name, total_beds: b.total_beds,
                             physical_rooms: b.physical_rooms, female_rooms: b.female_rooms || 0,
                             cooks_here: b.cooks_here ? 1 : 0, stated: true }))
      : [{ code: m.survivor_code, name: m.survivor,
           total_beds: reg.total_beds, physical_rooms: reg.physical_rooms,
           female_rooms: reg.female_rooms }];
    if (!fromOfficer) {
      for (const c of m.absorb_codes) {
        const r = await roomByCode(c);
        if (r) parts.push({ code: c, name: r.name, total_beds: r.total_beds,
                            physical_rooms: r.physical_rooms, female_rooms: r.female_rooms });
      }
    }

    const beds = parts.reduce((a, p) => a + p.total_beds, 0);
    if (beds !== survivor.total_beds) {
      throw new Error(
        `${m.rename_to}: its blocks total ${beds} beds but the running room carries `
        + `${survivor.total_beds}. The merge register and data/pilot/sites.json have drifted. `
        + `Fix that before seeding blocks — a block list that disagrees with the room above it `
        + `is worse than none.`);
    }

    // A name the officer stated is used exactly as he stated it. A name taken
    // off the register has the site prefix removed — "IGP - BSL Gaurd" names a
    // building, not a site — and the register's own text, misspelling and all,
    // is kept in the remark rather than corrected away.
    const shortName = (raw, stated) => {
      if (stated) return String(raw);
      const t = String(raw).replace(/^\s*[A-Z]{2,4}\s*-\s*/i, '').trim();
      return (t || raw).replace(/\bGaurd\b/gi, 'Guard');
    };

    let i = 0, wrote = 0;
    for (const p of parts) {
      i += 1;
      /* THE UPDATE LIST IS THE POINT OF THIS STATEMENT, so read it before
         adding to it. Every column named here is OVERWRITTEN on every run from
         sites.json -- which is right for the things sites.json states, and
         destroys anything written by another step. `female_rooms` was in this
         list while the inventory importer also wrote it, and one re-run of this
         seed silently put LP Mail's one ladies' room back to zero. It is stated
         in sites.json now and the importer only checks it.
         kitchens, bathrooms, toilets and facts_as_on are NOT here on purpose:
         they are counted on the ground and this file knows nothing about them. */
      await q(`INSERT INTO running_room_blocks
          (running_room_id, code, name, total_beds, physical_rooms, female_rooms,
           cooks_here, is_active, sort_order, remarks)
        VALUES (?,?,?,?,?,?,?,1,?,?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), total_beds = VALUES(total_beds),
          physical_rooms = VALUES(physical_rooms), female_rooms = VALUES(female_rooms),
          cooks_here = VALUES(cooks_here),
          sort_order = VALUES(sort_order), remarks = VALUES(remarks)`,
        [survivor.id, p.code, shortName(p.name, p.stated), p.total_beds, p.physical_rooms,
         p.female_rooms || 0, p.cooks_here || 0, i * 10,
         p.stated
           ? `Stated by the officer, 4 September 2026. The TRO register was stale.`
           : `Register entry ${p.code}, listed as "${p.name}".`]);
      wrote += 1;
    }
    // A block that is no longer in the register is stood down, not deleted:
    // assets and cleaning rounds recorded against it must survive.
    const codes = parts.map(p => p.code);
    await q(`UPDATE running_room_blocks SET is_active = 0
              WHERE running_room_id = ? AND code NOT IN (${codes.map(() => '?').join(',')})`,
      [survivor.id, ...codes]);

    /* THE ROOM COUNT FOLLOWS THE BUILDINGS. The merge sums physical_rooms off
       the register, and where the officer has restated the buildings that sum
       is stale too — 25 against his 23. The bed count is not touched, because
       it agrees; if it ever did not, the guard above would have stopped the
       run rather than quietly choosing a side. */
    if (fromOfficer) {
      // Belt and braces: the merge above already took the room count from these
      // same buildings, so this should never differ. If it ever does, the two
      // halves of one fact have drifted and that must be said out loud rather
      // than repaired quietly.
      const roomsNow = parts.reduce((a, p) => a + (p.physical_rooms || 0), 0);
      const nowRow = await roomByCode(m.survivor_code);
      if (nowRow && roomsNow !== nowRow.physical_rooms) {
        log(`! ${m.rename_to}: the buildings total ${roomsNow} rooms but the running room `
          + `carries ${nowRow.physical_rooms}. Both are computed from sites.json — they should `
          + `not be able to differ.`);
      }
    }
    log(`${m.rename_to}: ${wrote} building${wrote === 1 ? '' : 's'} on record `
      + `— ${parts.map(p => shortName(p.name, p.stated) + ' ' + p.total_beds).join(', ')} = ${beds} beds`
      + (fromOfficer ? '   (as stated by the officer)' : '   (from the register)'));
  }

  /* ---------------------------------------------------------- new sites */
  for (const s of SITES.new_sites) {
    const exists = await room(s.name);
    if (exists) { log(`${s.name}: already on the register`); continue; }
    await q(`INSERT INTO running_rooms
        (code, name, station_code, division_id, control_dept_id, category,
         physical_rooms, total_beds, female_rooms, ref_crews_per_day, ref_peak_occupancy,
         has_meal_facility, has_housekeeping, ac_status, status, remarks)
      VALUES (?,?,?,(SELECT id FROM divisions WHERE code = ?),
              (SELECT id FROM control_departments WHERE code = ?),?,?,?,?,?,?,?,?,?,?,?)`,
      [s.code, s.name, s.station_code, s.division, s.control_dept, s.category,
       s.physical_rooms, s.total_beds, s.female_rooms, s.ref_crews_per_day, s.ref_peak_occupancy,
       s.has_meal_facility, s.has_housekeeping, s.ac_status, s.status, s.remarks]);
    log(`${s.name}: added to the register — ${s.total_beds} beds${s.provisional ? '  (PROVISIONAL)' : ''}`);
  }

  /* ------------------------------------- re-derive the sanctioned strength */
  // A merged site has a different bed count and therefore a different band,
  // so its Schedule A row is no longer the one seed 04 derived. Close the old
  // rows and derive again rather than editing them, so the history of what was
  // sanctioned when survives.
  const pilotNames = SITES.pilot;
  for (const name of pilotNames) {
    const rr = await room(name);
    if (!rr) continue;
    const band = bandOf(rr.total_beds);
    /* "Is the band already right?" -- asked as "does any live row disagree",
     * not as "is there exactly one distinct band". The old test broke as soon as
     * a contract added a post the bed-band table has no row for: those rows
     * carry the band they were bought under, a second distinct value appears,
     * and the check re-derived every single run for no reason. */
    const live = await one(
      `SELECT COUNT(*) AS n, SUM(band_beds <> ?) AS wrong
       FROM running_room_manpower WHERE running_room_id = ? AND effective_to IS NULL`,
      [band, rr.id]);
    if (live && Number(live.n) > 0 && Number(live.wrong) === 0) continue;

    /* WHAT THE CONTRACT BOUGHT SURVIVES THE RE-DERIVATION.
     *
     * This closed every live manpower row and rebuilt them from the bed-band
     * table. Where a site's own contract had been read in, that threw the
     * contract away: IGP's 107 across nine posts went back to the norm's 49,
     * and three posts vanished outright -- Kitchen Helper, Running Room Bearer
     * and Housekeeping have no bed-band row to be rebuilt from, because the
     * tender's Schedule-A does not have those cadres at all.
     *
     * Worse, this is triggered BY the merge repair. Running seed-pilot to put
     * IGP's 131 beds back also silently undid its establishment -- one fix
     * quietly undoing another, for the third time in this stage.
     *
     * So the overrides are lifted out first and put back afterwards. The norm
     * is re-derived underneath them, exactly as intended, and norm_count keeps
     * the new derived figure so the difference stays visible. */
    const overrides = await q(`
      SELECT designation_id, sanctioned_count, override_reason
      FROM running_room_manpower
      WHERE running_room_id = ? AND effective_to IS NULL AND is_overridden = 1`, [rr.id]);

    /* Rows this same step created EARLIER TODAY are not history -- they are a
     * previous attempt. Closing them writes effective_to = effective_from =
     * today, which reads as a row that was never in force, and the fresh INSERT
     * then collides with them on (running_room, designation, effective_from).
     * That is what left IGP with 27 manpower rows and NOT ONE of them live.
     * Yesterday's rows are closed; today's are replaced. */
    await q(`DELETE FROM running_room_manpower
              WHERE running_room_id = ? AND effective_from = CURDATE()`, [rr.id]);
    await q(`UPDATE running_room_manpower SET effective_to = CURDATE()
             WHERE running_room_id = ? AND effective_to IS NULL`, [rr.id]);
    await q(`
      INSERT INTO running_room_manpower
        (running_room_id, designation_id, band_beds, norm_count, sanctioned_count,
         is_scaled, is_overridden, effective_from)
      SELECT ?, d.id, ?, n.sanctioned_count,
             CASE WHEN ? = 0 AND d.is_kitchen_role = 1 THEN 0 ELSE n.sanctioned_count END,
             0, 0, CURDATE()
      FROM designations d
      JOIN manpower_norms n ON n.designation_id = d.id AND n.band_beds = ?
      WHERE d.is_active = 1`,
      [rr.id, band, rr.has_meal_facility, band]);

    for (const o of overrides) {
      const fresh = await one(`
        SELECT id FROM running_room_manpower
        WHERE running_room_id = ? AND designation_id = ? AND effective_to IS NULL`,
        [rr.id, o.designation_id]);
      if (fresh) {
        await q(`UPDATE running_room_manpower
                    SET sanctioned_count = ?, is_overridden = 1, override_reason = ?
                  WHERE id = ?`, [o.sanctioned_count, o.override_reason, fresh.id]);
      } else {
        // A post the bed-band table has no row for at all. norm_count 0 records
        // that plainly: the norm for this post here is nil, and the contract
        // bought it anyway.
        await q(`INSERT INTO running_room_manpower
            (running_room_id, designation_id, band_beds, norm_count, sanctioned_count,
             is_scaled, is_overridden, override_reason, effective_from)
          VALUES (?,?,?,0,?,0,1,?,CURDATE())`,
          [rr.id, o.designation_id, band, o.sanctioned_count, o.override_reason]);
      }
    }

    const [{ c }] = await q(
      `SELECT SUM(sanctioned_count) c FROM running_room_manpower
       WHERE running_room_id = ? AND effective_to IS NULL`, [rr.id]);
    log(`${name}: sanctioned strength re-derived at band ${band} — ${c} posts`
      + (overrides.length
          ? `, of which ${overrides.length} post(s) carried forward from the contract`
          : ''));
  }

  /* --------------------------------------------- park what is not in scope */
  // The other forty running rooms are open and working; they are simply not on
  // this system yet. Marked not_in_scope they vanish from every working screen
  // while staying in the register, correctly described. Bringing a division on
  // later is one UPDATE, not a re-keying exercise.
  {
    const marks = pilotNames.map(() => '?').join(',');
    const parked = await q(`
      UPDATE running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      SET rr.status = 'not_in_scope',
          rr.remarks = CONCAT(COALESCE(NULLIF(rr.remarks,''), ''),
            CASE WHEN rr.remarks IS NULL OR rr.remarks = '' THEN '' ELSE ' ' END,
            'Not in the pilot. Open and working; not yet carried on this system.')
      WHERE rr.status = 'operational'
        AND NOT (d.code = ? AND rr.name IN (${marks}))`, [DIV, ...pilotNames]);
    if (parked.affectedRows) log(`${parked.affectedRows} running rooms parked as not_in_scope`);
  }

  /* ---------------------------------------------------- the contractors */
  // Three of these firms are real and named by the Railway; JNPT's is a
  // placeholder. What none of them has yet is an AGREEMENT, so the agreement
  // number carries AGREEMENT-AWAITED and the contract remark says why. The
  // number is the one field the schema will not let stay empty, and a made-up
  // one that looked plausible would be worse than one that plainly is not.
  const d = CONTRACTORS.contract_defaults;
  let realCount = 0, placeholderCount = 0;
  for (const c of CONTRACTORS.contractors) {
    const rr = await room(c.site);
    if (!rr) { log(`! no running room "${c.site}" in ${DIV} — skipping contractor`); continue; }

    // A superseded placeholder must not be left attached alongside the real
    // firm, or the running room shows two live contractors.
    await q(`UPDATE contract_running_rooms crr
             JOIN contracts ctr ON ctr.id = crr.contract_id
             JOIN contractors cn ON cn.id = ctr.contractor_id
             SET crr.effective_to = CURDATE()
             WHERE crr.running_room_id = ? AND crr.effective_to IS NULL
               AND cn.code <> ?`, [rr.id, c.code]);

    await q(`INSERT INTO contractors
               (code, name, address, gst_no, udyam_no, contact_person, phone, email, is_active)
             VALUES (?,?,?,?,?,?,?,?,1)
             ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address),
               gst_no = VALUES(gst_no), udyam_no = VALUES(udyam_no),
               contact_person = VALUES(contact_person), phone = VALUES(phone),
               email = VALUES(email)`,
      [c.code, c.name, c.address || null, c.gstin || null, c.udyam_no || null,
       c.contact_person || null, c.phone || null, c.email || null]);
    const ct = await one('SELECT id FROM contractors WHERE code = ?', [c.code]);

    // WHERE THE AGREEMENT HAS ARRIVED, IT IS THE RECORD.
    //
    // Until IGP's executed contract was read, every site here carried an
    // AGREEMENT-AWAITED number and an assumed 2025-27 period, and that assumed
    // period was twice mistaken on screen for a real one. A site with an
    // `agreement` block gets its own particulars; a site without one gets the
    // placeholder number and NO dates at all, so nothing has a date to
    // misread. Migration 037 made the period nullable for exactly this.
    const a = c.agreement || null;
    const agreement = a ? a.agreement_no : `AGREEMENT-AWAITED/${c.site}/${c.code}`;
    const remark = a ? a.remarks : [d.remarks, c.remarks].filter(Boolean).join(' ');

    // An earlier run may have written this site under the placeholder number.
    // Carry that row forward rather than leaving a second, dead contract behind.
    if (a) {
      const placeholder = `AGREEMENT-AWAITED/${c.site}/${c.code}`;
      const already = await one('SELECT id FROM contracts WHERE agreement_no = ?', [agreement]);
      const stale   = await one('SELECT id FROM contracts WHERE agreement_no = ?', [placeholder]);
      if (stale && !already) {
        await q('UPDATE contracts SET agreement_no = ? WHERE id = ?', [agreement, stale.id]);
        log(`${c.site}: placeholder agreement renamed to ${agreement}`);
      }
    }

    await q(`INSERT INTO contracts
        (agreement_no, bid_no, contractor_id, division_id, loa_date, start_date, end_date,
         total_value, epbg_percent, advisory_bank, buyer_office, paying_authority,
         billing_cycle, status, remarks, source_ref)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE contractor_id = VALUES(contractor_id),
        bid_no = VALUES(bid_no), loa_date = VALUES(loa_date),
        start_date = VALUES(start_date), end_date = VALUES(end_date),
        total_value = VALUES(total_value), epbg_percent = VALUES(epbg_percent),
        advisory_bank = VALUES(advisory_bank), buyer_office = VALUES(buyer_office),
        paying_authority = VALUES(paying_authority), billing_cycle = VALUES(billing_cycle),
        status = VALUES(status), remarks = VALUES(remarks), source_ref = VALUES(source_ref)`,
      [agreement, a ? a.bid_no || null : null, ct.id, rr.division_id,
       a ? a.loa_date || null : null,
       a ? a.start_date || null : d.start_date,
       a ? a.end_date   || null : d.end_date,
       a ? a.total_value || null : null,
       a ? a.epbg_percent || null : null,
       a ? a.advisory_bank || null : null,
       a ? a.buyer_office || null : null,
       a ? a.paying_authority || null : null,
       a ? a.billing_cycle || null : null,
       (a ? a.status : d.status) || 'active',
       remark,
       a ? a.source_ref || null : null]);
    const con = await one('SELECT id FROM contracts WHERE agreement_no = ?', [agreement]);

    /* ONE LINK PER CONTRACT PER ROOM.
     *
     * This looked only for an OPEN link and inserted when it found none -- so a
     * link that had been closed left a second row behind, and the contractor
     * page showed IGP twice: once for 2025-04-01 to today, once from the real
     * contract start. Two rows for one room under one agreement is not history,
     * it is noise; history is a link to a DIFFERENT contract, and that is kept.
     *
     * When the agreement particulars arrive, the existing link is corrected to
     * the contract's own start date rather than closed and duplicated. The
     * placeholder dates it carried were never real. */
    const from = (a && a.start_date) || d.start_date || new Date().toISOString().slice(0, 10);
    const existing = await q(
      `SELECT id FROM contract_running_rooms
        WHERE contract_id = ? AND running_room_id = ? ORDER BY id`, [con.id, rr.id]);
    if (!existing.length) {
      await q(`INSERT INTO contract_running_rooms (contract_id, running_room_id, effective_from)
               VALUES (?,?,?)`, [con.id, rr.id, from]);
    } else {
      await q(`UPDATE contract_running_rooms SET effective_from = ?, effective_to = NULL
                WHERE id = ?`, [from, existing[0].id]);
      if (existing.length > 1) {
        const extra = existing.slice(1).map(x => x.id);
        await q(`DELETE FROM contract_running_rooms WHERE id IN (${extra.map(() => '?').join(',')})`, extra);
        log(`${c.site}: ${extra.length} duplicate link(s) to the same agreement removed`);
      }
    }
    // Staff already loaded under a superseded placeholder must follow the site.
    await q('UPDATE staff SET contractor_id = ? WHERE running_room_id = ?', [ct.id, rr.id]);

    if (c.placeholder) placeholderCount++; else realCount++;
    log(`${c.site}: ${c.name}${c.placeholder ? '  (PLACEHOLDER)' : ''}`
      + `${a ? `  — ${a.agreement_no}, ${a.start_date} to ${a.end_date}` : '  — agreement awaited'}`
      + `${c.address ? '' : '  — address not supplied'}`);
  }
  log(`${realCount} contractor(s) named by the Railway, ${placeholderCount} still a placeholder`);

  // A firm that was attached on an earlier run and has since been replaced
  // still sits in the register. Stand it down rather than delete it: it may
  // hold history, and a contractor register listing four dead firms alongside
  // the live ones is exactly the confusion this system exists to remove.
  const stood = await q(`
    UPDATE contractors cn SET cn.is_active = 0
    WHERE cn.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM contracts ctr
        JOIN contract_running_rooms crr ON crr.contract_id = ctr.id
        WHERE ctr.contractor_id = cn.id AND crr.effective_to IS NULL)`);
  if (stood.affectedRows) log(`${stood.affectedRows} superseded contractor(s) stood down`);

  /* -------------------------------------------------------------- staff */
  const designations = await q('SELECT id, code, name FROM designations');
  const byCode = Object.fromEntries(designations.map(x => [x.code, x]));
  let added = 0, updated = 0;
  const mismatches = [];

  for (const [site, roster] of Object.entries(STAFF.rosters)) {
    if (!roster.staff.length) { log(`${site}: no roster supplied`); continue; }
    const rr = await room(site);
    if (!rr) { log(`! no running room "${site}" in ${DIV} — skipping roster`); continue; }

    /* A ROSTER IS NOT PUT BACK ONCE IT HAS BEEN DELIBERATELY CLEARED.
     *
     * IGP's contractor changes on 10.09.2026 and the men change with him, so
     * the old roster was cleared by db/clear-staff.js. Re-running this loader
     * would have loaded all 31 of them back -- the same shape of fault that
     * cost 87 beds and IGP's establishment earlier in this stage: a step that
     * re-runs from a source that does not know about a later correction.
     *
     * clear-staff.js sets running_rooms.roster_cleared_on. This honours it.
     * `ROSTER=reload` overrides.
     *
     * That mark lives in its OWN COLUMN and not in `remarks`, because the merge
     * step above rewrites remarks in this very same run -- the first version of
     * this guard was erased before the roster step could read it. */
    if (rr.roster_cleared_on && process.env.ROSTER !== 'reload') {
      const on = new Date(rr.roster_cleared_on).toISOString().slice(0, 10);
      log(`${site}: roster cleared ${on} — not reloading `
        + `(ROSTER=reload to override)`);
      continue;
    }
    const link = await one(`
      SELECT c.contractor_id FROM contract_running_rooms crr
      JOIN contracts c ON c.id = crr.contract_id
      WHERE crr.running_room_id = ? AND c.status = 'active' LIMIT 1`, [rr.id]);

    for (const p of roster.staff) {
      const code = STAFF.designation_map[p.designation];
      if (!code || !byCode[code]) {
        log(`! "${p.designation}" has no Schedule A equivalent — ${p.name} skipped`);
        continue;
      }
      const dg = byCode[code];
      if (dg.name.toLowerCase() !== p.designation.toLowerCase()) {
        mismatches.push({ site, name: p.name, said: p.designation, loaded: dg.name });
      }

      const found = await one(
        'SELECT id FROM staff WHERE running_room_id = ? AND full_name = ? AND designation_id = ?',
        [rr.id, p.name, dg.id]);
      if (found) { updated++; continue; }

      // The contractor's own word for the post is kept in the address field's
      // absence -- there is nowhere better today, so it goes in the remark the
      // screening officer reads. Nothing is invented: no joining date, no
      // bank account, no EPF, no ESIC.
      const res = await q(`
        INSERT INTO staff (staff_code, full_name, designation_id, running_room_id,
                           contractor_id, screening_status, is_active)
        VALUES ('', ?, ?, ?, ?, 'pending', 1)`,
        [p.name, dg.id, rr.id, link ? link.contractor_id : null]);
      await q(`UPDATE staff SET staff_code = ? WHERE id = ?`,
        [`${rr.code}-${String(res.insertId).padStart(5, '0')}`, res.insertId]);
      added++;
    }
    log(`${site}: ${roster.staff.length} on the roster from ${roster.source}`);
  }

  /* ------------------------------------------------------------ report */
  console.log(`\n  ${added} staff added, ${updated} already on record.\n`);

  if (mismatches.length) {
    console.log('  Where the contractor\'s word differs from Schedule A:');
    const grouped = {};
    mismatches.forEach(m => {
      const k = `${m.site}|${m.said}|${m.loaded}`;
      grouped[k] = (grouped[k] || 0) + 1;
    });
    Object.entries(grouped).forEach(([k, n]) => {
      const [site, said, loaded] = k.split('|');
      console.log(`    ${site.padEnd(6)} ${n} × "${said}" loaded as "${loaded}"`);
    });
    console.log();
  }

  // The comparison an officer will want first: who is short, who is over.
  console.log('  Sanctioned strength against the roster:\n');
  for (const name of pilotNames) {
    const rr = await room(name);
    if (!rr) continue;
    const rows = await q(`
      SELECT d.name, d.code, d.is_kitchen_role, m.sanctioned_count,
             (SELECT COUNT(*) FROM staff s WHERE s.running_room_id = m.running_room_id
                AND s.designation_id = m.designation_id AND s.is_active = 1) AS on_roll
      FROM running_room_manpower m JOIN designations d ON d.id = m.designation_id
      WHERE m.running_room_id = ? AND m.effective_to IS NULL AND m.sanctioned_count > 0
      ORDER BY d.sort_order`, [rr.id]);
    const tot = rows.reduce((a, r) => a + r.sanctioned_count, 0);
    const on  = rows.reduce((a, r) => a + Number(r.on_roll), 0);
    console.log(`  ${name} — ${rr.total_beds} beds, band ${bandOf(rr.total_beds)}: ${on} of ${tot} posts filled`);
    rows.filter(r => Number(r.on_roll) !== r.sanctioned_count).forEach(r => {
      const diff = Number(r.on_roll) - r.sanctioned_count;
      console.log(`      ${r.name.padEnd(20)} sanctioned ${String(r.sanctioned_count).padStart(2)}`
        + `  on roll ${String(r.on_roll).padStart(2)}   ${diff > 0 ? diff + ' OVER' : Math.abs(diff) + ' short'}`);
    });
    console.log();
  }

  console.log('  Still to come, and deliberately not invented:');
  console.log('    - the agreement number, LOA date, period, security deposit and');
  console.log('      performance guarantee for all four (search AGREEMENT-AWAITED/)');
  console.log("    - JNPT's contractor, once that contract is finalised (search PLACEHOLDER)");
  console.log("    - M/S Piyush Traders' address");
  console.log('    - JNPT\'s sanctioned beds, rooms and category (record marked PROVISIONAL)');
  console.log('    - the FSSAI licence for each of the four kitchens');
  console.log('    - Supervisor, Call Boy, Security, Gardner and Sweeper rosters');
  console.log('    - joining dates, bank, EPF and ESIC particulars, and the six screening documents\n');

  await db.end();
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
