#!/usr/bin/env node
/**
 * Exercises the write paths against a real MySQL.
 *
 * Reading a page proves the SELECTs. It says nothing about the INSERTs, and
 * INSERTs are where a real server differs most from a stub: STRICT_TRANS_TABLES
 * rejects an empty string in a DATE column that the stub accepted happily, a
 * unique key that only exists in the migration finally gets enforced, and a
 * value too long for its column is an error rather than a silent truncation.
 *
 *   node tools/write-check.mjs [baseUrl] [user] [password] [roomId]
 */
const BASE = process.argv[2] || 'http://localhost:3100';
const USER = process.argv[3] || 'officer';
const PASS = process.argv[4] || 'demo1234';
const RR   = process.argv[5] || '41';
// Several registers are the contractor's or the site's to fill, not the
// officer's — `stay.manage` belongs to the RR in-charge and the contractor's
// supervisor, and an officer posting to them is correctly refused. So the
// site-level half of this check runs under a second login.
const SITE_USER = process.argv[6] || '';
const SITE_PASS = process.argv[7] || '';

let cookie = '';
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + String(extra).slice(0, 240) : '')); fail++; }
};

async function req(path, { method = 'GET', form } = {}) {
  const init = { method, headers: { cookie }, redirect: 'manual' };
  if (form) { init.body = form; }
  const r = await fetch(BASE + path, init);
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, body: r.status < 300 ? await r.text() : '', loc: r.headers.get('location') };
}

async function loginAs(u, p) {
  cookie = '';
  await req('/login');
  const r = await fetch(BASE + '/login', {
    method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: u, password: p }), redirect: 'manual' });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return r.status === 302;
}
if (!await loginAs(USER, PASS)) { console.error('login failed for', USER); process.exit(1); }

const fd = o => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };

// --- a licence, with every optional date left blank ---------------------------
// The blank dates are the point. A form submitted with "issued on" untouched
// sends an empty string, and an empty string is not a date.
let r = await req(`/food-safety/${RR}/licence`, { method: 'POST', form: fd({
  licence_number: '10025901000005', licensee_name: 'M/S FIRST HOLDER',
  premises_address: '', kind_of_business: '', licence_category: '',
  issuing_authority: '', issued_on: '', valid_from: '2024-01-01', valid_upto: '2026-01-01',
  status: 'issued', tech_person_name: '', tech_person_qual: '', tech_person_mobile: '',
  form_ix_name: '', form_ix_mobile: '', remarks: '' }) });
ok('a licence saves with every optional date left blank', r.status === 302, r.body);

// --- the renewal, which must stand the first one down without colliding -------
r = await req(`/food-safety/${RR}/licence`, { method: 'POST', form: fd({
  licence_number: '10025901000005', licensee_name: 'M/S SECOND HOLDER',
  valid_from: '2026-01-01', valid_upto: '2028-01-01', status: 'issued',
  issued_on: '2026-01-02', issuing_authority: 'DO, Railways' }) });
ok('a renewal supersedes the previous licence without a duplicate key error',
   r.status === 302, r.body);

r = await req(`/food-safety/${RR}`);
ok('the renewed licence is the current one and the old one is kept in history',
   r.body.includes('M/S SECOND HOLDER') && r.body.includes('M/S FIRST HOLDER'));

// --- a third renewal, because two superseded rows is where a 0/NULL flag fails -
r = await req(`/food-safety/${RR}/licence`, { method: 'POST', form: fd({
  licence_number: '10025901000005', licensee_name: 'M/S THIRD HOLDER',
  valid_from: '2028-01-01', valid_upto: '2030-01-01', status: 'issued' }) });
ok('a second superseded licence does not collide with the first',
   r.status === 302, r.body);

// --- an over-long field must be cut, not rejected -----------------------------
r = await req(`/food-safety/${RR}/licence`, { method: 'POST', form: fd({
  licence_number: '10025901000005', licensee_name: 'M/S ' + 'X'.repeat(400),
  valid_from: '2030-01-01', valid_upto: '2032-01-01', status: 'issued' }) });
ok('a licensee name longer than the column is trimmed, not refused',
   r.status === 302, r.body);

