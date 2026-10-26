/**
 * Demo data — generated in memory, no database.
 * The 44 running rooms are real; everything else is sample data.
 */
const rooms = require('../data/running_rooms.json');

let seed = 20260804;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const R = (a, b) => a + rnd() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = a => a[RI(0, a.length - 1)];

const DIVS = [
  { id: 1, code: 'BB',  name: 'Mumbai',   sort_order: 1 },
  { id: 2, code: 'BSL', name: 'Bhusaval', sort_order: 2 },
  { id: 3, code: 'NGP', name: 'Nagpur',   sort_order: 3 },
  { id: 4, code: 'PA',  name: 'Pune',     sort_order: 4 },
  { id: 5, code: 'SUR', name: 'Solapur',  sort_order: 5 },
];
const DIVID = Object.fromEntries(DIVS.map(d => [d.code, d.id]));
const CTRL = { Elect: 'Electrical', Mech: 'Mechanical', 'Sr DOM/BB': 'Operating (Sr. DOM)' };

const DESIGNATIONS = [
  ['manager','Manager','skilled',0,null,0],
  ['supervisor','Supervisor','skilled',0,null,3],
  ['head_cook','Head Cook','skilled',1,null,0],
  ['cook_veg','Cook (Veg)','semi_skilled',1,null,1],
  ['cook_nonveg','Cook (Non-Veg)','semi_skilled',1,null,0],
  ['asst_cook','Asstt. Cook','unskilled',1,null,1],
  ['table_boy','Table Boy/Bearer','unskilled',1,null,1],
  ['utensil_wash','Utensil Washing','unskilled',1,null,1],
  ['call_boy','Call Boy','unskilled',0,'Adequate knowledge of Hindi and Marathi',3],
  ['security','Security Guard','unskilled',0,null,0],
  ['gardner','Gardner','unskilled',0,null,0],
  ['sweeper','Sweeper','unskilled',0,null,1],
].map((d, i) => ({ id: i + 1, code: d[0], name: d[1], skill_category: d[2], is_kitchen_role: d[3],
  qualification_note: d[4], min_per_site: d[5], sort_order: i + 1, is_active: 1, requires_qualification: i < 3 ? 1 : 0 }));

const NORMS = {
  50 :{manager:0,supervisor:3,head_cook:0,cook_veg:3,cook_nonveg:0,asst_cook:3,table_boy:3,utensil_wash:3,call_boy:3,security:0,gardner:1,sweeper:3},
  100:{manager:1,supervisor:3,head_cook:1,cook_veg:3,cook_nonveg:2,asst_cook:9,table_boy:9,utensil_wash:3,call_boy:6,security:3,gardner:1,sweeper:4},
  150:{manager:1,supervisor:3,head_cook:1,cook_veg:6,cook_nonveg:3,asst_cook:9,table_boy:9,utensil_wash:3,call_boy:6,security:3,gardner:1,sweeper:4},
  200:{manager:1,supervisor:3,head_cook:1,cook_veg:6,cook_nonveg:3,asst_cook:9,table_boy:9,utensil_wash:3,call_boy:6,security:3,gardner:1,sweeper:5},
  250:{manager:1,supervisor:3,head_cook:1,cook_veg:6,cook_nonveg:3,asst_cook:9,table_boy:12,utensil_wash:3,call_boy:9,security:3,gardner:1,sweeper:6},
};
const bandOf = b => b < 50 ? 50 : b <= 110 ? 100 : b <= 160 ? 150 : b <= 210 ? 200 : 250;

const CONTRACTORS = 'ABCDEFGHIJKLMNOP'.split('').map((x, i) => ({
  id: i + 1, code: `CON-${String(i + 1).padStart(2, '0')}`, name: `Contractor ${x}`,
  gst_no: `27AAAAA${1000 + i}A1Z${i % 9 + 1}`, is_blacklisted: 0, is_active: 1,
}));

const RUNNING_ROOMS = rooms.map((r, i) => {
  const band = bandOf(r.beds);
  const contractor = CONTRACTORS[i % CONTRACTORS.length];
  return {
    id: i + 1, code: `RR${String(i + 1).padStart(3, '0')}`, name: r.loc,
    division_id: DIVID[r.div], div_code: r.div, div_name: DIVS.find(d => d.code === r.div).name,
    control_dept: CTRL[r.ctrl], category: r.cat,
    physical_rooms: r.rooms, total_beds: r.beds, female_rooms: r.femRooms,
    ref_crews_per_day: r.crewsDay, ref_peak_occupancy: r.peak,
    has_meal_facility: r.meal ? 1 : 0, has_housekeeping: 1,
    ac_status: r.ac === 'Working' ? 'working' : r.ac === 'NOT WKG' ? 'not_working' : 'partial',
    ac_remarks: r.ac === 'Working' || r.ac === 'NOT WKG' ? null : r.ac,
    status: 'operational', band, contractor_id: contractor.id, contractor: contractor.name,
    agreement_no: `RRCMS/${DIVID[r.div]}/${contractor.id}/2025/${11 + i}`,
  };
});

// Effective manpower — the two rules that are not in the tender's tables.
const KITCHEN = ['head_cook','cook_veg','cook_nonveg','asst_cook','table_boy','utensil_wash'];
const MANPOWER = {};
for (const rr of RUNNING_ROOMS) {
  const base = NORMS[rr.band];
  // Staffing is decided per site, not per post: most running rooms are at full
  // strength, a minority run short in one or two roles, a few carry a spare.
  // Deciding it post by post would leave almost every site short by accident.
  const mode = rnd();
  const staffing = mode < 0.70 ? 'full' : mode < 0.92 ? 'short' : 'spare';
  let toAdjust = staffing === 'full' ? 0 : RI(1, staffing === 'short' ? 3 : 2);
  MANPOWER[rr.id] = DESIGNATIONS.map(d => {
    const norm = base[d.code];
    let sanctioned;
    if (!rr.has_meal_facility && KITCHEN.includes(d.code)) sanctioned = 0;
    else if (norm === 0) sanctioned = 0;
    else if (rr.total_beds >= 50) sanctioned = norm;
    else sanctioned = Math.max(d.min_per_site, Math.round(norm * rr.total_beds / 50));
    return { name: d.name, skill_category: d.skill_category, is_kitchen_role: d.is_kitchen_role,
      norm_count: norm, sanctioned_count: sanctioned, is_scaled: rr.total_beds < 50 ? 1 : 0,
      band_beds: rr.band, is_overridden: 0, override_reason: null,
      on_roll: (function () {
        if (!sanctioned || !toAdjust || rnd() > 0.35) return sanctioned;
        toAdjust--;
        return Math.max(0, sanctioned + (staffing === 'short' ? -1 : 1));
      })(),
      designation_id: d.id };
  });
  rr.sanctioned = MANPOWER[rr.id].reduce((a, m) => a + m.sanctioned_count, 0);
  rr.on_roll    = MANPOWER[rr.id].reduce((a, m) => a + m.on_roll, 0);
}

// Grading and coverage — mostly healthy, a few weaker sites.
const COVERAGE = {}, GRADING = {}, DEFICIENCIES = {};
// `meals: 1` clauses can only arise at a running room that serves meals.
const CLAUSE_SAMPLE = [
  { code:'A4', meals:0, text:'Staff working without full uniform or in dirty uniform' },
  { code:'A9', meals:0, text:'Short deployment of manpower against prescribed strength' },
  { code:'A6', meals:0, text:'Poor cleaning against schedule — rooms, dining, lavatories' },
  { code:'C4', meals:0, text:'Used linen provided in place of fresh linen for bed attending' },
  { code:'C5', meals:0, text:'Failure to serve call book in time — crew late on duty' },
  { code:'D1', meals:0, text:'Non-supply of sanitary consumable items as per scope' },
  { code:'B7', meals:1, text:'Cooks / bearers without apron, mask, hairnet, gloves or name badge' },
  { code:'B10',meals:1, text:'Non-maintenance of 15 days grocery stock' },
];
// Six completed months of history, newest first, so [0] is still the latest
// month everywhere it was used before and the trend pages have something to plot.
const now = new Date();
const MONTHS = [];
for (let k = 1; k <= 6; k++) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
  MONTHS.push(d.toISOString().slice(0, 10));
}
const MONTH_LABEL = m => new Date(m + 'T00:00:00Z')
  .toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

for (const rr of RUNNING_ROOMS) {
  const t = rnd();
  const base = t < 0.78 ? R(4.0, 4.85) : t < 0.94 ? R(3.45, 4.05) : R(2.95, 3.5);
  // A site drifts month to month rather than jumping, so a trend line means
  // something. Direction is fixed per site; most sites improve slowly.
  const drift = rnd() < 0.62 ? R(0.02, 0.10) : -R(0.02, 0.12);
  const covBase = +R(46, 88).toFixed(1);
  const covDrift = rnd() < 0.7 ? R(0.5, 2.6) : -R(0.4, 2.2);

  COVERAGE[rr.id] = [];
  GRADING[rr.id] = [];
  MONTHS.forEach((month, k) => {
    const daysIn = new Date(new Date(month + 'T00:00:00Z').getUTCFullYear(),
      new Date(month + 'T00:00:00Z').getUTCMonth() + 1, 0).getDate();
    const occ = Math.round(rr.ref_crews_per_day * daysIn * R(0.9, 1.05));
    const pct = +Math.min(97, Math.max(18, covBase - covDrift * k + R(-2.5, 2.5))).toFixed(1);
    const received = Math.round(occ * pct / 100);
    COVERAGE[rr.id].push({ period_month: month, month_label: MONTH_LABEL(month),
      occupants_total: occ, feedback_received: received,
      coverage_pct: pct, meets_floor: pct >= 50 ? 1 : 0 });

    const monthBase = base - drift * k;
    ['cleanliness', 'food', 'linen']
      .filter(h => h !== 'food' || rr.has_meal_facility)
      .forEach(h => {
        const avg = +Math.min(5, Math.max(1, monthBase + R(-0.3, 0.3))).toFixed(2);
        const rv = avg > 4 ? 5 : avg > 3 ? 4 : avg > 2 ? 3 : avg > 1 ? 2 : 0;
        GRADING[rr.id].push({ period_month: month, month_label: MONTH_LABEL(month), head: h,
          avg_rating: avg, sample_size: received, r_value: rv, coverage_met: pct >= 50 ? 1 : 0 });
      });
  });
  const pct = COVERAGE[rr.id][0].coverage_pct;
  // The register itself is filled from inspections further down; this only
  // reserves the key so the inspection generator has somewhere to push.
  DEFICIENCIES[rr.id] = [];
}

/**
 * The tender's penalty annexure, parsed straight out of the seed file the real
 * database uses -- db/seeds/02_deficiency_clauses.sql -- rather than kept as a
 * shortened copy here.
 *
 * It was a shortened copy, and that hid the very thing this stage exists to
 * fix: the demo carried six monthly clauses out of twelve, so a screen that
 * could not reach them looked almost right. The two files now move together by
 * construction.
 */
