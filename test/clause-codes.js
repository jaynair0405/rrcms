/**
 * Every generic clause code the system NAMES must have been decided about.
 *
 * THE FAULT THIS EXISTS TO CATCH, found on 09.09.2026 by the officer asking a
 * different question altogether.
 *
 * RR-CMS was built from the DIVISIONAL TENDER's penalty annexure, codes A1..M12.
 * IGP's executed contract does not use those codes at all -- its penalties are
 * lettered (a) to (ee). `supersedes_code` is the bridge: it says which contract
 * clause stands in place of which generic one, so a screen naming "A3" at IGP
 * resolves to the contract's clause (b) and its Rs 500, not the tender's
 * Rs 1,000.
 *
 * The bridge was built for the four codes the ROUTES ask for by name. Nobody
 * checked the codes the VIEWS print. So the cleaning register at IGP printed
 *
 *     "clause A6 -- poor cleaning against schedule, Rs 1,000 a day"
 *
 * for conduct this contract prices itself, in clause (e), at Rs 500 per
 * incident. Nothing computed money from it, so no bill was ever wrong -- which
 * is exactly why it survived: the screen stated the wrong clause at the wrong
 * rate and nothing downstream disagreed.
 *
 * WHAT THIS TEST ACTUALLY ASSERTS, and what it deliberately does not.
 *
 * It cannot tell whether a mapping is CORRECT -- that is a reading of two
 * documents and belongs to the officer. What it can do is refuse to let a code
 * be named on a screen without somebody having decided. So every generic code
 * that appears in a view or a route must be in exactly one of two lists below:
 * mapped by the contract loader, or named here as one the contract is silent
 * about, with the reason written down.
 *
 * Falling back to the tender where the contract is silent is CORRECT, not a
 * gap: a site's penalty list is not the whole of the contract conditions. The
 * fault is only ever a code that falls back BY ACCIDENT.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + extra : '')); fail++; }
};

const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name), ext)
                  : e.name.endsWith(ext) ? [path.join(dir, e.name)] : []);

/* Every generic code the system puts in front of a person or asks for by name. */
const named = new Set();
for (const f of walk(path.join(ROOT, 'src', 'views'), '.ejs')) {
  const src = fs.readFileSync(f, 'utf8');
  /* "clause A6", but ALSO "clauses B2 and B4" and "clauses D5 and D6". The
   * first cut of this matched only the singular form and silently missed four
   * codes that were being printed as verdicts on the bills and foodstuff
   * screens -- a scanner that under-reports is worse than no scanner, because
   * the green tick says the question was asked. */
  for (const m of src.matchAll(/[Cc]lauses?\s+[A-Z][0-9]{1,2}(?:\s+and\s+[A-Z][0-9]{1,2})*/g))
    for (const c of m[0].matchAll(/[A-Z][0-9]{1,2}/g)) named.add(c[0]);
  /* data-clause="B2" -- the clickable form, and the reason it must be read
   * SEPARATELY. Marking "clauses B2 and B4" up for the panel turns it into
   * `clauses <span data-clause="B2">B2</span> and <span ...>B4</span>`, and the
   * prose pattern above stops matching. The test then passed because it no
   * longer FOUND the two codes -- a green tick saying the question was asked
   * when it was not. Caught by running the scan after the markup, not before. */
  for (const m of src.matchAll(/data-clause="([A-Z][0-9]{1,2})"/g)) named.add(m[1]);
}
for (const f of [...walk(path.join(ROOT, 'src', 'routes'), '.js'),
                 ...walk(path.join(ROOT, 'src', 'services'), '.js')]) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/clauseFor\([^)]*?'([A-Z][0-9]{1,2})'/g)) named.add(m[1]);
}
ok('the scan found the clause codes the system names', named.size >= 8,
   `found ${named.size}: ${[...named].sort().join(' ')}`);

/* What IGP's contract loader bridges. */
const seed = fs.readFileSync(path.join(ROOT, 'db', 'seed-igp-contract.js'), 'utf8');
/* A mapping may name SEVERAL codes -- clause (t) replaces both B2 and B4, see
 * migration 065. Reading only the first would leave the second looking
 * undecided, and the fix for that would be to add it to SILENT, which would be
 * a lie in the file that exists to stop lies. */
const mapped = new Set();
for (const m of seed.matchAll(/supersedes:\s*'([A-Z0-9,]+)'/g))
  for (const c of m[1].split(',')) mapped.add(c.trim());

/* Codes IGP's contract is SILENT about. Falling back to the divisional tender
 * here is the decision, not the absence of one. A code joins this list only
 * after somebody has read the contract and found nothing answering to it. */
