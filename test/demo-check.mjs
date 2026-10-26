/** Drives the demo server end to end in a real browser — login, scoping, every page. */
import { chromium } from 'playwright';
import { spawn } from 'child_process';

// A demo server left running from an aborted run would answer on this port with
// stale state, and every failure after that would be a lie. Check first.
import net from 'net';
const portBusy = await new Promise(res => {
  const probe = net.connect(3177, '127.0.0.1');
  probe.on('connect', () => { probe.destroy(); res(true); });
  probe.on('error', () => res(false));
});
if (portBusy) {
  console.error('\n  Port 3177 is already in use — an older demo server is still running.\n'
    + '  Stop it first:  pkill -f "demo/server.js"\n');
  process.exit(1);
}

const srv = spawn('node', ['demo/server.js'], { env: { ...process.env, PORT: '3177' }, stdio: 'pipe' });
await new Promise(r => setTimeout(r, 900));

// A fake camera, so the capture control can be driven end to end rather than
// merely rendered. These flags only affect getUserMedia.
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const errs = [];
let pass = 0, fail = 0;
const ok = (n, c, detail) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (detail ? '\n       saw: ' + String(detail).slice(0, 160) : '')); fail++; }
};

async function signIn(user) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3177/login');
  await p.fill('#username', user);
  await p.fill('#password', 'demo');
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  return { ctx, p };
}

console.log('\n  Demo server on :3177\n');

// wrong password
{
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto('http://localhost:3177/login');
  await p.fill('#username', 'sysadmin'); await p.fill('#password', 'wrong');
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  ok('wrong password is rejected', (await p.content()).includes('incorrect'));
  await ctx.close();
}

const { ctx: c1, p: admin } = await signIn('sysadmin');
ok('sysadmin lands on the dashboard', admin.url().endsWith('/'));
const dash = await admin.textContent('body');
ok('dashboard shows all 44 running rooms', /Running rooms[\s\S]{0,60}44/.test(dash));
ok('dashboard shows 2,675 beds', dash.includes('2,675'));
ok('dashboard shows 3,521 crews/day', dash.includes('3,521'));
ok('dashboard states the RRMS boundary', dash.includes('RRMS'));

await admin.goto('http://localhost:3177/running-rooms');
const list = await admin.textContent('body');
ok('running rooms list shows 44', list.includes('44 running rooms'));
ok('CSMT present', list.includes('CSMT'));

// CSMT has no meal facility -> no kitchen crew
const csmtHref = await admin.getAttribute('a:text-is("CSMT")', 'href');
await admin.goto('http://localhost:3177' + csmtHref);
const csmt = await admin.textContent('body');
ok('CSMT shows meals not provided', csmt.includes('Not provided'));
ok('CSMT has no Head Cook row', !csmt.includes('Head Cook'));
ok('CSMT has no bearers', !csmt.includes('Table Boy'));
ok('CSMT carries no kitchen deficiency', !/\bB7\b|\bB10\b|grocery|apron/.test(csmt));

// Kurduvadi is scaled but keeps round-the-clock posts at 3
await admin.goto('http://localhost:3177/running-rooms?q=KWV');
const kwvHref = await admin.getAttribute('table a', 'href');
await admin.goto('http://localhost:3177' + kwvHref);
const kwv = await admin.textContent('body');
ok('Kurduvadi flagged as scaled', kwv.includes('scaled to 15 beds'));
ok('Kurduvadi explains the scaling rule', kwv.includes('round-the-clock'));

// occupancy write
await admin.fill('#ot', '4500');
await Promise.all([admin.waitForNavigation(), admin.click('button:has-text("Save figure")')]);
ok('occupancy figure saved and shown', (await admin.textContent('body')).includes('4,500'));

for (const [name, path] of [['masters','/masters'],['designations','/masters/designations'],
    ['manpower norms','/masters/manpower-norms'],['deficiency schedule','/masters/deficiency-clauses'],
    ['contractors','/contractors']]) {
  const r = await admin.goto('http://localhost:3177' + path);
  ok(`${name} page loads`, r.status() === 200);
}
const cl = await admin.textContent('body');
await admin.goto('http://localhost:3177/masters/deficiency-clauses');
ok('schedule says rates are never applied', (await admin.textContent('body')).includes('never applied'));
// ---- stage 2: contract staff ----
await admin.goto('http://localhost:3177/staff');
const staffList = await admin.textContent('body');
ok('staff register loads', staffList.includes('Staff on roll'));
ok('screening counts shown', /Screened (&|&amp;) approved/.test(staffList));

await admin.goto('http://localhost:3177/staff?flag=no_qual');
ok('qualification-missing filter works', (await admin.textContent('body')).includes('shown'));

await admin.goto('http://localhost:3177/staff?flag=uniform_due');
ok('uniform-overdue filter works', (await admin.textContent('body')).includes('shown'));

// sysadmin may view but must NOT be able to screen — that is a Railway officer's call
await admin.goto('http://localhost:3177/staff?flag=unscreened');
const anyStaff = await admin.getAttribute('table tbody a', 'href');
await admin.goto('http://localhost:3177' + anyStaff);
const asAdmin = await admin.textContent('body');
ok('staff detail shows the deployment checklist', asAdmin.includes('Deployment readiness'));
ok('unapproved staff marked not cleared', asAdmin.includes('Not cleared for deployment'));
ok('sysadmin is not offered the screening decision', !(await admin.$('button[value="approve"]')));
ok('sysadmin is not offered the document form', !(await admin.$('select[name="doc_type"]')));

// identity card, in the tender's proforma
const idHref = await admin.getAttribute('a:has-text("Identity card")', 'href');
const idResp = await admin.goto('http://localhost:3177' + idHref);
const card = await admin.textContent('body');
ok('identity card renders in the tender proforma',
   idResp.status() === 200 && card.includes('IDENTITY CARD') && card.includes('Sign of Rly. Representative'));
await c1.close();

// the contractor supervisor supplies documents and issues kit
const { ctx: cs, p: sup } = await signIn('contractor_sup');
await sup.goto('http://localhost:3177/staff?flag=unscreened');
const supStaff = await sup.getAttribute('table tbody a', 'href');
await sup.goto('http://localhost:3177' + supStaff);
ok('contractor supervisor gets the document form', !!(await sup.$('select[name="doc_type"]')));
ok('contractor supervisor is NOT offered screening', !(await sup.$('button[value="approve"]')));

await sup.selectOption('select[name="doc_type"]', 'police_verification');
await sup.fill('input[name="reference_no"]', 'PV-99001');
await Promise.all([sup.waitForNavigation(), sup.click('#docform button[type=submit]')]);
ok('document added and listed', (await sup.textContent('body')).includes('PV-99001'));

await Promise.all([sup.waitForNavigation(), sup.click('button:has-text("Record issue")')]);
const afterIssue = await sup.textContent('body');
ok('uniform issue recorded with a computed next-due date', /uniform/i.test(afterIssue));
await cs.close();

// the divisional officer screens
const { ctx: cd, p: dee0 } = await signIn('div_officer');
await dee0.goto('http://localhost:3177/staff?flag=unscreened');
const deeStaff = await dee0.getAttribute('table tbody a', 'href');
await dee0.goto('http://localhost:3177' + deeStaff);
ok('divisional officer is offered the screening decision', !!(await dee0.$('button[value="approve"]')));

await dee0.click('button[value="reject"]');
await dee0.waitForTimeout(300);
ok('rejecting without a reason is refused', (await dee0.textContent('body')).includes('reason is required'));

await dee0.goto('http://localhost:3177' + deeStaff);
await Promise.all([dee0.waitForNavigation(), dee0.click('button[value="approve"]')]);
const approved = await dee0.textContent('body');
ok('approval recorded and readiness re-evaluated', approved.includes('approved'));
await cd.close();

// ---- stage 3: service records ----
// Marking the muster is the contractor's job; counter-signing is the Railway's.
const { ctx: m1, p: sup2 } = await signIn('contractor_sup');
const MUSTER_RR = 10;   // Kalyan — held by the demo contractor and run by the demo RR in-charge
await sup2.goto(`http://localhost:3177/records/muster?rr=${MUSTER_RR}`);
const musterPage = await sup2.textContent('body');
ok('muster page loads for the contractor supervisor', musterPage.includes('Sanctioned strength'));
// The rule, stated as an invariant rather than as a fact about one running
// room: a row is markable exactly when that staff member is screened.
const rowState = await sup2.$$eval('tr', els => els
  .filter(e => e.querySelector('[name^="s_"]'))
  .map(e => ({ blocked: !!e.querySelector('input[type=hidden][name^="s_"]'),
               notApproved: !/\bapproved\b/.test(e.textContent) })));
ok('every staff member not yet screened is blocked from being marked present',
   rowState.length > 0 && rowState.every(r => r.blocked === r.notApproved));
ok('contractor supervisor gets the save button', !!(await sup2.$('button:has-text("Save muster")')));
ok('contractor supervisor cannot counter-sign', !(await sup2.$('button:has-text("Counter-sign")')));

// mark everyone present, then confirm the shortfall arithmetic responds.
// Attendance is now tap buttons rather than a dropdown per person -- one
// click sets the roster, which is the whole point of the change.
await sup2.click('#allpresent');
const markedCount = await sup2.$$eval('#mustertable input[type=radio][value=present]:checked',
  els => els.length);
ok('the screened staff can be marked', markedCount > 0);
await Promise.all([sup2.waitForNavigation(), sup2.click('button:has-text("Save muster")')]);
const afterMark = await sup2.textContent('body');
ok('muster saved and present count updated', /Marked present/.test(afterMark));
ok('deployment table reflects the marks', afterMark.includes('Full') || afterMark.includes('Short by'));
await m1.close();

const { ctx: m2, p: cli2 } = await signIn('rr_incharge');
await cli2.goto(`http://localhost:3177/records/muster?rr=${MUSTER_RR}`);
ok('RR in-charge is offered the counter-signature', !!(await cli2.$('button:has-text("Counter-sign")')));
ok('RR in-charge is not offered the save button', !(await cli2.$('button:has-text("Save muster")')));
await Promise.all([cli2.waitForNavigation(), cli2.click('button:has-text("Counter-sign")')]);
const signed = await cli2.textContent('body');
ok('muster counter-signed', signed.includes('Counter-signed'));
ok('counter-signed muster can no longer be edited', signed.includes('can no longer be edited'));

// The call book is a SHEET, on the model of the control office's LPC daily
// sheet: the room's own list of trains, filtered to the ones that run today,
// ordered by sign-on time, with the crew keyed into the row. A crew is relieved
// off a DOWN train, sleeps, and is called for an UP train back — so a boundary
// room's sheet is the UP workings.
await cli2.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}`);
ok('the call sheet loads with monthly totals', (await cli2.textContent('body')).includes('Calls this month'));

// Each row owns a form declared outside the table — a <form> inside a <tr> is
// hoisted out by the browser and the row silently stops submitting.
const rowForms = await cli2.$$eval('form[id^="rt"]', fs => fs.map(f => ({
  id: f.id, called: !!f.querySelector('input[name=call_id]') })));
ok('the sheet is pre-filled from the room\'s train list', rowForms.length >= 3);
ok('and every row carries its own form', rowForms.every(f => /^rt\d+$/.test(f.id)));
ok('the rows are the UP workings the crew is called for',
   (await cli2.textContent('#callsheet')).includes('UP'));

// Keyed on TOMORROW, where nothing has been called yet. A row the seed has
// already served must not be re-keyed — the route refuses to replace a man who
// has acknowledged, and that is the rule, not a fault — so picking a row on a
// busy day makes this check pass or fail by luck.
const CBDAY = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
await cli2.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&date=${CBDAY}`);
const openRows = await cli2.$$eval('form[id^="rt"]', fs => fs
  .filter(f => !f.querySelector('input[name=call_id]')).map(f => f.id));
ok('a day with nothing called still shows the whole sheet', openRows.length >= 3);
const freeRow = { id: openRows[0] };
await cli2.fill(`input[form="${freeRow.id}"][name="n_LP"]`, 'Test Crew Member');
await cli2.fill(`input[form="${freeRow.id}"][name="n_ALP"]`, 'Test Second Man');
await cli2.fill(`input[form="${freeRow.id}"][name="received"]`, '02:00');
await Promise.all([cli2.waitForNavigation(),
  cli2.click(`button[form="${freeRow.id}"] >> nth=0`)]);
// A man who has not acknowledged is still an editable box, so his name is an
// input VALUE — textContent would not see it, which is how the first version of
// this check failed against a screen that was working perfectly.
ok('a row saves the men keyed into it',
   (await cli2.inputValue(`input[form="${freeRow.id}"][name="n_LP"]`)) === 'Test Crew Member'
   && (await cli2.inputValue(`input[form="${freeRow.id}"][name="n_ALP"]`)) === 'Test Second Man');

// Saving the same row again is an upsert on (room, date, sheet row) — the same
// natural key the loco link log uses, and the reason a row can be corrected all
// day without ever doubling.
await cli2.fill(`input[form="${freeRow.id}"][name="received"]`, '02:14');
await Promise.all([cli2.waitForNavigation(),
  cli2.click(`button[form="${freeRow.id}"] >> nth=0`)]);
ok('saving it again corrects the row instead of adding one',
   (await cli2.$$eval('#callsheet input[name="n_LP"]',
      is => is.filter(i => i.value === 'Test Crew Member').length)) === 1);
ok('and the corrected time is kept',
   (await cli2.inputValue(`input[form="${freeRow.id}"][name="received"]`)) === '02:14');

// A train on no list at all — a goods working, a special, one running a day
// late from yesterday — is added on the last row and carries no scheduled entry.
await cli2.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&date=${CBDAY}`);
await cli2.fill('input[form="radd"][name="train_no"]', 'GDS-TEST');
await cli2.fill('input[form="radd"][name="n_LP"]', 'Goods Test Pilot');
await cli2.fill('input[form="radd"][name="sign_on"]', '23:30');
await Promise.all([cli2.waitForNavigation(), cli2.click('button[form="radd"]')]);
// The add button is "Save & serve" — it lands on the bed screen, which is what
// the bearer wants. Come back to the sheet to see the row.
ok('adding a train off the list opens the serving screen',
   cli2.url().includes('/records/call-book/'));
await cli2.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&date=${CBDAY}`);
const adhoc = await cli2.textContent('#callsheet');
ok('a train not on the list can still be called',
   (await cli2.$$eval('#callsheet input[name="n_LP"]',
      is => is.some(i => i.value === 'Goods Test Pilot'))));
ok('and it is marked as added by hand', adhoc.includes('added by hand'));

// The crew register builds itself from use: a name typed once is offered back
// the next time, which is what keeps one man under one name.
await cli2.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}`);
ok('crew typed once is offered back on the next call',
   (await cli2.$$eval('#crewlist option', os => os.map(o => o.value)))
     .some(v => v.startsWith('Test Crew Member')));

// The division staff master. On a real installation this is CRTMS's own
// bbtro.div_staff_master, read through two narrow views; the demo answers the
// same queries from invented people.
ok('the crew boxes are wired to the division staff list',
   !!(await cli2.getAttribute('#crewlines', 'data-search')));
ok('the form says plainly that a train manager will not be on that list',
   (await cli2.textContent('#crewlines')).includes('train manager'));

const ask = q => cli2.evaluate(async term => {
  const w = document.getElementById('crewlines');
  const r = await fetch(w.dataset.search + '?rr=' + w.dataset.rr + '&q='
    + encodeURIComponent(term), { credentials: 'same-origin' });
  return r.ok ? r.json() : null;
}, q);

// A name known to be on the demo's staff master, so an empty answer cannot
// pass this check by accident — which is exactly how the first version of it
// went green while the lookup returned nothing.
const hits = await ask('ram');
ok('the lookup finds people on the division staff list',
   Array.isArray(hits) && hits.length > 0);
ok('and each carries a name, a number and a designation',
   hits.every(m => m.full_name && m.cms_id && m.designation));
ok('and no identity number, caste or date of birth comes back with them',
   hits.every(m => !('aadhaar' in m) && !('pan' in m) && !('caste' in m)
                && !('date_of_birth' in m) && !('address' in m)));
ok('two letters are refused — the box is a lookup, not a staff directory',
   (await ask('ab')).length === 0);
// The Railway's own officer may ring a man who has not turned up.
ok('the RR in-charge is given the crew telephone number',
   hits.some(m => m.contact));

// The contractor's supervisor is not. Same query, same screen, number absent —
// he records the call; he is not handed a directory of the division's running
// staff. This is the check that matters, so it is made against his own session.
const { ctx: supCtx, p: supCB } = await signIn('contractor_sup');
await supCB.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}`);
const supHits = await supCB.evaluate(async () => {
  const w = document.getElementById('crewlines');
  if (!w || !w.dataset.search) return null;
  const r = await fetch(w.dataset.search + '?rr=' + w.dataset.rr + '&q=ram',
    { credentials: 'same-origin' });
  return r.ok ? r.json() : null;
});
ok('the contractor supervisor gets the same names', Array.isArray(supHits) && supHits.length > 0);
ok('but is given no crew telephone numbers at all',
   supHits.every(m => m.contact === null));
ok('and he cannot keep the room\'s list of trains',
   (await supCB.goto(`http://localhost:3177/records/call-sheet-trains?rr=${MUSTER_RR}`)).status() === 403);
await supCtx.close();

// linen. The demo already carries a figure for every one of the last fourteen
// days, so the next day to be recorded is today -- which is exactly the case
// the prefill exists for: an empty day with yesterday's shelf behind it.
//
// The register is item-wise from stage 24 (migration 032). What is being
// checked here is that the four facts stay where they belong: issues and stock
// per item on this page, the wash cycle read from the laundry record and not
// typed here, and the tender's minimum-stock condition shown with its
// arithmetic rather than as a bare flag.
const TODAY = new Date().toISOString().slice(0, 10);
await cli2.goto(`http://localhost:3177/records/linen?rr=${MUSTER_RR}&date=${TODAY}`);
const linenForm = await cli2.textContent('#linenform');
ok('every linen item has its own row', linenForm.includes('Bedsheets')
   && linenForm.includes('Pillow covers') && linenForm.includes('Curtains'));