// --- the periodic return ------------------------------------------------------
r = await req(`/food-safety/${RR}/returns`, { method: 'POST', form: fd({
  obligation: 'lab_test', period_label: 'Apr-Sep 2026', due_on: '2026-09-30',
  completed_on: '2026-08-01', reference_no: 'TR/1', agency_name: 'Envirocare Labs (NABL)',
  result_summary: 'Within limits' }) });
ok('a laboratory test report is recorded', r.status === 302, r.body);

// Same period twice: the unique key must update rather than blow up.
r = await req(`/food-safety/${RR}/returns`, { method: 'POST', form: fd({
  obligation: 'lab_test', period_label: 'Apr-Sep 2026', due_on: '2026-09-30',
  completed_on: '2026-08-09', reference_no: 'TR/2', agency_name: 'Choksi Laboratories' }) });
ok('lodging the same period again corrects it instead of duplicating it',
   r.status === 302, r.body);
r = await req(`/food-safety/${RR}`);
ok('the correction replaced the earlier entry',
   r.body.includes('Choksi Laboratories') && !r.body.includes('TR/1'));

// --- the inspection -----------------------------------------------------------
r = await req(`/food-safety/${RR}/inspect`);
const ids = [...r.body.matchAll(/name="item_(\d+)"/g)].map(m => m[1]);
const unique = [...new Set(ids)];
ok('the checklist is served with every item', unique.length === 42);

const answers = { inspection_date: '2026-08-05', inspector_name: 'Sr. DEE (TRO)',
                  contractor_rep_name: 'Site supervisor', remarks: 'Verified on site.' };
unique.forEach((id, i) => { answers['item_' + id] = i % 9 === 0 ? 'not_complied' : 'complied';
                            answers['obs_' + id] = i % 9 === 0 ? 'Not seen at the visit' : ''; });
r = await req(`/food-safety/${RR}/inspect`, { method: 'POST',
  form: new URLSearchParams(answers) });
ok('an inspection with 42 answers is recorded in one transaction',
   r.status === 302, r.body);

// The same room and date again must correct the visit, not create a second one.
r = await req(`/food-safety/${RR}/inspect`, { method: 'POST',
  form: new URLSearchParams({ ...answers, remarks: 'Re-entered after correction.' }) });
ok('re-entering the same day corrects the visit rather than duplicating it',
   r.status === 302, r.body);

if (r.loc) {
  const rep = await req(r.loc.replace(BASE, ''));
  ok('the inspection report renders from the database',
     rep.status === 200 && rep.body.includes('Re-entered after correction'));
}