const CLAUSES = (() => {
  const sql = require('fs').readFileSync(
    require('path').join(__dirname, '../db/seeds/02_deficiency_clauses.sql'), 'utf8');
  const rows = [];
  const re = /\('([A-Z0-9]+)','([A-Z])','([^']*)','((?:[^']|'')*)',\s*([\d.]+|NULL),\s*(?:'((?:[^']|'')*)'|NULL),\s*'(\w+)',\s*(\d),\s*(?:'((?:[^']|'')*)'|NULL),\s*(\d),\s*(\d)/g;
  let m;
  while ((m = re.exec(sql))) {
    rows.push({
      id: rows.length + 1, clause_code: m[1], group_code: m[2], group_name: m[3],
      description: m[4].replace(/''/g, "'"),
      rate: m[5] === 'NULL' ? null : Number(m[5]),
      unit: m[6] === undefined ? null : m[6].replace(/''/g, "'"),
      frequency: m[7], is_formula: +m[8],
      formula_note: m[9] === undefined ? null : m[9].replace(/''/g, "'"),
      in_daily_checklist: +m[10], applies_to_meals: +m[11], is_active: 1,
    });
  }
  if (rows.length < 40) throw new Error(`demo: parsed only ${rows.length} deficiency clauses from the seed`);
  return rows;
})();

// ---------- contract staff ----------
const FIRST = ['Ramesh','Sunil','Anil','Mahesh','Ganesh','Prakash','Nitin','Sachin','Rahul','Vikas','Deepak',
  'Sandeep','Amit','Rohit','Pravin','Ashok','Manoj','Kiran','Sagar','Vishal','Balaji','Shankar','Yogesh',
  'Nilesh','Swapnil','Tushar','Umesh','Ravi','Santosh','Sunita','Kavita','Meena','Rekha','Anita'];
const LAST = ['Patil','Jadhav','Shinde','Pawar','More','Chavan','Kale','Gaikwad','Sawant','Kadam','Bhosale',
  'Salunkhe','Thorat','Mane','Nikam','Waghmare','Ingle','Rathod','Deshmukh','Kulkarni'];
const nm = () => `${pick(FIRST)} ${pick(LAST)}`;
const iso = d => d.toISOString().slice(0, 10);
// Anchored to the machine's real date so the demo always has current records.
const TODAY = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const plusDays = n => iso(new Date(TODAY.getTime() + n * 86400000));

const STAFF = [], DOCS = {}, ISSUES = {}, REPLACEMENTS = {};
let sid = 0;
for (const rr of RUNNING_ROOMS) {
  for (const m of MANPOWER[rr.id]) {
    const d = DESIGNATIONS.find(x => x.id === m.designation_id);
    for (let i = 0; i < m.on_roll; i++) {
      sid++;
      const approved = rnd() < 0.9;
      const st = {
        id: sid, staff_code: `CS${String(sid).padStart(5, '0')}`, full_name: nm(),
        designation_id: d.id, designation: d.name, skill_category: d.skill_category,
        requires_qualification: d.requires_qualification, qualification_note: d.qualification_note,
        running_room_id: rr.id, rr_id: rr.id, rr_name: rr.name, div_code: rr.div_code,
        contractor_id: rr.contractor_id, contractor: rr.contractor, contractor_code: `CON-${String(rr.contractor_id).padStart(2,'0')}`,
        contractor_address: 'Plot 14, MIDC, Maharashtra',
        date_of_joining: `${2023 + RI(0,3)}-${String(RI(1,12)).padStart(2,'0')}-${String(RI(1,28)).padStart(2,'0')}`,
        date_of_birth: `${1975 + RI(0,25)}-${String(RI(1,12)).padStart(2,'0')}-${String(RI(1,28)).padStart(2,'0')}`,
        phone: `9${RI(100000000,999999999)}`, address: 'Maharashtra',
        epf_no: approved ? `MH/${RI(10000,99999)}/${RI(100,999)}` : null,
        esic_no: approved ? `${RI(1000000000,9999999999)}` : null,
        screening_status: approved ? 'approved' : (rnd() < 0.8 ? 'pending' : 'rejected'),
        screened_on: approved ? '2026-01-15' : null,
        rejection_reason: null, id_card_no: approved ? `IC${String(sid).padStart(5,'0')}` : null,
        id_card_issued_on: approved ? '2026-01-20' : null,
        agreement_no: rr.agreement_no, is_active: 1,
      };
      if (st.screening_status === 'rejected') st.rejection_reason = 'Police verification not produced within the stipulated time';
      STAFF.push(st);

      // documents — most complete, some deliberately short so the filters have work to do
      const docs = [];
      const add = (type, valid) => docs.push({ id: docs.length + 1, staff_id: sid, doc_type: type,
        reference_no: `${type.slice(0,3).toUpperCase()}${RI(10000,99999)}`,
        issued_on: `2026-0${RI(1,6)}-${String(RI(1,28)).padStart(2,'0')}`, valid_till: valid });
      if (approved || rnd() < 0.6) add('photo_id', null);
      if (approved || rnd() < 0.5) add('police_verification', null);
      if (approved && rnd() < 0.92) add('medical_fitness', rnd() < 0.12 ? plusDays(RI(5,55)) : plusDays(RI(120,330)));
      if (approved) { add('bank_proof', null); add('epf_proof', null); add('esic_proof', null); }
      if (d.requires_qualification && (approved ? rnd() < 0.88 : rnd() < 0.3)) add('qualification', null);
      DOCS[sid] = docs;

      // uniform and shoes — some overdue
      const lastUniform = rnd() < 0.25 ? RI(190, 400) : RI(5, 170);
      ISSUES[sid] = [
        { id: 1, staff_id: sid, issue_type: 'uniform', quantity: 2, issued_on: plusDays(-lastUniform),
          due_next_on: plusDays(-lastUniform + 182), acknowledged: rnd() < 0.85 ? 1 : 0 },
        { id: 2, staff_id: sid, issue_type: 'shoes', quantity: 1, issued_on: plusDays(-RI(30, 400)),
          due_next_on: plusDays(-RI(30, 400) + 365), acknowledged: rnd() < 0.8 ? 1 : 0 },
      ];
      REPLACEMENTS[sid] = rnd() < 0.06
        ? [{ effective_date: plusDays(-RI(20, 200)), designation: d.name,
             reason: pick(['Absconded without notice','Resigned','Removed for misbehaviour','Medical grounds']),
             railway_permission: rnd() < 0.5 ? 1 : 0 }]
        : [];
    }
  }
}

// ---------- service records ----------
const ATTENDANCE = new Map();     // `rr|date|staffId` -> { status, marked_at, countersigned_at }
const COUNTERSIGNED = new Set();  // `rr|date`

// Seed the muster for the last three completed months. Without it the monthly
// certificate reads "0 man-days present" against a full sanctioned strength,
// which looks like a broken screen rather than a staffing failure. Three months
// is enough for the certificate month picker's usual range without holding a
// year of per-person rows in memory.
{
  const t = new Date();
  const firstOfThisMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 3, 1));
  for (const rr of RUNNING_ROOMS) {
    const here = STAFF.filter(x => x.running_room_id === rr.id
      && x.is_active && x.screening_status === 'approved');
    if (!here.length) continue;
    // Each site has its own habit: some counter-sign daily, some let it slip.
    const signRate = 0.6 + rnd() * 0.38;
    for (let d = new Date(from); d < firstOfThisMonth; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      if (rnd() < 0.04) continue;                      // a day nobody marked
      for (const st of here) {
        const q = rnd();
        const status = q < 0.9 ? 'present' : q < 0.945 ? 'weekly_off'
                     : q < 0.98 ? 'leave' : q < 0.992 ? 'reliever' : 'absent';
        ATTENDANCE.set(`${rr.id}|${date}|${st.id}`, { status, marked_at: `${date} 08:15:00` });
      }
      if (rnd() < signRate) COUNTERSIGNED.add(`${rr.id}|${date}`);
    }
  }
}
const CALLBOOK = {}, CALLS = {}, SHEET_TRAINS = {}, CALL_CHANGES = [], LINEN = {}, LINEN_ITEM = {}, COMPLAINTS = {};
// Linen held, by item. A stock the Railway issued once and the room has been
// drawing on since -- so most of it is in service, some is at the laundry, and
// a little has been condemned. Nothing is generated for the pilot: no count has
// been taken at those four rooms, and inventing one would be inventing the
// figure the whole screen exists to establish.
const LINEN_STOCK = {};
// CCTV: what is installed, and what was found. Keyed by running room.
// Deliberately imperfect in the sample data -- a site with a camera missing
// from a required place, and one working camera recording nothing, because a
// register where everything is green teaches nobody how to read it.
const CCTV = {};
let camId = 0;
// Vendor premises inspections, joint asset checks, staff gradings and bills.
// All four are new registers at stage 18 and start EMPTY: nothing has been
// inspected, checked, graded or billed until somebody does it on the screen.
const VENDOR_INSPECTIONS = [];
const ASSET_CHECKS = [];          // { id, running_room_id, checked_on, ... , items: [] }
const STAFF_RATINGS = new Map();  // `${staffId}|${YYYY-MM-01}` -> row
const BILLS = [];
const BILL_DOCS = new Map();      // `${billId}|${docType}` -> row
// Meals ticked, keyed `${rrId}|${date}|${meal}|${crewId}`.
const MEALS = new Map();
// The Schedule B ceilings, mirroring db/seeds/06_meal_rates.sql. Printed beside
// the counts and multiplied by nothing.
const MEAL_RATES = [
  { meal_type: 'breakfast', effective_from: '2026-07-24', subsidised_rate: '37.80', full_rate: '42.00',
    source_ref: 'Indicative SCC for Running Rooms, Central Railway — L.326.OP.RR Lobby/08 dated 24.07.2026' },
  { meal_type: 'lunch', effective_from: '2026-07-24', subsidised_rate: '62.37', full_rate: '69.30',
    source_ref: 'Indicative SCC for Running Rooms, Central Railway — L.326.OP.RR Lobby/08 dated 24.07.2026' },
  { meal_type: 'dinner', effective_from: '2026-07-24', subsidised_rate: '62.37', full_rate: '69.30',
    source_ref: 'Indicative SCC for Running Rooms, Central Railway — L.326.OP.RR Lobby/08 dated 24.07.2026' },
];
// Table A and Table B, mirroring db/seeds/07_menu_items.sql. The tender's own
// list, and — as in the tender — NO RATE for any Table-B item: the cost column
// is printed blank and the figures are the Railway's to fix. The demo carries
// the same hole the real system carries, because a demo that quietly prices the
// rate board would hide the one thing the screen exists to say.
let miId = 0;
const MENU_ITEMS = [
  ['A-VEG-PLATE','A','Veg. Rice Plate','plate','any',
   'Three Parathas or Five fulkas, one full katori sabji (200 gms approx. with gravy), one katori dry sabji (100 grams approx), one full katori dal (200 gms approx.), one full plate rice (150 gms approx.), one roasted papad, pickle, curd (100 gm), kosambir/green salad containing onion, kakidi, lemon, tomato etc. (Weekly Menu will be decided.)'],
  ['A-EGG-PLATE','A','Egg Curry Rice Plate','plate','any',
   'Three Parathas or Five fulkas, one plate rice (150 gms approx.), Eggs curry 200 gms approx. with two boiled eggs, one roasted papad and green salad onion, kakidi, lemon, tomato etc.'],
  ['A-BREAKFAST','A','Breakfast (veg & non-veg)','plate','breakfast',
   'Veg — Two parotha of aloo/cabbage/methi/Palak OR 2 Masala Dosa with Chutney and Sambhar OR One plate Sheera + One plate Upma OR One plate Poha + One plate Sheera (150 gms plate) OR Four idlis + Two medu vada with sambhar and chutney OR 4 Puri + 150 gm Sabzi, + 200 ml Milk along with Tea/Coffee (Weekly Menu will be decided). Non-veg — two parotha/bread with double egg omelet + 200 ml milk along with Tea/Coffee.'],
  ['B-TEA-ORD','B','Tea (Ordinary 1:1 milk-water)','100 ml','any',null],
  ['B-TEA-SPL','B','Special Tea (with full milk)','100 ml','any',null],
  ['B-MILK','B','Milk (pure milk with sugar)','200 ml','any',null],
  ['B-COFFEE','B','Coffee (prepared with pure milk)','100 ml','any',null],
  ['B-PARATHAS','B','Parathas',null,'any',null],
  ['B-FULKA','B','Fulka',null,'any',null],
  ['B-DAL-FULL','B','Standard Dal per bowl (full)','200 ml','any',null],
  ['B-DAL-HALF','B','Standard Dal per bowl (half)','100 ml','any',null],
  ['B-RICE','B','Rice per bowl','150 gms','any',null],
  ['B-SABJI-W-FULL','B','Vegetable curry (wet) / sabji bowl (full)','200 ml','any',null],
  ['B-SABJI-W-HALF','B','Vegetable curry (wet) / sabji bowl (half)','100 ml','any',null],
  ['B-SABJI-D-FULL','B','Dry sabji (full bowl)','200 gms','any',null],
  ['B-SABJI-D-HALF','B','Dry sabji (half bowl)','100 gms','any',null],
  ['B-EGG2-CURRY','B','Double Egg with separate curry','200 ml','any',null],
  ['B-EGG1-CURRY','B','Single Egg with separate curry','100 ml','any',null],
  ['B-EGG2-BHURJI','B','Double Egg Bhurji',null,'any',null],
  ['B-EGG2-OMELET','B','Double Egg Omelet',null,'any',null],
  ['B-EGG1-BHURJI','B','Single Egg Bhurji',null,'any',null],
  ['B-EGG1-OMELET','B','Single Egg Omelet',null,'any',null],
  ['B-PARATHA','B','Paratha',null,'any',null],
  ['B-MASKA-SLICE','B','Maska slice (pair)',null,'any',null],
  ['B-CURD','B','Curd','100 gm','any',null],
  ['B-FRUITS','B','Seasonal Fruits',null,'any',null],
].map(([code, tbl, name, unit, applies, contents], i) => ({
  id: ++miId, code, schedule_table: tbl, name, unit, applies_to: applies, contents,
  sort_order: (i + 1) * 10, is_active: 1, source_ref: `Schedule B, Table-${tbl}`,
}));
// Deliberately empty. Two are priced so the screen can be seen working at all;
// the remaining twenty-one show as not fixed, which is the truth.
const MENU_RATES = [
  { id: 1, menu_item_id: MENU_ITEMS.find(i => i.code === 'B-TEA-ORD').id,
    effective_from: '2026-04-01', rate: '7.00', authority: 'DRM/BB rate order (demonstration only)', recorded_by: null },
  { id: 2, menu_item_id: MENU_ITEMS.find(i => i.code === 'B-MILK').id,
    effective_from: '2026-04-01', rate: '22.00', authority: 'DRM/BB rate order (demonstration only)', recorded_by: null },
];
// Filled below, once RUNNING_ROOMS exists.
// The cleaning schedule, mirroring db/seeds/08_cleaning_schedule.sql — the
// tender's own table, one row per round. Pest control is not here: it is
// monthly, done by a specialist agency, and has kept its own register since
// stage 6.
const CLEANING_SCHEDULE = [
  ['ROOMS-1','Open space, garden and outside compound; bed rooms, recreation hall and galleries','twice_daily',1,'06:00','10:00'],
  ['ROOMS-2','Open space, garden and outside compound; bed rooms, recreation hall and galleries','twice_daily',2,'16:00','20:00'],
  ['KITCHEN-1','Kitchen, kitchen store rooms, dining hall, bathrooms and lavatories with urinal','thrice_daily',1,'06:00','08:00'],
  ['KITCHEN-2','Kitchen, kitchen store rooms, dining hall, bathrooms and lavatories with urinal','thrice_daily',2,'13:00','15:00'],
  ['KITCHEN-3','Kitchen, kitchen store rooms, dining hall, bathrooms and lavatories with urinal','thrice_daily',3,'18:00','20:00'],
  ['FURNITURE','Racks, cupboards and furniture; windows and ventilators including grill and glass portions','weekly_sunday',1,'08:00','12:00'],
  ['WALLS','Wall surfaces including complete removal of cobwebs, dusting and cleaning of ceilings','sunday_2_4',1,'08:00','14:00'],
  ['GARBAGE-1','Wet and dry garbage collected separately and disposed away from the premises','twice_daily',1,null,null],
  ['GARBAGE-2','Wet and dry garbage collected separately and disposed away from the premises','twice_daily',2,null,null],
].map(([code, area_name, frequency, round_no, window_from, window_to], i) => ({
  id: i + 1, code, area_name, frequency, round_no, window_from, window_to,
  sort_order: (i + 1) * 10, is_active: 1,
  source_ref: code.startsWith('GARBAGE') ? 'Schedule C, scope for cleaning work, item viii'
                                         : 'Schedule C, cleaning schedule table',
}));
// Rounds recorded, keyed `${rrId}|${date}|${scheduleId}`; days verified,
// keyed `${rrId}|${date}`.
const CLEANING_LOG = new Map();
const CLEANING_DAY = new Map();