const SILENT = {
  C1: 'washing at an unapproved centre — the contract names no penalty for it',
  D5: 'late submission of a bill — the contract has no billing penalty; (u) is the '
    + 'FSSAI certificate and (v) is police verification, and there is no third',
  D6: 'late submission of a bill, continuing — same as D5',
  M5: 'late payment of wages — the contract says nothing about it',
  B6: 'overcharging or short quantity — no lettered clause answers to it',
  M2: 'no counterpart in the contract',
  C5: 'no counterpart in the contract',
};

const undecided = [...named].filter(c => !mapped.has(c) && !(c in SILENT)).sort();
ok('every clause code the system names has been decided about',
   undecided.length === 0,
   undecided.length
     ? `undecided: ${undecided.join(', ')}\n       Map it in db/seed-igp-contract.js (supersedes:'<code>'), or add it to\n`
       + `       SILENT in this file with the reason the contract has no counterpart.\n`
       + `       Do not add it to SILENT without reading the contract — that is how A6\n`
       + `       came to print the tender's Rs 1,000 for a Rs 500 clause.`
     : '');

/* A code cannot be both. If it is, one of the two statements is wrong. */
const both = [...mapped].filter(c => c in SILENT).sort();
ok('no code is both mapped and declared silent', both.length === 0, both.join(', '));

/* The four the routes ask for BY NAME are the ones where a wrong answer becomes
 * a recorded deficiency rather than a line of text. They must stay mapped. */
for (const code of ['A3', 'A9', 'C6', 'A6']) {
  ok(`${code} resolves to IGP's own contract clause`, mapped.has(code),
      `${code} is not mapped — IGP would fall back to the divisional tender`);
}

/* ------------------------------------------------------------------------
 * A clickable clause must be on a page that knows WHICH RUNNING ROOM it is on.
 *
 * THE FAULT THIS CATCHES, made while building the panel on 09.09.2026. The
 * bills KPI said "clauses D5 and D6", so it was marked up like the rest --
 * `data-rr="<%= rr.id %>"`. But the bills page lists bills across EVERY running
 * room the reader can see; it has no `rr` at all, and the page would have
 * thrown on render. It was caught by loading the page, which is not a method
 * that scales to the next fifteen screens.
 *
 * The deeper reason is not the crash. A clause reads differently under
 * different contracts, so on a page that spans running rooms "what does D5 say
 * here" HAS no answer -- and a click would imply it did.
 */
const marked = [];
for (const f of walk(path.join(ROOT, 'src', 'views'), '.ejs')) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/data-clause=/.test(src)) continue;
  if (f.endsWith(path.join('views', 'layout.ejs'))) continue;   // the panel itself
  marked.push([path.relative(ROOT, f), src]);
}
ok('some screens carry a clickable clause', marked.length > 0, `${marked.length} views`);

/* The data-rr attribute is STRIPPED before looking for `rr`, and that is the
 * whole trick. The first cut of this check looked for `rr.id` anywhere in the
 * file -- which `data-rr="<%= rr.id %>"` satisfies by itself. So the check
 * passed on the very page it was written to reject, being satisfied by the
 * attribute under test. A test whose evidence is the thing it is testing proves
 * nothing. What is being asked is whether the page was ALREADY about one
 * running room before anybody made a clause clickable on it. */
const noRoom = marked
  .filter(([, src]) => !/\brr\.(id|name)\b/.test(src.replace(/data-rr="[^"]*"/g, '')))
  .map(([f]) => f);
ok('every screen with a clickable clause is about ONE running room',
   noRoom.length === 0,
   noRoom.join(', ') + '\n       A clause reads differently under different contracts. On a page that\n'
   + '       spans running rooms there is no single answer, and `rr` is not in scope.');

const noRrAttr = marked.filter(([, src]) =>
  (src.match(/data-clause=/g) || []).length !== (src.match(/data-clause="[^"]*"\s+data-rr=/g) || []).length
).map(([f]) => f);
ok('every clickable clause carries the running room with it',
   noRrAttr.length === 0,
   noRrAttr.join(', ') + '\n       data-clause without data-rr asks the server a question it must refuse.');

/* The route that answers them has to be mounted, or every chip is a dead end. */
const app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
ok('the clause route is mounted', /router\.use\('\/clauses'/.test(app));

/* And it must scope by running room. Asking for a clause "at running room 19"
 * must not be a way to learn which contract governs a site you cannot see. */
const route = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'clauses.js'), 'utf8');
ok('the clause route checks access to the running room',
   /assertRunningRoomAccess\(/.test(route));
ok('the clause route resolves through the contract rule, not a bare lookup',
   /clauseFor\(/.test(route) && !/FROM deficiency_clauses/i.test(route));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