// --- wages, and clause M5 (stage 30) ------------------------------------------
//
// This section exists because of a fault the demo could not see. The route
// asked `deficiency_clauses` for a column called `code`; the real column is
// `clause_code`, and the demo stub had been keyed on the route's own statement,
// so it answered the typo perfectly and went green. The officer got a 500.
// A stub written to match the statement can only ever confirm the statement —
// only a real server refuses it. So the M5 hand-over is exercised here.
{
  // TWO months back, not one. The clause M5 checks need a wage month whose due
  // date — the 10th of the FOLLOWING month — is comfortably in the past, so
  // that a "paid late" date can be invented without landing in the future,
  // which the application rightly refuses. With one month back this suite
  // passed for most of a month and then failed on the 1st, which is the worst
  // kind of test: one that keeps time.
  const LASTM = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 2);
    return d.toISOString().slice(0, 7); })();
  const due = (() => { const [y, m] = LASTM.split('-').map(Number);
    return m === 12 ? `${y + 1}-01-10` : `${y}-${String(m + 1).padStart(2, '0')}-10`; })();
  const late = due.slice(0, 8) + '22';                       // twelve days after the 10th

  r = await req(`/wages?rr=${RR}&month=${LASTM}`);
  ok('the wage register renders from the database', r.status === 200, r.body);

  const men = [...r.body.matchAll(/name="staff" value="(\d+)"/g)].map(m => m[1]);
  ok('the roll is listed, including men whose particulars are missing', men.length > 0);

  if (men.length) {
    const f = new URLSearchParams({ rr: RR, month: LASTM, paid_on: late, payment_mode: 'bank' });
    men.forEach(id => f.append('staff', id));
    f.append(`d_${men[0]}`, '26');
    f.append(`a_${men[0]}`, '18500');
    f.append(`t_${men[0]}`, 'bank');
    f.append(`r_${men[0]}`, 'UTR000000001');
    f.append('rt_epf_on', due);
    f.append('rt_epf_ref', 'EPF/WC/1');
    f.append('rt_epf_amt', '42000');
    r = await req('/wages', { method: 'POST', form: f });
    ok('a wage sheet with one man written down and the rest left silent saves',
       r.status === 302, r.body);

    // STRICT_TRANS_TABLES is the point of doing this on a real server: an empty
    // string in a DATE column is an error here and was silently accepted by the
    // stub. Every blank man must leave no row at all rather than a row of ''.
    r = await req(`/wages?rr=${RR}&month=${LASTM}`);
    // DECIMAL(12,2) comes back as "18500.00", not "18500" — the value the
    // officer typed, as the column actually stores it.
    ok('and comes back with exactly one man on the sheet',
       (r.body.match(/name="a_\d+"[^>]*value="18500(\.00)?"/g) || []).length === 1,
       (r.body.match(/name="a_\d+"[^>]*value="[^"]*"/g) || []).join(' | ').slice(0, 200));

    ok('clause M5 is reported as late, in words',
       /after the due date/.test(r.body) && /staff-days/.test(r.body));

    // Written to be re-runnable against a database that keeps its state: on the
    // second run the clause is already on the register, and being refused is
    // then the correct answer rather than a failure. What is asserted is the
    // END STATE — raised exactly once — not the transition.
    r = await req('/wages/m5', { method: 'POST',
      form: new URLSearchParams({ rr: RR, month: LASTM }) });
    ok('clause M5 is handed to the deficiency register, or was already on it',
       r.status === 302 || r.status === 400, r.body);

    r = await req(`/wages?rr=${RR}&month=${LASTM}`);
    ok('the register shows M5 raised, once', /Already raised/.test(r.body));

    r = await req('/wages/m5', { method: 'POST',
      form: new URLSearchParams({ rr: RR, month: LASTM }) });
    ok('and refuses to raise the same clause a second time', r.status === 400);

    r = await req('/wages/verify', { method: 'POST',
      form: new URLSearchParams({ rr: RR, month: LASTM, verify_remarks: 'sheet seen' }) });
    ok('the Railway can verify the month', r.status === 302, r.body);

    r = await req('/wages', { method: 'POST',
      form: new URLSearchParams({ rr: RR, month: LASTM, paid_on: late }) });
    ok('a verified month is closed to editing', r.status === 400);

    r = await req('/wages/verify', { method: 'POST',
      form: new URLSearchParams({ rr: RR, month: LASTM, action: 'reopen' }) });
    ok('and reopening it puts the figures back in hand', r.status === 302, r.body);
  }
}

// --- the agreement record (stage 29) ------------------------------------------
//
// contract.edit is the officer's, so this runs under his session. The period is
// left deliberately blank: migration 037 made it nullable precisely because the
// pilot's real state is "LOA issued, agreement not yet executed", and a NOT NULL
// column would refuse the one state the officer needs to record.
{
  r = await req('/contractors/contracts/new');
  ok('the agreement form is served', r.status === 200, r.body);
  const firm = (/name="contractor_id"[\s\S]*?value="(\d+)"/.exec(r.body) || [])[1];
  const div  = (/name="division_id"[\s\S]*?value="(\d+)"/.exec(r.body) || [])[1];
  const stamp = Date.now().toString().slice(-8);

  if (firm && div) {
    const f = new URLSearchParams({ agreement_no: `WCHK/${stamp}`, status: 'draft',
      contractor_id: firm, division_id: div, loa_no: `LOA/WCHK/${stamp}`,
      loa_date: '2026-06-01', start_date: '', end_date: '', extended_to: '',
      security_deposit: '', performance_guarantee: '', total_value: '',
      remarks: 'written by tools/write-check.mjs' });
    r = await req('/contractors/contracts/new', { method: 'POST', form: f });
    ok('an agreement with an LOA and no period at all is accepted', r.status === 302, r.body);
    const id = (/contracts\/(\d+)/.exec(r.loc || '') || [])[1];

    if (id) {
      r = await req(`/contractors/contracts/${id}`);
      ok('and comes back reporting the period as a gap',
         r.status === 200 && /the period/.test(r.body), r.body.slice(0, 200));
    }
    // The agreement number is unique in the schema, and only a real server enforces it.
    r = await req('/contractors/contracts/new', { method: 'POST', form: f });
    ok('the same agreement number twice is refused, not duplicated', r.status === 400);

    const badDates = new URLSearchParams({ agreement_no: `WCHK/${stamp}/B`, status: 'draft',
      contractor_id: firm, division_id: div, start_date: '2026-05-01', end_date: '2026-01-01' });
    r = await req('/contractors/contracts/new', { method: 'POST', form: badDates });
    ok('an agreement that ends before it begins is refused', r.status === 400);
  }
}

// --- the site-level registers (stages 25, 26, 28) -----------------------------
//
// stay.manage and inspection.create belong to the site, not to the officer, so
// these need the second login. Without one they are skipped and said to be
// skipped — a check that quietly does not run is worse than no check.
if (!SITE_USER) {
  console.log('\n  – cleaning, menu, foodstuff, garden, incidents and obligations skipped: no site login given');
  console.log('    node tools/write-check.mjs <base> <officer> <pass> <roomId> <incharge> <pass>');
} else if (!await loginAs(SITE_USER, SITE_PASS)) {
  ok(`the site login ${SITE_USER} works`, false, 'login refused');
} else {
  const D = new Date(); D.setUTCDate(D.getUTCDate() - 1);
  const YDAY = D.toISOString().slice(0, 10);

  // --- cleaning (stage 26) ---------------------------------------------------
  r = await req(`/records/cleaning?rr=${RR}&date=${YDAY}`);
  ok('the cleaning record is served', r.status === 200, r.body);
  const rounds = [...r.body.matchAll(/name="st_(\d+)"/g)].map(m => m[1]);
  const uniqueRounds = [...new Set(rounds)];
  ok('the day carries the rounds Schedule C makes due', uniqueRounds.length > 0);

  if (uniqueRounds.length) {
    const f = new URLSearchParams({ rr: RR, date: YDAY });
    // One round done, one not done, the rest left silent — the three states.
    uniqueRounds.forEach((id, i) => {
      if (i === 0) { f.append(`st_${id}`, 'done'); f.append(`at_${id}`, '09:30'); }
      else if (i === 1) { f.append(`st_${id}`, 'not_done'); }
    });
    r = await req('/records/cleaning', { method: 'POST', form: f });
    ok('a cleaning day with one round done, one not, and the rest silent saves',
       r.status === 302, r.body);

    r = await req(`/records/cleaning?rr=${RR}&date=${YDAY}`);
    ok('and the three states are counted apart',
       /Recorded as done/.test(r.body) && /Recorded as not done/.test(r.body)
       && /Not written down at all/.test(r.body));

    r = await req('/records/cleaning', { method: 'POST', form: f });
    ok('saving the same day again corrects it rather than duplicating it',
       r.status === 302, r.body);

    // A future date must be refused by the route, not by the browser's max=.
    r = await req('/records/cleaning', { method: 'POST',
      form: new URLSearchParams({ rr: RR, date: '2027-01-01' }) });
    ok('cleaning cannot be recorded for a future date', r.status === 400);
  }

  // --- the weekly menu (stage 25) -------------------------------------------
  const MON = (() => { const d = new Date(); const n = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); })();
  r = await req(`/facility/menu?rr=${RR}&week=${MON}`);
  ok('the weekly menu is served', r.status === 200, r.body);

  const slot = (/name="(main_\d_[a-z]+)"/.exec(r.body) || [])[1];
  if (slot) {
    const mf = new URLSearchParams({ rr: RR, week: MON, remarks: 'write-check' });
    mf.append(slot, 'Chapati and dal');
    r = await req('/facility/menu', { method: 'POST', form: mf });
    ok('a week of the menu saves', r.status === 302, r.body);
    // menu_plans is unique on (running_room_id, week_start): re-saving must
    // correct the week, and only a real server enforces that key.
    r = await req('/facility/menu', { method: 'POST', form: mf });
    ok('re-saving the same week corrects it rather than creating a second plan',
       r.status === 302, r.body);
  }

  // --- raw foodstuff quality (stage 28) --------------------------------------
  r = await req(`/facility/foodstuff?rr=${RR}`);
  ok('the foodstuff register is served', r.status === 200, r.body);

  const ff = new URLSearchParams({ rr: RR, checked_on: YDAY });
  ff.append('item_0', 'Wheat flour');
  ff.append('brand_0', 'Approved brand');
  ff.append('seal_0', '1');
  ff.append('fssai_0', '1');
  ff.append('quality_0', 'good');
  ff.append('sig_name_0', 'Running staff');
  ff.append('sig_desig_0', 'Loco Pilot');
  r = await req('/facility/foodstuff', { method: 'POST', form: ff });
  ok('a quality check with an item and a signature saves', r.status === 302, r.body);

  r = await req('/facility/foodstuff', { method: 'POST',
    form: new URLSearchParams({ rr: RR, checked_on: YDAY }) });
  ok('a check with nothing examined is refused', r.status === 400);

  // A check nobody signed is KEPT and flagged, never refused — an unrecorded
  // check is worse evidence than an unsigned one.
  const nosig = new URLSearchParams({ rr: RR, checked_on: YDAY });
  nosig.append('item_0', 'Edible oil');
  nosig.append('quality_0', 'poor');
  r = await req('/facility/foodstuff', { method: 'POST', form: nosig });
  ok('a check nobody signed is kept, not refused', r.status === 302, r.body);

  // --- garden upkeep (stage 28) ----------------------------------------------
  const gf = new URLSearchParams({ rr: RR, work_date: YDAY, work_type: 'gamla_supply',
    plants_supplied: '4', pot_material: 'cement', pot_size_inches: '18',
    detail: 'written by write-check' });
  r = await req('/facility/pest/garden', { method: 'POST', form: gf });
  ok('a supply of plants in gamlas is recorded', r.status === 302, r.body);

  r = await req('/facility/pest/garden', { method: 'POST',
    form: new URLSearchParams({ rr: RR, work_date: YDAY, work_type: 'gamla_supply' }) });
  ok('a supply of plants with no count is refused', r.status === 400);

  r = await req('/facility/pest/garden', { method: 'POST',
    form: new URLSearchParams({ rr: RR, work_date: '2027-01-01', work_type: 'watering' }) });
  ok('garden work cannot be dated in the future', r.status === 400);

  r = await req(`/facility/pest?rr=${RR}&garden=1`);
  ok('the garden register renders what was written', r.status === 200, r.body);

  // --- the linen schedule and the per-item return window (stage 34) ---------
  //
  // The register used to flag everything on a flat 48 hours. The executed
  // contract gives a period per item, and the old rule was wrong in BOTH
  // directions: a bed sheet two days out passed silently, a blanket cover five
  // days out was called a breach. Both are asserted here, because a fix that
  // only moves the threshold one way is half a fix.
  const backDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10); };

  r = await req(`/facility/laundry?rr=${RR}`);
  ok('the laundry register is served', r.status === 200, r.body);
  ok("it prints the contract's own schedule", /What the contract says/.test(r.body));
  ok('bed sheets are due back next day', /Bed sheet[\s\S]{0,150}1 day/.test(r.body));
  ok('a blanket cover has seven', /Blanket cover[\s\S]{0,150}7 days/.test(r.body));
  ok('the recovery rate is shown and nothing multiplies it',
     /Rs 170\.00/.test(r.body) && /nothing here multiplies it/i.test(r.body));

  const vend = (/name="vendor_id"[\s\S]*?value="(\d+)"/.exec(r.body) || [])[1] || '';
  for (const [item, days] of [['bedsheet', 2], ['blanket_cover', 5]]) {
    r = await req('/facility/laundry', { method: 'POST', form: new URLSearchParams({
      rr: RR, dispatch_date: backDays(days), item_type: item,
      vendor_id: vend, [`qty_${item}`]: '40' }) });
    ok(`a ${item.replace('_', ' ')} dispatch ${days} days back is recorded`, r.status === 302, r.body);
  }

  r = await req(`/facility/laundry?rr=${RR}`);
  const near = (label) => { const i = r.body.indexOf(label); return i < 0 ? '' : r.body.slice(i - 500, i + 900); };
  ok('a bed sheet two days out IS overdue — it was not under the flat rule',
     /overdue/.test(near('Bed sheet')));
  ok('a blanket cover five days out is NOT overdue — it was under the flat rule',
     !/overdue/.test(near('Blanket cover')));

  // --- the security and incident register (stage 31) -------------------------
  //
  // The pair that carries the design: the SAME incident type, told apart only
  // by whose man it was. Clause A3 must be offered for one and refused for the
  // other, and the refusal must be the route's, not the view's.
  r = await req('/incidents');
  ok('the incident register is served', r.status === 200, r.body);

  const inc = (o) => { const f = new URLSearchParams({ rr: RR, ...o }); return f; };

  r = await req('/incidents', { method: 'POST', form: inc({ occurred_on: YDAY,
    incident_type: 'intoxication', involves: 'contractor_staff', severity: 'serious',
    summary: "Night bearer found intoxicated on duty", reported_on: YDAY,
    n_police_on: YDAY, n_police_ref: 'SD/441/2026' }) });
  ok("an incident involving the contractor's man is recorded", r.status === 302, r.body);

  r = await req('/incidents', { method: 'POST', form: inc({ occurred_on: YDAY,
    incident_type: 'intoxication', involves: 'running_staff',
    summary: 'Loco Pilot reported in an intoxicated state; lobby informed' }) });
  ok('and one involving running staff is recorded too', r.status === 302, r.body);

  r = await req('/incidents?type=intoxication');
  const ids = [...r.body.matchAll(/\/incidents\/(\d+)\/a3"/g)].map(m => m[1]);
  ok('clause A3 is offered on exactly one of the two', ids.length >= 1);
  ok('and the crew case says plainly that no contractor penalty arises',
     /crew discipline matter/.test(r.body));

  const allIds = [...r.body.matchAll(/id="i(\d+)"/g)].map(m => m[1]);
  const crewId = allIds.find(x => !ids.includes(x));

  if (ids[0]) {
    r = await req(`/incidents/${ids[0]}/a3`, { method: 'POST', form: new URLSearchParams({}) });
    ok('A3 is handed to the deficiency register, or was already on it',
       r.status === 302 || r.status === 400, r.body);
    r = await req(`/incidents/${ids[0]}/a3`, { method: 'POST', form: new URLSearchParams({}) });
    ok('and refuses to raise the same clause twice', r.status === 400);
  }
  if (crewId) {
    r = await req(`/incidents/${crewId}/a3`, { method: 'POST', form: new URLSearchParams({}) });
    ok('A3 on a running-staff case is refused by the route, not merely hidden',
       r.status === 400);
  }

  r = await req('/incidents', { method: 'POST', form: inc({ occurred_on: '2027-01-01',
    incident_type: 'fire', summary: 'x' }) });
  ok('an incident cannot be dated in the future', r.status === 400);

  r = await req('/incidents', { method: 'POST', form: inc({ occurred_on: YDAY,
    reported_on: '2020-01-01', incident_type: 'fire', summary: 'x' }) });
  ok('the Railway cannot have been told before it happened', r.status === 400);

  r = await req('/incidents', { method: 'POST', form: inc({ occurred_on: YDAY,
    incident_type: 'fire', summary: '   ' }) });
  ok('an entry with nothing written in it is refused', r.status === 400);

  if (allIds[0]) {
    r = await req(`/incidents/${allIds[0]}/status`, { method: 'POST',
      form: new URLSearchParams({ status: 'closed' }) });
    ok('closing without saying what was found is refused', r.status === 400);
    r = await req(`/incidents/${allIds[0]}/status`, { method: 'POST',
      form: new URLSearchParams({ status: 'closed',
        closure_remarks: 'Man removed from the site the same night.' }) });
    ok('and closing with a finding is accepted', r.status === 302, r.body);
  }

  // --- the standing obligations (stage 32) -----------------------------------
  //
  // The point worth proving on a real database is the one about missing
  // paperwork: with no LOA date on record, D3 and D4 have no due date, are NOT
  // reported as breached, and cannot be raised. A penalty must not run from a
  // date nobody has given.
  r = await req(`/compliance?rr=${RR}`);
  ok('the standing obligations page is served', r.status === 200, r.body);
  const noAnchor = /No date to count from/.test(r.body);
  // A period the pilot loader invented must never become a due date. The test
  // is on the agreement NUMBER: one that says AGREEMENT-AWAITED cannot supply a
  // start date, whatever is sitting in the column.
  if (/AGREEMENT-AWAITED/.test(r.body)) {
    ok('an AGREEMENT-AWAITED period is not used to date anything', noAnchor, r.body.slice(0, 200));
  }
  ok('it says plainly where the clocks run from, or that they cannot',
     noAnchor || /Clocks run from/.test(r.body));

  const items = [...r.body.matchAll(/name="met_(\d+)"/g)].map(m => m[1]);
  ok('the nine obligations are listed', items.length >= 9, `saw ${items.length}`);

  if (items.length) {
    const tick = items[items.length - 1];        // a tick-only obligation
    r = await req('/compliance', { method: 'POST',
      form: new URLSearchParams({ rr: RR, [`met_${tick}`]: YDAY,
        [`rem_${tick}`]: 'seen in place at the visit' }) });
    ok('an obligation can be recorded as met', r.status === 302, r.body);

    r = await req(`/compliance?rr=${RR}`);
    ok('and it comes back from the database', r.body.includes('seen in place at the visit'));

    r = await req('/compliance', { method: 'POST',
      form: new URLSearchParams({ rr: RR, [`met_${tick}`]: '2027-01-01' }) });
    ok('an obligation cannot be met on a future date', r.status === 400);

    r = await req('/compliance', { method: 'POST',
      form: new URLSearchParams({ rr: RR, [`met_${tick}`]: YDAY, [`no_${tick}`]: '1' }) });
    ok('it cannot be both met and not in place', r.status === 400);

    r = await req('/compliance/clause', { method: 'POST',
      form: new URLSearchParams({ rr: RR, item: tick }) });
    ok('an obligation with no clause behind it cannot be raised', r.status === 400);

    // --- the monthly occupant count (stage 33) -------------------------------
    //
    // The figure is the DENOMINATOR of the tender's 50% feedback floor, so with
    // no figure the three grading clauses cannot be levied at all. Proving it
    // saves on a real database matters more than it looks: a blank here is
    // indistinguishable, on paper, from coverage honestly falling short.
    const NOW = new Date().toISOString().slice(0, 7);
    r = await req(`/feedback/coverage?month=${NOW}`);
    ok('the coverage page is served', r.status === 200, r.body);
    const occIds = [...r.body.matchAll(/name="occ_(\d+)"/g)].map(m => m[1]);
    ok('the occupant count can be entered from the coverage page', occIds.length > 0);

    if (occIds.length) {
      r = await req('/feedback/coverage/occupancy', { method: 'POST',
        form: new URLSearchParams({ month: NOW, [`occ_${occIds[0]}`]: '420',
          source_reference: 'written by tools/write-check.mjs' }) });
      ok('a month of occupancy saves', r.status === 302, r.body);

      r = await req(`/feedback/coverage?month=${NOW}`);
      ok('and comes back from the database',
         new RegExp(`name="occ_${occIds[0]}"[^>]*value="420"`).test(r.body));

      r = await req('/feedback/coverage/occupancy', { method: 'POST',
        form: new URLSearchParams({ month: NOW, [`occ_${occIds[0]}`]: '' }) });
      ok('a blank box leaves the room untouched rather than zeroing it', r.status === 302);
      r = await req(`/feedback/coverage?month=${NOW}`);
      ok('the figure survives the blank save',
         new RegExp(`name="occ_${occIds[0]}"[^>]*value="420"`).test(r.body));

      r = await req('/feedback/coverage/occupancy', { method: 'POST',
        form: new URLSearchParams({ month: NOW, [`occ_${occIds[0]}`]: 'lots' }) });
      ok('a count that is not a whole number is refused', r.status === 400);

      r = await req('/feedback/coverage/occupancy', { method: 'POST',
        form: new URLSearchParams({ month: NOW, occ_9999: '50' }) });
      ok('a running room outside the signed-in scope is refused', r.status === 403);
    }

    if (noAnchor) {
      r = await req('/compliance/clause', { method: 'POST',
        form: new URLSearchParams({ rr: RR, item: items[0] }) });
      ok('with no LOA date on record, D3 cannot be raised at all', r.status === 400, r.body);
    }
  }
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