ok('the stock in hand is carried forward per item, from the last recorded day',
   linenForm.includes('carried from')
   && (await cli2.getAttribute('input[name="hand_bedsheet"]', 'data-carried')) !== '');
ok('the day\'s issues are not filled in on the supervisor\'s behalf',
   (await cli2.getAttribute('input[name="issued_bedsheet"]', 'value')) === '');
ok('the wash cycle cannot be typed on the daily register',
   (await cli2.$('input[name="fresh_received"]')) === null
   && (await cli2.$('input[name="soiled_sent_to_wash"]')) === null);
ok('the minimum-stock condition shows the arithmetic behind it',
   /two sets of bedsheets and pillow covers/i.test(linenForm)
   && /\d+ × \d+ beds = \d+/.test(linenForm));
await cli2.fill('input[name="issued_bedsheet"]', '40');
await cli2.fill('input[name="hand_bedsheet"]', '12');
ok('the shelf arithmetic is checked per item as the figures are typed',
   /Bedsheets: .*expected/.test(await cli2.textContent('#linencheck')));
await Promise.all([cli2.waitForNavigation(), cli2.click('button:has-text("Save the day")')]);
const ln = await cli2.textContent('body');
ok('linen day saved', ln.includes('The linen register has been saved'));
ok('the item figures come back item-wise',
   (await cli2.getAttribute('input[name="issued_bedsheet"]', 'value')) === '40'
   && (await cli2.getAttribute('input[name="hand_bedsheet"]', 'value')) === '12');
ok('twelve bedsheets against the minimum is flagged, and says by how much',
   ln.includes('Below the minimum washed stock') && /short by \d+/.test(ln));

// the wash cycle, on the same page but saving to the record that owns it
const outBefore = (await cli2.textContent('body')).match(/(\d+) consignments? not fully back/);
ok('each item carries its own colour, in every table on the page',
   (await cli2.getAttribute('tr[data-item="bedsheet"]', 'class')).includes('li-bedsheet')
   && (await cli2.$$('tr.li-pillow_cover')).length >= 2);
ok('the columns nobody types into are marked as such',
   (await cli2.$$('td.ro')).length > 0 && (await cli2.$$('th.ro')).length > 0
   && (await cli2.$('td.ro input')) === null);
ok('linen out at the wash beyond 48 hours is named as clause C6',
   /clause <b>C6<\/b>|clause C6/.test(await cli2.content()));
ok('the bundle going to the wash is a grid, not an item picked from a list',
   (await cli2.$('#sendform select[name="item_type"]')) === null
   && (await cli2.$('#sendform input[name="qty_bedsheet"]')) !== null
   && (await cli2.$('#sendform input[name="qty_pillow_cover"]')) !== null);
ok('what goes to the wash is measured against the soiled pile, not the fresh shelf',
   /Soiled, not yet sent/.test(await cli2.textContent('#sendform'))
   && /not the fresh stock on the shelf/.test(await cli2.textContent('body')));
ok('a dispatch cannot be dated in the future',
   (await cli2.getAttribute('#sendform input[name="dispatch_date"]', 'max'))
     === new Date().toISOString().slice(0, 10));
await cli2.fill('#sendform input[name="qty_pillow_cover"]', '30');
await cli2.fill('#sendform input[name="qty_bedsheet"]', '99999');
ok('sending more than the Railway ever gave the room is questioned as it is typed',
   /More is going than the room was ever given/.test(await cli2.textContent('#sendcheck')));
await cli2.fill('#sendform input[name="qty_bedsheet"]', '5');
ok('and the question goes away when the count is corrected',
   (await cli2.textContent('#sendcheck')).trim() === '');
await cli2.fill('#sendform input[name="invoice_no"]', 'INV/TEST/01');
await Promise.all([cli2.waitForNavigation(), cli2.click('button:has-text("Record what is going")')]);
const afterSend = await cli2.textContent('body');
ok('a dispatch entered on the linen page comes back to the linen page',
   cli2.url().includes('/records/linen'));
ok('the whole bundle goes on one press, and is kept item by item',
   /2 items recorded on one challan/.test(afterSend));
ok('and each count lands against the item it belongs to',
   /\b30\b/.test(await cli2.textContent('tr[data-item="pillow_cover"]'))
   && !/\b30\b/.test(await cli2.textContent('tr[data-item="mosquito_net"]')));
ok('the consignment is now out at the wash',
   !outBefore || +afterSend.match(/(\d+) consignments? not fully back/)[1] > +outBefore[1] + 1);

// complaints
await cli2.goto(`http://localhost:3177/records/complaints?rr=${MUSTER_RR}`);
await cli2.fill('input[name="raised_by_name"]', 'Loco Pilot Test');
await cli2.fill('textarea[name="description"]', 'Geyser not working in bathroom 2');
await cli2.selectOption('select[name="severity"]', 'major');

// The category is a list, not a typed word. A category nobody can count is
// decoration -- "food", "Food quality" and "meal" are three headings for one
// thing, and then no quarter's figure means anything.
ok('what a complaint is about is chosen from a list',
   !!(await cli2.$('select[name="category"]')));
const catNames = await cli2.$$eval('select[name="category"] option', os => os.map(o => o.value));
ok('the list is the deficiency schedule\'s own groups, so a complaint can escalate without reclassifying',
   ['housekeeping', 'meals', 'linen', 'consumables'].every(c => catNames.includes(c)));

// A geyser is the Railway's to mend. It must not be counted against the
// contractor, or his grading carries the Railway's own arrears.
await cli2.selectOption('select[name="category"]', 'maintenance');
ok('choosing a Railway maintenance item says so before it is recorded',
   (await cli2.textContent('#compcathint')).includes('not against the contractor'));
await Promise.all([cli2.waitForNavigation(), cli2.click('button:has-text("Record")')]);
const cmp = await cli2.textContent('body');
ok('complaint recorded', cmp.includes('Geyser not working'));
ok('and it is shown as the Railway\'s own, not the contractor\'s',
   cmp.includes("Railway's own — not against the contractor"));

const closeBtn = await cli2.$('form[action$="/close"] button');
ok('RR in-charge may close a complaint', !!closeBtn);
await cli2.fill('form[action$="/close"] input[name="closure_remarks"]', 'Geyser replaced same day');
await Promise.all([cli2.waitForNavigation(), cli2.click('form[action$="/close"] button')]);
ok('complaint closed with remarks recorded',
   (await cli2.textContent('body')).includes('Geyser replaced same day'));
await m2.close();

// ---- stage 4: crew feedback ----
// The form is public by design: a crew member off a night run will not log in.
const anon = await b.newContext({ viewport: { width: 420, height: 900 } });
const pub = await anon.newPage();
pub.on('pageerror', e => errs.push(e.message));

const noMeal = await pub.goto('http://localhost:3177/f/RR001');   // CSMT — no meal facility
ok('feedback form opens with no login at all', noMeal.status() === 200);
const csmtForm = await pub.textContent('body');
ok('form names the running room', csmtForm.includes('CSMT'));
ok('no-meal site does not ask about food', !csmtForm.includes('Food quality'));
ok('form asks the three other heads',
   csmtForm.includes('Cleanliness') && csmtForm.includes('Bed linen') && csmtForm.includes('Staff behaviour'));

await pub.goto('http://localhost:3177/f/RR020');                  // IGP — serves meals
ok('meal-serving site does ask about food', (await pub.textContent('body')).includes('Food quality'));

// submitting nothing at all must be refused
await pub.click('button[type=submit]');
await pub.waitForTimeout(300);
ok('a submission with no rating is refused', (await pub.textContent('body')).includes('at least one rating'));

// a poor rating should reach an officer rather than vanish into an average
await pub.goto('http://localhost:3177/f/RR020');
for (const h of ['cleanliness','food','linen','behaviour']) await pub.click(`label[for="${h}_1"]`);
await pub.fill('textarea[name="comments"]', 'AUTOMATED TEST — bathroom filthy and dinner cold');
await pub.fill('input[name="crew_name"]', 'Test Loco Pilot');
await Promise.all([pub.waitForNavigation(), pub.click('button[type=submit]')]);
const thanks = await pub.textContent('body');
ok('submission lands on the thank-you page', thanks.includes('Thank you'));
ok('thank-you names the running room', thanks.includes('IGP'));
await anon.close();

const { ctx: f1, p: off } = await signIn('sysadmin');
await off.goto('http://localhost:3177/feedback');
ok('sysadmin can read feedback', off.url().includes('/feedback'));
ok('sysadmin still cannot close feedback', !(await off.$('button:has-text("Close")')));
const inbox = await off.textContent('body');
ok('the submission appears in the inbox', inbox.includes('AUTOMATED TEST'));
ok('a 1-star submission is graded critical', /Critical/.test(inbox));

await off.goto('http://localhost:3177/feedback?severity=critical');
ok('severity filter works', (await off.textContent('body')).includes('AUTOMATED TEST'));

// A fresh submission must be findable. Sorting open-first buries a good rating,
// so "newest first" and a today marker exist for exactly this.
await off.goto('http://localhost:3177/feedback?sort=new');
const firstRows = await off.$$eval('table.tbl tbody tr',
  trs => trs.slice(0, 3).map(tr => tr.textContent));
ok('newest-first sort puts the fresh submission in the top rows',
   firstRows.some(t => t.includes('AUTOMATED TEST')));
const newest = await off.textContent('body');
ok('items received today are marked', newest.includes('TODAY'));
ok('a count of today\'s feedback is shown', /received today/.test(newest));

// filtering by running room also finds it
const rrId = 20;
await off.goto(`http://localhost:3177/feedback?rr=${rrId}&sort=new`);
ok('filtering by running room finds the submission',
   (await off.textContent('body')).includes('AUTOMATED TEST'));

await off.goto('http://localhost:3177/feedback/coverage');
const cov = await off.textContent('body');
ok('coverage page explains the 50% floor', cov.includes('at least 50% of the occupants'));
ok('coverage page states the penalty is not leviable below it', cov.includes('not leviable'));

await off.goto('http://localhost:3177/feedback/grading');
const grad = await off.textContent('body');
ok('grading page shows R values', /R = [0-5]/.test(grad));
ok('grading page states no amount is computed', grad.includes('No amount is computed here'));
ok('grading omits food where there is no meal facility', grad.includes('no meals'));

await off.goto('http://localhost:3177/feedback/qr');
ok('QR posters render as inline SVG', (await off.$$('.poster svg')).length > 0);
ok('QR page warns about the printed address', (await off.textContent('body')).includes('PUBLIC_BASE_URL'));
await f1.close();

// a view-only role cannot close feedback
const { ctx: f2, p: hq2 } = await signIn('hq');
await hq2.goto('http://localhost:3177/feedback');
ok('HQ can read feedback but not close it', !(await hq2.$('button:has-text("Close")')));
await f2.close();

// a refusal must say what is needed and who has it, not print a permission code
const { ctx: f3, p: sup3 } = await signIn('contractor_sup');
const refused = await sup3.goto('http://localhost:3177/feedback');
const body403 = await sup3.textContent('body');
ok('refusal returns 403', refused.status() === 403);
ok('refusal is written in plain language', body403.includes('Your role does not have access'));
ok('refusal names the roles that do have access', body403.includes('Who can open this page'));
ok('refusal shows no permission code or stack trace',
   !body403.includes('feedback.view') && !body403.includes('at /'));
await f3.close();

// a view-only role must not be able to write anything here
const { ctx: m3, p: hq } = await signIn('hq');
await hq.goto('http://localhost:3177/records/call-book');
ok('HQ sees the call sheet but cannot key a row', !(await hq.$('button[form^="rt"]')));
await hq.goto('http://localhost:3177/records/complaints');
ok('HQ cannot record a complaint', !(await hq.$('button:has-text("Record")')));
await m3.close();



// scoping — divisional officer
const { ctx: c2, p: dee } = await signIn('div_officer');
await dee.goto('http://localhost:3177/running-rooms');
const deeList = await dee.textContent('body');
ok('divisional officer sees only 5 running rooms', deeList.includes('5 running rooms'));
ok('divisional officer does not see CSMT', !deeList.includes('CSMT'));
const r403 = await dee.goto('http://localhost:3177/running-rooms/1');
ok('divisional officer refused a running room outside the division', r403.status() === 403);
await c2.close();

// scoping — RR in-charge
const { ctx: c3, p: cli } = await signIn('rr_incharge');
await cli.goto('http://localhost:3177/running-rooms');
ok('RR in-charge sees exactly one running room', (await cli.textContent('body')).includes('1 running rooms'));
const rc = await cli.goto('http://localhost:3177/contractors');
ok('RR in-charge refused the contractors page', rc.status() === 403);
await cli.goto('http://localhost:3177/staff');
const cliStaff = await cli.textContent('body');
ok('RR in-charge sees only their own running room\'s staff', !cliStaff.includes('CSMT'));
const cliScreen = await cli.goto('http://localhost:3177/staff/1');
ok('RR in-charge cannot open staff outside their running room', cliScreen.status() === 403);
await c3.close();

// ---- stage 5: inspections, checklist and the deficiency register ----
const { ctx: i1, p: insp } = await signIn('div_officer');

await insp.goto('http://localhost:3177/inspections');
ok('inspection log loads', (await insp.textContent('body')).includes('Inspections filed'));

// WD (rr=40) is in Solapur, which is the divisional officer's scope, and serves meals.
const MEAL_RR = 40;
await insp.goto(`http://localhost:3177/inspections/new?rr=${MEAL_RR}`);
const withMeals = await insp.textContent('body');
ok('meal-serving site shows the kitchen clauses', /Meals & Kitchen|Meals &amp; Kitchen/.test(withMeals));
ok('a running room outside the division is refused',
   (await insp.goto('http://localhost:3177/inspections/new?rr=1')).status() === 403);
await insp.goto(`http://localhost:3177/inspections/new?rr=${MEAL_RR}`);

// a joint report needs the contractor's representative named
await insp.click('button:has-text("Submit joint report")');
await insp.waitForTimeout(400);
const noRep = await insp.textContent('body');
ok('a joint report without the contractor representative is refused',
   noRep.includes('must be named') || noRep.includes('required'));

// file a real report: one clause not complied, with a photo
await insp.goto(`http://localhost:3177/inspections/new?rr=${MEAL_RR}`);
await insp.fill('input[name="contractor_rep_name"]', 'Test Supervisor');
const firstSelect = await insp.$('select[name^="c_"]');
const clauseField = await firstSelect.getAttribute('name');
const clauseId = clauseField.slice(2);
await firstSelect.selectOption('not_complied');
await insp.fill(`input[name="q_${clauseId}"]`, '2');
await insp.fill(`input[name="o_${clauseId}"]`, 'AUTOMATED TEST — observed during joint inspection');
await insp.setInputFiles(`input[name="p_${clauseId}"]`, 'test/fixture.jpg');
await Promise.all([insp.waitForNavigation(), insp.click('button:has-text("Submit joint report")')]);

const report = await insp.textContent('body');
ok('report is created and opens', report.includes('Joint inspection report') || report.includes('report —'));
ok('the deficiency is listed on the report', report.includes('AUTOMATED TEST'));
ok('the report records the contractor representative', report.includes('Test Supervisor'));
const reportUrl = insp.url();

// the photo must actually be served back
const img = await insp.$('img[alt="evidence"]');
ok('evidence photo is attached to the deficiency', !!img);
if (img) {
  const src = await img.getAttribute('src');
  const r = await insp.request.get('http://localhost:3177' + src);
  ok('evidence photo is served back', r.status() === 200 && (r.headers()['content-type'] || '').startsWith('image/'));
}

// signing
ok('an unsigned report offers the signature', !!(await insp.$('button:has-text("Sign as Railway")')));
await Promise.all([insp.waitForNavigation(), insp.click('button:has-text("Sign as Railway")')]);
ok('report is signed', (await insp.textContent('body')).includes('Signed'));

// the deficiency reaches the register
await insp.goto('http://localhost:3177/deficiencies');
const reg = await insp.textContent('body');
ok('deficiency register shows the new item', reg.includes('AUTOMATED TEST'));
ok('register states that no amount is computed', reg.includes('No amount is computed anywhere'));

// closing needs remarks
const closeForm = await insp.$('form[action$="/close"]');
ok('an open deficiency can be closed by the divisional officer', !!closeForm);
await insp.fill('form[action$="/close"] input[name="closure_remarks"]', 'Rectified and verified');
await Promise.all([insp.waitForNavigation(), insp.click('form[action$="/close"] button')]);
ok('deficiency closed with remarks', (await insp.textContent('body')).includes('Rectified and verified'));
await i1.close();

// Kalyan has no meal facility, so the kitchen clauses must not appear at all.
const { ctx: i3, p: cli3 } = await signIn('rr_incharge');
await cli3.goto('http://localhost:3177/inspections/new?rr=10');
const noKitchen = await cli3.textContent('body');
ok('no-meal site hides the kitchen clauses', !/Meals & Kitchen|Meals &amp; Kitchen/.test(noKitchen));
ok('no-meal site says why', noKitchen.includes('has no meal facility'));
await i3.close();

// the contractor cannot inspect itself
const { ctx: i2, p: sup4 } = await signIn('contractor_sup');
const denied = await sup4.goto('http://localhost:3177/inspections/new');
ok('contractor supervisor cannot file an inspection', denied.status() === 403);
await sup4.goto('http://localhost:3177/deficiencies');
ok('contractor supervisor can see deficiencies but not close them',
   !(await sup4.$('form[action$="/close"] button')));
await i2.close();

