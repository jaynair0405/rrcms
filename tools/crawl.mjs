#!/usr/bin/env node
/**
 * Walks every page of a RUNNING instance and reports anything that is not a
 * clean 200. Written for the first run against a real MySQL, where the
 * failures that matter are the ones no stub can produce: a GROUP BY that
 * MySQL 8 refuses under ONLY_FULL_GROUP_BY, a column that exists in the
 * query but not in the migration, a date function that behaves differently.
 *
 *   node tools/crawl.mjs [baseUrl] [username] [password]
 */
const BASE = process.argv[2] || 'http://localhost:3100';
const USER = process.argv[3] || 'admin';
const PASS = process.argv[4] || 'demo1234';

let cookie = '';
async function get(path) {
  const r = await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const body = r.status < 300 ? await r.text() : '';
  return { status: r.status, body, location: r.headers.get('location') };
}

async function login() {
  await get('/login');
  const r = await fetch(BASE + '/login', {
    method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: USER, password: PASS }), redirect: 'manual',
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  if (r.status !== 302) throw new Error(`login failed: ${r.status}`);
}

const YM = new Date().toISOString().slice(0, 7);
// Last month, for the wage register — the current month is usually empty.
const LASTM = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7); })();
// Rooms and a staff member inside the crawling user's own scope. Without
// this every scoped role reports a wall of 403s that are simply correct.
const RR    = (process.env.CRAWL_RR || '1,12,44').split(',');
const MEAL  = process.env.CRAWL_MEAL || '12';
const STAFF = process.env.CRAWL_STAFF || '1';
// An agreement inside the crawling user's scope. Discovered below from the
// contractor page, the same way the contractor itself is.
let CONTRACT = process.env.CRAWL_CONTRACT || '1';
const CONTRACTOR = process.env.CRAWL_CONTRACTOR || '1';
const PAGES = [
  '/', '/running-rooms', ...RR.map(r => '/running-rooms/' + r),
  '/staff', '/staff?flag=unscreened', '/staff?flag=no_medical', '/staff?flag=expiring',
  '/staff?flag=uniform_due', '/staff?flag=left', `/staff/${STAFF}`, '/staff/new',
  '/records/muster', '/records/call-book', '/records/call-book/changes', '/records/call-sheet-trains', '/records/complaints', '/records/linen', '/records/cleaning',
  '/records/linen-stock', '/records/meals', '/account/users', '/account/password',
  '/feedback', '/feedback/coverage', '/feedback/grading', '/feedback/qr', '/feedback/register',
  '/facility/laundry', '/facility/consumables', '/facility/assets',
  `/facility/kitchen?rr=${MEAL}`, '/facility/menu', '/facility/menu/card', '/masters/menu',
  '/facility/pest', '/facility/cctv',
  '/inspections', '/inspections/new', '/deficiencies', '/deficiencies?status=open',
  '/incidents', '/incidents?status=open', '/incidents?type=intoxication',
  '/compliance', `/compliance?rr=${RR[0]}`,
  '/contractors', `/contractors/${CONTRACTOR}`,
  '/contractors/contracts/new', `/contractors/contracts/${CONTRACT}`,
  '/certificates', `/certificates?month=${YM}`,
  '/reports', '/reports/sites', '/reports/trends',
  '/masters', '/masters/deficiency-clauses', '/masters/vendors', '/masters/vendors/1',
  '/bills', `/wages?rr=${RR[0]}`, `/wages?rr=${RR[0]}&month=${LASTM}`, '/staff/grading', '/deficiencies/review?period=monthly', '/deficiencies/review?period=weekly',
  '/food-safety', `/food-safety/${MEAL}`, `/food-safety/${MEAL}/inspect`,
];

/**
 * A 403 is not a fault. No single role can reach every page — that is the whole
 * point of the permission model — and calling a correctly refused page "broken"
 * trains whoever reads this output to skim past real failures. So a refusal is
 * counted and named separately, and only a 5xx, a 404 or a rendered error page
 * fails the run.
 *
 * To see the operational screens, crawl as somebody who holds them:
 *   node tools/crawl.mjs http://localhost:3100 officer <password>
 */
await login();

// Find a real staff member and a real contractor rather than assuming id 1.
// The pilot loader numbers staff from 1000 and contractors from wherever the
// file left off, so the hardcoded ids produced two 404s that were not faults --
// and a crawl that always ends "2 broken" is a crawl nobody reads.
{
  const pick = async (path, re) => (re.exec((await get(path)).body) || [])[1];
  const st = await pick('/staff', /href="[^"]*\/staff\/(\d+)"/);
  const ct = await pick('/contractors', /href="[^"]*\/contractors\/(\d+)"/);
  const vn = await pick('/masters/vendors', /href="[^"]*\/masters\/vendors\/(\d+)"/);
  // The agreement id comes off the contractor's own page, so the crawl walks an
  // agreement that actually exists and actually belongs to this user's scope.
  const ag = ct ? await pick(`/contractors/${ct}`, /href="[^"]*\/contractors\/contracts\/(\d+)"/) : null;
  for (let i = 0; i < PAGES.length; i++) {
    // A running room whose roster has been cleared -- a contract changing hands
    // does exactly that -- has NO staff to open. Drop the page rather than
    // asking for a man who is not there and calling the 404 a fault.
    if (PAGES[i] === `/staff/${STAFF}`) PAGES[i] = st ? `/staff/${st}` : null;
    if (ct && PAGES[i] === `/contractors/${CONTRACTOR}`) PAGES[i] = `/contractors/${ct}`;
    if (PAGES[i] === `/contractors/contracts/${CONTRACT}`) PAGES[i] = ag ? `/contractors/contracts/${ag}` : null;
  }
  // A contractor with no agreement on record is a real state at a pilot site.
  for (let i = PAGES.length - 1; i >= 0; i--) if (PAGES[i] === null) PAGES.splice(i, 1);
  // A pilot install has no vendors at all, so there is no id to walk to. That
  // is a site with nothing recorded yet, not a broken page.
  if (!vn) PAGES.splice(PAGES.indexOf('/masters/vendors/1'), 1);
  else PAGES[PAGES.indexOf('/masters/vendors/1')] = `/masters/vendors/${vn}`;
}

