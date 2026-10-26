#!/usr/bin/env node
/**
 * Exports every register the application shows, as CSV.
 *
 *   node tools/export-csv.js            writes to ./exports
 *   node tools/export-csv.js /some/dir  writes elsewhere
 *
 * Reads the same in-memory demo dataset the demo server uses, so what you get
 * is exactly what the pages display. Deficiency clauses are read from the SQL
 * seed instead, so you get all 50 rather than the demo's sample.
 */
const fs = require('fs');
const path = require('path');
const D = require('../demo/data');

const OUT = process.argv[2] || path.join(__dirname, '..', 'exports');
fs.mkdirSync(OUT, { recursive: true });

const cell = v => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function write(name, headers, rows) {
  const csv = [headers.join(',')].concat(rows.map(r => r.map(cell).join(','))).join('\n');
  fs.writeFileSync(path.join(OUT, name), '﻿' + csv);   // BOM so Excel reads UTF-8
  console.log(`  ${name.padEnd(30)} ${rows.length} rows`);
}

console.log(`\n  Writing CSVs to ${OUT}\n`);

// ---- running rooms (REAL data) ----
write('running-rooms.csv',
  ['Code','Running room','Division','Category','Controlling dept','Rooms','Beds','Female rooms',
   'Crews per day','Peak concurrent','Meal facility','AC status','Manpower band','Sanctioned staff','Contractor','Agreement no'],
  D.RUNNING_ROOMS.map(r => [r.code, r.name, r.div_name, r.category, r.control_dept, r.physical_rooms,
    r.total_beds, r.female_rooms, r.ref_crews_per_day, r.ref_peak_occupancy,
    r.has_meal_facility ? 'Subsidised' : 'None', r.ac_status, r.band, r.sanctioned, r.contractor, r.agreement_no]));

// ---- contract staff ----
const docTypes = ['photo_id','police_verification','medical_fitness','bank_proof','epf_proof','esic_proof','qualification'];
write('contract-staff.csv',
  ['Staff code','Name','Designation','Skill','Running room','Division','Contractor','Date of joining',
   'Screening','EPF no','ESIC no','ID card no','Documents held','Missing documents','Last uniform issue','Uniform due'],
  D.STAFF.map(s => {
    const held = new Set((D.DOCS[s.id] || []).map(d => d.doc_type));
    const need = docTypes.filter(t => t !== 'qualification' || s.requires_qualification);
    const uni = (D.ISSUES[s.id] || []).find(i => i.issue_type === 'uniform');
    return [s.staff_code, s.full_name, s.designation, s.skill_category.replace('_','-'), s.rr_name,
      D.DIVS.find(d => d.code === s.div_code).name, s.contractor, s.date_of_joining, s.screening_status,
      s.epf_no, s.esic_no, s.id_card_no, held.size,
      need.filter(t => !held.has(t)).join('; '), uni ? uni.issued_on : '', uni ? uni.due_next_on : ''];
  }));

// ---- contractors ----
write('contractors.csv',
  ['Code','Contractor','GST no','Running rooms','Beds','Staff on roll','Running rooms held'],
  D.CONTRACTORS.map(c => {
    const rs = D.RUNNING_ROOMS.filter(r => r.contractor_id === c.id);
    return [c.code, c.name, c.gst_no, rs.length, rs.reduce((a, r) => a + r.total_beds, 0),
      D.STAFF.filter(s => s.contractor_id === c.id).length, rs.map(r => r.name).join('; ')];
  }));

// ---- designations & the Schedule-A matrix ----
write('designations.csv',
  ['Code','Designation','Skill category','Kitchen role','Qualification required','Floor when scaled below 50 beds'],
  D.DESIGNATIONS.map(d => [d.code, d.name, d.skill_category.replace('_','-'),
    d.is_kitchen_role ? 'Yes' : 'No', d.requires_qualification ? 'Yes' : 'No', d.min_per_site]));

const bands = [50, 100, 150, 200, 250];
write('manpower-norms.csv',
  ['Designation', ...bands.map(b => `~${b} beds`)],
  D.DESIGNATIONS.map(d => [d.name, ...bands.map(b => D.NORMS[b][d.code])])
    .concat([['TOTAL', ...bands.map(b => D.DESIGNATIONS.reduce((a, d) => a + D.NORMS[b][d.code], 0))]]));

// ---- per-running-room sanctioned strength ----
const rows = [];
for (const rr of D.RUNNING_ROOMS)
  for (const m of D.MANPOWER[rr.id])
    if (m.sanctioned_count > 0 || m.norm_count > 0)
      rows.push([rr.code, rr.name, rr.total_beds, m.band_beds, m.name, m.norm_count,
        m.sanctioned_count, m.is_scaled ? 'Yes' : 'No',
        (!rr.has_meal_facility && m.is_kitchen_role) ? 'No meal facility — nil' : '']);
write('manpower-per-running-room.csv',
  ['RR code','Running room','Beds','Band','Designation','Schedule-A norm','Sanctioned','Scaled','Note'], rows);