// The sidebar must not offer a page the role would be refused.
const { ctx: n1, p: nav1 } = await signIn('sysadmin');
await nav1.goto('http://localhost:3177/');
const adminNav = await nav1.$$eval('.navitem span', els => els.map(e => e.textContent));
ok('sysadmin sees Inspections and Deficiencies in the sidebar',
   adminNav.includes('Inspections') && adminNav.includes('Deficiencies'));
ok('sysadmin sees the full sidebar', adminNav.length >= 9);
await n1.close();

const { ctx: n2, p: nav2 } = await signIn('contractor_sup');
await nav2.goto('http://localhost:3177/');
const supNav = await nav2.$$eval('.navitem span', els => els.map(e => e.textContent));
ok('contractor supervisor is not offered Crew Feedback', !supNav.includes('Crew Feedback'));
ok('contractor supervisor is not offered Contractors', !supNav.includes('Contractors'));
ok('contractor supervisor still gets their own pages',
   supNav.includes('Daily Records') && supNav.includes('Contract Staff'));
await n2.close();

const { ctx: n3, p: nav3 } = await signIn('rr_incharge');
await nav3.goto('http://localhost:3177/');
const cliNav = await nav3.$$eval('.navitem span', els => els.map(e => e.textContent));
ok('RR in-charge is not offered Contractors', !cliNav.includes('Contractors'));
await n3.close();

// ---------- stage 6: facility and material ----------
const { ctx: fx1, p: fac } = await signIn('rr_incharge');   // Kalyan, holds stay.manage
await fac.goto('http://localhost:3177/facility/laundry');
const laun = await fac.textContent('body');
ok('laundry register renders', laun.includes('Laundry dispatch register'));
ok('laundry page names the approved washing centre or warns there is none',
   /Approved washing centre|No approved laundry is on record/.test(laun));
await fac.fill('input[name="quantity_sent"]', '25');
await fac.fill('input[name="quantity_returned"]', '25');
await fac.fill('input[name="invoice_no"]', 'INV/TEST/9001');
await Promise.all([fac.waitForNavigation(), fac.click('button:has-text("Save dispatch")')]);
ok('a laundry dispatch can be recorded', (await fac.textContent('body')).includes('INV/TEST/9001'));

await fac.goto('http://localhost:3177/facility/consumables');
const cons = await fac.textContent('body');
ok('consumables register renders', cons.includes('Supply register'));
ok('approved brand list is shown', cons.includes('Approved brands'));
await fac.fill('input[name="quantity_due"]', '12');
await fac.fill('input[name="quantity_supplied"]', '9');
await fac.fill('input[name="brand_supplied"]', 'Test Brand 9001');
await Promise.all([fac.waitForNavigation(), fac.click('button:has-text("Save entry")')]);
const cons2 = await fac.textContent('body');
ok('a short supply is recorded and shown as short', cons2.includes('Test Brand 9001') && cons2.includes('Short by 3'));
ok('no rupee figure is computed for the shortfall', !/₹/.test(cons2));

await fac.goto('http://localhost:3177/facility/assets');
const ass = await fac.textContent('body');
ok('asset register renders', ass.includes('Asset register'));
ok('assets page shows the 24-hour clock', ass.includes('24-hour clock'));
await fac.fill('input[name="description"]', 'Test defect 9001');
await Promise.all([fac.waitForNavigation(), fac.click('button:has-text("Report")')]);
const ass2 = await fac.textContent('body');
ok('a defect can be reported and shows as open', ass2.includes('Test defect 9001') && ass2.includes('open'));
await fac.fill('form[action$="/rectify"] input[name="remarks"]', 'Set right on the spot');
await Promise.all([fac.waitForNavigation(), fac.click('form[action$="/rectify"] button')]);
ok('the defect can be closed and the elapsed hours appear',
   (await fac.textContent('body')).includes('Set right on the spot'));

await fac.goto('http://localhost:3177/facility/kitchen');
ok('a no-meal running room says the kitchen obligations do not apply',
   (await fac.textContent('body')).includes('has no meal facility'));

await fac.goto('http://localhost:3177/facility/pest');
const pest = await fac.textContent('body');
ok('pest control log renders', pest.includes('Pest control log'));
await fac.fill('input[name="areas_covered"]', 'Test areas 9001');
await Promise.all([fac.waitForNavigation(), fac.click('button:has-text("Save")')]);
ok('a treatment can be scheduled', (await fac.textContent('body')).includes('Test areas 9001'));
await fx1.close();

// a meal site shows the eight kitchen checks
const { ctx: fx2, p: fac2 } = await signIn('sysadmin');
await fac2.goto('http://localhost:3177/facility/kitchen?rr=12');
const kit = await fac2.textContent('body');
ok('a meal site lists the kitchen obligations',
   kit.includes('FSSAI') && kit.includes('15-day grocery stock') && kit.includes('spare LPG'));
ok('sysadmin cannot record facility entries', kit.includes('view access only'));
await fac2.goto('http://localhost:3177/facility/laundry');
ok('sysadmin can read the laundry register',
   (await fac2.textContent('body')).includes('Laundry dispatch register'));
const facNav = await fac2.$$eval('.navitem span', els => els.map(e => e.textContent));
ok('Facility & Material appears in the sidebar', facNav.includes('Facility & Material'));
await fx2.close();


// ------------------ raw foodstuff quality, and the garden (stage 28) ------
//
// Two named tender obligations that had nothing behind them. What is checked:
// that the foodstuff register carries the thing the clause actually turns on —
// the seal, and the signature of the running staff who will eat it — and that
// the garden page works out the half-yearly ten plants rather than leaving an
// officer to count backwards through a log.
const { ctx: fsx, p: fs } = await signIn('rr_incharge');
await fs.goto(`http://localhost:3177/facility/foodstuff?rr=${MUSTER_RR}`);
const fsPage = await fs.textContent('body');
ok('the raw-foodstuff register quotes the clause it serves',
   fsPage.includes('signature of available running staff'));
ok('a check with nobody named is counted, not hidden',
   fsPage.includes('Checks nobody signed'));

const FS_TODAY = new Date().toISOString().slice(0, 10);
await fs.fill('input[name="checked_on"]', FS_TODAY);
await fs.fill('input[name="conducted_by"]', 'Health Inspector');
await fs.fill('input[name="item_0"]', 'Edible oil');
await fs.fill('input[name="brand_0"]', 'Fortune');
await fs.selectOption('select[name="seal_0"]', '0');
await fs.selectOption('select[name="fssai_0"]', '0');
await fs.selectOption('select[name="quality_0"]', 'poor');
await fs.fill('input[name="iremarks_0"]', 'Seal broken and past its date');
await fs.fill('input[name="sig_name_0"]', 'R. Jadhav');
await fs.fill('input[name="sig_desig_0"]', 'Loco Pilot');
await Promise.all([fs.waitForNavigation(), fs.click('button:has-text("Record the check")')]);
const fsAfter = await fs.textContent('body');
ok('a quality check saves with its items and its signatures',
   fsAfter.includes('Quality check recorded') && fsAfter.includes('R. Jadhav'));
ok('a broken seal and a missing FSSAI mark are each named',
   fsAfter.includes('seal broken') && fsAfter.includes('no FSSAI mark'));
ok('a poor item points at the clauses it is evidence for',
   fsAfter.includes('clauses B2 and B4'));
ok('and the register never raises the deficiency itself',
   fsAfter.includes('records the finding and'));

// the contractor may read it but not write it — this is the Railway's check
await fsx.close();
const { ctx: fcx, p: fc2 } = await signIn('contractor_sup');
const fcRes = await fc2.goto(`http://localhost:3177/facility/foodstuff?rr=${MUSTER_RR}`);
ok('the contractor can read the foodstuff register', fcRes.status() === 200);
ok('but cannot record a quality check on his own stock',
   (await fc2.$('button:has-text("Record the check")')) === null);
await fcx.close();

const { ctx: gdx, p: gd } = await signIn('rr_incharge');
await gd.goto(`http://localhost:3177/facility/pest?rr=${MUSTER_RR}`);
const garden0 = await gd.textContent('body');
ok('the garden half of the tab is no longer a sentence of prose',
   garden0.includes('Garden and lawn upkeep') && garden0.includes('Ten plants in gamlas'));
ok('the half-yearly plant supply is counted against the tender figure',
   /\d+ supplied of 10/.test(garden0));
await gd.selectOption('#gtype', 'gamla_supply');
await gd.fill('#gardenform input[name="plants_supplied"]', '3');
await gd.selectOption('#gardenform select[name="pot_material"]', 'other');
await gd.fill('#gardenform input[name="pot_size_inches"]', '12');
await Promise.all([gd.waitForNavigation(), gd.click('#gardenform button:has-text("Record")')]);
const garden1 = await gd.textContent('body');
ok('a supply of plants is recorded with its count', garden1.includes('Garden work recorded'));
ok('and a pot the tender does not allow is called out',
   garden1.includes('not the pot the tender specifies'));
await gdx.close();

// Schedule D — the consumables list that had never been seeded
const { ctx: cnx, p: cn } = await signIn('rr_incharge');
await cn.goto(`http://localhost:3177/facility/consumables?rr=${MUSTER_RR}`);
const schedD = await cn.textContent('body');
ok('the newspapers and magazines are consumable items in their own right',
   /India Today|[Nn]ewspaper/.test(schedD));
await cnx.close();

// --------------------------------- the agreements and LOA panel (stage 27)
//
// Asked for by a divisional officer. Two questions he could not answer on one
// screen: which agreement covers each of my running rooms, and when does it
// run out. What is checked is that the LOA reference stands beside the
// agreement number, that a missing figure is printed as missing rather than as
// a zero or a blank, and that a running room no live agreement covers is named.
const { ctx: agx, p: ag } = await signIn('div_officer');
await ag.goto('http://localhost:3177/');
const loaPanel = await ag.textContent('body');
ok('the dashboard carries an agreements and LOA panel',
   loaPanel.includes('Agreements and Letters of Acceptance'));
ok('the LOA sits beside the agreement number, as two separate references',
   /LOA[\s\S]{0,400}Agreement/.test(loaPanel)
   && loaPanel.includes('two documents with two numbers'));
ok('what the Railway has not supplied is printed as missing, never as zero',
   loaPanel.includes('not on record'));
ok('and the panel says plainly that it computes no amount',
   loaPanel.includes('No amount here is computed'));
await agx.close();

// ------------------------------------------------ the daily cleaning record
//
// Clause A6 -- poor cleaning against schedule, Rs 1000 a day -- is the largest
// recurring penalty in Schedule A, and before stage 26 nothing recorded whether
// a single round had happened. What is checked here is that the register serves
// BOTH sides: a shortfall is visible, and so is a schedule properly kept; that
// a blank round stays unrecorded rather than becoming an accusation; and that
// the contractor cannot confirm his own work.
const CLEAN_TODAY = new Date().toISOString().slice(0, 10);
const { ctx: clnx, p: cln } = await signIn('rr_incharge');
await cln.goto(`http://localhost:3177/records/cleaning?rr=${MUSTER_RR}&date=${CLEAN_TODAY}`);
const clean0 = await cln.textContent('body');
ok('the cleaning register opens on the tender\'s own schedule',
   clean0.includes('Rounds due today') && clean0.includes('Schedule C, cleaning schedule table'));
ok('the bed rooms are due twice a day and the kitchen block three times',
   clean0.includes('twice a day') && clean0.includes('three times a day'));
ok('garbage carries its own obligation, cited to the scope and not the table',
   clean0.includes('Wet and dry garbage') && clean0.includes('item viii'));
ok('pest control is not duplicated here — it keeps its own register',
   !clean0.includes('rodent') && clean0.includes('own register'));

// one round done, one honestly marked not done, one left blank
const schedIds = await cln.$$eval('tr.cl', rows =>
  rows.map(r => (r.querySelector('input[name^="st_"]') || {}).name || '').filter(Boolean)
      .map(n => n.slice(3)));
ok('a round is offered as done or not done, never as a single tick', schedIds.length >= 5);
await cln.check(`input[name="st_${schedIds[0]}"][value="done"]`);
await cln.fill(`input[name="at_${schedIds[0]}"]`, '09:15');
await cln.check(`input[name="fr_${schedIds[0]}"]`);
await cln.check(`input[name="st_${schedIds[1]}"][value="not_done"]`);
await cln.fill(`input[name="rm_${schedIds[1]}"]`, 'Sweeper on leave, no reliever sent');
await Promise.all([cln.waitForNavigation(), cln.click('#cleanform button:has-text("Save the day")')]);
const clean1 = await cln.textContent('body');
ok('the day saves round by round', clean1.includes('The cleaning record has been saved'));
ok('a round marked not done is named as clause A6', /clause A6/.test(clean1));
ok('and a round left blank stays unrecorded rather than becoming an accusation',
   clean1.includes('Not written down at all') && clean1.includes('not the same as'));

// a round finished after its window closed is done AND late
const lateId = schedIds[2];
await cln.check(`input[name="st_${lateId}"][value="done"]`);
await cln.fill(`input[name="at_${lateId}"]`, '23:50');
await Promise.all([cln.waitForNavigation(), cln.click('#cleanform button:has-text("Save the day")')]);
ok('a round finished after its window is recorded as done and as late',
   (await cln.textContent('body')).includes('after the window closed'));

await cln.fill('input[name="verify_remarks"]', 'Checked at 21:15, all blocks seen');
await Promise.all([cln.waitForNavigation(), cln.click('button:has-text("Verify this day")')]);
const clean2 = await cln.textContent('body');
ok('the Railway verifies the day', clean2.includes('The day has been verified'));
ok('and a verified day is closed to editing', clean2.includes('closed to editing'));

// A verified day is closed -- but it must still be correctable by SOMEBODY.
// The first cut removed the save button and offered nothing in its place, so a
// day verified by mistake could never be put right. Found by the RR in-charge
// on the first walk-through; these three checks are why it cannot recur.
await cln.goto(`http://localhost:3177/records/cleaning?rr=${MUSTER_RR}&date=${CLEAN_TODAY}`);
ok('a verified day offers no save button at all',
   (await cln.$('#cleanform button')) === null);
ok('but the Railway is offered a way to reopen it',
   (await cln.$('button:has-text("Reopen this day")')) !== null);
await Promise.all([cln.waitForNavigation(), cln.click('button:has-text("Reopen this day")')]);
const reopened = await cln.textContent('body');
ok('reopening withdraws the verification and says so',
   reopened.includes('The day has been reopened') && reopened.includes('verification is withdrawn'));
ok('and the rounds are back in hand',
   (await cln.$('#cleanform button:has-text("Save the day")')) !== null);
await clnx.close();

const { ctx: ccx, p: cc } = await signIn('contractor_sup');
const ccRes = await cc.goto(`http://localhost:3177/records/cleaning?rr=${MUSTER_RR}&date=${CLEAN_TODAY}`);
ok('the contractor can read the cleaning register', ccRes.status() === 200);
ok('but is not offered the Railway\'s verification',
   (await cc.$('button:has-text("Verify this day")')) === null);
ok('nor the reopening of a day the Railway has closed',
   (await cc.$('button:has-text("Reopen this day")')) === null);
await ccx.close();

// ---------------------------------------- the menu, the rate board, the week
//
// Schedule B: the contractor prepares the menu in consultation with the
// Railway's representative. What is checked here is that both halves are real
// -- that the tender's two menu rules are put in front of the officer before he
// agrees a week, that he alone can agree it, and that an agreed week closes.
const MENU_WEEK = '2026-08-17';   // a Monday
const { ctx: mnx, p: mn } = await signIn('rr_incharge');
await mn.goto(`http://localhost:3177/facility/menu?rr=${MUSTER_RR}&week=${MENU_WEEK}`);
const menu0 = await mn.textContent('body');
ok('the weekly menu opens on the week asked for',
   menu0.includes('Weekly menu') && menu0.includes(MENU_WEEK));
ok('and prints what a plate must contain, from the tender',
   menu0.includes('one full katori dal') && menu0.includes('kosambir'));

// the same breakfast on two days running, and a lunch with only one vegetable
await mn.fill(`input[name="main_1_breakfast"]`, 'Poha and sheera');
await mn.fill(`input[name="main_2_breakfast"]`, 'Poha and Sheera');
await mn.fill(`input[name="main_1_lunch"]`, 'Veg Rice Plate');
await mn.fill(`input[name="dry_1_lunch"]`, 'Bhindi');
await Promise.all([mn.waitForNavigation(), mn.click('button:has-text("Save the week")')]);
const menu1 = await mn.textContent('body');
ok('a week saves as a draft, not as agreed', menu1.includes('Draft — not yet agreed'));
ok('a breakfast repeated on the next day is caught, and the clause is quoted',
   /Breakfast on Tuesday repeats Monday/.test(menu1)
   && menu1.includes('not to be repeated on the subsequent day'));
ok('a meal missing one of its two seasonal vegetables is caught',
   /Monday lunch does not name the vegetable with curry/.test(menu1));

await Promise.all([mn.waitForNavigation(), mn.click('button:has-text("Agree this week")')]);
const menu2 = await mn.textContent('body');
ok('the Railway can agree the week', menu2.includes('The week has been agreed'));
ok('and an agreed week is closed to editing', menu2.includes('closed to editing'));
await mnx.close();

// the contractor prepares, but does not agree
const { ctx: mcx, p: mc } = await signIn('contractor_sup');
await mc.goto(`http://localhost:3177/facility/menu?rr=${MUSTER_RR}&week=${MENU_WEEK}`);
ok('the contractor is not offered the Railway\'s agreement',
   (await mc.$('button:has-text("Agree this week")')) === null);
const mcNext = await mc.goto(`http://localhost:3177/facility/menu?rr=${MUSTER_RR}&week=2026-08-24`);
ok('but he may prepare a week that has not been agreed',
   mcNext.status() === 200 && (await mc.$('input[name="main_1_breakfast"]')) !== null);
await mcx.close();

