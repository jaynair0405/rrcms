#!/usr/bin/env node
/**
 * Generates the sample dataset: contractors, contracts, staff, crew, monthly
 * occupancy figures, call book events, linen records, feedback, inspections
 * and deficiencies.
 *
 * NOT generated, because RRMS owns them: the occupancy register, bed
 * allotment, and meal / subsidy accounting.
 *
 * The running room register (44 sites, beds, categories, meal facility, female
 * accommodation) is REAL and comes from db/seeds/03_running_rooms.sql. Nothing
 * in this file touches it.
 *
 * Deterministic: the same seed always produces the same dataset, so a bug is
 * reproducible and two developers see identical numbers.
 *
 *   node db/seed-dummy.js            generate with the default seed
 *   node db/seed-dummy.js --seed 7   generate a different but repeatable set
 *   node db/seed-dummy.js --wipe     clear generated data first
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

// ---------- deterministic PRNG ----------
const argSeed = (() => { const i = process.argv.indexOf('--seed'); return i > -1 ? +process.argv[i + 1] : 20260804; })();
let _s = argSeed >>> 0;
function rnd() { _s = (_s + 0x6D2B79F5) >>> 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const R = (a, b) => a + rnd() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = a => a[RI(0, a.length - 1)];
const chance = p => rnd() < p;

// ---------- sample name pools (deliberately non-identifying) ----------
const CONTRACTORS = 'ABCDEFGHIJKLMNOP'.split('').map((x, i) => ({
  code: `CON-${String(i + 1).padStart(2, '0')}`, name: `Contractor ${x}`,
}));
const FIRST = ['Ramesh','Sunil','Anil','Mahesh','Ganesh','Prakash','Nitin','Sachin','Rahul','Vikas','Deepak','Sandeep','Amit','Rohit','Pravin','Ashok','Manoj','Kiran','Sagar','Vishal','Balaji','Shankar','Yogesh','Nilesh','Swapnil','Tushar','Umesh','Ravi','Santosh','Sunita','Kavita','Meena','Rekha','Anita'];
const LAST  = ['Patil','Jadhav','Shinde','Pawar','More','Chavan','Kale','Gaikwad','Sawant','Kadam','Bhosale','Salunkhe','Thorat','Mane','Nikam','Waghmare','Ingle','Rathod','Deshmukh','Kulkarni'];
const CREW_DESIG = ['Loco Pilot (Mail)','Loco Pilot (Goods)','Asstt. Loco Pilot','Guard / Train Manager','Chief Loco Inspector','Sr. Loco Pilot'];
const name = () => `${pick(FIRST)} ${pick(LAST)}`;

// Feedback text, tagged so a running room with no meal facility never receives
// a comment about food.
const FB = {
  good: [['Room was clean and bed linen fresh. Call book served on time.',0],
         ['Food was hot and tasty. Bearer service prompt.',1],
         ['AC working well, bathroom clean. No complaints.',0],
         ['Call boy woke me exactly on time, very courteous.',0],
         ['Fresh bedsheet provided on arrival within 10 minutes.',0],
         ['Kitchen hygiene visibly good, staff in proper uniform.',1]],
  fair: [['Overall satisfactory. Newspaper was not available in recreation room.',0],
         ['Room fine, but geyser takes long to heat.',0],
         ['Food average. Vegetable curry could be better.',1]],
  poor: [['Bedsheet had stains, appeared not properly washed.',0],
         ['Dinner served cold and dal quantity was less than menu.',1],
         ['Bathroom not cleaned, no liquid soap in dispenser.',0],
         ['Mosquito net torn, could not sleep properly.',0],
         ['Call book served 20 minutes late, nearly reported late for duty.',0],
         ['Water cooler not working since two days.',0]],
};

const pad = (n, w) => String(n).padStart(w, '0');
const d2s = d => d.toISOString().slice(0, 19).replace('T', ' ');
const day = (base, offset) => new Date(base.getTime() + offset * 86400000);
const MONTH_START = new Date(Date.UTC(2026, 6, 1));   // July 2026
const DAYS_IN_MONTH = 31;

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, multipleStatements: true,
  });

  const [rrs] = await db.query(`
    SELECT r.id, r.code, r.name, r.division_id, r.category, r.total_beds,
           r.has_meal_facility, r.ref_crews_per_day, r.ref_peak_occupancy
    FROM running_rooms r ORDER BY r.id`);
  if (!rrs.length) { console.error('  No running rooms. Run "npm run seed" first.'); process.exit(1); }

  if (process.argv.includes('--wipe')) {
    console.log('  wiping generated data ...');
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    for (const t of ['deficiencies','inspection_items','inspections','feedback_photos','feedback',
                     'monthly_grading','feedback_coverage','occupancy_monthly','staff_ratings',
                     'call_book','linen_daily_item','linen_daily','complaints','crew','attendance_daily','deployment_daily',
                     'staff_issues','staff_replacements','staff_documents','staff',
                     'contract_schedule_values','contract_running_rooms','contracts','contractors'])
      await db.query(`TRUNCATE TABLE ${t}`);
    await db.query('SET FOREIGN_KEY_CHECKS=1');
  }

  // ---------- contractors & contracts ----------
  await db.query(
    `INSERT INTO contractors (code,name,gst_no,contact_person,phone,is_active) VALUES ?
     ON DUPLICATE KEY UPDATE name=VALUES(name)`,
    [CONTRACTORS.map(c => [c.code, c.name, `27AAAAA${RI(1000,9999)}A1Z${RI(1,9)}`, name(), `9${RI(100000000,999999999)}`, 1])]);
  const [conRows] = await db.query('SELECT id, code FROM contractors ORDER BY id');
  const conIds = conRows.map(r => r.id);

  const rrContractor = new Map();
  rrs.forEach((rr, i) => rrContractor.set(rr.id, conIds[i % conIds.length]));

  const contracts = [], seen = new Set();
  for (const rr of rrs) {
    const cid = rrContractor.get(rr.id), key = `${cid}-${rr.division_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contracts.push([`RRCMS/${rr.division_id}/${cid}/${2024 + RI(0,2)}/${RI(11,99)}`, cid, rr.division_id,
      '2025-04-01', '2027-03-31', 'active', RI(3,12) * 100000]);
  }
  await db.query(`INSERT INTO contracts (agreement_no,contractor_id,division_id,start_date,end_date,status,security_deposit) VALUES ?`, [contracts]);
  const [ctRows] = await db.query('SELECT id, contractor_id, division_id FROM contracts');
  const ctByKey = new Map(ctRows.map(c => [`${c.contractor_id}-${c.division_id}`, c.id]));
  await db.query(`INSERT INTO contract_running_rooms (contract_id,running_room_id,effective_from) VALUES ?`,
    [rrs.map(rr => [ctByKey.get(`${rrContractor.get(rr.id)}-${rr.division_id}`), rr.id, '2025-04-01'])]);

  // ---------- contract staff, against the derived sanction ----------
  const [sanction] = await db.query(`
    SELECT m.running_room_id, m.designation_id, m.sanctioned_count
    FROM running_room_manpower m
    WHERE m.sanctioned_count > 0 AND m.effective_to IS NULL`);
  let sn = 0; const staff = [];
  for (const s of sanction) for (let i = 0; i < s.sanctioned_count; i++) {
    sn++;
    const approved = chance(0.94);
    staff.push([`CS${pad(sn,5)}`, name(), s.designation_id, s.running_room_id, rrContractor.get(s.running_room_id),
      `${2023 + RI(0,3)}-${pad(RI(1,12),2)}-${pad(RI(1,28),2)}`, `9${RI(100000000,999999999)}`,
      approved ? 'approved' : 'pending', approved ? '2026-01-15' : null, 1]);
  }
  for (let i = 0; i < staff.length; i += 500)
    await db.query(`INSERT INTO staff (staff_code,full_name,designation_id,running_room_id,contractor_id,
      date_of_joining,phone,screening_status,screened_on,is_active) VALUES ?`, [staff.slice(i, i + 500)]);
  const [staffRows] = await db.query('SELECT id, running_room_id FROM staff');
  const staffByRR = new Map();
  staffRows.forEach(s => { if (!staffByRR.has(s.running_room_id)) staffByRR.set(s.running_room_id, []); staffByRR.get(s.running_room_id).push(s.id); });

  // ---------- crew ----------
  // Crew are not imported from RRMS; a row appears when someone identifies
  // themselves at a QR form or is named on a call book entry.
  const crew = [];
  for (let i = 1; i <= 900; i++)
    crew.push([`CR${pad(100000 + i, 6)}`, name(), pick(CREW_DESIG),
      pick(['KYN','BSL','NGP','PA','SUR','DD','LNL','BPQ']),
      rrs[RI(0, rrs.length - 1)].division_id, chance(0.07) ? 1 : 0, 1]);
  for (let i = 0; i < crew.length; i += 500)
    await db.query(`INSERT INTO crew (crew_id_no,full_name,designation,headquarters,division_id,is_female,is_active) VALUES ?`,
      [crew.slice(i, i + 500)]);
  const [crewRows] = await db.query('SELECT id, full_name, crew_id_no FROM crew');

  // ---------- monthly occupancy figure (the 50% floor denominator) ----------
  // With no RRMS access this is typed in by the RR In-charge. Here it is derived
  // from the site's real crews-per-day figure so the sample numbers are sane.
  await db.query(`INSERT INTO occupancy_monthly
    (running_room_id, period_month, occupants_total, crew_days, peak_occupancy, source, remarks) VALUES ?
    ON DUPLICATE KEY UPDATE occupants_total=VALUES(occupants_total)`,
    [rrs.map(rr => {
      const perDay = rr.ref_crews_per_day || rr.total_beds;
      const total = Math.round(perDay * DAYS_IN_MONTH * R(0.9, 1.05));
      return [rr.id, '2026-07-01', total, total, rr.ref_peak_occupancy, 'manual',
              'Entered from the running room occupancy register (RRMS)'];
    })]);

  // ---------- service records + feedback ----------
  const SCALE = 0.12;                     // sample volume, not real throughput
  let cbTotal = 0, fbTotal = 0, lnTotal = 0;

  for (const rr of rrs) {
    const perDay = Math.max(1, Math.round((rr.ref_crews_per_day || rr.total_beds) * SCALE));
    const rrStaff = staffByRR.get(rr.id) || [];
    const t = rnd();
    const base = t < 0.78 ? R(4.0, 4.85) : t < 0.94 ? R(3.45, 4.05) : R(2.95, 3.5);

    // call book events
    const calls = [];
    for (let d = 0; d < DAYS_IN_MONTH; d++) for (let k = 0; k < perDay; k++) {
      const c = crewRows[RI(0, crewRows.length - 1)];
      const recv = new Date(day(MONTH_START, d).getTime() + RI(0, 23) * 3600000 + RI(0, 59) * 60000);
      const late = !chance(0.93);
      const served = new Date(recv.getTime() + (late ? RI(25, 70) : RI(2, 12)) * 60000);
      calls.push([rr.id, c.id, c.full_name, String(RI(1, rr.total_beds)), `${RI(11,22)}${RI(100,999)}`,
        d2s(recv), d2s(served), rrStaff.length ? pick(rrStaff) : null,
        chance(0.94) ? 1 : 0, d2s(served), late && chance(0.3) ? 1 : 0]);
    }
    for (let i = 0; i < calls.length; i += 500)
      await db.query(`INSERT INTO call_book (running_room_id,crew_id,crew_name,bed_no,call_for_train,
        call_received_at,served_at,served_by_staff_id,acknowledged,acknowledged_at,crew_reported_late)
        VALUES ?`, [calls.slice(i, i + 500)]);
    cbTotal += calls.length;

    // linen — a day header, and one row per item under it (migration 032)
    const linen = [], linenItems = [];
    const need = 2 * (rr.total_beds || 0);
    for (let d = 0; d < DAYS_IN_MONTH; d++) {
      const occ = Math.round(perDay * R(0.8, 1.1));
      const date = day(MONTH_START, d).toISOString().slice(0, 10);
      const hand = {
        bedsheet:     RI(20, 140), pillow_cover: RI(20, 140),
        mosquito_net: RI(5, 60),   blanket:      RI(5, 60), curtain: RI(0, 25),
      };
      const issued = {
        bedsheet: occ * 2, pillow_cover: occ,
        mosquito_net: chance(0.6) ? Math.round(occ * 0.4) : 0,
        blanket: chance(0.3) ? Math.round(occ * 0.3) : 0,
        curtain: 0,
      };
      for (const code of Object.keys(hand))
        linenItems.push([rr.id, date, code, issued[code], hand[code]]);
      // The flag is derived exactly as the application derives it, so seeded
      // data and entered data cannot disagree about what a green tick means.
      linen.push([rr.id, date,
        (hand.bedsheet >= need && hand.pillow_cover >= need) ? 1 : 0,
        chance(0.05) ? RI(1, 3) : 0]);
    }
    await db.query(`INSERT INTO linen_daily (running_room_id,record_date,
      min_stock_met,used_linen_reported) VALUES ?`, [linen]);
    for (let i = 0; i < linenItems.length; i += 500)
      await db.query(`INSERT INTO linen_daily_item (running_room_id,record_date,item_type,
        issued,fresh_in_hand) VALUES ?`, [linenItems.slice(i, i + 500)]);
    lnTotal += linen.length;

    // feedback — coverage deliberately varies around the 50% floor
    const [[occRow]] = await db.query(
      `SELECT occupants_total FROM occupancy_monthly WHERE running_room_id=? AND period_month='2026-07-01'`, [rr.id]);
    const coverage = R(0.46, 0.88);
    const wanted = Math.max(4, Math.round((occRow?.occupants_total || 100) * SCALE * coverage));
    const fb = [];
    for (let i = 0; i < wanted; i++) {
      const c = crewRows[RI(0, crewRows.length - 1)];
      const q = rnd();
      const bandName = q < 0.74 ? 'good' : q < 0.91 ? 'fair' : 'poor';
      const centre = bandName === 'good' ? Math.min(5, base + R(0.1, 0.5))
                   : bandName === 'fair' ? base : Math.max(1, base - R(0.9, 1.8));
      const jit = () => +Math.min(5, Math.max(1, centre + R(-0.4, 0.4))).toFixed(2);
      const pool = FB[bandName].filter(x => rr.has_meal_facility || !x[1]);
      const cl = jit(), fo = rr.has_meal_facility ? jit() : null, li = jit(), be = jit();
      const vals = [cl, li, be].concat(fo === null ? [] : [fo]);
      const when = new Date(day(MONTH_START, RI(0, DAYS_IN_MONTH - 1)).getTime() + RI(6, 22) * 3600000);
      fb.push([rr.id, c.id, c.full_name, c.crew_id_no, when.toISOString().slice(0, 10), d2s(when),
        pick(['qr_room','qr_dining','checkout_register','mobile_app']), cl, fo, li, be,
        +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2), pick(pool)[0],
        (chance(0.3) && rrStaff.length) ? pick(rrStaff) : null,
        bandName === 'poor' ? (chance(0.2) ? 'critical' : 'major') : 'normal',
        bandName === 'poor' ? 'open' : 'closed']);
    }
    for (let i = 0; i < fb.length; i += 500)
      await db.query(`INSERT INTO feedback (running_room_id,crew_id,crew_name,crew_id_entered,stay_date,
        submitted_at,channel,rating_cleanliness,rating_food,rating_linen,rating_behaviour,rating_overall,
        comments,named_staff_id,severity,status) VALUES ?`, [fb.slice(i, i + 500)]);
    fbTotal += fb.length;
  }

  // ---------- coverage & monthly grading ----------
  // Denominator is the typed-in occupancy figure, scaled to the sample volume.
  await db.query(`
    INSERT INTO feedback_coverage (running_room_id, period_month, occupants_total, feedback_received, coverage_pct, meets_floor)
    SELECT o.running_room_id, o.period_month,
           ROUND(o.occupants_total * ${SCALE}),
           COUNT(f.id),
           ROUND(COUNT(f.id) / GREATEST(ROUND(o.occupants_total * ${SCALE}),1) * 100, 2),
           IF(COUNT(f.id) / GREATEST(ROUND(o.occupants_total * ${SCALE}),1) >= 0.5, 1, 0)
    FROM occupancy_monthly o
    LEFT JOIN feedback f ON f.running_room_id = o.running_room_id
                        AND f.submitted_at >= o.period_month
                        AND f.submitted_at <  o.period_month + INTERVAL 1 MONTH
    GROUP BY o.running_room_id, o.period_month, o.occupants_total
    ON DUPLICATE KEY UPDATE occupants_total=VALUES(occupants_total),
      feedback_received=VALUES(feedback_received), coverage_pct=VALUES(coverage_pct), meets_floor=VALUES(meets_floor)`);

  for (const [head, col] of [['cleanliness','rating_cleanliness'], ['food','rating_food'], ['linen','rating_linen']]) {
    await db.query(`
      INSERT INTO monthly_grading (running_room_id, period_month, head, avg_rating, sample_size, r_value, coverage_met)
      SELECT f.running_room_id, '2026-07-01', ?, ROUND(AVG(f.${col}),2), COUNT(f.${col}),
             CASE WHEN AVG(f.${col}) > 4 THEN 5 WHEN AVG(f.${col}) > 3 THEN 4
                  WHEN AVG(f.${col}) > 2 THEN 3 WHEN AVG(f.${col}) > 1 THEN 2 ELSE 0 END,
             COALESCE(c.meets_floor, 0)
      FROM feedback f
      LEFT JOIN feedback_coverage c ON c.running_room_id = f.running_room_id AND c.period_month = '2026-07-01'
      WHERE f.${col} IS NOT NULL
      GROUP BY f.running_room_id, c.meets_floor
      ON DUPLICATE KEY UPDATE avg_rating=VALUES(avg_rating), sample_size=VALUES(sample_size),
        r_value=VALUES(r_value), coverage_met=VALUES(coverage_met)`, [head]);
  }

  // ---------- inspections & deficiencies (captured, never priced) ----------
  const [clauses] = await db.query(
    `SELECT id, clause_code, applies_to_meals FROM deficiency_clauses WHERE in_daily_checklist = 1 AND is_formula = 0`);
  let inspCount = 0, defCount = 0;
  for (const rr of rrs) {
    const usable = clauses.filter(c => rr.has_meal_facility || !c.applies_to_meals);
    for (let d = 0; d < DAYS_IN_MONTH; d++) {
      if (!chance(0.35)) continue;
      const date = day(MONTH_START, d).toISOString().slice(0, 10);
      const picked = usable.slice().sort(() => rnd() - 0.5).slice(0, RI(14, 20));
      const fails = picked.filter(() => chance(0.06));
      const [res] = await db.query(
        `INSERT INTO inspections (running_room_id,inspection_date,inspection_type,inspector_name,
          contractor_rep_name,items_checked,deficiency_count,result,submitted_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [rr.id, date, 'daily_joint', 'Sr. DEE (TRO) Representative', name(), picked.length, fails.length,
         fails.length === 0 ? 'compliant' : fails.length <= 2 ? 'minor_deficiencies' : 'major_deficiencies',
         `${date} 11:${pad(RI(0,59),2)}:00`]);
      inspCount++;
      await db.query(`INSERT INTO inspection_items (inspection_id,clause_id,status,quantity,observation) VALUES ?`,
        [picked.map(c => { const bad = fails.includes(c);
          return [res.insertId, c.id, bad ? 'not_complied' : 'complied', bad ? RI(1,4) : 0,
            bad ? 'Observed during joint inspection' : null]; })]);
      if (fails.length) {
        await db.query(`INSERT INTO deficiencies (running_room_id,clause_id,occurred_on,quantity,source,
          source_ref_table,source_ref_id,description,status) VALUES ?`,
          [fails.map(c => [rr.id, c.id, date, RI(1,4), 'daily_checklist', 'inspections', res.insertId,
            'Recorded on the daily joint compliance report', chance(0.6) ? 'rectified' : 'open'])]);
        defCount += fails.length;
      }
    }
  }

  // ---------- summary ----------
  const q1 = async s => (await db.query(s))[0][0].c;
  console.log(`\n  Sample data generated (seed ${argSeed})\n`);
  console.log(`    running rooms (real)   ${rrs.length}`);
  console.log(`    contractors            ${await q1('SELECT COUNT(*) c FROM contractors')}`);
  console.log(`    contracts              ${await q1('SELECT COUNT(*) c FROM contracts')}`);
  console.log(`    contract staff         ${await q1('SELECT COUNT(*) c FROM staff')}`);
  console.log(`    crew                   ${await q1('SELECT COUNT(*) c FROM crew')}`);
  console.log(`    occupancy months       ${await q1('SELECT COUNT(*) c FROM occupancy_monthly')}   (typed in - RRMS is the source)`);
  console.log(`    call book events       ${cbTotal}`);
  console.log(`    linen daily records    ${lnTotal}`);
  console.log(`    feedback               ${fbTotal}`);
  console.log(`    inspections            ${inspCount}`);
  console.log(`    deficiencies           ${defCount}   (captured, no amount computed)`);
  console.log(`\n  Not generated - RRMS owns these: occupancy register, bed allotment, meal accounting.\n`);
  await db.end();
}
main().catch(e => { console.error(e); process.exit(1); });