let bad = 0, ok = 0;
const refused = [];
const BODIES = [];
for (const p of PAGES) {
  const r = await get(p);
  if (r.status === 200) BODIES.push(r.body);
  const rendered = r.status === 200 && /Something went wrong|Template error/i.test(r.body);
  if (r.status === 403 && !rendered) { refused.push(p); console.log(`  –  403  ${p}`); continue; }
  const broken = r.status >= 400 || rendered;
  if (broken) {
    bad++;
    const why = /Template error[^<]*/i.exec(r.body)
      || /<p class="muted"[^>]*>([^<]{5,300})</i.exec(r.body);
    console.log(`  ✗ ${r.status}  ${p}`);
    if (why) console.log(`       ${(why[1] || why[0]).trim().slice(0, 260)}`);
  } else { ok++; console.log(`  ✓ ${r.status}  ${p}`); }
}
/* --- second pass: every link the pages themselves offer ----------------------
 *
 * The list above is hand-kept, and a hand-kept list only ever contains what
 * somebody remembered to add. This pass follows the links the application
 * actually renders, which is how a link to a route that was never written gets
 * found: the wages screen offered "Open it" against /deficiencies/:id and there
 * is no such route — the register is a list, not a page per row. The officer
 * got a 404 from a link the system had drawn for him, and nothing here would
 * ever have walked it.
 */
{
  const already = new Set(PAGES);
  const found = new Set();
  for (const body of BODIES) {
    for (const m of body.matchAll(/href="([^"][^"]*)"/g)) {
      let href = m[1].replace(/&amp;/g, '&').split('#')[0];
      if (!href.startsWith('/') || href.startsWith('/assets/')) continue;
      if (already.has(href) || found.has(href)) continue;
      found.add(href);
    }
  }
  const links = [...found].slice(0, 250);
  if (links.length) {
    console.log(`  following ${links.length} link(s) the pages themselves render\n`);
    for (const href of links) {
      const r = await get(href);
      const rendered = r.status === 200 && /Something went wrong|Template error/i.test(r.body);
      if (r.status === 403 && !rendered) { refused.push(href); continue; }
      if ((r.status >= 200 && r.status < 400) && !rendered) { ok++; continue; }
      bad++;
      console.log(`  \u2717 ${r.status}  ${href}   \u2190 linked from a rendered page`);
    }
  }
}

/* --- third pass: is the HTML actually closed? --------------------------------
 *
 * A page can return 200, compile as a template, and pass every check above
 * while its markup is structurally broken. That happened: a script that added
 * the sticky building bar left three files with an unclosed <div>, and the
 * browser's error recovery swallowed the rest of the page into the last open
 * element -- the main column collapsed to 800px against a 6479px page. Nothing
 * in the suite saw it, because nothing in the suite was looking at the SHAPE of
 * the output. Template compilation cannot see it either: a template with one
 * <div> too few is a perfectly valid template.
 *
 * Counting opening and closing tags is crude, and crude is the point -- it is
 * the one check that would have caught it, it needs no parser, and a mismatch
 * is never innocent in hand-written markup.
 */
{
  const TAGS = ['div', 'table', 'tbody', 'thead', 'tr', 'td', 'form', 'select'];
  let unbalanced = 0;
  for (let i = 0; i < PAGES.length && i < BODIES.length; i++) {
    const body = BODIES[i].replace(/<script[\s\S]*?<\/script>/gi, '')
                          .replace(/<!--[\s\S]*?-->/g, '');
    for (const t of TAGS) {
      const open = (body.match(new RegExp('<' + t + '(?=[\\s>])', 'gi')) || []).length;
      const close = (body.match(new RegExp('</' + t + '>', 'gi')) || []).length;
      if (open !== close) {
        unbalanced++; bad++;
        console.log(`  \u2717 <${t}> ${open} opened, ${close} closed   ${PAGES[i]}`);
      }
    }
  }
  if (!unbalanced) console.log(`  \u2713 markup closes on all ${BODIES.length} rendered page(s)`);
}

console.log(`\n  ${ok} clean, ${bad} broken, ${refused.length} outside ${USER}'s role\n`);
process.exit(bad ? 1 : 0);