// the rate board — the tender leaves it blank and the screen says so
const { ctx: rbx, p: rb } = await signIn('div_officer');
await rb.goto('http://localhost:3177/masters/menu');
const board = await rb.textContent('body');
ok('the rate board lists Table B as the tender prints it',
   board.includes('Standard Dal per bowl (full)') && board.includes('Maska slice (pair)'));
ok('and keeps both of the tender\'s own paratha lines rather than merging them',
   board.includes('as its twentieth') && board.includes('quietly removed from a rate board'));
ok('items the Railway has not priced say so instead of showing zero',
   /have no rate on record/.test(board) && board.includes('has not fixed this'));
ok('Table A carries the tender\'s own rates', board.includes('69.30') && board.includes('37.80'));
await rb.fill('input[name="authority"]', 'Test rate order 9001');
await rb.fill('input[name="r_4"]', '8.50');
await Promise.all([rb.waitForNavigation(), rb.click('button:has-text("Save the rate board")')]);
ok('a rate can be fixed, and carries the order that fixed it',
   (await rb.textContent('body')).includes('Rate board updated'));

await rbx.close();

// the menu card, and the parcel meal type
const { ctx: pmx, p: pm } = await signIn('rr_incharge');
await pm.goto(`http://localhost:3177/facility/menu/card?rr=${MUSTER_RR}&week=${MENU_WEEK}`);
const wallCard = await pm.textContent('body');
ok('the menu card prints for the wall', wallCard.includes('Menu Card') && wallCard.includes('Rate Board'));
ok('an unpriced item prints as not yet fixed, never as a blank or a zero',
   wallCard.includes('rate not yet fixed'));
ok('and the card carries the ceiling and the parcel exception',
   wallCard.includes('three subsidised meals') && wallCard.includes('in addition to that ceiling'));
await pm.goto(`http://localhost:3177/records/meals?rr=${MUSTER_RR}`);
const mealsPage = await pm.textContent('body');
ok('the meals register offers a parcel column', mealsPage.includes('Parcel'));
ok('and says the parcel sits outside the three-meal ceiling',
   mealsPage.includes('in addition to that ceiling'));
await pmx.close();

// scoping still holds on the new pages
const { ctx: fx3, p: fac3 } = await signIn('div_officer');   // Solapur only
const outOfScope = await fac3.goto('http://localhost:3177/facility/assets?rr=1');   // CSMT, Mumbai
ok('a divisional officer cannot open another division on the facility pages', outOfScope.status() === 403);
await fx3.close();

// ---------- adding, leaving and replacing a worker ----------
const { ctx: a1, p: sup10 } = await signIn('contractor_sup');
await sup10.goto('http://localhost:3177/staff');
ok('the contractor supervisor is offered the add button',
   !!(await sup10.$('a[href$="/staff/new"]')));

await sup10.goto('http://localhost:3177/staff/new?rr=10');       // Kalyan
const addForm = await sup10.textContent('body');
ok('the add form explains the screening gate', addForm.includes('cannot be marked present'));
ok('the add form shows the sanctioned strength of the site', addForm.includes('Sanctioned strength'));
const postOptions = await sup10.$$eval('select[name="designation_id"] option',
  els => els.map(e => ({ value: e.value, label: e.textContent.trim() })));
ok('only posts sanctioned at this running room are offered',
   postOptions.length > 0 && postOptions.every(o => o.value));
ok('a site with no meal facility offers no kitchen post',
   !postOptions.some(o => /Cook|Bearer|Utensil/i.test(o.label)));

await sup10.fill('input[name="full_name"]', 'Test Worker One');
await sup10.fill('input[name="phone"]', '9876500011');
await Promise.all([sup10.waitForNavigation(), sup10.click('button:has-text("Add to the register")')]);
const added = await sup10.textContent('body');
const NEW_URL = sup10.url();
ok('the person is created and opens', added.includes('Test Worker One'));
ok('a staff code is generated', /CS\d{5}/.test(added));
ok('a new person starts awaiting screening', added.includes('pending'));
ok('a new person is not cleared for deployment', added.includes('Not cleared for deployment'));
ok('a new person has no documents yet', added.includes('No documents on file'));
ok('adding beyond the sanctioned strength is shown, not hidden',
   /\bover\b[\s\S]{0,40}sanctioned\s+strength/.test(
     (await sup10.textContent('body')).replace(/\s+/g, ' ')));

// they show up in the register and in the unscreened filter
await sup10.goto('http://localhost:3177/staff?q=Test+Worker+One');
ok('the new person appears in the register', (await sup10.textContent('body')).includes('Test Worker One'));
await sup10.goto('http://localhost:3177/staff?flag=unscreened&q=Test+Worker');
ok('the new person appears among those awaiting screening',
   (await sup10.textContent('body')).includes('Test Worker One'));

// a post that is not sanctioned here is refused
const badPost = await a1.request.post('http://localhost:3177/staff', {
  form: { running_room_id: '10', designation_id: '3', full_name: 'Should Not Exist',
          date_of_joining: '2026-08-01' },              // Head Cook at a site with no meals
});
ok('a post that is not sanctioned at the running room is refused', badPost.status() === 400);
ok('the refusal names the post', (await badPost.text()).includes('sanctioned'));

// leaving needs a reason. The field is marked required in the browser, and the
// server refuses it too — a form control is a convenience, not a guarantee.
await sup10.goto(NEW_URL);
ok('the reason field is required in the form',
   !!(await sup10.$('input[name="reason"][required]')));
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const noReason = await a1.request.post(`${NEW_URL}/leave`, {
  form: { date_of_leaving: TODAY_ISO },
});
ok('marking someone as left without a reason is refused by the server', noReason.status() === 400);
ok('the refusal says a reason is needed', (await noReason.text()).includes('reason is required'));

await sup10.goto(NEW_URL);
await sup10.fill('input[name="reason"]', 'Resigned, returning to home town');
await Promise.all([sup10.waitForNavigation(), sup10.click('button:has-text("Mark as left")')]);
const left = await sup10.textContent('body');
ok('the person is marked as left', left.includes('No longer on roll'));
ok('a replacement record is written', left.includes('Resigned, returning to home town'));
ok('the replacement has no Railway permission yet', left.includes('Not obtained'));
ok('the contractor supervisor cannot grant that permission themselves',
   !(await sup10.$('button:has-text("Permit")')));

await sup10.goto('http://localhost:3177/staff?q=Test+Worker+One');
ok('someone who has left drops out of the register',
   !(await sup10.textContent('body')).includes('Test Worker One'));
await sup10.goto('http://localhost:3177/staff?flag=left&q=Test+Worker+One');
ok('someone who has left is still findable', (await sup10.textContent('body')).includes('Test Worker One'));
await a1.close();

// The RR In-charge may also enter staff — a site should not stall because the
// contractor's supervisor cannot get to a computer — but still cannot screen.
const { ctx: a5, p: cli9 } = await signIn('rr_incharge');
await cli9.goto('http://localhost:3177/staff/new');
ok('the RR in-charge can open the add form',
   (await cli9.textContent('body')).includes('New contract staff'));
await cli9.fill('input[name="full_name"]', 'Test Worker Three');
await Promise.all([cli9.waitForNavigation(), cli9.click('button:has-text("Add to the register")')]);
const byCli = await cli9.textContent('body');
ok('the RR in-charge can add a person', byCli.includes('Test Worker Three'));
ok('a person the RR in-charge added is still only pending', byCli.includes('pending'));
ok('the RR in-charge cannot screen their own entry',
   !(await cli9.$('button[value="approve"]')));
await a5.close();

// The divisional officer screens and permits, but does not enter staff.

const { ctx: a2, p: dee11 } = await signIn('div_officer');
const officerAdd = await dee11.goto('http://localhost:3177/staff/new');
ok('a divisional officer cannot add contract staff', officerAdd.status() === 403);

// Room 42 is in Solapur AND held by the demo contractor, so both roles reach it.
const { ctx: a4, p: sup11 } = await signIn('contractor_sup');
await sup11.goto('http://localhost:3177/staff/new?rr=42');
await sup11.fill('input[name="full_name"]', 'Test Worker Two');
await Promise.all([sup11.waitForNavigation(), sup11.click('button:has-text("Add to the register")')]);
const SUR_URL = sup11.url();
await sup11.fill('input[name="reason"]', 'Replaced on the Railway advice after poor grading');
await Promise.all([sup11.waitForNavigation(), sup11.click('button:has-text("Mark as left")')]);
ok('the replacement is recorded without permission', (await sup11.textContent('body')).includes('Not obtained'));
await a4.close();

await dee11.goto(SUR_URL);
ok('the divisional officer is offered the permission button',
   !!(await dee11.$('button:has-text("Permit")')));
await Promise.all([dee11.waitForNavigation(), dee11.click('button:has-text("Permit")')]);
const permitted = await dee11.textContent('body');
ok('the Railway permission is recorded', permitted.includes('Obtained'));
ok('the permission names the officer who gave it', permitted.includes('Sr. DEE (TRO) Solapur'));
await a2.close();

// scope still holds on the new routes
const { ctx: a3, p: sup12 } = await signIn('contractor_sup');
const outsideAdd = await a3.request.post('http://localhost:3177/staff', {
  form: { running_room_id: '1', designation_id: '2', full_name: 'Out Of Scope',
          date_of_joining: '2026-08-01' },              // CSMT, another contractor's site
});
ok('a supervisor cannot add staff to a running room they do not hold', outsideAdd.status() === 403);
await a3.close();

// ---------- staff document scans ----------
// The document row and the scan behind it are added together, and the scan is
// reachable only through the staff member it belongs to.
const { ctx: u1, p: sup9 } = await signIn('contractor_sup');
await sup9.goto('http://localhost:3177/staff');
const staffHref = await sup9.getAttribute('table tbody a', 'href');
const STAFF_ID = +staffHref.split('/').pop();
await sup9.goto('http://localhost:3177' + staffHref);

// a scanned PDF certificate
await sup9.selectOption('select[name="doc_type"]', 'police_verification');
await sup9.fill('input[name="reference_no"]', 'PV/TEST/2026');
await sup9.setInputFiles('#docform input[name="scan"]', 'test/fixture.pdf');
await Promise.all([sup9.waitForNavigation(), sup9.click('button:has-text("Add")')]);
const withScan = await sup9.textContent('body');
ok('a document can be added with a scanned certificate', withScan.includes('PV/TEST/2026'));
const openLinks = await sup9.$$eval('a:text-is("Open")', els => els.map(e => e.getAttribute('href')));
ok('the scan is offered for opening', openLinks.length > 0);

const scanned = await u1.request.get('http://localhost:3177' + openLinks[0]);
ok('the scan is served back', scanned.status() === 200);
ok('the scan keeps its real content type', scanned.headers()['content-type'].includes('application/pdf'));
ok('the scan is served with nosniff', scanned.headers()['x-content-type-options'] === 'nosniff');

// a passport photograph shows on the record and on the identity card.
// It has its own box beside the name -- deliberately not in the Documents
// list, so there is one way to do it rather than two.
await sup9.setInputFiles('#photoform input[name="scan"]', 'test/fixture.jpg');
await Promise.all([sup9.waitForNavigation(), sup9.click('#photoupload')]);
ok('the photograph appears on the staff record', !!(await sup9.$('img[alt^="Photograph of"]')));
await sup9.goto(`http://localhost:3177/staff/${STAFF_ID}/id-card`);
ok('the identity card uses the photograph', !!(await sup9.$('img.photo')));

// a file that is not what it claims to be is refused, and says so
await sup9.goto(`http://localhost:3177/staff/${STAFF_ID}`);
await sup9.selectOption('select[name="doc_type"]', 'medical_fitness');
await sup9.setInputFiles('#docform input[name="scan"]', 'test/fixture.txt');
await sup9.click('button:has-text("Add")');
await sup9.waitForTimeout(400);
const badFile = await sup9.textContent('body');
ok('a file that is not an accepted format is refused', badFile.includes('was not accepted'));
ok('the refusal names the formats that are accepted', badFile.includes('PDF'));
await u1.close();

// the scan route is scoped like everything else
const { ctx: u2, p: dee10 } = await signIn('div_officer');
const foreign = await u2.request.get(`http://localhost:3177${openLinks[0]}`);
ok('a scan outside the division is refused', foreign.status() === 403);
await u2.close();

// ---------- stage 7: dashboards and reports ----------
const { ctx: r1, p: rep } = await signIn('hq');
await rep.goto('http://localhost:3177/');
const dashHtml = await rep.content();
ok('dashboard renders charts as inline SVG', (dashHtml.match(/<svg class="chart"/g) || []).length >= 3);
ok('dashboard charts carry an accessible name', dashHtml.includes('role="img"'));
ok('rating chart marks the 4.01 penalty band boundary', dashHtml.includes('4.01'));
ok('coverage chart marks the 50% floor', dashHtml.includes('50% floor'));

await rep.goto('http://localhost:3177/reports');
const sc = await rep.textContent('body');
ok('contractor scorecard loads', sc.includes('Contractor scorecard') || sc.includes('Scorecard'));
ok('scorecard covers all 16 contractors', sc.includes('Contractor P') && sc.includes('Contractor A'));
ok('scorecard states no amount is computed', /No amount is computed|not a deduction/.test(sc));
ok('scorecard shows no rupee figure anywhere', !/₹/.test(sc));
const scRows = await rep.$$eval('table.tbl tbody tr', els => els.length);
ok('scorecard has one row per contractor', scRows === 16);

await rep.goto('http://localhost:3177/reports/sites');
const st7 = await rep.textContent('body');
ok('running-room league table loads', st7.includes('Running rooms'));
const siteRows = await rep.$$eval('table.tbl tbody tr', els => els.length);
ok('league table has one row per running room', siteRows === 44);
const firstRating = await rep.$$eval('table.tbl tbody tr td:nth-child(5)', els =>
  els.slice(0, 3).map(e => parseFloat(e.textContent)));
ok('league table is sorted worst first by default',
   firstRating[0] <= firstRating[1] && firstRating[1] <= firstRating[2]);
await rep.goto('http://localhost:3177/reports/sites?sort=beds');
const bedsCol = await rep.$$eval('table.tbl tbody tr td:nth-child(4)', els =>
  els.slice(0, 3).map(e => parseInt(e.textContent.replace(/,/g, ''), 10)));
ok('league table re-sorts by size', bedsCol[0] >= bedsCol[1] && bedsCol[1] >= bedsCol[2]);

await rep.goto('http://localhost:3177/reports/trends');
const tr = await rep.textContent('body');
ok('trends page loads', tr.includes('Occupant rating') && tr.includes('Feedback coverage'));
ok('trends shows six months of history', (tr.match(/\b20\d\d\b/g) || []).length >= 6);
ok('inspection chart has a legend', tr.includes('Minor deficiencies'));
const tables = await rep.$$eval('details.tableview', els => els.length);
ok('every trend chart has a table of the same figures', tables >= 3);
const trHtml = await rep.content();
ok('trend charts are inline SVG, not an image or a script',
   trHtml.includes('<svg class="chart"') && !/<script[^>]*chart/i.test(trHtml));

// CSV export is a separate permission from reading the report
// Fetched through the page's own context so the session cookie rides along —
// page.goto would trip over the download rather than read it.
const csv = await r1.request.get('http://localhost:3177/reports/scorecard.csv');
ok('HQ can download the scorecard', csv.status() === 200);
const csvText = await csv.text();
ok('CSV has a header row and 16 contractors', csvText.trim().split(/\r?\n/).length === 17);
ok('CSV carries no rupee amount', !/₹/.test(csvText));
ok('CSV is comma separated with a BOM so Excel opens it as UTF-8', csvText.charCodeAt(0) === 0xFEFF);
await r1.close();

// the contractor's own supervisor may read but not export
const { ctx: r2, p: sup7 } = await signIn('contractor_sup');
await sup7.goto('http://localhost:3177/reports');
const supScore = await sup7.textContent('body');
ok('contractor supervisor sees only their own contractor', !supScore.includes('Contractor B'));
ok('contractor supervisor is offered no download', !(await sup7.$('a[href$="scorecard.csv"]')));
const supCsv = await r2.request.get('http://localhost:3177/reports/scorecard.csv');
ok('contractor supervisor is refused the CSV', supCsv.status() === 403);
await r2.close();

// scoping holds on the reports
const { ctx: r3, p: div7 } = await signIn('div_officer');
await div7.goto('http://localhost:3177/reports/sites');
const divRows = await div7.$$eval('table.tbl tbody tr', els => els.length);
ok('divisional officer sees only their 5 running rooms in the league table', divRows === 5);
await div7.goto('http://localhost:3177/reports/trends');
ok('divisional officer sees only their own division on the trends page',
   !(await div7.textContent('body')).includes('Bhusaval'));
await r3.close();