// ---- deficiency clauses, read from the SQL seed so all 50 are included ----
const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'seeds', '02_deficiency_clauses.sql'), 'utf8');
const clause = [];
const re = /\(\s*'([^']+)','([A-Z])','([^']*)','((?:[^']|'')*)',\s*(NULL|[\d.]+)\s*,'((?:[^']|'')*)','(\w+)',(\d),(NULL|'(?:[^']|'')*'),(\d),(\d)/g;
let m;
while ((m = re.exec(sql)))
  clause.push([m[1], m[3], m[4].replace(/''/g, "'"), m[5] === 'NULL' ? '' : Number(m[5]),
    m[6].replace(/''/g, "'"), m[7], m[8] === '1' ? 'Yes' : 'No',
    m[9] === 'NULL' ? '' : m[9].slice(1, -1).replace(/''/g, "'"), m[10] === '1' ? 'Yes' : 'No']);
write('deficiency-clauses.csv',
  ['Clause','Head','Nature of deficiency','Rate (Rs)','Unit','Frequency','Formula','Formula note','In daily checklist'],
  clause);

// ---- occupant grading & feedback coverage ----
write('grading-and-coverage.csv',
  ['RR code','Running room','Month','Occupants','Feedback received','Coverage %','Meets 50% floor',
   'Cleanliness','Food','Linen'],
  D.RUNNING_ROOMS.map(rr => {
    const c = D.COVERAGE[rr.id][0];
    const g = h => { const x = D.GRADING[rr.id].find(y => y.head === h); return x ? x.avg_rating : ''; };
    return [rr.code, rr.name, c.period_month, c.occupants_total, c.feedback_received,
      c.coverage_pct, c.meets_floor ? 'Yes' : 'No', g('cleanliness'), g('food'), g('linen')];
  }));

// ---- six months of grading and coverage, for the trend pages ----
write('grading-and-coverage-monthly.csv',
  ['RR code','Running room','Division','Month','Occupants','Feedback received','Coverage %',
   'Meets 50% floor','Cleanliness','Food','Linen'],
  D.RUNNING_ROOMS.flatMap(rr => (D.COVERAGE[rr.id] || []).map(c => {
    const g = h => {
      const x = (D.GRADING[rr.id] || []).find(y => y.head === h && y.period_month === c.period_month);
      return x ? x.avg_rating : '';
    };
    return [rr.code, rr.name, rr.div_code, c.period_month, c.occupants_total, c.feedback_received,
      c.coverage_pct, c.meets_floor ? 'Yes' : 'No', g('cleanliness'), g('food'), g('linen')];
  })));

// ---- facility and material (stage 6) ----
write('vendors.csv',
  ['Type','Name','Licence no','Licence valid till','Approved','Active'],
  D.VENDORS.map(v => [v.vendor_type, v.name, v.licence_no, v.licence_valid_till,
    v.is_approved ? 'Yes' : 'No', v.is_active ? 'Yes' : 'No']));

write('consumable-items.csv',
  ['Code','Item','Schedule','Unit','Supply frequency','Approved brands'],
  D.CONSUMABLE_ITEMS.map(i => [i.code, i.name, i.schedule_code, i.unit, i.supply_frequency, i.approved_brands]));

write('assets.csv',
  ['RR code','Running room','Asset code','Asset','Category','Owned by','Quantity','Condition','Handed over'],
  D.RUNNING_ROOMS.flatMap(rr => (D.ASSETS[rr.id] || []).map(a =>
    [rr.code, rr.name, a.asset_code, a.name, a.category, a.owned_by, a.quantity,
     a.condition_status, a.handed_over_on])));

write('asset-breakdowns.csv',
  ['RR code','Running room','Asset','Owned by','Reported at','Defect','Rectified at','Hours','Status'],
  D.RUNNING_ROOMS.flatMap(rr => (D.BREAKDOWNS[rr.id] || []).map(f =>
    [rr.code, rr.name, f.asset_name, f.owned_by, f.reported_at, f.description,
     f.rectified_at, f.hours_to_rectify, f.status])));

write('pest-control.csv',
  ['RR code','Running room','Treatment','Agency','Scheduled','Carried out','Notice given','Delay (days)','Areas','Chemical'],
  D.RUNNING_ROOMS.flatMap(rr => (D.PEST[rr.id] || []).map(x =>
    [rr.code, rr.name, x.treatment_type, x.vendor_name, x.scheduled_on, x.performed_on,
     x.notice_given_on, x.delay_days, x.areas_covered, x.chemical_used])));

write('kitchen-compliance.csv',
  ['RR code','Running room','Check','As on','Position','Detail','Valid till'],
  D.RUNNING_ROOMS.flatMap(rr => (D.KITCHEN_COMPLIANCE[rr.id] || []).map(k =>
    [rr.code, rr.name, k.check_type, k.as_on_date, k.status, k.detail, k.valid_till])));

// ---- blank templates for the real data still to be collected ----
fs.mkdirSync(path.join(OUT, 'templates'), { recursive: true });
const T = (name, headers, sample) => {
  fs.writeFileSync(path.join(OUT, 'templates', name),
    '﻿' + [headers.join(','), sample.map(cell).join(',')].join('\n'));
  console.log(`  templates/${name.padEnd(19)} header + 1 example row`);
};
T('contracts-to-collect.csv',
  ['RR code','Running room','Contractor name','Agreement no','Start date','End date','Security deposit','Remarks'],
  ['RR001','CSMT','<contractor firm name>','<agreement no>','2025-04-01','2027-03-31','', 'one row per running room']);
T('vendors-to-collect.csv',
  ['Type','Firm name','Address','GST no','Licence no','Licence valid till','Running rooms served'],
  ['laundry','<washing centre name>','','','','','CSMT, KYN']);
T('assets-to-collect.csv',
  ['RR code','Running room','Asset','Category','Owned by','Quantity','Condition','Handed over on','Joint note ref'],
  ['RR001','CSMT','<asset as in the joint note>','Electrical','railway','','good','','']);
T('contract-staff-to-collect.csv',
  ['Running room','Staff name','Designation','Date of joining','Phone','EPF no','ESIC no','Police verification ref','Medical fitness valid till'],
  ['CSMT','<full name>','Supervisor','2025-04-01','','','','','']);

console.log('');