// Weekly menus, keyed `${rrId}|${weekStart}`; days keyed by plan id.
const MENU_PLANS = new Map();
const MENU_PLAN_DAYS = new Map();
let mpId = 0;

// A stand-in for the division's train master, `bbtro.div_trains`. Invented
// numbers in a block that does not exist, with names that are plainly not real
// trains -- the point is to prove the lookup, not to publish a timetable.
const TRAIN_MASTER = [
  ['91001', 'Deccan Test Express', 'CSMT', 'PUNE', 'Daily', 'UP'],
  ['91002', 'Deccan Test Express', 'PUNE', 'CSMT', 'Daily', 'DN'],
  ['91011', 'Konkan Test Mail', 'CSMT', 'ROHA', 'Daily', 'UP'],
  ['91012', 'Konkan Test Mail', 'ROHA', 'CSMT', 'Daily', 'DN'],
  ['91021', 'Ghat Test Passenger', 'IGP', 'MMR', 'XSUN', 'UP'],
  ['91022', 'Ghat Test Passenger', 'MMR', 'IGP', 'XSUN', 'DN'],
  ['91031', 'Lonavala Test Shuttle', 'LNL', 'PUNE', 'Daily', 'UP'],
  ['91032', 'Lonavala Test Shuttle', 'PUNE', 'LNL', 'Daily', 'DN'],
  ['91041', 'JNPT Test Goods Link', 'JNPT', 'KYN', 'MWF', 'UP'],
].map(([train_no, train_name, from_station, to_station, run_days, direction]) => ({
  train_no, train_name, train_type: 'Express', direction, run_days, from_station, to_station,
}));
let cbId = 0, callId = 0, stId = 0, cmId = 0;

const CREW_NAMES = Array.from({ length: 60 }, () => nm());
// Crew are a register in their own right, not a name typed into the call book.
// Two thirds carry a crew id number, which is roughly what the running rooms
// report: the number is written when it is known and left out when it is not.
const CREW = CREW_NAMES.map((n, i) => ({
  id: i + 1, full_name: n,
  crew_id_no: i % 3 === 2 ? null : `LP/${String(10000 + i * 7)}`,
  division_id: null, is_active: 1,
  source: i % 4 === 3 ? 'typed' : 'div_master',
  hrms_id: i % 4 === 3 ? null : `DEMO${String(100 + i)}`,
  designation: null, headquarters: null,
}));

/**
 * A stand-in for the division staff master CRTMS holds — for Mumbai,
 * `bbtro.div_staff_master`, read through the two narrow views described in
 * db/crtms/README.md.
 *
 * Every person here is invented. The real master carries Aadhaar and PAN
 * numbers, caste and dates of birth; none of that is copied into a demo, and
 * none of it is reachable by RR-CMS on a real installation either — it is not
 * granted, not merely not selected.
 *
 * Three quarters of the demo crew appear on it and one quarter do not, because
 * that is the truth of a running room: train managers are on the traffic
 * branch's books, not the running staff master, and crew booked in from other
 * divisions are on nobody's master that Mumbai can read.
 */
// The division's own numbering, carried so the demo can narrow the Loco Pilot
// box to drivers and the Assistant box to assistants — exactly as the real
// v_rr_crew_lookup does. Without the id the demo would happily let an ALP be
// booked as the LP, which is the very mis-key the narrowing exists to stop.
const CREW_DESIGNATIONS = [
  ['LPG', 'Loco Pilot Goods', 6], ['LPM', 'Loco Pilot Mail', 7],
  ['LPP', 'Loco Pilot Passenger', 2], ['LPS', 'Loco Pilot Shunting', 5],
  ['ALP', 'Assistant Loco Pilot', 1], ['MOTORMAN', 'Motorman', 5],
];
const CREW_HQ = ['KYN-ML', 'PNVL-ML', 'IGP-ML', 'LNL-ML', 'ROHA-ML'];
const CREW_MASTER = CREW.filter(c => c.hrms_id).map((c, i) => {
  const d = CREW_DESIGNATIONS[i % CREW_DESIGNATIONS.length];
  c.designation = d[1];
  c.headquarters = CREW_HQ[i % CREW_HQ.length];
  return {
    hrms_id: c.hrms_id, cms_id: c.crew_id_no || `DM/${String(20000 + i)}`,
    full_name: c.full_name, designation_id: d[2],
    designation_code: d[0], designation_name: d[1],
    hq_station: CREW_HQ[i % CREW_HQ.length], office_code: CREW_HQ[i % CREW_HQ.length],
    contact_number: '90000' + String(20000 + i).slice(-5),
  };
});
const REAL_SHEET = (() => {
  // The three rooms the Railway has actually supplied a timetable for.
  try { return JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'data', 'pilot', 'call-sheet.json'), 'utf8')); }
  catch (e) { return { rooms: {} }; }
})();