// ---------- stage 8: monthly certification pack ----------
const D8 = new Date();
const YM = new Date(Date.UTC(D8.getUTCFullYear(), D8.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const CERT_RR = 10;                       // Kalyan, the demo RR in-charge's own running room

const { ctx: k1, p: cli8 } = await signIn('rr_incharge');
await cli8.goto('http://localhost:3177/certificates');
const certIndex = await cli8.textContent('body');
ok('certification index loads', certIndex.includes('Not yet generated'));
ok('certification index states that no amount is stated', certIndex.includes('states no amount'));

await cli8.goto(`http://localhost:3177/certificates/${CERT_RR}/${YM}`);
ok('an ungenerated month says so', (await cli8.textContent('body')).includes('No certificate has been generated'));
await Promise.all([cli8.waitForNavigation(), cli8.click('button:has-text("Generate certificate")')]);
const pack = await cli8.textContent('body');
ok('the pack is generated', pack.includes('Monthly certificate of service'));
ok('the pack carries the five sections',
   pack.includes('Manpower and attendance') && pack.includes('Service quality')
   && pack.includes('Inspections and deficiencies') && pack.includes('Facility and material')
   && pack.includes('Certification'));
ok('man-days are counted, not zero', /Man-days due[\s\S]{0,400}?[1-9]/.test(pack));
ok('the pack states no rupee amount anywhere', !/₹/.test(pack));
ok('the pack says the grading formula is not applied', pack.includes('not applied here'));
ok('the pack names RRMS as the owner of the meal quantity', pack.includes('RRMS'));
ok('the pack carries four signature blocks',
   (await cli8.$$eval('.signbox', els => els.length)) === 4);

// a draft can be regenerated
ok('a draft offers regeneration', !!(await cli8.$('button:has-text("Regenerate from current records")')));

// the RR in-charge certifies; the divisional officer is the one who counter-signs
ok('the RR in-charge is not offered the counter-signature',
   (await cli8.textContent('body')).includes('does not counter-sign'));
await cli8.fill('input[name="remarks"]', 'Shortfall in call boys taken up with the contractor');
await Promise.all([cli8.waitForNavigation(), cli8.click('button:has-text("Certify this pack")')]);
const certified = await cli8.textContent('body');
ok('the pack is certified', certified.includes('Certified on'));
ok('the remarks are carried on the certificate', certified.includes('Shortfall in call boys'));
ok('a certified pack can no longer be regenerated',
   !(await cli8.$('button:has-text("Regenerate from current records")')));

// The button is gone, but the guard has to hold against a direct POST too —
// that is the whole point of freezing a signed document.
const forced = await k1.request.post('http://localhost:3177/certificates/generate', {
  form: { rr: String(CERT_RR), month: `${YM}-01` },
});
ok('a signed certificate cannot be regenerated by posting directly', forced.status() === 400);
ok('the refusal explains why', (await forced.text()).includes('cannot be regenerated'));

// the printable version is a standalone sheet, not the application shell
const printed = await k1.request.get(`http://localhost:3177/certificates/${CERT_RR}/${YM}?print=1`);
const printHtml = await printed.text();
ok('the printable version renders', printed.status() === 200 && printHtml.includes('Monthly certificate of service'));
ok('the printable version drops the application sidebar', !printHtml.includes('class="sidebar"'));
ok('the printable version is a complete document', printHtml.trim().startsWith('<!DOCTYPE html>'));
await k1.close();

// only the divisional officer counter-signs, and returning needs a reason
const { ctx: k2, p: dee8 } = await signIn('div_officer');
const outside = await dee8.goto(`http://localhost:3177/certificates/${CERT_RR}/${YM}`);
ok('a divisional officer cannot open a certificate outside the division', outside.status() === 403);
await k2.close();

// generate, certify and counter-sign one inside the divisional officer's own scope
const SUR_RR = 41;                        // SUR, in Solapur division
const { ctx: k3, p: dee9 } = await signIn('div_officer');
await dee9.goto(`http://localhost:3177/certificates/${SUR_RR}/${YM}`);
await Promise.all([dee9.waitForNavigation(), dee9.click('button:has-text("Generate certificate")')]);
ok('the divisional officer can also prepare a pack',
   (await dee9.textContent('body')).includes('Monthly certificate of service'));
ok('an uncertified pack cannot be counter-signed yet',
   (await dee9.textContent('body')).includes('has to certify the pack first'));
await Promise.all([dee9.waitForNavigation(), dee9.click('button:has-text("Certify this pack")')]);

await dee9.click('button:has-text("Return for correction")');
await dee9.waitForTimeout(300);
ok('returning without a reason is refused', (await dee9.textContent('body')).includes('reason is required'));

await dee9.goto(`http://localhost:3177/certificates/${SUR_RR}/${YM}`);
await Promise.all([dee9.waitForNavigation(), dee9.click('button:has-text("Counter-sign")')]);
const signed8 = await dee9.textContent('body');
ok('the pack is counter-signed', signed8.includes('Counter-signed on'));
ok('a counter-signed pack shows no further action',
   !(await dee9.$('button:has-text("Return for correction")')));
await k3.close();

// the contractor's supervisor may not prepare or sign anything
const { ctx: k4, p: sup8 } = await signIn('contractor_sup');
await sup8.goto('http://localhost:3177/certificates');
ok('the contractor supervisor can read the certification list',
   (await sup8.textContent('body')).includes('Running rooms'));
ok('the contractor supervisor is offered no generate button',
   !(await sup8.$('button:has-text("Generate certificate")')));
await k4.close();

// Every page, checked for escaped markup leaking through as visible text.
// A hardcoded shortlist missed this once already.
const { ctx: sw, p: sweep } = await signIn('sysadmin');
const ALL_PAGES = ['/', '/running-rooms', '/running-rooms/1', '/staff', '/staff/2',
  '/inspections', '/deficiencies',   // /inspections/new needs inspection.create, checked separately
  '/contractors', '/contractors/1', '/records/muster', '/records/call-book', '/records/linen',
  '/records/complaints', '/feedback', '/feedback?sort=new', '/feedback/coverage',
  '/feedback/grading', '/feedback/qr', '/feedback/register', '/masters', '/masters/designations',
  '/masters/manpower-norms', '/masters/deficiency-clauses',
  '/facility/laundry', '/facility/consumables', '/facility/assets',
  '/records/cleaning', '/facility/kitchen', '/facility/kitchen?rr=12', '/facility/foodstuff',
  '/facility/menu', '/facility/menu/card',
  '/masters/menu', '/facility/pest',
  '/reports', '/reports/sites', '/reports/sites?sort=open', '/reports/trends',
  '/certificates', `/certificates/${CERT_RR}/${YM}`];
let leaks = [];
for (const p of ALL_PAGES) {
  const r = await sweep.goto('http://localhost:3177' + p);
  if (r.status() !== 200) { leaks.push(`${p} returned ${r.status()}`); continue; }
  const body = await sweep.content();
  if (/&lt;(span|div|b|i|br|a|td)\b/.test(body)) leaks.push(`${p} renders escaped markup as text`);
  if (body.includes('[object Promise]')) leaks.push(`${p} renders an un-awaited Promise`);
}
ok(`all ${ALL_PAGES.length} pages render without escaped markup or stray promises`,
   leaks.length === 0 || (console.log('      ' + leaks.join('\n      ')), false));
await sw.close();

/* ---------------------------------------------------------------- stage 9
 * FSSAI food safety: the register, the expiry arithmetic, the upload, and the
 * checklist that decides its own result.
 * -------------------------------------------------------------------- */
{
  const { ctx, p } = await signIn('sysadmin');
  await p.goto('http://localhost:3177/food-safety');
  const body = (await p.textContent('body')).replace(/\s+/g, ' ');

  const listed = await p.$$eval('table.tbl tbody tr', els => els.length);
  ok('only kitchens appear in the FSSAI register, not every running room',
     listed === 33);
  ok('the licence actually issued for Bhusaval is on the register',
     body.includes('10025901000005') && body.includes('M/S ISF SERVICES'));
  ok('a kitchen with no licence is called out, not left blank',
     body.includes('No licence on record'));
  ok('a suspended licence is shown as suspended whatever its dates say',
     body.includes('Suspended'));
  ok('licences inside the 180-day window read as renewable, not as expired',
     body.includes('Renewal may be filed'));
  ok('a licence past the 180-day grace period is distinguished from a merely expired one',
     body.includes('Lapsed beyond renewal') && body.includes('late renewal window'));

  // The room a demonstration would be run against.
  await p.goto('http://localhost:3177/food-safety/23');
  const room = (await p.textContent('body')).replace(/\s+/g, ' ');
  ok('the room page carries the premises, category and issuing authority from the Form C',
     room.includes('Central License - Indian Railways') && room.includes('DO, Railways'));
  ok('a technical person whose qualification is not on the Condition 4 list is questioned',
     /B\.Com/.test(room) && room.includes('does not appear to be one of these'));
  ok('the recurring duties are listed with their due dates',
     room.includes('Annual return') && room.includes('Laboratory test'));

  const cert = await p.evaluate(async () => {
    const a = [...document.querySelectorAll('a')].find(x => /Open the certificate/.test(x.textContent));
    if (!a) return null;
    const r = await fetch(a.href); return { status: r.status, type: r.headers.get('content-type') };
  });
  ok('the uploaded certificate is served back through the room that owns it',
     cert && cert.status === 200 && /pdf/.test(cert.type));
  await ctx.close();
}

{
  // A divisional officer may lodge and inspect; Solapur's kitchens only.
  const { ctx, p } = await signIn('div_officer');
  await p.goto('http://localhost:3177/food-safety/23');
  ok('a divisional officer cannot open a kitchen outside the division',
     (await p.textContent('body')).includes('outside your access'));

  await p.goto('http://localhost:3177/food-safety/41');
  await p.fill('input[name=licence_number]', '10025901009999');
  await p.fill('input[name=licensee_name]', 'M/S TEST CATERERS');
  await p.fill('input[name=valid_from]', '2026-01-01');
  await p.fill('input[name=valid_upto]', '2028-01-01');
  await Promise.all([p.waitForNavigation(), p.click('form[action*="/licence"] button[type=submit]')]);
  const after = (await p.textContent('body')).replace(/\s+/g, ' ');
  ok('a licence lodged from the form appears as the current one',
     after.includes('10025901009999') && after.includes('M/S TEST CATERERS'));

  // The form's own pattern stops a short number before it is sent, which is why
  // this posts straight past the browser: the server must refuse it too, or a
  // script or a stale page could put a malformed licence into the register.
  const refused = await p.evaluate(async () => {
    const fd = new FormData();
    fd.append('licence_number', '12345');
    fd.append('licensee_name', 'M/S WRONG');
    fd.append('valid_from', '2026-01-01');
    fd.append('valid_upto', '2028-01-01');
    const r = await fetch('/food-safety/41/licence', { method: 'POST', body: fd });
    return { status: r.status, text: await r.text() };
  });
  ok('a licence number that is not 14 digits is refused by the server, not only the form',
     refused.status === 400 && refused.text.includes('14 digits'));

  const badDates = await p.evaluate(async () => {
    const fd = new FormData();
    fd.append('licence_number', '10025901000005');
    fd.append('licensee_name', 'M/S TEST');
    fd.append('valid_from', '2028-01-01');
    fd.append('valid_upto', '2026-01-01');
    const r = await fetch('/food-safety/41/licence', { method: 'POST', body: fd });
    return { status: r.status, text: await r.text() };
  });
  ok('a validity period that ends before it starts is refused',
     badDates.status === 400 && badDates.text.includes('expiry after the start date'));

  // The checklist works out its own verdict from the findings.
  await p.goto('http://localhost:3177/food-safety/41/inspect');
  const radios = await p.$$eval('input[type=radio][value=not_complied]', els => els.length);
  ok('the whole Schedule 4 checklist is presented for the visit', radios === 42);

  const criticalId = await p.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(r => /critical/.test(r.textContent));
    const inp = row && row.querySelector('input[type=radio][value=not_complied]');
    return inp ? inp.name : null;
  });
  await p.check(`input[name="${criticalId}"][value=not_complied]`);
  await p.fill('input[name="obs_' + criticalId.slice(5) + '"]', 'Not seen at the time of visit');
  await p.fill('input[name=inspection_date]', '2026-08-05');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Record the inspection")')]);
  const rep = (await p.textContent('body')).replace(/\s+/g, ' ');
  ok('one critical failure makes the visit unsatisfactory on its own',
     rep.includes('Unsatisfactory') && rep.includes('What was found wanting'));
  ok('the observation typed at the site survives into the report',
     rep.includes('Not seen at the time of visit'));
  await ctx.close();
}

{
  // The contractor holds the licence, so he lodges it; he does not inspect himself.
  const { ctx, p } = await signIn('contractor_sup');
  await p.goto('http://localhost:3177/food-safety');
  ok('the contractor sees the FSSAI register for his own kitchens',
     !(await p.textContent('body')).includes('Not found'));
  // Take the row's "Open" link, not the certificate link that sits beside it.
  const kitchen = await p.evaluate(() => {
    const a = [...document.querySelectorAll('table.tbl tbody a')]
      .find(x => /^\/food-safety\/\d+$/.test(x.getAttribute('href')));
    return a ? a.getAttribute('href') : null;
  });
  if (kitchen) {
    await p.goto('http://localhost:3177' + kitchen + '/inspect');
    ok('the contractor cannot carry out the Railway\'s food safety inspection',
       (await p.textContent('body')).includes('Not permitted'));
  }
  await ctx.close();
}

{
  const { ctx, p } = await signIn('hq');
  await p.goto('http://localhost:3177/food-safety/23');
  ok('HQ may read the register but is not offered the forms',
     (await p.textContent('body')).includes('may view this register but not add to it'));
  await ctx.close();
}

/* -------------------------------------------------- leaving without a date
 * A person loaded from a typed roster has no date of joining. The comparison
 * that guards the leaving date was reading a missing joining date as the text
 * "null", which sorts below every real date -- so every leaving date was
 * refused as being before it.
 * -------------------------------------------------------------------- */
{
  const { ctx, p } = await signIn('contractor_sup');
  await p.goto('http://localhost:3177/staff');
  const href = await p.$eval('table.tbl tbody a[href*="/staff/"]', a => a.getAttribute('href'));
  await p.goto('http://localhost:3177' + href);

  // The generated demo gives everyone a joining date, so clear it first --
  // that is the state a roster loaded from a typed list actually arrives in.
  await p.fill('#particulars input[name=date_of_joining]', '');
  await Promise.all([p.waitForNavigation(), p.click('#particulars button[type=submit]')]);
  const joining = await p.inputValue('#particulars input[name=date_of_joining]');
  ok('a joining date can be left blank for a person off a typed roster', joining === '');

  const leave = await p.evaluate(async (id) => {
    const r = await fetch(id + '/leave', { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ date_of_leaving: '2026-08-01',
                                  reason: 'Left of his own accord' }) });
    return { status: r.status, text: await r.text() };
  }, href);
  ok('a person with no joining date can still be marked as left', leave.status < 400);

  // And the guard still works when a joining date IS held.
  await p.goto('http://localhost:3177/staff');
  const other = await p.$$eval('table.tbl tbody a[href*="/staff/"]',
    els => els.map(a => a.getAttribute('href')));
  const target = other.find(h => h !== href) || href;
  await p.goto('http://localhost:3177' + target);
  await p.fill('#particulars input[name=date_of_joining]', '2026-01-15');
  await Promise.all([p.waitForNavigation(), p.click('#particulars button[type=submit]')]);
  const early = await p.evaluate(async (id) => {
    const r = await fetch(id + '/leave', { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ date_of_leaving: '2025-11-01', reason: 'test' }) });
    return { status: r.status, text: await r.text() };
  }, target);
  ok('a leaving date before a known joining date is still refused, and names it',
     early.status === 400 && /before the date of joining \(2026-01-15\)/.test(early.text));
  await ctx.close();
}

/* --------------------------------------------------- correcting particulars
 * A roster typed off a Word list carries a name and a post and nothing else.
 * Unless the phone, bank, EPF and ESIC numbers can be filled in afterwards
 * from the screen, the register can never become complete.
 * -------------------------------------------------------------------- */
{
  const { ctx, p } = await signIn('contractor_sup');
  await p.goto('http://localhost:3177/staff');
  const href = await p.$eval('table.tbl tbody a[href*="/staff/"]', a => a.getAttribute('href'));
  await p.goto('http://localhost:3177' + href);

  ok('a particular that is not held is shown as missing, not left blank',
     (await p.textContent('body')).includes('not on record'));
  ok('the contractor is offered the form to fill them in', !!(await p.$('#particulars')));

  await p.fill('#particulars input[name=phone]', '9822011223');
  await p.fill('#particulars input[name=epf_no]', 'MH/BAN/1234567/000/0001234');
  await p.fill('#particulars input[name=esic_no]', '3100123456');
  await p.fill('#particulars input[name=bank_account_no]', '32100987654');
  await p.fill('#particulars input[name=bank_ifsc]', 'sbin0001234');
  await p.fill('#particulars input[name=date_of_joining]', '2025-06-01');
  await Promise.all([p.waitForNavigation(), p.click('#particulars button[type=submit]')]);
  const saved = await p.textContent('body');
  ok('the particulars are saved and shown back',
     saved.includes('9822011223') && saved.includes('MH/BAN/1234567')
     && saved.includes('3100123456') && saved.includes('2025-06-01'));
  // The IFSC lives in the form field, not in the printed summary, so read it
  // from the field rather than from the page text.
  ok('an IFSC typed in lower case is stored in upper',
     (await p.inputValue('#particulars input[name=bank_ifsc]')) === 'SBIN0001234');
  ok('the record says the particulars were saved', saved.includes('particulars have been saved'));

  // A date of joining in the future is a typo, not a fact.
  const future = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const bad = await p.evaluate(async (d) => {
    const f = document.querySelector('#particulars');
    const fd = new FormData(f);
    fd.set('date_of_joining', d);
    const r = await fetch(f.action, { method: 'POST', body: new URLSearchParams(fd) });
    return { status: r.status, text: await r.text() };
  }, future);
  ok('a joining date in the future is refused',
     bad.status === 400 && /cannot be in the future/.test(bad.text));

  // Moving a person between sites is a contract event, not a correction.
  const fields = await p.$$eval('#particulars [name]', els => els.map(e => e.name));
  ok('the form cannot move a person to another running room or post',
     !fields.includes('running_room_id') && !fields.includes('designation_id')
     && !fields.includes('contractor_id') && !fields.includes('screening_status'));
  await ctx.close();
}

{
  const { ctx, p } = await signIn('div_officer');
  await p.goto('http://localhost:3177/staff');
  const href = await p.$eval('table.tbl tbody a[href*="/staff/"]', a => a.getAttribute('href'));
  await p.goto('http://localhost:3177' + href);
  ok('the divisional officer sees the gaps but is not offered the form',
     (await p.textContent('body')).includes('not on record') && !(await p.$('#particulars')));
  await ctx.close();
}

{
  const { ctx, p } = await signIn('hq');
  await p.goto('http://localhost:3177/staff');
  const href = await p.$eval('table.tbl tbody a[href*="/staff/"]', a => a.getAttribute('href'));
  await p.goto('http://localhost:3177' + href);
  ok('HQ is not offered the form either', !(await p.$('#particulars')));
  await ctx.close();
}

/* ------------------------------------------------------- camera capture
 * The document upload and the passport photograph can both be taken with the
 * machine's own camera. Driven here against a fake device so the whole path is
 * exercised: shutter, review, and the picture reaching the server as a file.
 * -------------------------------------------------------------------- */
{
  const { ctx, p } = await signIn('rr_incharge');
  await ctx.grantPermissions(['camera'], { origin: 'http://localhost:3177' });
  await p.goto('http://localhost:3177/staff');
  const href = await p.$eval('table.tbl tbody a[href*="/staff/"]', a => a.getAttribute('href'));
  await p.goto('http://localhost:3177' + href);

  // Whether or not this person already has one, the slot and the control are
  // there -- a photograph can always be replaced.
  const hasSlot = await p.$('#photoform');
  ok('every person carries a photograph slot with a way to fill it', !!hasSlot);

  const shutterButtons = await p.$$eval('button', els =>
    els.map(e => e.textContent.trim()).filter(t => /Take the photograph|Photograph the paper/.test(t)));
  ok('the camera is offered for both the photograph and the documents',
     shutterButtons.length === 2);

  await p.click('button:has-text("Take the photograph")');
  await p.waitForSelector('video', { timeout: 10000 });
  await p.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && v.videoWidth > 0;
  }, { timeout: 15000 });
  ok('the camera starts and shows a live picture', true);

  await p.click('button:has-text("Take the picture")');
  await p.waitForSelector('button:has-text("Use this picture")', { timeout: 10000 });
  ok('the picture can be reviewed before it is used',
     (await p.textContent('body')).includes('Check it reads clearly'));

  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Use this picture")')]);
  const after = await p.textContent('body');
  ok('the photograph taken on the machine is stored against the person',
     !after.includes('No photograph') && after.includes('Passport photograph'));
  ok('the stored photograph is shown on the record',
     !!(await p.$('img[alt^="Photograph of"]')));

  // And the same control on the document form, which must NOT submit on its
  // own -- the officer still has to say which document it is.
  await p.click('button:has-text("Photograph the paper")');
  await p.waitForSelector('video', { timeout: 10000 });
  await p.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && v.videoWidth > 0;
  }, { timeout: 15000 });
  await p.click('button:has-text("Take the picture")');
  await p.click('button:has-text("Use this picture")');
  await p.waitForTimeout(300);
  ok('a photographed document waits for its type to be chosen rather than posting itself',
     (await p.textContent('body')).includes('Ready to upload:'));

  // Take a second photograph. There is one likeness of a person, not a series,
  // so this must replace the first rather than stack another row beside it.
  await p.click('button:has-text("Take the photograph")');
  await p.waitForSelector('video', { timeout: 10000 });
  await p.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && v.videoWidth > 0;
  }, { timeout: 15000 });
  await p.click('button:has-text("Take the picture")');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Use this picture")')]);
  const twice = await p.$$eval('table.tbl tbody tr', els =>
    els.filter(r => /Passport photograph/.test(r.textContent)).length);
  ok('taking the photograph again replaces it rather than adding another row', twice === 1);

  // And pressing Upload with nothing chosen must not leave an empty record.
  const empty = await p.evaluate(async () => {
    const fd = new FormData();
    fd.append('doc_type', 'photograph');
    const r = await fetch(document.querySelector('#photoform').action,
      { method: 'POST', body: fd });
    return { status: r.status, text: await r.text() };
  });
  // A photograph off a phone is routinely several megabytes. Rejecting that
  // with "the request could not be completed" is what makes a supervisor give
  // up on the screen, so the limit and the message both have to be right.
  const big = await p.evaluate(async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024);
    bytes.set([0xFF, 0xD8, 0xFF, 0xE0]);                 // a JPEG, as far as the check goes
    const fd = new FormData();
    fd.append('doc_type', 'photograph');
    fd.append('scan', new File([bytes], 'phone.jpg', { type: 'image/jpeg' }));
    const r = await fetch(document.querySelector('#photoform').action,
      { method: 'POST', body: fd });
    return r.status;
  });
  ok('a nine-megabyte photograph from a phone is accepted', big < 400);

  const huge = await p.evaluate(async () => {
    const bytes = new Uint8Array(25 * 1024 * 1024);
    bytes.set([0xFF, 0xD8, 0xFF, 0xE0]);
    const fd = new FormData();
    fd.append('doc_type', 'photograph');
    fd.append('scan', new File([bytes], 'huge.jpg', { type: 'image/jpeg' }));
    const r = await fetch(document.querySelector('#photoform').action,
      { method: 'POST', body: fd });
    return { status: r.status, text: await r.text() };
  });
  ok('something genuinely too large is refused with the size and what to do',
     huge.status === 400 && /larger than \d+ MB/.test(huge.text));

  await p.reload();

  // The screen must make the mistake impossible, not merely report it: with no
  // picture chosen the upload button is not pressable at all.
  const guard = await p.$eval('#photoupload', b => b.disabled);
  ok('the photograph button cannot be pressed until a picture is chosen', guard === true);
  await p.setInputFiles('#photoform input[name=scan]', 'test/fixture.jpg');
  const freed = await p.$eval('#photoupload', b => b.disabled);
  ok('choosing a picture enables it', freed === false);
  await Promise.all([p.waitForNavigation(), p.click('#photoupload')]);
  ok('and that upload is accepted',
     !(await p.textContent('body')).includes('No picture was attached'));
  await p.reload();

  ok('uploading a photograph with no picture chosen is refused, not recorded',
     empty.status === 400 && /No picture was attached/.test(empty.text));
  await p.reload();
  const stillOne = await p.$$eval('table.tbl tbody tr', els =>
    els.filter(r => /Passport photograph/.test(r.textContent)).length);
  ok('the refused upload left no empty photograph record behind', stillOne === 1);

  // The photograph must not be offered here as well as in its own box. Two
  // ways to do one thing meant a person could pick it in the Documents list,
  // type a reference, and be refused for not attaching a picture -- while the
  // picture box sat elsewhere on the screen.
  const docTypes = await p.$$eval('#docform select[name=doc_type] option', els =>
    els.map(e => e.value));
  ok('the photograph is not offered twice on the same page',
     !docTypes.includes('photograph') && docTypes.includes('police_verification'));

  // And a certificate recorded before its scan arrives is still allowed.
  await p.selectOption('#docform select[name=doc_type]', 'medical_fitness');
  await p.fill('#docform input[name=reference_no]', 'MED/2026/771');
  await Promise.all([p.waitForNavigation(), p.click('#docform button[type=submit]')]);
  const noScan = await p.textContent('body');
  ok('a certificate can be recorded before its scan arrives',
     noScan.includes('MED/2026/771') && !noScan.includes('No picture was attached'));

  await p.selectOption('select[name=doc_type]', 'police_verification');
  await p.fill('input[name=reference_no]', 'PV/2026/0912');
  await Promise.all([p.waitForNavigation(), p.click('#docform button[type=submit]')]);
  const docs = await p.textContent('body');
  ok('a police verification photographed at the site reaches the register',
     docs.includes('Police verification') && docs.includes('PV/2026/0912'));
  await ctx.close();
}

/* --------------------------------------------- the scoped logins agree
 * The RR in-charge and the contractor supervisor must be looking at the same
 * running room. Binding the supervisor to whichever contractor happened to be
 * first in the file meant a person approved on one screen read as pending on
 * the other -- with nothing to show the two were different sites.
 * -------------------------------------------------------------------- */
{
  const a = await signIn('rr_incharge');
  const b = await signIn('contractor_sup');
  const rooms = async (p) => {
    await p.goto('http://localhost:3177/staff');
    return p.$$eval('select[name=rr] option', els =>
      els.map(e => e.textContent.trim()).filter(t => t && !/All/i.test(t)));
  };
  // In the ordinary demo these two are deliberately at different sites, to
  // show scoping working. What must hold everywhere is that each has a scope
  // at all -- an empty one looks like a fault and sends people hunting.
  ok('every scoped login has a running room to work in',
     (await rooms(a.p)).length > 0 && (await rooms(b.p)).length > 0);

  // And the same person reads the same on both screens.
  await a.p.goto('http://localhost:3177/staff');
  const href = await a.p.$eval('table.tbl tbody a[href*="/staff/"]', x => x.getAttribute('href'));
  await a.p.goto('http://localhost:3177' + href);
  await b.p.goto('http://localhost:3177' + href);
  const nameOf = p => p.$eval('.pagetitle, [style*="font-size:22px"]', e => e.textContent.trim())
    .catch(() => null);
  ok('the same record shows the same person to both',
     (await nameOf(a.p)) === (await nameOf(b.p)));
  const cleared = p => p.textContent('body').then(t => /Cleared for deployment/.test(t));
  ok('and the same screening position to both', (await cleared(a.p)) === (await cleared(b.p)));
  await a.ctx.close(); await b.ctx.close();
}

{
  // The pilot binds both scoped logins to one site on purpose. This is the
  // thing that broke: the supervisor was taken from the top of the contractor
  // list, so reordering that file moved him to another running room.
  const pilot = spawn('node', ['demo/server.js'],
    { env: { ...process.env, PORT: '3178', DEMO_PILOT: '1', DEMO_TEST_DATA: '1' }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 2500));
  const roomsFor = async (user) => {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.goto('http://localhost:3178/login');
    await p.fill('#username', user); await p.fill('#password', 'demo');
    await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
    await p.goto('http://localhost:3178/staff');
    const list = await p.$$eval('select[name=rr] option',
      els => els.map(e => e.textContent.trim()).filter(t => t && !/All/i.test(t)));
    const count = (await p.$$('table.tbl tbody a[href*="/staff/"]')).length;
    await ctx.close();
    return { list, count };
  };
  const inc = await roomsFor('rr_incharge');
  const sup = await roomsFor('contractor_sup');
  ok('in the pilot both scoped logins sit at the same running room',
     inc.list.length === 1 && JSON.stringify(inc.list) === JSON.stringify(sup.list));
  ok('and therefore see the same people', inc.count === sup.count && inc.count > 0);
  pilot.kill();
}

/* --------------------------------------------------------------- the muster
 * The most repeated act in the system: thirty names a day, by the person
 * least at ease with a computer. Everyone present in one click, tap buttons
 * rather than dropdowns, a search for the exceptions, and the people who were
 * not present yesterday marked out.
 * -------------------------------------------------------------------- */
{
  const { ctx, p } = await signIn('contractor_sup');
  // An earlier test counter-signs today, which correctly makes the muster
  // read-only. Work on a day that has not been signed.
  const day = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await p.goto('http://localhost:3177/records/muster?date=' + day);

  ok('attendance is marked with tap buttons, not a dropdown per person',
     (await p.$$('#mustertable .mark')).length > 0
     && (await p.$$('select[name^="s_"]')).length === 0);

  const rows = (await p.$$('#mustertable tbody tr')).length;
  await p.click('#allpresent');
  const marked = await p.$$eval('#mustertable input[type=radio][value=present]:checked',
    els => els.length);
  ok('one click marks the whole roster present', marked > 0 && marked <= rows);
  ok('and the count says nothing is left to mark',
     /none left to mark/.test(await p.textContent('#mustercount')));

  // Change one person, the way a supervisor marks an exception.
  const first = await p.$('#mustertable tbody tr input[type=radio][value=absent]');
  await first.check();
  const tally = await p.textContent('#mustercount');
  ok('marking one absent is a single tap and the count follows',
     /\babsent\b/.test(tally) && /present/.test(tally), tally);

  // The search is how he finds that one person among thirty.
  const name = await p.$eval('#mustertable tbody tr[style]:not([style=""]) a, #mustertable tbody tr a',
    a => a.textContent.trim());
  await p.fill('#mustersearch', name.split(' ')[0]);
  const shown = await p.$$eval('#mustertable tbody tr',
    els => els.filter(r => r.style.display !== 'none').length);
  ok('the search narrows the roster to the person being looked for',
     shown > 0 && shown < rows);
  await p.fill('#mustersearch', '');

  await Promise.all([p.waitForNavigation(), p.click('#musterform button[type=submit]')]);
  ok('the muster saves', !(await p.textContent('body')).includes('Something went wrong'));
  await ctx.close();
}

{
  // Yesterday's absentees are the people the supervisor has to look for today.
  const pilot = spawn('node', ['demo/server.js'],
    { env: { ...process.env, PORT: '3179', DEMO_PILOT: '1', DEMO_TEST_DATA: '1' }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 2500));
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto('http://localhost:3179/login');
  await p.fill('#username', 'contractor_sup'); await p.fill('#password', 'demo');
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);

  // Mark yesterday first, with one person absent.
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await p.goto('http://localhost:3179/records/muster?date=' + y);
  await p.click('#allpresent');
  const abs = await p.$('#mustertable tbody tr input[type=radio][value=absent]');
  await abs.check();
  await Promise.all([p.waitForNavigation(), p.click('#musterform button[type=submit]')]);

  await p.goto('http://localhost:3179/records/muster');
  const body = await p.textContent('body');
  ok('today\'s muster says how many were not present yesterday',
     /not present yesterday/.test(body));
  // The unscreened person is posted as absent too, so more than one row can
  // legitimately be flagged; what matters is that they are flagged at all.
  const watched = (await p.$$('#mustertable tbody tr[data-watch="1"]')).length;
  ok('and those rows are marked out', watched >= 1);

  await p.check('#onlywatch');
  const visible = await p.$$eval('#mustertable tbody tr',
    els => els.filter(r => r.style.display !== 'none').length);
  ok('and can be shown on their own, so nobody is hunted for down a long list',
     visible === watched && visible > 0);
  await ctx.close();
  pilot.kill();
}

/* ------------------------------------------ the month on a person's record */
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/staff');
  const href = await p.$eval('table.tbl tbody a[href*="/staff/"]', a => a.getAttribute('href'));
  await p.goto('http://localhost:3177' + href);

  const body = await p.textContent('body');
  ok('a person carries their month of attendance', /Attendance —/.test(body));
  const cells = await p.$$eval('[title*="—"]', els =>
    els.filter(e => /^\d{4}-\d{2}-\d{2}/.test(e.getAttribute('title'))).length);
  ok('the month is laid out a day at a time', cells >= 28 && cells <= 31);
  ok('a day with no mark is called that, not treated as a day off',
     /not a day off/.test(body) || /No muster has been marked/.test(body));

  // The previous month is one click away.
  const prev = await p.$eval('a[href*="?month="]', a => a.getAttribute('href'));
  await p.goto('http://localhost:3177' + prev);
  ok('the month before can be looked at', /Attendance —/.test(await p.textContent('body')));
  await ctx.close();
}

// screenshots for the user
/* ---------------------------------------------------------- stage 15 ----- */
// Accounts. Until now a login was created with a SQL statement and its password
// came out of somebody's terminal; neither is a thing to hand a divisional
// office.
{
  const { ctx, p } = await signIn('sysadmin');
  await p.goto('http://localhost:3177/account/users');
  const body = await p.textContent('body');
  ok('the administrator has a screen for accounts', body.includes('Accounts'));
  ok('and every account shows what it can reach, not just what it may do',
     body.includes('Reach'));

  // Scope is not decoration. A role that must be scoped and is not does not
  // see nothing -- it sees whatever each query happens to allow.
  await p.selectOption('form[action$="/account/users"] select[name=role_code]', 'rr_incharge');
  await p.waitForTimeout(200);
  ok('choosing a role shows only the scope box that role needs',
     await p.isVisible('form[action$="/account/users"] [data-scope=running_room_id]')
     && !(await p.isVisible('form[action$="/account/users"] [data-scope=contractor_id]')));

  const NEWFORM = 'form[action$="/account/users"]';
  await p.fill(`${NEWFORM} input[name=username]`, 'igp.incharge');
  await p.fill(`${NEWFORM} input[name=full_name]`, 'Test In-charge');
  await p.selectOption(`${NEWFORM} select[name=running_room_id]`,
    await p.$eval(`${NEWFORM} select[name=running_room_id] option:nth-child(2)`, o => o.value));
  await Promise.all([p.waitForNavigation(),
    p.click('button:has-text("Create the account")')]);
  const after = await p.textContent('body');
  ok('a new account is created and its password shown once', after.includes('igp.incharge'));
  ok('and it is said plainly that the password cannot be shown again',
     after.includes('cannot be shown again'));
  ok('the new account is marked as not having chosen a password yet',
     after.includes('Has not chosen a password'));
  await ctx.close();
}

// A password issued by somebody else is a password two people know.
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/account/password');
  ok('anybody can change their own password', (await p.textContent('body')).includes('Change your password'));
  await p.fill('input[name=current]', 'demo');
  await p.fill('input[name=fresh]', 'password123');
  await p.fill('input[name=again]', 'password123');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Change it")')]);
  ok('an obvious password is refused',
     (await p.textContent('body')).includes('first passwords anybody would try'));
  await ctx.close();
}