const hhmm = (h, m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

for (const rr of RUNNING_ROOMS) {
  // Call book — last 14 days. A call is ONE telephone call from the lobby: one
  // train, a sign-on time, and the men booked for it. Generating it as pairs
  // rather than as loose rows is not cosmetic — a demo that carries one man per
  // call would never exercise the case the whole redesign exists for, which is
  // the LP acknowledging and the ALP not.
  CALLBOOK[rr.id] = [];
  CALLS[rr.id] = [];

  // The room's own list of trains — the mirror of div_loco_link_master, and
  // what the daily sheet is built from. UP workings, because a crew is relieved
  // off a DOWN train, sleeps, and is called for an UP train back. (Once the
  // neighbouring divisions come on, a room can carry both: Bhusawal's crews
  // rest at Igatpuri too and are called DN onward.)
  //
  // Where the Railway has given us the real list — IGP, LNL and ROHA, built
  // from the division's own working timetable — it is used. Invented five-digit
  // numbers make the call sheet look like a toy to anybody who knows the
  // section, and this is the one screen where the trains are not a record of
  // something done and so can honestly be real.
  SHEET_TRAINS[rr.id] = [];
  const realList = (REAL_SHEET.rooms || {})[rr.station_code || rr.name];
  if (realList) {
    realList.forEach(t => {
      stId++;
      SHEET_TRAINS[rr.id].push({
        id: stId, running_room_id: rr.id, train_no: t.train_no, train_name: t.train_name,
        direction: t.direction, sign_on_time: t.sign_on_time, arrives_at: t.arrives_at,
        from_station: t.from_station, to_station: t.to_station, run_days: t.run_days,
        effective_from: null, effective_until: null, source: 'imported',
        is_active: t.direction === 'UP' ? 1 : 0, notes: null,
      });
    });
  }
  const slots = realList ? 0 : Math.max(3, Math.min(14, Math.round(rr.ref_crews_per_day * 0.12)));
  for (let i = 0; i < slots; i++) {
    stId++;
    const h = Math.floor((i * 24) / slots), m = pick([5, 10, 20, 35, 40, 55]);
    SHEET_TRAINS[rr.id].push({
      id: stId, running_room_id: rr.id,
      train_no: `${RI(11, 22)}${RI(100, 999)}`,
      train_name: pick(['Jan Shatabdi', 'Mahanagari Express', 'Sinhagad Express', 'Deccan Express',
                        'Mandovi Express', 'Pushpak Express', 'Tejas Express', null]),
      direction: 'UP',
      sign_on_time: hhmm(h, m),
      arrives_at: hhmm((h + 1) % 24, m),
      from_station: rr.name, to_station: 'CSMT',
      run_days: i % 5 === 0 ? '1,3,5' : 'DAILY',
      effective_from: null, effective_until: null, service: 'mail',
      source: i % 7 === 0 ? 'manual' : 'imported', is_active: 1, notes: null,
    });
  }
  SHEET_TRAINS[rr.id].sort((a, b) => String(a.sign_on_time).localeCompare(String(b.sign_on_time)));
  // Every third site is a goods room, so the Goods tab is exercised in the
  // demo rather than only in the one place somebody remembers to look.
  if (rr.id % 3 === 0) rr.call_sheet_default = 'goods';

  const perDay = Math.max(1, Math.round(rr.ref_crews_per_day * 0.10));
  for (let d = 13; d >= 0; d--) {
    const day = plusDays(-d);
    for (let k = 0; k < perDay; k++) {
      const h = RI(0, 23), m = RI(0, 59);
      const late = rnd() < 0.10;
      const delay = late ? RI(25, 70) : RI(2, 14);
      const served = new Date(Date.UTC(2000, 0, 1, h, m + delay));
      const signOn = new Date(Date.UTC(2000, 0, 1, h, m + RI(55, 95)));
      callId++;
      const recv = `${day} ${hhmm(h, m)}:00`;
      const servedAt = `${day} ${hhmm(served.getUTCHours(), served.getUTCMinutes())}:00`;
      const allAck = rnd() < 0.90;
      // Most calls are against a scheduled slot, as they are in life; a few
      // are ad-hoc, which is the goods working or the train running a day late.
      const slot = k < SHEET_TRAINS[rr.id].length && rnd() < 0.85
        ? SHEET_TRAINS[rr.id][(k + d) % SHEET_TRAINS[rr.id].length] : null;
      CALLS[rr.id].push({
        id: callId, running_room_id: rr.id, service: 'mail',
        sheet_train_id: slot ? slot.id : null, working_date: day,
        train_no: slot ? slot.train_no : `G${RI(10000, 99999)}`,
        train_name: slot ? slot.train_name : null,
        sign_on_at: `${day} ${hhmm(signOn.getUTCHours(), signOn.getUTCMinutes())}:00`,
        received_from: pick(['Jr CC Kadam', 'Jr CC Shinde', 'Jr CC Bhosale', 'CCOR']),
        lobby: null, call_received_at: recv, created_at: recv,
        repeated_to_lobby_at: allAck && rnd() < 0.85 ? servedAt : null,
        repeated_to: null, cancelled_at: null, cancelled_reason: null,
        remarks: null, recorded_by: null,
      });
      const pair = [['LP', pick(CREW)], ['ALP', pick(CREW)]];
      pair.forEach(([role, man], idx) => {
        cbId++;
        // One man on roughly one call in ten is not acknowledged — refused, or
        // simply not in the running room when the bearer got there.
        const bad = !allAck && idx === 1;
        const outcome = bad ? (rnd() < 0.6 ? 'not_present' : 'refused') : 'acknowledged';
        CALLBOOK[rr.id].push({
          id: cbId, call_id: callId, running_room_id: rr.id,
          crew_id: man.id, crew_name: man.full_name, crew_role: role,
          bed_no: String(RI(1, rr.total_beds)),
          call_for_train: CALLS[rr.id][CALLS[rr.id].length - 1].train_no,
          call_received_at: recv, served_at: servedAt, delay_minutes: delay,
          acknowledged: outcome === 'acknowledged' ? 1 : 0,
          ack_outcome: outcome,
          ack_method: outcome === 'acknowledged' ? 'tap' : null,
          ack_recorded_at: outcome === 'acknowledged' ? servedAt : null,
          acknowledged_at: outcome === 'acknowledged' ? servedAt : null,
          lobby_advised_at: bad && rnd() < 0.8 ? servedAt : null,
          lobby_advised_to: bad && rnd() < 0.8 ? 'Jr CC on duty' : null,
          crew_reported_late: late && idx === 0 && rnd() < 0.35 ? 1 : 0,
          remarks: null, served_by: null,
        });
      });
    }
  }

  // CCTV — the four required places, less one at every third site
  {
    const zones = [['kitchen', 'Kitchen — over the range'], ['dining', 'Dining hall'],
                   ['corridor', 'First floor corridor'], ['entrance', 'Main entrance']];
    CCTV[rr.id] = zones
      .filter(([z]) => z !== 'kitchen' || rr.has_meal_facility)
      .filter((_, i) => !(rr.id % 3 === 0 && i === 1))     // one site short of a dining camera
      .map(([zone, label], i) => {
        const working = !(rr.id % 4 === 0 && i === 0);
        const recording = working && !(rr.id % 5 === 0 && i === 1);
        return {
          id: ++camId, running_room_id: rr.id, zone, label,
          location_note: null, installed_on: plusDays(-RI(200, 900)), is_active: 1,
          retired_on: null, retired_reason: null,
          checked_on: rnd() < 0.85 ? plusDays(-RI(0, 12)) : null,
          last_working: working ? 1 : 0,
          last_recording: recording ? 1 : 0,
          footage_days_seen: recording ? RI(7, 40) : null,
          last_remarks: working ? null : 'Reported to the contractor',
          checked_by_name: 'RR In-charge',
        };
      });
  }

  // linen stock — one count, taken a fortnight ago
  LINEN_STOCK[rr.id] = [
    ['bedsheet', rr.total_beds * 4], ['pillow_cover', rr.total_beds * 3],
    ['mosquito_net', Math.round(rr.total_beds * 1.2)], ['blanket', rr.total_beds * 2],
    ['curtain', rr.physical_rooms * 2],
  ].map(([item, issued]) => {
    const condemned = Math.round(issued * R(0.02, 0.08));
    const lost = Math.round(issued * R(0, 0.03));
    const atLaundry = Math.round((issued - condemned - lost) * R(0.15, 0.35));
    return { running_room_id: rr.id, item_type: item, issued_by_railway: issued,
      in_service: issued - condemned - lost - atLaundry, at_laundry: atLaundry,
      condemned, lost_damaged: lost, as_on_date: plusDays(-RI(10, 25)),
      counted_by: null, counted_by_name: 'RR In-charge', remarks: null };
  });

  // linen — last 14 days, as a day header with one row per item beneath it.
  // The wash cycle is NOT generated here: it belongs to LAUNDRY, which is the
  // record that owns it. See migration 032.
  LINEN[rr.id] = []; LINEN_ITEM[rr.id] = [];
  const need = 2 * (rr.total_beds || 0);
  // Ends yesterday, not today. Today's register is the one the supervisor is
  // about to fill, and a demo where every day is already complete never shows
  // the screen doing its actual job — the empty day with yesterday's shelf
  // carried in behind it.
  for (let d = 14; d >= 1; d--) {
    const occ = Math.max(1, Math.round(rr.ref_crews_per_day * 0.10 * R(0.8, 1.1)));
    const date = plusDays(-d);
    const short = rnd() < 0.15;
    const hand = {
      bedsheet:     short ? RI(0, Math.max(1, need - 1)) : RI(need, need + 90),
      pillow_cover: rnd() < 0.12 ? RI(0, Math.max(1, need - 1)) : RI(need, need + 70),
      mosquito_net: RI(4, 60), blanket: RI(4, 60), curtain: RI(0, 24),
    };
    const issued = {
      bedsheet: occ * 2, pillow_cover: occ,
      mosquito_net: rnd() < 0.6 ? Math.round(occ * 0.4) : 0,
      blanket: rnd() < 0.3 ? Math.round(occ * 0.3) : 0,
      curtain: 0,
    };
    for (const code of Object.keys(hand))
      LINEN_ITEM[rr.id].push({ running_room_id: rr.id, record_date: date, item_type: code,
        issued: issued[code], fresh_in_hand: hand[code] });
    LINEN[rr.id].push({
      running_room_id: rr.id, record_date: date,
      min_stock_met: (hand.bedsheet >= need && hand.pillow_cover >= need) ? 1 : 0,
      used_linen_reported: rnd() < 0.06 ? RI(1, 3) : 0,
      remarks: null, recorded_by: null, verified_by: null,
    });
  }
  LINEN[rr.id].reverse();

  // complaint book
  const CATS = [['cleanliness','Bathroom not cleaned since morning, no liquid soap in the dispenser'],
    ['linen','Bedsheet had stains, appeared not properly washed'],
    ['equipment','Water cooler on the first floor not working since two days'],
    ['food','Dinner served cold and the dal quantity was less than the menu'],
    ['pest','Mosquitoes in room 4, net torn'],
    ['staff','Call boy was not available at the counter at night']];
  COMPLAINTS[rr.id] = Array.from({ length: RI(0, 5) }, () => {
    const c = pick(CATS.filter(x => rr.has_meal_facility || x[0] !== 'food'));
    const open = rnd() < 0.4;
    cmId++;
    return { id: cmId, running_room_id: rr.id, source: 'complaint_book',
      raised_by_name: pick(CREW_NAMES), raised_at: `${plusDays(-RI(0, 20))} ${hhmm(RI(6,22), RI(0,59))}:00`,
      category: c[0], description: c[1],
      severity: rnd() < 0.12 ? 'critical' : rnd() < 0.35 ? 'major' : 'normal',
      status: open ? 'open' : 'closed',
      closure_remarks: open ? null : pick(['Rectified and verified by RR In-charge',
        'Contractor supervisor counselled; item replaced', 'Attended the same day']) };
  });
}

// ---------- inspections & the deficiency register ----------
const INSPECTIONS = {}, INSPECTION_ITEMS = {};
let inspId = 0, defId = 0;
const CHECKLIST = CLAUSES.filter(c => c.in_daily_checklist && !c.is_formula);
const OBSERVED = {
  A1: 'Supervisor on duty could not produce the hotel-management diploma',
  A2: 'Two workers on duty without Railway screening approval',
  A4: 'Bearer on duty in a soiled uniform, no name badge',
  A6: 'First-floor lavatory not cleaned in the morning shift',
  A9: 'One sweeper and one call boy short against sanctioned strength',
  B1: 'Dinner served 40 minutes after order',
  B7: 'Cook serving without hairnet or apron',
  B9: 'Two crew complained of undercooked rice at dinner',
  B10: 'Grocery stock covers 9 days against the 15 required',
  C1: 'Laundry invoice for the week not produced',
  C4: 'Used bedsheet found on bed 12 at handover',
  C5: 'Call book served 35 minutes late; crew reported late on duty',
  D1: 'Liquid soap not replenished in two bathrooms',
};

// Reset the register — deficiencies now come from inspections, so they carry a
// clause, a source and an audit trail rather than appearing from nowhere.
for (const k of Object.keys(DEFICIENCIES)) DEFICIENCIES[k] = [];

for (const rr of RUNNING_ROOMS) {
  INSPECTIONS[rr.id] = [];
  const usable = CHECKLIST.filter(c => rr.has_meal_facility || !c.applies_to_meals);
  // Six months back, so the trend and scorecard pages have real history to
  // aggregate rather than a single month repeated.
  for (let d = 185; d >= 1; d--) {
    if (rnd() > 0.42) continue;                       // not inspected every day
    const date = plusDays(-d);
    const picked = usable.slice().sort(() => rnd() - 0.5).slice(0, RI(12, usable.length));
    const fails = picked.filter(() => rnd() < 0.07);
    inspId++;
    const type = rnd() < 0.85 ? 'daily_joint' : pick(['scheduled','surprise','higher_official']);
    INSPECTIONS[rr.id].push({
      id: inspId, running_room_id: rr.id, rr_id: rr.id, rr_name: rr.name,
      div_code: rr.div_code, div_name: rr.div_name,
      inspection_date: date, inspection_type: type,
      inspector_name: pick(['Sr. DEE (TRO) Representative','DME (O&C)','RR In-charge','CLI']),
      contractor_rep_name: nm(),
      items_checked: picked.length, deficiency_count: fails.length,
      result: fails.length === 0 ? 'compliant' : fails.length <= 2 ? 'minor_deficiencies' : 'major_deficiencies',
      railway_sign_file_id: rnd() < 0.7 ? 0 : null,
      submitted_at: `${date} 11:${String(RI(0,59)).padStart(2,'0')}:00`,
      remarks: null,
    });
    INSPECTION_ITEMS[inspId] = picked.map(c => {
      const bad = fails.includes(c);
      return { inspection_id: inspId, clause_id: c.id, clause_code: c.clause_code,
        group_name: c.group_name, description: c.description, unit: c.unit,
        status: bad ? 'not_complied' : 'complied',
        quantity: bad ? RI(1, 4) : 0,
        observation: bad ? (OBSERVED[c.clause_code] || 'Observed during joint inspection') : null,
        evidence_file_id: null };
    });
    for (const c of fails) {
      defId++;
      // Recent items are still open; the older ones have mostly been set right.
      const open = rnd() < Math.max(0.05, 0.55 - d * 0.004);
      DEFICIENCIES[rr.id].push({
        id: defId, running_room_id: rr.id, rr_id: rr.id, rr_name: rr.name, div_code: rr.div_code,
        clause_code: c.clause_code, group_code: c.group_code, group_name: c.group_name,
        clause_description: c.description,
        description: OBSERVED[c.clause_code] || 'Observed during joint inspection',
        rate: c.rate, unit: c.unit,
        occurred_on: date, quantity: RI(1, 4), source: type === 'daily_joint' ? 'daily_checklist' : 'inspection',
        source_ref_table: 'inspections', source_ref_id: inspId,
        evidence_file_id: null, status: open ? 'open' : 'rectified',
        rectified_on: open ? null : plusDays(-d + 1),
        closure_remarks: open ? null : pick(['Rectified the same day and verified',
          'Staff counselled, item replaced', 'Contractor supplied the shortfall next morning']),
      });
    }
  }
}


// ---------- crew feedback ----------
const FEEDBACK = [];
let fbId = 0;
const FB_GOOD = [['Room was clean and the bed linen fresh. Call book served on time.',0],
  ['Food was hot and tasty, bearer service prompt.',1],
  ['AC working well, bathroom clean. No complaints.',0],
  ['Call boy woke me exactly on time, very courteous.',0],
  ['Fresh bedsheet given within ten minutes of arrival.',0]];
const FB_FAIR = [['Overall satisfactory. Newspaper was not available in the recreation room.',0],
  ['Room fine, but the geyser takes very long to heat.',0],
  ['Food average, the vegetable curry could be better.',1]];
const FB_POOR = [['Bedsheet had stains, did not appear properly washed.',0],
  ['Dinner served cold and the dal quantity was less than the menu.',1],
  ['Bathroom not cleaned, no liquid soap in the dispenser.',0],
  ['Mosquito net torn, could not sleep properly.',0],
  ['Call book served twenty minutes late, nearly reported late for duty.',0],
  ['Water cooler not working since two days.',0]];

for (const rr of RUNNING_ROOMS) {
  const cov = COVERAGE[rr.id][0];
  const staffHere = STAFF.filter(s => s.running_room_id === rr.id && s.screening_status === 'approved');
  const t = rnd();
  const base = t < 0.78 ? R(4.0, 4.85) : t < 0.94 ? R(3.45, 4.05) : R(2.95, 3.5);
  const n = Math.max(3, Math.min(40, Math.round(cov.feedback_received * 0.02)));
  for (let i = 0; i < n; i++) {
    const q = rnd();
    const band = q < 0.74 ? 'good' : q < 0.91 ? 'fair' : 'poor';
    const centre = band === 'good' ? Math.min(5, base + R(0.1, 0.5))
                 : band === 'fair' ? base : Math.max(1, base - R(0.9, 1.8));
    const jit = () => +Math.min(5, Math.max(1, centre + R(-0.4, 0.4))).toFixed(2);
    const pool = (band === 'good' ? FB_GOOD : band === 'fair' ? FB_FAIR : FB_POOR)
      .filter(x => rr.has_meal_facility || !x[1]);
    const cl = jit(), fo = rr.has_meal_facility ? jit() : null, li = jit(), be = jit();
    const vals = [cl, li, be].concat(fo === null ? [] : [fo]);
    const overall = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
    fbId++;
    FEEDBACK.push({
      id: fbId, running_room_id: rr.id, rr_id: rr.id, rr_name: rr.name, div_code: rr.div_code,
      crew_name: rnd() < 0.65 ? pick(CREW_NAMES) : null,
      crew_id_entered: rnd() < 0.4 ? String(RI(100000, 999999)) : null,
      submitted_at: `${plusDays(-RI(1, 28))} ${hhmm(RI(5, 23), RI(0, 59))}:00`,
      channel: pick(['qr_room','qr_dining','checkout_register','mobile_app']),
      rating_cleanliness: cl, rating_food: fo, rating_linen: li, rating_behaviour: be,
      rating_overall: overall, comments: pick(pool)[0],
      named_staff_id: (rnd() < 0.3 && staffHere.length) ? pick(staffHere).id : null,
      named_staff: null,
      severity: overall <= 2 ? 'critical' : overall <= 3 ? 'major' : 'normal',
      status: overall <= 3 ? 'open' : 'closed',
    });
  }
}
FEEDBACK.forEach(f => {
  if (!f.named_staff_id) return;
  const s = STAFF.find(x => x.id === f.named_staff_id);
  f.named_staff = s ? s.full_name : null;
});

module.exports = { MONTHS, MONTH_LABEL, DIVS, DESIGNATIONS, NORMS, CONTRACTORS, RUNNING_ROOMS, MANPOWER,
  COVERAGE, GRADING, DEFICIENCIES, CLAUSES, STAFF, DOCS, ISSUES, REPLACEMENTS, TODAY,
  ATTENDANCE, COUNTERSIGNED, CALLBOOK, CALLS, SHEET_TRAINS, CALL_CHANGES, CREW, CREW_MASTER, TRAIN_MASTER,
  MEALS, MEAL_RATES, MENU_ITEMS, MENU_RATES, MENU_PLANS, MENU_PLAN_DAYS,
  CLEANING_SCHEDULE, CLEANING_LOG, CLEANING_DAY,
  LINEN, LINEN_ITEM, LINEN_STOCK, CCTV, COMPLAINTS, FEEDBACK,
  VENDOR_INSPECTIONS, ASSET_CHECKS, STAFF_RATINGS, BILLS, BILL_DOCS,
  INSPECTIONS, INSPECTION_ITEMS, FILES: new Map(), plusDays };

/* ---------------------------------------------------------------------------
 * Stage 6 — facility and material.
 * Vendors, laundry dispatches, consumables, assets, pest control and the
 * recurring kitchen obligations. Sample data, clearly fictional names.
 * ------------------------------------------------------------------------ */

const LAUNDRY_NAMES = ['Sunrise Washing Centre', 'Deccan Dhobi Ghat Co-op', 'Shubham Laundry Works',
  'Blue Star Cleaners', 'Ganga Washing Services', 'Neelkamal Laundry'];
const PEST_NAMES = ['Suraksha Pest Care', 'Vajra Hygiene Services', 'Konkan Pest Solutions',
  'Sanjeevani Fumigation'];

const VENDORS = [];
LAUNDRY_NAMES.forEach((n, i) => VENDORS.push({
  id: VENDORS.length + 1, vendor_type: 'laundry', name: n,
  address: `Plot ${RI(10, 99)}, MIDC Area`, gst_no: `27BBBBB${2000 + i}B1Z${i % 9 + 1}`,
  licence_no: `LN/${2024 + (i % 2)}/${1000 + i}`, licence_valid_till: plusDays(RI(60, 500)),
  approved_on: plusDays(-RI(200, 700)), approved_by: null,
  is_approved: i === LAUNDRY_NAMES.length - 1 ? 0 : 1, is_active: 1,
}));
PEST_NAMES.forEach((n, i) => VENDORS.push({
  id: VENDORS.length + 1, vendor_type: 'pest_control', name: n,
  address: `Shop ${RI(1, 40)}, Station Road`, gst_no: `27CCCCC${3000 + i}C1Z${i % 9 + 1}`,
  licence_no: `PCO/${1200 + i}`, licence_valid_till: plusDays(i === 3 ? -RI(10, 90) : RI(40, 600)),
  approved_on: plusDays(-RI(200, 700)), approved_by: null, is_approved: 1, is_active: 1,
}));
const LAUNDRY_VENDORS = VENDORS.filter(v => v.vendor_type === 'laundry');
const PEST_VENDORS = VENDORS.filter(v => v.vendor_type === 'pest_control');

// One approved washing centre and one pest agency per running room, except a
// few sites deliberately left without one so the warning on the page is real.
const RR_VENDORS = {};
RUNNING_ROOMS.forEach((rr, i) => {
  const list = [];
  if (i % 13 !== 5) list.push({ vendor_id: LAUNDRY_VENDORS[i % LAUNDRY_VENDORS.length].id, service_type: 'laundry' });
  if (i % 11 !== 3) list.push({ vendor_id: PEST_VENDORS[i % PEST_VENDORS.length].id, service_type: 'pest_control' });
  RR_VENDORS[rr.id] = list;
});

const LINEN_ITEMS = ['bedsheet', 'pillow_cover', 'mosquito_net', 'blanket', 'curtain'];
const LAUNDRY = {};
let ldId = 0;
for (const rr of RUNNING_ROOMS) {
  const v = (RR_VENDORS[rr.id].find(x => x.service_type === 'laundry') || {}).vendor_id || null;
  const rows = [];
  for (let d = 1; d <= 24; d++) {
    const day = plusDays(-d);
    const item = d % 5 === 0 ? pick(LINEN_ITEMS.slice(1)) : 'bedsheet';
    const sent = Math.max(6, Math.round(rr.total_beds * R(0.45, 0.95)));
    const back = rnd() < 0.86 ? sent : sent - RI(1, Math.max(2, Math.round(sent * 0.12)));
    const hasInv = rnd() < 0.88;
    const q = rnd();
    ldId++;
    rows.push({
      id: ldId, running_room_id: rr.id, vendor_id: rnd() < 0.96 ? v : null, dispatch_date: day,
      item_type: item, quantity_sent: sent, quantity_returned: back,
      returned_on: back === sent ? plusDays(-d + 1) : null,
      invoice_no: hasInv ? `INV/${String(1000 + ldId).slice(-4)}/${day.slice(2, 7).replace('-', '')}` : null,
      invoice_file_id: null,
      quality_ok: q < 0.82 ? 1 : q < 0.93 ? 0 : null,
      quality_remarks: q < 0.82 ? null : q < 0.93 ? pick(['Faint stains on four sheets, sent for rewash.',
        'Sheets returned damp.', 'Two pillow covers torn at the seam.']) : null,
      recorded_by: null,
    });
  }
  LAUNDRY[rr.id] = rows;
}
LAUNDRY_LOOKUP: {
  const byId = new Map(VENDORS.map(v => [v.id, v]));
  Object.values(LAUNDRY).flat().forEach(r => {
    const v = r.vendor_id ? byId.get(r.vendor_id) : null;
    r.vendor_name = v ? v.name : null;
    r.is_approved = v ? v.is_approved : null;
  });
}

const CONSUMABLE_ITEMS = [
  ['CD01', 'Phenyl / floor disinfectant',   'D', 'litre',  'weekly',      'Lizol, Domex, Harpic or equivalent ISI'],
  ['CD02', 'Liquid hand wash',              'D', 'litre',  'weekly',      'Dettol, Lifebuoy, Savlon'],
  ['CD03', 'Toilet cleaning acid',          'D', 'litre',  'weekly',      'Harpic or equivalent'],
  ['CD04', 'Naphthalene balls',             'D', 'kg',     'fortnightly', null],
  ['CD05', 'Air freshener / room spray',    'D', 'nos',    'fortnightly', 'Odonil, Ambipur'],
  ['CD06', 'Detergent powder',              'D', 'kg',     'weekly',      'Surf, Ariel, Nirma'],
  ['CD07', 'Broom (soft and hard)',         'D', 'nos',    'monthly',     null],
  ['CD08', 'Mop with handle',               'D', 'nos',    'monthly',     null],
  ['CD09', 'Garbage bags (large)',          'D', 'nos',    'weekly',      null],
  ['CD10', 'Bathroom soap for crew',        'D', 'nos',    'daily',       'Lifebuoy, Santoor, Medimix'],
  ['CC01', 'Mosquito repellent refill',     'C', 'nos',    'monthly',     'Good Knight, All Out'],
  ['CC02', 'Bedsheet (replacement stock)',  'C', 'nos',    'yearly',      'Cotton, 200 TC minimum'],
  ['CC03', 'Water purifier candle / filter','C', 'nos',    'half_yearly', 'as per the fitted make'],
  ['CC04', 'First-aid box refill',          'C', 'nos',    'half_yearly', null],
  // Schedule D as the tender prints it, mirroring db/seeds/09_consumable_items.sql.
  // The five publications are items in their own right because clause D2
  // penalises short supply of newspapers and magazines at twice the cost of
  // what was not supplied -- which cannot be assessed against a line of prose.
  ['SD01', 'Big dust bin, swivel type, 80 to 100 litres', 'D', 'nos', 'as_required', null],
  ['SD02', 'Plastic buckets 20 litres, for bathrooms',    'D', 'nos', 'as_required', null],
  ['SD03', 'Plastic buckets 5 litres, for lavatories',    'D', 'nos', 'as_required', null],
  ['SD04', 'Plastic mugs 1.5 litres, for bathrooms',      'D', 'nos', 'as_required', null],
  ['SD05', 'Bathroom stools, 30 cm height',               'D', 'nos', 'as_required', null],
  ['SD06', 'Dustbin small for bedrooms, 10 to 15 litres, foot operated', 'D', 'nos', 'as_required', null],
  ['SD07', 'One popular Hindi newspaper',                 'D', 'copy', 'daily', null],
  ['SD08', 'One popular English newspaper',               'D', 'copy', 'daily', null],
  ['SD09', 'One popular Marathi newspaper',               'D', 'copy', 'daily', null],
  ['SD10', 'India Today (Hindi)',                         'D', 'copy', 'weekly', 'India Today (Hindi) — each edition'],
  ['SD11', 'One Marathi magazine',                        'D', 'copy', 'weekly', 'Lokprabha or Chitralekha'],
  ['SD12', 'Uniform — two pairs for every running room staff', 'D', 'set', 'half_yearly',
   'sample approved by the RR In-charge before use'],
  ['SD13', 'Shoes — one pair for every staff',            'D', 'pair', 'yearly', null],
  ['SD14', 'Cleaning material for kitchen, dining hall, bathroom, lavatory and running room area',
   'D', 'lot', 'monthly', 'branded quality only; caustic soda, acid and bleaching powder are not to be used'],
].map((c, i) => ({ id: i + 1, code: c[0], name: c[1], schedule_code: c[2], unit: c[3],
  supply_frequency: c[4], approved_brands: c[5], is_active: 1 }));

const BRANDS_OK = { 'CD01': 'Lizol', 'CD02': 'Dettol', 'CD03': 'Harpic', 'CD06': 'Surf',
  'CD10': 'Lifebuoy', 'CC01': 'Good Knight' };
const CONSUMABLE_ISSUES = {};
let ciId = 0;
for (const rr of RUNNING_ROOMS) {
  const rows = [];
  for (const it of CONSUMABLE_ITEMS) {
    const every = { daily: 7, weekly: 7, fortnightly: 15, monthly: 30, half_yearly: 60, yearly: 90 }[it.supply_frequency] || 30;
    for (let k = 1; k <= 3; k++) {
      const due = plusDays(-k * every + RI(0, 2));
      const perBed = it.unit === 'litre' ? 0.06 : it.unit === 'kg' ? 0.04 : 0.12;
      const qDue = Math.max(2, Math.round(rr.total_beds * perBed) + RI(0, 3));
      const t = rnd();
      const short = t < 0.09;
      const lateDays = t >= 0.09 && t < 0.22 ? RI(1, 5) : 0;
      ciId++;
      rows.push({
        id: ciId, running_room_id: rr.id, consumable_item_id: it.id, due_date: due,
        supplied_on: t < 0.04 ? null : plusDays(-k * every + lateDays),
        quantity_due: qDue, quantity_supplied: short ? Math.max(0, qDue - RI(1, Math.max(1, Math.round(qDue / 3)))) : qDue,
        brand_supplied: BRANDS_OK[it.code] || null,
        acknowledged_by: null, shortfall_days: lateDays, remarks: null,
        name: it.name, unit: it.unit, supply_frequency: it.supply_frequency,
        approved_brands: it.approved_brands, schedule_code: it.schedule_code,
      });
    }
  }
  CONSUMABLE_ISSUES[rr.id] = rows.sort((a, b) => b.due_date.localeCompare(a.due_date));
}

const RAILWAY_ASSETS = [
  ['Split air conditioner', 'Air conditioning'], ['Ceiling fan', 'Electrical'],
  ['Geyser (25 litre)', 'Plumbing'], ['Water cooler with purifier', 'Plumbing'],
  ['Cot with mattress', 'Furniture'], ['Almirah / locker', 'Furniture'],
  ['Television (recreation room)', 'Electrical'], ['Exhaust fan', 'Electrical'],
  ['Solar water heater', 'Plumbing'], ['Refrigerator (kitchen)', 'Kitchen'],
];
const CONTRACTOR_ASSETS = [
  ['Vacuum cleaner', 'Housekeeping'], ['Wet-and-dry mop set', 'Housekeeping'],
  ['Pressure washer', 'Housekeeping'], ['Cooking range with LPG bank', 'Kitchen'],
  ['Stainless steel utensil set', 'Kitchen'], ['Insect-o-cutor', 'Housekeeping'],
];
// A defect should read like the asset it is on, not like a generic fault.
const DEFECTS = {
  'Air conditioning': ['Cooling has stopped, only the fan runs.', 'Water dripping from the indoor unit.',
    'Remote and panel both unresponsive.', 'Compressor tripping every few minutes.'],
  'Electrical': ['Not running since this morning.', 'Making abnormal noise at all speeds.',
    'Switch burnt out.', 'Regulator not working, runs at full speed only.'],
  'Plumbing': ['Water leaking from the inlet joint.', 'No hot water despite the element being on.',
    'Cooling has stopped, water is warm.', 'Tap dripping continuously.'],
  'Furniture': ['Frame bent, unsafe to use.', 'Mattress torn along the seam.',
    'Door hinge broken, will not shut.', 'Locker key lost, lock jammed.'],
  'Kitchen': ['Not cooling, contents spoiling.', 'Burner not lighting on two of the four rings.',
    'Door gasket torn.', 'Thermostat not holding temperature.'],
  'Housekeeping': ['Motor burnt out.', 'Suction lost, filter choked.',
    'Handle broken at the joint.', 'Hose split, leaking under pressure.'],
  default: ['Not working since this morning.', 'Making abnormal noise.', 'Body damaged, unsafe to use.'],
};

const ASSETS = {};
const BREAKDOWNS = {};
let aId = 0, bId = 0;
for (const rr of RUNNING_ROOMS) {
  const list = [];
  RAILWAY_ASSETS.forEach(([name, cat]) => {
    if (cat === 'Kitchen' && !rr.has_meal_facility) return;
    if (name === 'Solar water heater' && rnd() < 0.55) return;
    aId++;
    const cs = rnd();
    list.push({ id: aId, running_room_id: rr.id, asset_code: `AST/${rr.code}/${String(aId).slice(-4)}`,
      name, category: cat, owned_by: 'railway',
      quantity: name === 'Cot with mattress' ? rr.total_beds
              : name === 'Ceiling fan' ? Math.max(2, Math.round(rr.total_beds * 0.6))
              : name === 'Split air conditioner' ? Math.max(1, Math.round(rr.physical_rooms * 0.7))
              : name === 'Geyser (25 litre)' ? Math.max(1, Math.round(rr.physical_rooms * 0.35))
              : name === 'Exhaust fan' ? Math.max(1, Math.round(rr.physical_rooms * 0.5))
              : name === 'Almirah / locker' ? Math.max(2, Math.round(rr.total_beds * 0.5))
              : name === 'Water cooler with purifier' ? Math.max(1, Math.round(rr.total_beds / 60))
              : RI(1, 3),
      // A line covering many identical items is judged on the whole line, so a
      // 198-cot line reading "condemned" would be nonsense — bulk lines stay good.
      condition_status: name === 'Cot with mattress' || name === 'Ceiling fan'
              ? (cs < 0.85 ? 'good' : 'serviceable')
              : cs < 0.72 ? 'good' : cs < 0.9 ? 'serviceable' : cs < 0.97 ? 'defective' : 'condemned',
      handed_over_on: plusDays(-RI(200, 600)), joint_note_file_id: null, returned_on: null, remarks: null });
  });
  CONTRACTOR_ASSETS.forEach(([name, cat]) => {
    if (cat === 'Kitchen' && !rr.has_meal_facility) return;
    if (name === 'Pressure washer' && rr.total_beds < 40) return;
    aId++;
    list.push({ id: aId, running_room_id: rr.id, asset_code: null, name, category: cat,
      owned_by: 'contractor', quantity: RI(1, 3),
      condition_status: rnd() < 0.85 ? 'good' : 'serviceable',
      handed_over_on: null, joint_note_file_id: null, returned_on: null, remarks: null });
  });
  ASSETS[rr.id] = list;

  const faults = [];
  const n = RI(1, 5);
  for (let i = 0; i < n; i++) {
    const a = pick(list);
    const hoursAgo = RI(3, 40 * 24);
    const reported = new Date(TODAY.getTime() - hoursAgo * 3600000);
    const open = rnd() < 0.22;
    const took = RI(2, 40);
    bId++;
    faults.push({
      id: bId, asset_id: a.id, asset_name: a.name, owned_by: a.owned_by,
      reported_at: reported.toISOString().slice(0, 19).replace('T', ' '),
      reported_by: null,
      description: pick(DEFECTS[a.category] || DEFECTS.default),
      rectified_at: open ? null : new Date(reported.getTime() + took * 3600000).toISOString().slice(0, 19).replace('T', ' '),
      hours_to_rectify: open ? null : took,
      status: open ? 'open' : (rnd() < 0.9 ? 'rectified' : 'replaced'),
      remarks: open ? null : pick(['Spare fitted by the contractor.', 'Attended by Railway electrical staff.',
        'Unit replaced.', 'Cleaned and recharged.']),
    });
  }
  BREAKDOWNS[rr.id] = faults;
}
ASSETS_OPEN: {
  for (const rr of RUNNING_ROOMS) {
    const open = {};
    BREAKDOWNS[rr.id].filter(f => f.status === 'open').forEach(f => { open[f.asset_id] = (open[f.asset_id] || 0) + 1; });
    ASSETS[rr.id].forEach(a => { a.open_faults = open[a.id] || 0; });
  }
}

const TREATMENTS = ['rodent', 'insecticide', 'flying_insect', 'bed_bug', 'fumigation'];
const PEST_CHEMICALS = {
  rodent:        ['Bromadiolone bait blocks', 'Zinc phosphide bait', 'Glue boards and bait stations'],
  insecticide:   ['Deltamethrin 2.5% WP', 'Cypermethrin 10% EC', 'Lambda-cyhalothrin 5% EC'],
  flying_insect: ['Pyrethrum 2% space spray', 'Cypermethrin fogging solution'],
  bed_bug:       ['Imidacloprid gel', 'Deltamethrin 2.5% WP crack-and-crevice'],
  fumigation:    ['Aluminium phosphide (supervised)', 'Sulphuryl fluoride'],
};
const PEST = {};
let pId = 0;
for (const rr of RUNNING_ROOMS) {
  const v = (RR_VENDORS[rr.id].find(x => x.service_type === 'pest_control') || {}).vendor_id || null;
  const rows = [];
  for (let k = 0; k < 8; k++) {
    const sched = plusDays(-k * 30 + RI(-2, 2) + (k === 0 ? RI(1, 8) : 0));
    const future = sched > plusDays(0);
    const t = rnd();
    const delay = t < 0.16 ? RI(1, 6) : 0;
    const notDone = future || t < 0.07;
    pId++;
    rows.push({
      id: pId, running_room_id: rr.id, vendor_id: v,
      treatment_type: TREATMENTS[k % TREATMENTS.length],
      scheduled_on: sched,
      performed_on: notDone ? null : plusDays(-k * 30 + delay),
      notice_given_on: notDone ? null : (rnd() < 0.85 ? plusDays(-k * 30 - 2) : null),
      areas_covered: pick(rr.has_meal_facility
        ? ['Dormitory, bathrooms and corridor', 'Kitchen, dining hall and drains',
           'All rooms, kitchen and surrounding garden', 'Bathrooms, drains and rear yard']
        : ['Dormitory, bathrooms and corridor', 'All rooms, corridor and surrounding garden',
           'Bathrooms, drains and rear yard']),
      chemical_used: pick(PEST_CHEMICALS[TREATMENTS[k % TREATMENTS.length]]),
      certificate_file_id: null, delay_days: delay, remarks: null,
    });
  }
  PEST[rr.id] = rows.sort((a, b) => b.scheduled_on.localeCompare(a.scheduled_on));
}
PEST_LOOKUP: {
  const byId = new Map(VENDORS.map(v => [v.id, v]));
  Object.values(PEST).flat().forEach(r => {
    const v = r.vendor_id ? byId.get(r.vendor_id) : null;
    r.vendor_name = v ? v.name : null;
    r.licence_valid_till = v ? v.licence_valid_till : null;
  });
}

const KC_TYPES = ['fssai_licence', 'grocery_stock', 'perishables', 'approved_brands',
  'lpg_spare', 'gas_pipe', 'utensil_segregation', 'water_quality'];
const KITCHEN_COMPLIANCE = {};
let kcId = 0;
for (const rr of RUNNING_ROOMS) {
  const rows = [];
  if (rr.has_meal_facility) {
    for (const type of KC_TYPES) {
      if (rnd() < 0.06) continue;                       // a few checks never recorded
      const t = rnd();
      const status = t < 0.84 ? 'compliant' : 'shortfall';
      kcId++;
      rows.push({
        id: kcId, running_room_id: rr.id, check_type: type, as_on_date: plusDays(-RI(1, 25)),
        status,
        detail: status === 'shortfall' ? ({
          fssai_licence: 'Licence copy not displayed at the counter.',
          grocery_stock: `Stock on hand covers ${RI(4, 11)} days against 15 required.`,
          perishables: 'Milk and curd not indented for the next day.',
          approved_brands: 'Loose refined oil found in use instead of an approved brand.',
          lpg_spare: 'Only one spare cylinder available against two required.',
          gas_pipe: 'Pipe last replaced beyond six months.',
          utensil_segregation: 'Veg and non-veg utensils found stacked together.',
          water_quality: 'TDS report for the month not produced.',
        }[type]) : ({
          fssai_licence: 'Valid licence displayed.',
          grocery_stock: `${RI(15, 22)} days of stock verified.`,
          perishables: 'Next 24 hours indented and received.',
          approved_brands: 'All items from the approved list.',
          lpg_spare: 'Two spare cylinders in the bank.',
          gas_pipe: 'Replaced within the six-month cycle.',
          utensil_segregation: 'Separate racks, clearly marked.',
          water_quality: 'TDS and pH within limits.',
        }[type]),
        valid_till: type === 'fssai_licence' ? plusDays(status === 'shortfall' ? -RI(5, 60) : RI(30, 400))
                  : type === 'gas_pipe' ? plusDays(status === 'shortfall' ? -RI(5, 90) : RI(20, 160))
                  : null,
        evidence_file_id: null, recorded_by: null,
      });
    }
  }
  KITCHEN_COMPLIANCE[rr.id] = rows;
}

/* ---------------------------------------------------------------------------
 * Stage 8 — monthly certification packs.
 * A few months already certified and counter-signed, so the workflow has
 * history; the most recent month is left ungenerated so it can be generated
 * live during a demonstration.
 * ------------------------------------------------------------------------ */
const CERTIFICATES = new Map();          // `${rrId}|${month}` -> certificate row
const CERT_DEFICIENCIES = new Map();     // certificateId -> frozen deficiency rows
let certId = 5000;

// The agreements, one per contractor per division, as db/seed-dummy.js builds
// them. Carried here so the dashboard's LOA panel has something real to show.
//
// Deliberately incomplete in places: a few carry no LOA number, one or two no
// security deposit, and one has already expired. That is the true state of the
// paperwork at a real go-live, and a demo where every agreement is perfect
// hides the column the panel exists to print.
const CONTRACTS = [];
{
  const seen = new Map();
  let cid = 0;
  RUNNING_ROOMS.forEach((rr, i) => {
    const key = `${rr.contractor_id}|${rr.division_id}`;
    if (!seen.has(key)) {
      cid++;
      const expired = cid % 17 === 3;
      const soon = cid % 11 === 5;
      const end = expired ? plusDays(-RI(20, 90))
                : soon    ? plusDays(RI(10, 80))
                          : plusDays(RI(200, 900));
      seen.set(key, {
        id: cid,
        agreement_no: rr.agreement_no,
        loa_no: cid % 7 === 2 ? null : `CR/${rr.div_code}/RR/LOA/${2024 + (cid % 2)}/${100 + cid}`,
        loa_date: cid % 9 === 4 ? null : plusDays(-RI(400, 1000)),
        start_date: plusDays(-RI(300, 800)),
        end_date: end,
        extended_to: cid % 13 === 6 ? plusDays(RI(100, 300)) : null,
        status: expired ? 'active' : (cid % 13 === 6 ? 'extended' : 'active'),
        security_deposit: cid % 5 === 1 ? null : String(RI(3, 12) * 100000) + '.00',
        performance_guarantee: cid % 8 === 3 ? null : String(RI(2, 9) * 100000) + '.00',
        contractor_id: rr.contractor_id,
        contractor_name: rr.contractor,
        contractor_code: (CONTRACTORS.find(c => c.id === rr.contractor_id) || {}).code || null,
        division_id: rr.division_id,
        div_code: rr.div_code,
        rooms: [],
      });
      CONTRACTS.push(seen.get(key));
    }
    // One running room in the whole estate is left with no agreement at all,
    // because that is a real state and the panel has to be able to say it.
    if (i !== 6) seen.get(key).rooms.push(rr);
  });
}


// Raw-foodstuff quality checks and garden upkeep (stage 28). Sparse on
// purpose: at a real running room these are monthly-ish events, not daily ones,
// and one site in the demo has a check nobody signed -- which is the state the
// screen exists to call out.
const FOODSTUFF_CHECKS = [];
const FOODSTUFF_ITEMS_ROWS = [];
const FOODSTUFF_SIGS = [];
const GARDEN = {};
{
  const STUFF = [['Wheat flour','Ashirvad'],['Rice','Kolam'],['Pulses (toor / moong / chana)','Tata'],
                 ['Edible oil','Fortune'],['Spices','Everest'],['Salt (iodised)','Tata']];
  const SIGNERS = [['R. Jadhav','Loco Pilot'],['S. Kale','Asstt. Loco Pilot'],
                   ['M. Pawar','Sr. Loco Pilot'],['A. Shinde','Guard']];
  let fcId = 0, fiId = 0, fsId = 0, guId = 0;
  for (const rr of RUNNING_ROOMS) {
    if (!rr.has_meal_facility) continue;
    for (let k = 0; k < 3; k++) {
      fcId++;
      const on = plusDays(-(k * 28 + RI(1, 9)));
      const unsigned = (rr.id + k) % 17 === 4;
      FOODSTUFF_CHECKS.push({ id: fcId, running_room_id: rr.id, checked_on: on,
        checked_at: on + ' ' + hhmm(RI(9, 17), RI(0, 59)) + ':00',
        conducted_by: pick(['Health Inspector', 'RR In-charge', 'Running Supervisor']),
        remarks: null, recorded_by: null, recorded_name: 'RR In-charge' });
      for (const pair of STUFF.slice(0, RI(3, 6))) {
        const poor = rnd() < 0.07;
        FOODSTUFF_ITEMS_ROWS.push({ id: ++fiId, check_id: fcId, item: pair[0], brand: pair[1],
          seal_intact: rnd() < 0.94 ? 1 : 0, fssai_mark: rnd() < 0.96 ? 1 : 0,
          quality: poor ? 'poor' : 'good',
          remarks: poor ? pick(['Weevils seen in the pack.','Oil past its date.','Smell not right.']) : null });
      }
      if (!unsigned) {
        for (const sg of SIGNERS.slice(0, RI(1, 3))) {
          FOODSTUFF_SIGS.push({ id: ++fsId, check_id: fcId, crew_id: null,
            signatory_name: sg[0], designation: sg[1],
            signed_at: on + ' ' + hhmm(RI(9, 17), RI(0, 59)) + ':00', signature_file_id: null });
        }
      }
    }
    const g = [];
    for (let k = 0; k < RI(4, 9); k++) {
      guId++;
      g.push({ id: guId, running_room_id: rr.id, work_date: plusDays(-RI(1, 120)),
        work_type: pick(['lawn_cutting','trimming','watering','fertiliser','pesticide','fencing']),
        plants_supplied: null, pot_material: null, pot_size_inches: null,
        organic: rnd() < 0.7 ? 1 : 0, detail: null,
        done_by_staff_id: null, done_by_name: 'Gardner', recorded_by: null });
    }
    const supplied = rr.id % 4 === 1 ? RI(3, 8) : 10;
    guId++;
    g.push({ id: guId, running_room_id: rr.id, work_date: plusDays(-RI(10, 80)),
      work_type: 'gamla_supply', plants_supplied: supplied,
      pot_material: rr.id % 9 === 2 ? 'other' : 'cement',
      pot_size_inches: rr.id % 11 === 3 ? 14 : 18,
      organic: null, detail: null, done_by_staff_id: null, done_by_name: 'Gardner', recorded_by: null });
    GARDEN[rr.id] = g.sort(function (a, b) { return String(b.work_date).localeCompare(String(a.work_date)); });
  }
}

// A fortnight of cleaning, so the register shows what a kept schedule and a
// broken one look like side by side. Mostly kept; the odd round missed, the odd
// round finished after its window closed, and a handful never written down at
// all -- which is the commonest state of a paper register and the one the
// screen has to distinguish from a round that was genuinely skipped.
for (const rr of RUNNING_ROOMS) {
  for (let back = 14; back >= 0; back--) {
    const date = plusDays(-back);
    const d = new Date(Date.parse(date + 'T00:00:00Z'));
    const isSunday = d.getUTCDay() === 0;
    const nth = Math.floor((d.getUTCDate() - 1) / 7) + 1;
    for (const sch of CLEANING_SCHEDULE) {
      const due = sch.frequency === 'weekly_sunday' ? isSunday
                : sch.frequency === 'sunday_2_4' ? (isSunday && (nth === 2 || nth === 4))
                : true;
      if (!due) continue;
      const r = rnd();
      if (r < 0.08) continue;                       // never written down
      const status = r < 0.14 ? 'not_done' : 'done';
      // Finish time: usually inside the window, occasionally after it closes.
      let at = null;
      if (status === 'done' && sch.window_to) {
        const [wh, wm] = sch.window_to.split(':').map(Number);
        const late = rnd() < 0.09;
        const mins = wh * 60 + wm - (late ? -RI(10, 70) : RI(5, 90));
        at = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
      }
      CLEANING_LOG.set(`${rr.id}|${date}|${sch.id}`, {
        running_room_id: rr.id, work_date: date, schedule_id: sch.id, status,
        done_at: at, done_by_staff_id: null,
        freshener: status === 'done' ? (rnd() < 0.85 ? 1 : 0) : null,
        remarks: status === 'not_done'
          ? pick(['Sweeper on leave, no reliever sent.', 'Water supply failed.', 'Not attended.'])
          : null,
        recorded_by: null,
      });
    }
    // Yesterday and before are mostly verified; today is not yet.
    if (back > 0 && rnd() < 0.8)
      CLEANING_DAY.set(`${rr.id}|${date}`, { running_room_id: rr.id, work_date: date,
        verified_by: null, verified_at: `${date} 21:${String(RI(10, 50)).padStart(2, '0')}:00`,
        verify_remarks: null, verified_name: 'RR In-charge' });
  }
}

Object.assign(module.exports, { CONTRACTS, FOODSTUFF_CHECKS, FOODSTUFF_ITEMS_ROWS,
  FOODSTUFF_SIGS, GARDEN, VENDORS, RR_VENDORS, LAUNDRY, CONSUMABLE_ITEMS,
  CONSUMABLE_ISSUES, ASSETS, BREAKDOWNS, PEST, KITCHEN_COMPLIANCE,
  CERTIFICATES, CERT_DEFICIENCIES, nextCertId: () => ++certId });

/* ---------------------------------------------------------------------------
 * Stage 9 — FSSAI food safety.
 *
 * The checklist is not restated here. It is parsed out of the seed file that
 * the real database loads, so the demo cannot drift from the migration: change
 * db/seeds/05_food_check_items.sql and both move together.
 * ------------------------------------------------------------------------ */
const FOOD_CHECK_ITEMS = (() => {
  const sql = require('fs').readFileSync(
    require('path').join(__dirname, '../db/seeds/05_food_check_items.sql'), 'utf8');
  const re = /\('([A-Z]{2}-\d+)','(\w+)','([^']*)',\s*'([^']*)',\s*(?:'([^']*)'|NULL),\s*(\d),\s*(\d+)\)/g;
  const out = []; let m, id = 0;
  while ((m = re.exec(sql))) {
    out.push({ id: ++id, item_code: m[1], section: m[2], section_name: m[3],
               description: m[4], source_ref: m[5] || null,
               is_critical: +m[6], sort_order: +m[7], is_active: 1 });
  }
  return out;
})();

const dISO = n => iso(new Date(TODAY.getTime() + n * 86400000));

/**
 * One licence per kitchen, spread deliberately across every state the screen
 * has to handle. Bhusaval carries the licence actually issued for that running
 * room, so the demo can be checked against the paper.
 */
const FOOD_LICENCES = [];
const FOOD_RETURNS  = [];
const FOOD_INSPECTIONS = [];
const FOOD_INSPECTION_ITEMS = [];
let flId = 7000, flrId = 7500, fiId = 7800, fiiId = 8000;

{
  const kitchens = RUNNING_ROOMS.filter(r => r.has_meal_facility);
  // Rooms singled out so the dashboard shows every case at once.
  const BSL     = kitchens.find(r => r.name === 'BSL');
  const noneRR  = kitchens.find(r => r.name === 'MMR');
  const expRR   = kitchens.find(r => r.name === 'NGN');
  const lapsRR  = kitchens.find(r => r.name === 'BD');
  const suspRR  = kitchens.find(r => r.name === 'KNW');
  const special = new Set([BSL, noneRR, expRR, lapsRR, suspRR].filter(Boolean).map(r => r.id));

  const put = (rr, o) => {
    FOOD_LICENCES.push({
      id: ++flId, running_room_id: rr.id, contractor_id: rr.contractor_id,
      licence_number: o.number, licensee_name: o.licensee || `M/S ${rr.contractor}`,
      premises_address: `${rr.name} Running Room, Central Railway`,
      kind_of_business: 'Food Services - Restaurants',
      licence_category: 'Central License - Indian Railways',
      issuing_authority: 'DO, Railways', issued_on: o.from,
      valid_from: o.from, valid_upto: o.upto, status: o.status || 'issued',
      tech_person_name: o.tech === null ? null : (o.tech || nm()),
      tech_person_qual: o.tech === null ? null : (o.qual || 'B.Sc. Microbiology'),
      tech_person_mobile: o.tech === null ? null : '90' + RI(10000000, 99999999),
      form_ix_name: nm(), form_ix_mobile: '80' + RI(10000000, 99999999),
      certificate_file_id: o.scan === false ? null : 9000 + FOOD_LICENCES.length,
      remarks: null, is_current: 1, recorded_by: null, contractor_name: rr.contractor,
    });
  };

  // The real one, transcribed from the Form C.
  if (BSL) put(BSL, { number: '10025901000005', licensee: 'M/S ISF SERVICES',
                      from: '2025-02-11', upto: '2027-02-10',
                      tech: 'Lekhraj Nihal Singh', qual: 'B.Com' });
  if (expRR)  put(expRR,  { number: '1002590100' + RI(1000, 9999), from: dISO(-700), upto: dISO(-40) });
  if (lapsRR) put(lapsRR, { number: '1002590100' + RI(1000, 9999), from: dISO(-1000), upto: dISO(-260) });
  if (suspRR) put(suspRR, { number: '1002590100' + RI(1000, 9999), from: dISO(-300), upto: dISO(400),
                            status: 'suspended' });

  kitchens.forEach((rr, i) => {
    if (special.has(rr.id)) return;
    // Every sixth kitchen sits inside the 180-day renewal window, and every
    // ninth has never uploaded the certificate — both are the ordinary state
    // of a register that nobody has been made to keep.
    const upto = i % 6 === 0 ? dISO(RI(20, 170)) : dISO(RI(200, 640));
    put(rr, { number: '1002590100' + String(1000 + i).slice(-4), from: dISO(-380), upto,
              scan: i % 9 !== 0, tech: i % 7 === 0 ? null : undefined });
  });

  // Recurring duties. Roughly two in three kitchens are up to date; the rest
  // are the ones the dashboard exists to surface.
  const y = TODAY.getUTCFullYear(), mo = TODAY.getUTCMonth() + 1;
  const fyEnd = mo >= 4 ? y : y - 1;
  const annual = { obligation: 'annual_return',
                   period_label: `${fyEnd - 1}-${String(fyEnd).slice(2)}`, due_on: `${fyEnd}-05-31` };
  const halves = mo >= 10 ? [`Apr-Sep ${y}`, `Oct-Mar ${y}-${y + 1}`]
               : mo >= 4  ? [`Oct-Mar ${y - 1}-${y}`, `Apr-Sep ${y}`]
                          : [`Apr-Sep ${y - 1}`, `Oct-Mar ${y - 1}-${y}`];

  kitchens.forEach((rr, i) => {
    const lic = FOOD_LICENCES.find(l => l.running_room_id === rr.id);
    if (i % 3 !== 2) {
      FOOD_RETURNS.push({ id: ++flrId, running_room_id: rr.id, licence_id: lic ? lic.id : null,
        ...annual, completed_on: `${fyEnd}-05-${String(RI(4, 28)).padStart(2, '0')}`,
        reference_no: 'AR/' + RI(100000, 999999), agency_name: null,
        result_summary: 'Filed on FoSCoS', document_file_id: 9500 + i, recorded_by: null });
    }
    halves.forEach((h, k) => {
      if ((i + k) % 4 === 3) return;              // some halves genuinely missed
      FOOD_RETURNS.push({ id: ++flrId, running_room_id: rr.id, licence_id: lic ? lic.id : null,
        obligation: 'lab_test', period_label: h,
        due_on: h.startsWith('Apr') ? `${h.slice(-4)}-09-30` : `${h.slice(-4)}-03-31`,
        completed_on: dISO(-RI(20, 300)),
        reference_no: 'TR/' + RI(10000, 99999),
        agency_name: pick(['Sai Analytical Labs (NABL)', 'Envirocare Labs, Thane (NABL)',
                           'Choksi Laboratories (FSSAI recognised)', 'MicroChem Silliker (NABL)']),
        result_summary: 'All parameters within prescribed limits',
        document_file_id: 9600 + i * 3 + k, recorded_by: null });
    });
  });

  // A few inspections already carried out, so the history is not empty.
  kitchens.filter((_, i) => i % 4 === 0).forEach((rr, n) => {
    const date = dISO(-RI(10, 120));
    const answers = FOOD_CHECK_ITEMS.map(it => {
      const bad = (it.id * (n + 3)) % 11 === 0;
      return { item_id: it.id, is_critical: it.is_critical,
               status: bad ? 'not_complied' : 'complied',
               observation: bad ? pick(['Not seen at the time of visit',
                                        'Register produced but not written up',
                                        'Pointed out to the supervisor on the spot',
                                        'Undertaking given to put right within the week']) : null };
    });
    const failed = answers.filter(a => a.status === 'not_complied').length;
    const crit   = answers.filter(a => a.status === 'not_complied' && a.is_critical).length;
    const id = ++fiId;
    FOOD_INSPECTIONS.push({ id, running_room_id: rr.id,
      licence_id: (FOOD_LICENCES.find(l => l.running_room_id === rr.id) || {}).id || null,
      inspection_date: date, inspected_by: null, inspector_name: nm() + ', Sr. DEE (TRO)',
      contractor_rep_name: nm(), items_checked: answers.length, items_failed: failed,
      critical_failed: crit,
      result: crit ? 'unsatisfactory' : failed ? 'needs_improvement' : 'satisfactory',
      remarks: failed ? 'Contractor advised to put the above right and report compliance in seven days.' : null,
      rr_name: rr.name, rr_id: rr.id, div_code: rr.div_code, inspector: null });
    answers.forEach(a => FOOD_INSPECTION_ITEMS.push({ id: ++fiiId, inspection_id: id,
      item_id: a.item_id, status: a.status, observation: a.observation, evidence_file_id: null }));
  });
}

Object.assign(module.exports, { FOOD_CHECK_ITEMS, FOOD_LICENCES, FOOD_RETURNS,
  FOOD_INSPECTIONS, FOOD_INSPECTION_ITEMS,
  nextFoodId: () => ++flId, nextFoodReturnId: () => ++flrId,
  nextFoodInspId: () => ++fiId, nextFoodItemId: () => ++fiiId });

/* ---------------------------------------------------------------------------
 * Stage 30 — wages, EPF, ESIC, bonus and Shramik Kalyan. Audit item P7.
 *
 * The point of the demo data here is clause M5: Rs 100 per staff per DAY where
 * wages are not paid by the 10th. So the months are not uniformly clean. One
 * running room in seven pays somewhere between the 15th and the 20th every
 * single month, which is the shape of a standing M5 case and the thing the
 * twelve-month table exists to make visible; the most recent month is left
 * unrecorded at some rooms, because "nobody has written it down yet" is the
 * commonest state of a register at the start of a month and is not the same as
 * "unpaid"; and the statutory returns are patchy, because they are in real life.
 * ------------------------------------------------------------------------ */
const WAGE_MONTHS = new Map();          // `${rrId}|${ym}` -> row
const WAGE_PAYMENTS = [];
const WAGE_RETURNS = [];
{
  let wmId = 0, wpId = 0, wrId = 0;
  const pad2 = n => String(n).padStart(2, '0');
  const now = new Date(TODAY.getTime());
  RUNNING_ROOMS.forEach((rr, idx) => {
    const chronicallyLate = idx % 7 === 3;
    const men = STAFF.filter(s => s.running_room_id === rr.id && s.screening_status === 'approved');
    for (let back = 1; back <= 6; back++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const ym = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
      // The month just gone is often not written down yet at some rooms.
      if (back === 1 && idx % 5 === 2) continue;
      const nxt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      const payDay = chronicallyLate ? RI(15, 20) : RI(3, 9);
      const paidOn = `${nxt.getUTCFullYear()}-${pad2(nxt.getUTCMonth() + 1)}-${pad2(payDay)}`;
      const id = ++wmId;
      const verified = !chronicallyLate && rnd() < 0.7;
      WAGE_MONTHS.set(`${rr.id}|${ym}`, {
        id, running_room_id: rr.id, wage_month: `${ym}-01`, paid_on: paidOn,
        payment_mode: rnd() < 0.85 ? 'bank' : 'mixed', sheet_file_id: null,
        remarks: chronicallyLate && back === 1 ? 'Delay in receipt of the running bill.' : null,
        recorded_by: null, recorded_name: 'Contractor Supervisor',
        verified_by: verified ? null : null,
        verified_at: verified ? `${paidOn} 17:${pad2(RI(5, 55))}:00` : null,
        verified_name: verified ? 'RR In-charge' : null,
        verify_remarks: verified ? 'Signed payment sheet seen; bank statement tallies.' : null,
      });
      men.forEach(m => {
        // One man in twenty is simply not written down — silence, which the
        // register has to be able to show as different from "paid nothing".
        if (rnd() < 0.05) return;
        WAGE_PAYMENTS.push({ id: ++wpId, wage_month_id: id, staff_id: m.id,
          days_paid: RI(24, 30), amount_paid: String(RI(14, 22) * 1000) + '.00',
          paid_through: 'bank', bank_ref: `UTR${RI(100000000, 999999999)}`, paid_on: paidOn });
      });
      const filed = (type, when, ref, amt) => WAGE_RETURNS.push({ id: ++wrId, wage_month_id: id,
        return_type: type, paid_on: when, reference_no: ref, amount: amt,
        file_id: null, remarks: null, recorded_by: null });
      const by15 = `${nxt.getUTCFullYear()}-${pad2(nxt.getUTCMonth() + 1)}-15`;
      if (rnd() < 0.9) filed('epf', by15, `EPF/${RI(100000, 999999)}`, String(RI(20, 60) * 1000) + '.00');
      if (rnd() < 0.85) filed('esic', by15, `ESIC/${RI(100000, 999999)}`, String(RI(5, 18) * 1000) + '.00');
      // Bonus is annual: only the month it is actually paid carries it.
      if (ym.endsWith('-10')) filed('bonus', by15, `BON/${RI(1000, 9999)}`, String(RI(60, 140) * 1000) + '.00');
      if (rnd() < 0.6) filed('shramik_kalyan', by15, `SKP/${RI(100000, 999999)}`, null);
    }
  });
}

Object.assign(module.exports, { WAGE_MONTHS, WAGE_PAYMENTS, WAGE_RETURNS });

/* ---------------------------------------------------------------------------
 * Stage 31 — the security and incident register. Audit item P14, first half.
 *
 * Sparse on purpose. Incidents are rare, and a demo where every running room
 * has a fire misrepresents the register as badly as one where nothing has ever
 * happened. What the sample DOES carry deliberately is the three states an
 * officer has to be able to tell apart: an entry the Railway was told about the
 * same day, one it heard about a week later, and one with no report date at all
 * — which is not the same as nothing to report.
 *
 * Two entries are intoxication, one of the contractor's man and one of running
 * staff, because that pair is the whole reason the register asks whose man it
 * was: the first is clause A3 at Rs 1,000, the second is a crew discipline
 * matter carrying no contractor penalty whatever.
 * ------------------------------------------------------------------------ */
const INCIDENTS = [];
const INCIDENT_NOTIFICATIONS = [];
{
  let id = 0, nid = 0;
  const KINDS = [
    ['theft',        'Two blankets and a wall clock missing from the first floor after the night shift.', 'minor'],
    ['fire',         'Kitchen chimney caught fire during the evening meal; put out with the extinguisher.', 'serious'],
    ['accident',     'Bearer slipped on a wet stair and fractured a wrist.', 'serious'],
    ['miscreant',    'Outsider entered through the rear gate and was removed by the RPF.', 'minor'],
    ['security_lapse', 'Rear gate found unlocked at 03:00 on the night round.', 'minor'],
  ];
  const add = (rr, back, kind, involves, reportedAfter, sev) => {
    const on = plusDays(-back);
    const i = {
      id: ++id, running_room_id: rr.id, occurred_on: on,
      occurred_at: `${String(RI(0, 23)).padStart(2, '0')}:${String(RI(0, 59)).padStart(2, '0')}:00`,
      reported_on: reportedAfter === null ? null : plusDays(-back + reportedAfter),
      incident_type: kind[0], severity: sev || kind[2], summary: kind[1], detail: null,
      involves, staff_id: null, persons_affected: null,
      immediate_action: 'Site secured and the RR In-charge informed.',
      evidence_file_id: null,
      status: back > 40 ? 'closed' : (back > 15 ? 'under_enquiry' : 'open'),
      closed_on: back > 40 ? plusDays(-back + 6) : null, closed_by: null,
      closure_remarks: back > 40 ? 'Enquiry completed; nothing further arises against the contractor.' : null,
      recorded_by: null,
      rr_name: rr.name, div_code: rr.div_code, staff_name: null, closed_name: back > 40 ? 'RR In-charge' : null,
    };
    INCIDENTS.push(i);
    if (i.reported_on) {
      const who = kind[0] === 'theft' ? 'police' : kind[0] === 'fire' ? 'fire_service'
                : kind[0] === 'accident' ? 'medical' : 'rpf';
      INCIDENT_NOTIFICATIONS.push({ id: ++nid, incident_id: i.id, authority: who,
        informed_on: i.reported_on, informed_at: '09:15:00',
        reference_no: who === 'police' ? `FIR/${RI(100, 999)}/2026` : `REF/${RI(1000, 9999)}`, remarks: null });
      INCIDENT_NOTIFICATIONS.push({ id: ++nid, incident_id: i.id, authority: 'division_control',
        informed_on: i.reported_on, informed_at: '09:40:00',
        reference_no: `MSG/${RI(1000, 9999)}`, remarks: null });
    }
    return i;
  };

  RUNNING_ROOMS.forEach((rr, idx) => {
    if (idx % 6 !== 0) return;                       // most rooms have nothing
    add(rr, RI(50, 120), KINDS[idx % KINDS.length], 'outsider', 0);
    if (idx % 12 === 0) add(rr, RI(5, 25), KINDS[(idx + 1) % KINDS.length], 'nobody', 7);
    if (idx % 18 === 0) add(rr, RI(3, 14), KINDS[(idx + 2) % KINDS.length], 'occupant', null);
  });

  // The pair that carries the whole design.
  const a = RUNNING_ROOMS[3], b = RUNNING_ROOMS[9];
  if (a) {
    const i = add(a, 9, ['intoxication',
      "The contractor's night bearer found intoxicated on duty and sent off the premises.", 'serious'],
      'contractor_staff', 0);
    const man = STAFF.find(s => s.running_room_id === a.id);
    if (man) { i.staff_id = man.id; i.staff_name = man.full_name; }
  }
  if (b) add(b, 6, ['intoxication',
    'A Loco Pilot reported at the running room in an intoxicated state; the lobby and controller were informed.',
    'serious'], 'running_staff', 0);
}

Object.assign(module.exports, { INCIDENTS, INCIDENT_NOTIFICATIONS });

/* ---------------------------------------------------------------------------
 * Stage 32 — the contractor's standing obligations. The remainder of P14.
 *
 * The nine obligations mirror db/seeds/10_compliance_items.sql. The sample is
 * deliberately mixed: most rooms have the everyday things in place and the two
 * that carry a weekly rate — the PC and the biometric — outstanding at a few,
 * because that is the pair the screen exists to put a date against.
 * ------------------------------------------------------------------------ */
const COMPLIANCE_ITEMS = [
  { id: 1, code: 'PC_PRINTER',     name: 'Computer and printer at the running room',
    detail: 'A PC unit with a printer so that records are computer-generated rather than handwritten.',
    clause_code: 'D3', due_basis: 'loa_plus_days', due_days: 30, recur_months: null,
    source_ref: 'Schedule D / clause D3', sort_order: 10, is_active: 1 },
  { id: 2, code: 'BIOMETRIC',      name: 'Biometric attendance system',
    detail: 'Installed and working, so attendance is machine-recorded. The tender allows one month from acceptance.',
    clause_code: 'D4', due_basis: 'loa_plus_days', due_days: 30, recur_months: null,
    source_ref: 'Schedule D / clause D4', sort_order: 20, is_active: 1 },
  { id: 3, code: 'INDEMNITY_BOND', name: 'Indemnity bond executed',
    detail: 'Executed and lodged with the Railway.',
    clause_code: null, due_basis: 'loa_plus_days', due_days: 30, recur_months: null,
    source_ref: 'General conditions', sort_order: 30, is_active: 1 },
  { id: 4, code: 'UNIFORM_SAMPLE', name: 'Uniform sample approved',
    detail: 'A sample set produced and approved by the Railway before issue to the staff.',
    clause_code: null, due_basis: 'loa_plus_days', due_days: 30, recur_months: null,
    source_ref: 'General conditions', sort_order: 40, is_active: 1 },
  { id: 5, code: 'FIRE_EXT',       name: 'Fire extinguishers refilled',
    detail: 'Refilled and in date. Where it is not done the Railway may have the work executed elsewhere and recover twice the expenditure.',
    clause_code: 'M12', due_basis: 'recurring_months', due_days: null, recur_months: 12,
    source_ref: 'Schedule M / clause M12', sort_order: 50, is_active: 1 },
  { id: 6, code: 'EMERGENCY_NOS',  name: 'Emergency numbers displayed at reception',
    detail: 'Fire, police, ambulance, the RR In-charge and the controller, legible at the reception counter.',
    clause_code: null, due_basis: 'none', due_days: null, recur_months: null,
    source_ref: 'General conditions', sort_order: 60, is_active: 1 },
  { id: 7, code: 'NO_PLASTIC',     name: 'Single-use plastic not in use',
    detail: 'Prohibited throughout the running room, kitchen included.',
    clause_code: null, due_basis: 'none', due_days: null, recur_months: null,
    source_ref: 'General conditions', sort_order: 70, is_active: 1 },
  { id: 8, code: 'BED_PLATE',      name: 'Bed indication plates and name board',
    detail: 'Every bed numbered and the running room name board in place.',
    clause_code: null, due_basis: 'none', due_days: null, recur_months: null,
    source_ref: 'General conditions', sort_order: 80, is_active: 1 },
  { id: 9, code: 'STAFF_TRAINING', name: 'Staff trained before deployment',
    detail: 'Training given before a man is put on duty, not after.',
    clause_code: null, due_basis: 'none', due_days: null, recur_months: null,
    source_ref: 'General conditions', sort_order: 90, is_active: 1 },
];

const COMPLIANCE_STATUS = [];
{
  let sid = 0;
  RUNNING_ROOMS.forEach((rr, idx) => {
    COMPLIANCE_ITEMS.forEach(it => {
      // One obligation in nine is left with nothing written down at all, so the
      // "nobody has looked" column is never empty in the demo.
      if ((idx + it.id) % 9 === 0) return;
      const behind = it.clause_code && idx % 5 === 2;      // the chargeable pair, at some sites
      COMPLIANCE_STATUS.push({ id: ++sid, running_room_id: rr.id, item_id: it.id,
        met_on: behind ? null : plusDays(-RI(30, 400)),
        not_met: behind && idx % 10 === 2 ? 1 : 0,
        reference_no: behind ? null : (it.code === 'FIRE_EXT' ? `REFILL/${RI(100, 999)}` : null),
        file_id: null, remarks: null, recorded_by: null });
    });
  });
}

Object.assign(module.exports, { COMPLIANCE_ITEMS, COMPLIANCE_STATUS });

/* ---------------------------------------------------------------------------
 * Stage 34 — the linen schedule, mirroring db/seeds/11_linen_schedule.sql.
 * Transcribed from the executed GeM contract for IGP, pages 83-84.
 * ------------------------------------------------------------------------ */
const LINEN_SCHEDULE = [
  { item_type:'bedsheet',       name:'Bed sheet',       delivery_days:1, wash_frequency:'Each occupant',  per_bed:2,    recovery_rate:'170.00', schedule_qty:365200, sort_order:10 },
  { item_type:'pillow_cover',   name:'Pillow cover',    delivery_days:1, wash_frequency:'Each occupant',  per_bed:1,    recovery_rate:'45.00',  schedule_qty:182500, sort_order:20 },
  { item_type:'mosquito_net',   name:'Mosquito net',    delivery_days:1, wash_frequency:'Once in a week', per_bed:1,    recovery_rate:'170.00', schedule_qty:17680,  sort_order:30 },
  { item_type:'curtain',        name:'Curtain',         delivery_days:3, wash_frequency:'Every 15 days',  per_bed:null, recovery_rate:'450.00', schedule_qty:12000,  sort_order:40 },
  { item_type:'mattress_cover', name:'Mattress cover',  delivery_days:3, wash_frequency:'Every 15 days',  per_bed:1,    recovery_rate:'400.00', schedule_qty:8160,   sort_order:50 },
  { item_type:'blanket',        name:'Woollen blanket', delivery_days:3, wash_frequency:'Every month',    per_bed:1,    recovery_rate:'397.00', schedule_qty:4000,   sort_order:60 },
  { item_type:'blanket_cover',  name:'Blanket cover',   delivery_days:7, wash_frequency:'Every 15 days',  per_bed:1,    recovery_rate:'230.00', schedule_qty:9600,   sort_order:70 },
  { item_type:'other',          name:'Other linen',     delivery_days:null, wash_frequency:null,          per_bed:null, recovery_rate:null,     schedule_qty:null,   sort_order:80 },
];
Object.assign(module.exports, { LINEN_SCHEDULE });