// The reliever, as the Railway settled it on 18.08.2026: from within the roster,
// and he has to say whose post he covered.
{
  const { ctx, p } = await signIn('contractor_sup');
  // Today's muster at this room was counter-signed earlier in this run and can
  // no longer be edited -- correctly. Use a day that is still open.
  const OPENDAY = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await p.goto(`http://localhost:3177/records/muster?rr=${MUSTER_RR}&date=${OPENDAY}`);
  ok('the muster offers Reliever as a mark', (await p.textContent('#mustertable')).includes('Reliever'));

  const ids = await p.$$eval('#mustertable input[type=radio][value=present]',
    els => els.slice(0, 2).map(e => e.name.slice(2)));
  if (ids.length >= 2) {
    // Start from a clean sheet: everyone present, so nobody is away and the
    // box has to say so rather than offering a list of people who are standing
    // in the room.
    await p.click('#allpresent');
    await p.check(`input[name=s_${ids[0]}][value=reliever]`);
    await p.waitForTimeout(250);
    ok('marking Reliever asks whose post he covered',
       await p.isVisible(`.relieverbox[data-for="${ids[0]}"]`));
    ok('and with nobody marked away it says to mark the absence first',
       (await p.textContent(`.relieverbox[data-for="${ids[0]}"]`)).includes('mark the absence first'));

    await p.check(`input[name=s_${ids[1]}][value=absent]`);
    await p.waitForTimeout(250);
    const offered = await p.$$eval(`.relieverbox[data-for="${ids[0]}"] option`,
      os => os.filter(o => o.value && !o.hidden).map(o => o.value));
    const away = await p.$$eval('#mustertable input[type=radio]:checked',
      els => els.filter(e => e.value === 'absent' || e.value === 'leave').map(e => e.name.slice(2)));
    ok('only the people actually marked away today are offered',
       offered.length === away.length && offered.every(o => away.indexOf(o) !== -1));
    ok('and a man standing in the room cannot be recorded as having been relieved',
       offered.indexOf(ids[0]) === -1 && offered.length > 0);

    // Pressing Save without choosing must be stopped in the browser, on the
    // field, with the muster still on screen -- not by the server after ninety
    // marks have been thrown away.
    // One absence can be covered once. Two men naming the same absentee would
    // read as two present against one vacant post.
    await p.selectOption(`.relieverbox[data-for="${ids[0]}"] select`, ids[1]);
    await p.waitForTimeout(300);
    const others = await p.$$eval('#mustertable input[type=radio][value=present]',
      els => els.map(e => e.name.slice(2)));
    const third = others.find(x => x !== ids[0] && x !== ids[1]);
    await p.check(`input[name=s_${third}][value=reliever]`);
    await p.waitForTimeout(400);
    ok('an absence already covered is not offered to a second reliever',
       (await p.$$eval(`.relieverbox[data-for="${third}"] option`,
         os => os.filter(o => o.value && !o.hidden).length)) === 0);
    ok('and the box says why rather than looking merely empty',
       (await p.textContent(`.relieverbox[data-for="${third}"]`))
         .includes('already shown as covered'));
    await p.check(`input[name=s_${third}][value=present]`);
    await p.waitForTimeout(200);

    // What was saved must come back on the next load, or the supervisor cannot
    // tell a recorded substitution from one that quietly failed to record.
    await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save muster")')]);
    await p.waitForTimeout(300);
    ok('the man relieved is still shown after saving',
       (await p.$eval(`.relieverbox[data-for="${ids[0]}"] select`, el => el.value)) === ids[1]);

    // Clear the choice to prove the guard, then press Save.
    await p.selectOption(`.relieverbox[data-for="${ids[0]}"] select`, '');
    await p.waitForTimeout(200);
    ok('the box is required once it is showing',
       await p.$eval('.relieverbox select:not([disabled])', el => el.required === true));
    await p.click('button:has-text("Save muster")');
    await p.waitForTimeout(600);
    ok('saving without naming the man is stopped before the muster is lost',
       p.url().indexOf('records/muster') > -1
       && await p.$eval('.relieverbox select:not([disabled])', el => el.checkValidity() === false));

    // The server must enforce it too, not merely the browser.
    await p.evaluate(d => { window.__openDay = d; }, OPENDAY);
    const refused = await p.evaluate(async ([rr, a, b]) => {
      const body = new URLSearchParams({ rr, date: window.__openDay });
      body.set('s_' + a, 'reliever'); body.set('s_' + b, 'absent');   // no r_ field at all
      const r = await fetch('/records/muster', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      return r.status;
    }, [String(MUSTER_RR), ids[0], ids[1]]);
    ok('a reliever naming nobody is refused by the server, not only by the form', refused === 400);
  }
  await ctx.close();
}

// Linen stock. The table has existed since stage 6 with no screen, so no figure
// had ever been entered into it.
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto(`http://localhost:3177/records/linen-stock?rr=${MUSTER_RR}`);
  const body = await p.textContent('body');
  ok('linen is counted by item, not as one number', body.includes('Pillow covers')
     && body.includes('Mosquito nets') && body.includes('Blankets'));
  ok('what the room can still put on a bed is shown', body.includes('On hand'));
  ok('and linen issued but neither held nor written off is called out',
     body.includes('unaccounted') || body.includes('accounted for'));

  await p.fill('input[name=bedsheet_issued]', '400');
  await p.fill('input[name=bedsheet_service]', '250');
  await p.fill('input[name=bedsheet_laundry]', '80');
  await p.fill('input[name=bedsheet_condemned]', '20');
  await p.fill('input[name=bedsheet_lost]', '5');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the count")')]);
  const saved = await p.textContent('body');
  ok('a count is saved', saved.includes('330'));           // 250 in service + 80 at laundry
  ok('and the discrepancy is worked out rather than left to be noticed',
     saved.includes('45 unaccounted'));                    // 400 - 20 - 5 - 330
  await ctx.close();
}

// The train the crew was called for, from the division's own train master.
// A number typed at four in the morning becomes 12345, 1234 and 12435 for one
// service, and then no pattern of late calls can be attributed to a train.
{
  const { ctx, p } = await signIn('contractor_sup');
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}`);
  ok('the train box is wired to the division train list',
     !!(await p.getAttribute('#trainpick', 'data-search')));
  await p.fill('input[form="radd"][name=train_no]', '910');
  await p.waitForTimeout(700);
  const opts = await p.$$('#trainpick div[style*="cursor:pointer"]');
  ok('typing part of a number offers trains', opts.length > 0);
  ok('and each carries its name and where it runs between',
     (await p.textContent('#trainpick')).includes('–'));
  await opts[0].click();
  await p.waitForTimeout(200);
  const chosen = await p.inputValue('input[form="radd"][name=train_no]');
  ok('choosing one puts the number alone into the record — not the name',
     /^\d+$/.test(chosen));
  ok('while the name is confirmed beside the box',
     (await p.textContent('#trainnote')).length > 5);

  // A special or one-off working is on no master, and must not be blocked.
  await p.fill('input[form="radd"][name=train_no]', '00999');
  await p.waitForTimeout(700);
  ok('a train on no master is called normal, not an error',
     (await p.textContent('#trainnote')).includes('Specials'));

  // Record a call so the meals list has somebody in the room.
  await p.fill('input[form="radd"][name=n_LP]', 'Meal Test Crew');
  await p.fill('input[form="radd"][name=received]', '05:00');
  await Promise.all([p.waitForNavigation(), p.click('button[form="radd"]')]);

  // ---- meals: one tick per crew per service
  await p.goto(`http://localhost:3177/records/meals?rr=${MUSTER_RR}`);
  const mealBody = await p.textContent('body');
  ok('the meals list builds itself from the call book',
     (await p.$$('#mealstable tbody tr')).length > 0);
  ok('the Schedule B ceilings are printed beside the counts',
     mealBody.includes('37.80') && mealBody.includes('62.37'));
  ok('and their source is named, so a disputed figure is settled by reading it',
     mealBody.includes('L.326.OP.RR Lobby/08'));
  ok('no rupee amount is computed anywhere on the page',
     !/₹\s?[\d,]{4,}/.test(mealBody));

  await p.click('[data-mealall="breakfast"]');
  await p.waitForTimeout(200);
  ok('a whole service is ticked in one press',
     +(/(\d+) breakfast/.exec(await p.textContent('#mealcount')) || [0, 0])[1] > 0);
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the meals")')]);
  ok('the meals save', await p.isChecked('input[data-meal=breakfast]'));
  ok('and the day\'s count follows',
     (await p.textContent('body')).includes('Breakfast today'));

  // A meal ticked by mistake has to be correctable, or the count is
  // unarguable in the wrong direction.
  await p.uncheck('input[data-meal=breakfast]');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the meals")')]);
  ok('clearing a tick removes the meal', !(await p.isChecked('input[data-meal=breakfast]')));
  await ctx.close();
}

// CCTV — a contract obligation nothing recorded until now.
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/facility/cctv');
  const body = await p.textContent('body');
  ok('the CCTV register exists', body.includes('Cover by place'));
  ok('cover is judged by place, not by a count of cameras',
     body.includes('one working camera covers a place'));

  // "Looked at" is separate from "working": a camera nobody examined must not
  // acquire a state.
  ok('a camera not looked at is left alone',
     (await p.textContent('#cctvcount')).indexOf('0 of') === 0);
  const before = await p.$eval('[data-work]', el => el.disabled);
  ok('and its working state cannot be set until it is', before === true);

  await p.click('#cctvallwork');
  await p.waitForTimeout(300);
  ok('one press marks the ordinary case — all looked at, working, recording',
     !(await p.$eval('[data-work]', el => el.disabled)));
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the check")')]);
  ok('the check saves', (await p.textContent('body')).includes('Working and recording'));

  // A camera that is not working cannot be recording. (The page comes back
  // with nothing ticked -- yesterday's check is not tomorrow's -- so the box
  // has to be ticked again first.)
  await p.check('input[data-seen]');
  await p.waitForTimeout(200);
  await p.selectOption('[data-work]', '0');
  await p.waitForTimeout(200);
  ok('a dead camera cannot be shown as recording',
     await p.$eval('[data-rec]', el => el.value === '0' && el.disabled));

  await p.selectOption('select[name=zone]', 'store');
  await p.fill('input[name=label]', 'Store room door');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Add it to the register")')]);
  ok('a camera can be registered', (await p.textContent('body')).includes('Store room door'));

  // Taking a camera OFF reduces the contractor's cover. That is the Railway's.
  ok('the running room cannot take a camera off the register',
     !(await p.$('button:has-text("Take off")')));
  ok('and no camera address or live picture is carried anywhere',
     !/rtsp:|<video/.test(await p.content()));
  await ctx.close();
}
{
  const { ctx, p } = await signIn('div_officer');
  await p.goto('http://localhost:3177/facility/cctv');
  ok('the divisional officer can take a camera off the register',
     !!(await p.$('button:has-text("Take off")')));
  ok('but must say why', await p.$eval('input[name=retired_reason]', el => el.required === true));
  await ctx.close();
}

// Washing at a source the Railway has not approved is a clause C1 breach in
// its own right. It was marked on each row; the count is what carries.
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/facility/laundry');
  const l = await p.textContent('body');
  ok('non-approved washing is counted, not just marked on the row',
     l.includes('Washed at a non-approved source'));
  ok('and the clause is named rather than left to be looked up',
     l.includes('C1'));
  await ctx.close();
}

/* -------- stage 18: the five half-built parts of the schema -------------- */

// 1. The weekly and monthly deficiency clauses. All 50 were seeded and only the
// daily ones could ever be recorded, so twelve monthly clauses and two weekly
// ones were unreachable from any screen.
{
  const { ctx, p } = await signIn('div_officer');
  await p.goto('http://localhost:3177/deficiencies/review?period=monthly');
  const codes = await p.$$eval('#reviewtable tbody tr td:first-child b', els => els.map(e => e.textContent));
  ok('the monthly clauses can be reached at all', codes.length > 0);
  ok('and all twelve M clauses are there',
     ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'].every(c => codes.includes(c)));
  ok('M10 gives an unnamed irregularity a home rather than forcing the wrong clause',
     codes.includes('M10'));
  ok('the grading clauses are absent — they are computed from feedback, not ticked',
     !codes.some(c => c.startsWith('G')));

  await p.click('#allcomplied');
  await p.waitForTimeout(200);
  ok('everything complied in one press', (await p.textContent('#reviewcount')).includes('all complied'));
  const names = await p.$$eval('#reviewtable input[type=radio][value=not_complied]', els => els.map(e => e.name));
  await p.check(`input[name="${names[2]}"][value=not_complied]`);
  await p.fill(`input[name="o_${names[2].slice(2)}"]`, 'Flower pots dry, lawn not cut');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the review")')]);
  ok('a monthly deficiency is raised',
     (await p.$$eval('#reviewtable input[value=not_complied]:checked', e => e.length)) === 1);
  await p.goto('http://localhost:3177/deficiencies');
  ok('and reaches the consolidated register', (await p.textContent('body')).includes('Flower pots dry'));
  await p.goto('http://localhost:3177/deficiencies/review?period=weekly');
  const wk = await p.$$eval('#reviewtable tbody tr td:first-child b', els => els.map(e => e.textContent));
  ok('the two weekly clauses are reachable too', wk.includes('D3') && wk.includes('D4'));
  await ctx.close();
}

// 2. Vendor approval. `is_approved` has been read since stage 6 and nothing
// could ever set it.
{
  const { ctx, p } = await signIn('div_officer');
  await p.goto('http://localhost:3177/masters/vendors');
  ok('vendors can be administered', (await p.textContent('body')).includes('Washing centres and operators'));
  await p.selectOption('select[name=vendor_type]', 'laundry');
  await p.fill('input[name=name]', 'Check Washing Centre');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Add — unapproved")')]);
  const list = await p.textContent('body');
  ok('a new vendor is created unapproved', list.includes('Check Washing Centre')
     && list.includes('Never approved'));

  await p.click('a:has-text("Check Washing Centre")');
  await p.waitForLoadState('load');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Approve")')]);
  ok('it can be approved', (await p.textContent('body')).includes('Approved on'));

  await p.selectOption('select[name=result]', 'unfit');
  await p.fill('textarea[name=observations]', 'Drains open into the wash area');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Record the inspection")')]);
  const after = await p.textContent('body');
  ok('a premises inspection is recorded with its finding', after.includes('Drains open'));
  ok('and found unfit, the approval goes with the finding', after.includes('Approval withdrawn'));
  await ctx.close();
}
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/masters/vendors');
  ok('the running room can see the vendors but not approve one',
     !(await p.$('button:has-text("Add — unapproved")')));
  await ctx.close();
}

// 3. The joint asset register and the three-monthly check.
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/facility/assets');
  ok('an asset can be put on the register', !!(await p.$('button:has-text("Add it")')));
  await p.fill('input[name=name]', 'Check Geyser 25 l');
  await p.fill('input[name=quantity]', '4');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Add it")')]);
  ok('and it appears', (await p.textContent('body')).includes('Check Geyser 25 l'));

  // A check that is not joint proves nothing, so the contractor's man is required.
  ok('the contractor\'s representative is required',
     await p.$eval('input[name=contractor_rep]', el => el.required === true));
  await p.fill('input[name=contractor_rep]', 'Shri A. Kadam');
  await p.click('#assetallseen');
  await p.waitForTimeout(200);
  const first = (await p.$$eval('input[data-aseen]', els => els.map(e => e.dataset.aseen)))[0];
  await p.fill(`input[data-afound="${first}"]`, '0');
  await p.selectOption(`select[data-acond="${first}"]`, 'missing');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the joint check")')]);
  const done = await p.textContent('body');
  ok('the joint check saves and counts what was short', done.includes('short or missing'));
  ok('the history names the contractor\'s man', done.includes('Shri A. Kadam'));
  ok('and the overdue warning clears once a check exists',
     !done.includes('never been jointly checked'));
  await ctx.close();
}

// 4. Staff grading — the Concept Note's retain and bar lists.
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/staff/grading');
  const g = await p.textContent('body');
  ok('staff can be graded', g.includes('Grading —'));
  ok('the occupant rating and attendance are computed, not asked for',
     g.includes('Occupants said') && g.includes('Attendance'));

  const ids = await p.$$eval('#gradetable input[type=radio][value=replace]', els => els.map(e => e.name));
  await p.check(`input[name="${ids[0]}"][value=replace]`);
  await p.fill(`input[name="m_${ids[0].slice(2)}"]`, 'Repeated complaints on behaviour');
  await p.check(`input[name="${ids[1]}"][value=retain]`);
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the grading")')]);
  const after = await p.textContent('body');
  ok('a replace recommendation produces the list the Railway acts on',
     after.includes('recommended for replacement'));
  ok('and the screen states that no replacement penalty follows from it',
     after.includes('replacement penalty is not imposed'));
  ok('a man nobody graded is left ungraded rather than defaulted to retain',
     (await p.$$eval('#gradetable input[type=radio]:checked', e => e.length)) === 2);
  await ctx.close();
}
{
  const { ctx, p } = await signIn('contractor_sup');
  await p.goto('http://localhost:3177/staff/grading');
  ok('the contractor cannot grade his own men',
     !(await p.$('button:has-text("Save the grading")')));
  await ctx.close();
}

// 5. Bills, and the eleven documents.
{
  const { ctx, p } = await signIn('div_officer');
  await p.goto('http://localhost:3177/bills');
  ok('a bill can be raised', !!(await p.$('button:has-text("Raise it")')));
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Raise it")')]);
  const b = await p.textContent('body');
  ok('the eleven documents are created with it, not built by hand',
     (await p.$$('input[name=doc_type]')).length === 11);
  ok('the tender\'s own eleven, including the staff list with bank details',
     b.includes('bank details') && b.includes('Shramik Kalyan') && b.includes('GST challan'));
  ok('the due date is the end of the following month, as clause D6 reckons it',
     b.includes('Due by'));

  const refused = await p.evaluate(async () => {
    const f = new URLSearchParams({ status: 'passed' });
    const r = await fetch(location.pathname + '/status', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: f.toString() });
    return r.status;
  });
  ok('it cannot be passed while a required document is awaited', refused === 400);

  await p.fill('input[name=gross_schedule_a]', '100000');
  await p.fill('input[name=gross_schedule_b]', '25000');
  await p.fill('input[name=submitted_on]', '2026-08-05');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the figures")')]);
  const fig = await p.textContent('body');
  ok('the gross is added up rather than typed', fig.includes('1,25,000'));
  ok('and no deduction is computed', fig.includes('nothing computed'));
  await ctx.close();
}
{
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto('http://localhost:3177/bills');
  ok('the RR in-charge may prepare a bill', !!(await p.$('button:has-text("Raise it")')));
  await ctx.close();
}

// ---- stage 19: the signed feedback register -------------------------------
// The tender puts the grading penalty on the average of feedback taken from at
// least 50% of the occupants, on a physical register signed by the occupant.
// QR feedback is unsigned, so it cannot be what a deduction rests on; these
// checks are about keeping the two counts apart and making the floor bite.
{
  const { ctx, p } = await signIn('div_officer');
  await p.goto('http://localhost:3177/feedback/register');
  ok('the signed register opens for the divisional officer', p.url().includes('/feedback/register'));
  const reg = await p.textContent('body');
  ok('it says the register is the signed one and QR is not',
     reg.includes('signed by the occupant'));

  const rrId = await p.getAttribute('input[name=rr]', 'value');
  const month = await p.getAttribute('input[name=month]', 'value');

  // a line that names a man but carries no rating is a keying slip, and the
  // whole page must be refused rather than half of it saved
  await p.fill('input[name=n_0]', 'GHOST ENTRY');
  const refused = await p.evaluate(async () => {
    const f = document.getElementById('regform');
    const r = await fetch(f.action, { method: 'POST', body: new FormData(f) });
    return { status: r.status, body: await r.text() };
  });
  ok('a named but unrated line is refused', refused.status === 400);
  ok('and the refusal says nothing was saved', /NOT been saved|Nothing has been saved/.test(refused.body));

  await p.goto('http://localhost:3177/feedback/register');
  await p.fill('input[name=register_page_no]', '47');
  for (const [i, [n, c, l]] of [['A K SHARMA','4','5'],['B N RAO','3','3.5'],
                                ['C D PATIL','2','2'],['D E KADAM','5','4.5']].entries()) {
    await p.fill(`input[name=n_${i}]`, n);
    await p.fill(`input[name=cleanliness_${i}]`, c);
    await p.fill(`input[name=linen_${i}]`, l);
    const food = await p.$(`input[name=food_${i}]`);
    if (food) await food.fill('4');
  }
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save the page")')]);
  const after = await p.textContent('body');
  ok('a page of four signed entries saves', /4<\/b> signed entries|4 signed entries/.test(after));
  ok('the occupants are listed back', after.includes('A K SHARMA'));
  ok('the register page number is kept against them', after.includes('47'));
  ok('an unsaved blank line is not stored as zeroes', !after.includes('GHOST ENTRY'));

  // the occupancy figure is the denominator, and entering it must move the
  // stored coverage — this is what used to be read in seven places and written
  // by none
  await p.goto(`http://localhost:3177/running-rooms/${rrId}`);
  const occBox = await p.$('input[name=occupants_total]');
  if (occBox) {
    await p.fill('input[name=occupants_total]', '6');
    const mBox = await p.$('input[name=period_month]');
    if (mBox) await mBox.fill(month);
    await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save")')]).catch(() => {});
  }
  await p.goto(`http://localhost:3177/feedback/coverage?month=${month}`);
  const cov = await p.textContent('body');
  ok('coverage counts the signed entries separately', cov.includes('of which signed'));
  ok('coverage explains why the signed count is the one that matters',
     /signed/i.test(cov));
  ok('coverage can be recomputed from the screen',
     !!(await p.$('button:has-text("Recompute")')) || cov.includes('Recompute'));

  await p.goto(`http://localhost:3177/feedback/grading?rr=${rrId}&month=${month}`);
  const grad = await p.textContent('body');
  ok('grading is stated against the signed sample', /signed/i.test(grad));
  ok('grading still computes no rupee figure', grad.includes('No amount is computed here'));
  await ctx.close();
}
{
  // the contractor's own supervisor must not be able to key the register that
  // decides his grading — this one is deliberate, not an oversight
  const { ctx, p } = await signIn('contractor_sup');
  const r = await p.goto('http://localhost:3177/feedback/register');
  ok("the contractor's supervisor cannot key the signed register", r.status() === 403);
  await ctx.close();
}

// ---- stage 21: the call sheet, worked at the bed ---------------------------
// The sheet books the day; the row opens the screen the bearer carries to the
// bed, where each man presses his OWN name and the server stamps the time.
// Schedule C item 6 needs BOTH limbs — served late AND late on duty — and the
// tender sets no lead time in minutes, so none is invented.
{
  const { ctx, p } = await signIn('contractor_sup');
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}`);

  const freeForms = await p.$$eval('form[id^="rt"]', fs => fs
    .filter(f => !f.querySelector('input[name=call_id]')).map(f => f.id));
  const rid = freeForms[freeForms.length - 1];
  await p.fill(`input[form="${rid}"][name=received]`, '01:10');
  await p.fill(`input[form="${rid}"][name=n_LP]`, 'SERVE TEST LP');
  await p.fill(`input[form="${rid}"][name=b_LP]`, '7');
  await p.fill(`input[form="${rid}"][name=n_ALP]`, 'SERVE TEST ALP');
  await Promise.all([p.waitForNavigation(), p.click(`button[form="${rid}"]:has-text("Save & serve")`)]);
  ok('the row opens the serving screen', p.url().includes('/records/call-book/'));

  // the lobby cannot be told the call is done while a man is unsettled
  const disabled = await p.getAttribute('button:has-text("I have repeated it to the lobby")', 'disabled');
  ok('the repeat-back is held until every man is settled', disabled !== null);

  // the LP presses his own name — the server stamps the time
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("I am SERVE TEST LP")')]);
  const afterAck = await p.textContent('body');
  ok('the crew presses his own name and it is recorded', /Acknowledged/.test(afterAck));
  ok('the record says the time was stamped, not typed',
     afterAck.includes('stamped by the system'));

  // the ALP was not in the running room; the lobby is advised, with the time
  await p.click('summary:has-text("He did not acknowledge")');
  await p.selectOption('select[name=outcome]', 'not_present');
  await p.fill('input[name=advised_to]', 'Jr CC Kadam');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Record it")')]);
  const afterOut = await p.textContent('body');
  ok('a man not in the running room is recorded as such',
     afterOut.includes('Not in the running room'));
  ok('and the advice to the lobby carries a time', afterOut.includes('Lobby advised at'));

  // now it may be repeated back
  await p.fill('input[name=repeated_to]', 'Jr CC Kadam');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("I have repeated it to the lobby")')]);
  ok('the repeat-back to the lobby is recorded with a time',
     (await p.textContent('body')).includes('Repeated to the lobby at'));

  // late on duty is the second limb, and it is recorded separately
  await p.check('input[name=late]');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save")')]);
  const afterLate = await p.textContent('body');
  ok('late on duty is recorded against the man', afterLate.includes('second limb'));
  ok('and no rupee amount is computed', afterLate.includes('computes no amount'));

  // withdrawals and crew changes are NOT on the serving screen
  ok('a withdrawal cannot be done from the serving screen',
     !(await p.$('button:has-text("Mark it withdrawn")')));

  // the sheet greys the finished row out
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}`);
  const sheet = await p.textContent('#callsheet');
  ok('the finished row is greyed out', (await p.$$('tr.cbdone')).length > 0);
  ok('and the sheet shows who was called on it', sheet.includes('SERVE TEST LP'));
  await ctx.close();
}
{
  // Withdrawals and crew changes carry a reason and are kept — so they live on
  // their own tab, and an acknowledged man cannot be quietly replaced.
  const { ctx, p } = await signIn('contractor_sup');
  await p.goto(`http://localhost:3177/records/call-book/changes?rr=${MUSTER_RR}`);
  ok('the changes tab opens', (await p.textContent('body')).includes('Changes'));

  await p.click('summary:has-text("The lobby withdrew this call")');
  await p.fill('form[action*="/withdraw"] input[name=reason]', 'train cancelled');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Mark it withdrawn")')]);
  const afterW = await p.textContent('body');
  ok('a call can be withdrawn with a reason', afterW.includes('Call withdrawn'));
  ok('and the reason is kept where it can be read back', afterW.includes('train cancelled'));

  await p.click('summary:has-text("The lobby changed a man")');
  await p.fill('form[action*="/change-crew"] input[name=crew_name]', 'SUBSTITUTE PILOT');
  await p.fill('form[action*="/change-crew"] input[name=reason]', 'lobby changed the man');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Record the change")')]);
  const afterC = await p.textContent('body');
  ok('a substituted man is put on the call', afterC.includes('SUBSTITUTE PILOT'));
  ok('and he has acknowledged nothing, so the lobby must be told again',
     !afterC.includes('Repeated to the lobby at'));
  await p.goto(`http://localhost:3177/records/call-book/changes?rr=${MUSTER_RR}`);
  ok('the man who was booked first is kept in the history',
     (await p.textContent('body')).includes('Crew changed'));
  await ctx.close();
}
{
  // The room's list of trains is the Railway's to keep, not the contractor's.
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto(`http://localhost:3177/records/call-sheet-trains?rr=${MUSTER_RR}`);
  const list = await p.textContent('body');
  ok('the RR in-charge keeps the room\'s list of trains', list.includes('trains'));
  ok('the page explains which direction a room\'s sheet is',
     list.includes('called for an') && list.includes('UP'));
  ok('and says Bhusawal crews will need the DN ones', list.includes('Bhusawal'));

  await p.fill('input[name=train_no]', '99321');
  await p.fill('input[name=train_name]', 'Test Special');
  await p.fill('input[name=run_days]', 'MON,WED');
  const bad = await p.evaluate(async () => {
    const f = document.querySelector('form[action*="call-sheet-trains"]:has(input[name=run_days])')
           || document.querySelectorAll('form[action*="call-sheet-trains"]')[
                document.querySelectorAll('form[action*="call-sheet-trains"]').length - 1];
    const r = await fetch(f.action, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(f)) });
    return { status: r.status, body: await r.text() };
  });
  ok('run days in words are refused', bad.status === 400);
  ok('and the refusal teaches the convention', /1 is Monday/.test(bad.body));

  await p.fill('input[name=run_days]', '1,3,5');
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Put it on the sheet")')]);
  const after = await p.textContent('body');
  ok('a train added by hand joins the list', after.includes('99321'));
  ok('and is marked as kept by hand so the import will not overwrite it',
     after.includes('by hand'));
  await ctx.close();
}

// ---- stage 22: mail and goods, slotted rows, and who may be booked --------
{
  const { ctx, p } = await signIn('contractor_sup');
  const CBD = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&date=${CBD}`);
  ok('the sheet offers a Mail tab and a Goods tab',
     !!(await p.$('a.tab:has-text("Mail / Express")')) && !!(await p.$('a.tab:has-text("Goods")')));

  // a special that turns up between two booked trains, slotted where it belongs
  const before = (await p.$$('tr.cbrow')).length;
  ok('the blank rows start hidden', (await p.$$('tr.cbinsert:not([hidden])')).length === 0);
  await p.click('button.cbinsert-open >> nth=0');
  ok('pressing + opens exactly one blank row',
     (await p.$$('tr.cbinsert:not([hidden])')).length === 1);
  await p.click('button.cbinsert-open >> nth=2');
  ok('opening another closes the first — one at a time, never a field of boxes',
     (await p.$$('tr.cbinsert:not([hidden])')).length === 1);

  const openRow = await p.$('tr.cbinsert:not([hidden])');
  const formId = await openRow.getAttribute('data-for');
  const iid = 'i' + formId.slice(1);
  await p.fill(`input[form="${iid}"][name=sign_on]`, '03:05');
  await p.fill(`input[form="${iid}"][name=train_no]`, '0SPL9');
  await p.fill(`input[form="${iid}"][name=n_LP]`, 'Special Pilot');
  await Promise.all([p.waitForNavigation(), p.click(`button[form="${iid}"]`)]);
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&date=${CBD}`);
  // A hand-added row keeps its number in an input, so textContent cannot see
  // it — the same trap that made an earlier check fail against a working screen.
  ok('the special is on the sheet',
     (await p.$$eval('#callsheet input[name="train_no"]',
        is => is.some(i => i.value === '0SPL9'))));
  ok('and it sorted into place by its time, not onto the end',
     (await p.$$('tr.cbrow')).length === before + 1);

  // goods: nothing to pre-fill, so blank lines
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&service=goods&date=${CBD}`);
  const goods = await p.textContent('body');
  ok('the goods sheet opens as blank lines', (await p.$$('tr.cbblank')).length >= 10);
  ok('and says why there is nothing to pre-fill', goods.includes('on no timetable'));
  ok('the mail links are not on the goods sheet',
     !(await p.$$eval('#callsheet input[name="train_no"]',
        is => is.some(i => i.value === '0SPL9'))));

  // a goods working often has no number at all
  await p.fill('input[form="rg0"][name=n_LP]', 'Goods Pilot Two');
  await p.fill('input[form="rg0"][name=sign_on]', '22:10');
  await Promise.all([p.waitForNavigation(), p.click('button[form="rg0"]')]);
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&service=goods&date=${CBD}`);
  ok('a goods row identified only by its crew saves',
     (await p.$$eval('#callsheet input[name="n_LP"]',
        is => is.some(i => i.value === 'Goods Pilot Two'))));
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}&service=mail&date=${CBD}`);
  ok('and it stays off the mail sheet',
     !(await p.$$eval('#callsheet input[name="n_LP"]',
        is => is.some(i => i.value === 'Goods Pilot Two'))));
  await ctx.close();
}
{
  // Only a driver may be offered into the Loco Pilot box, only an assistant
  // into the Assistant box. Booking a cook as a driver was never possible;
  // booking the ALP as the LP was, and that is a real keying error at 4 a.m.
  const { ctx, p } = await signIn('rr_incharge');
  await p.goto(`http://localhost:3177/records/call-book?rr=${MUSTER_RR}`);
  const ask = role => p.evaluate(async r => {
    const w = document.getElementById('crewlines');
    const res = await fetch(w.dataset.search + '?rr=' + w.dataset.rr + '&q=ram'
      + (r ? '&role=' + r : ''), { credentials: 'same-origin' });
    return res.ok ? res.json() : null;
  }, role);
  const lps = await ask('LP'), alps = await ask('ALP'), anyone = await ask(null);
  ok('the boxes carry the role they are', !!(await p.$('input.crewname[data-role="LP"]')));
  ok('the Loco Pilot box offers only drivers',
     Array.isArray(lps) && lps.every(m => [5, 6, 7].includes(m.designation_id)));
  ok('the Assistant box offers only assistants',
     Array.isArray(alps) && alps.every(m => [1, 2].includes(m.designation_id)));
  ok('an unqualified search stays inside the permitted designations',
     Array.isArray(anyone) && anyone.every(m => [1, 2, 5, 6, 7].includes(m.designation_id)));
  ok('no identity number or caste comes back with any of them',
     [...lps, ...alps].every(m => !('aadhaar' in m) && !('caste' in m) && !('date_of_birth' in m)));

  // the room's own tab
  await p.goto(`http://localhost:3177/records/call-sheet-trains?rr=${MUSTER_RR}`);
  ok('the room can be told which tab to open on', !!(await p.$('select[name=set_default]')));
  ok('and the list says which sheet each train is on',
     (await p.textContent('body')).includes('MAIL'));
  await ctx.close();
}

// ---- stage 23a: the muster says what happened ----------------------------
// A bearer who presses Save and sees the page come back unchanged cannot tell
// whether the muster was written, so he presses it again. Harmless — the save
// is an upsert — but it tells him nothing either time.
{
  const { ctx, p } = await signIn('contractor_sup');
  const MD = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  await p.goto(`http://localhost:3177/records/muster?rr=${MUSTER_RR}&date=${MD}`);
  const before = await p.textContent('body');
  ok('an unmarked day does not claim to be on record', !before.includes('on record'));

  const marks = await p.$$('input[type=radio][value=present]');
  if (marks.length) {
    for (const m of marks.slice(0, 3)) await m.check();
    await Promise.all([p.waitForNavigation(), p.click('button:has-text("Save muster")')]);
    const after = await p.textContent('body');
    ok('saving the muster says so', after.includes('The muster has been saved'));
    ok('and names how many were marked', /\d+ (person|people) marked/.test(after));

    await p.goto(`http://localhost:3177/records/muster?rr=${MUSTER_RR}&date=${MD}`);
    const back = await p.textContent('body');
    ok('coming back says the muster is on record', back.includes('on record'));
    ok('with the time it was last saved', /last saved\s+\d\d:\d\d/.test(back));
    ok('and that saving again only corrects it', back.includes('does not add a second muster'));
  }
  await ctx.close();
}

const { ctx: c4, p: shot } = await signIn('hq');
for (const [n, u] of [['dashboard','/'],['rooms','/running-rooms'],['room','/running-rooms/1'],
    ['staff','/staff'],['staff-detail','/staff/2'],['muster','/records/muster'],
    ['call-book','/records/call-book'],['linen-stock','/records/linen-stock'],['meals','/records/meals'],['complaints','/records/complaints'],
    ['feedback','/feedback'],['coverage','/feedback/coverage'],['grading','/feedback/grading'],
    ['feedback-register','/feedback/register'],
    ['qr','/feedback/qr'],['clauses','/masters/deficiency-clauses'],
    ['laundry','/facility/laundry'],['consumables','/facility/consumables'],
    ['assets','/facility/assets'],['kitchen','/facility/kitchen?rr=12'],['pest','/facility/pest'],['cctv','/facility/cctv'],['vendors','/masters/vendors'],['bills','/bills'],
    ['scorecard','/reports'],['league','/reports/sites'],['trends','/reports/trends'],
    ['certificates','/certificates'],['pack',`/certificates/${CERT_RR}/${YM}`],
    ['food-safety','/food-safety'],['food-licence','/food-safety/23']]) {
  await shot.goto('http://localhost:3177' + u); await shot.waitForTimeout(150);
  await shot.screenshot({ path: `demo-${n}.png`, fullPage: true });
}
await c4.close();

console.log(`\n  ${pass} passed, ${fail} failed`);
console.log('  page errors:', errs.length ? errs : 'none', '\n');
await b.close(); srv.kill();
process.exit(fail || errs.length ? 1 : 0);
