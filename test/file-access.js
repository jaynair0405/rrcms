/**
 * Every table that can hold a file must say who may see it.
 *
 * THE FAULT THIS EXISTS TO CATCH — found on 10.09.2026, proved on a running
 * system, and it was live on crtms.in.
 *
 * `/inspections/photo/:fileId` fetched the row and then checked access only
 * `if (f.entity_table === 'inspection_items')`. Everything else fell through to
 * being served. Every upload in RR-CMS lands in ONE `files` table — staff
 * police verifications, medical certificates, bill documents, food licences,
 * wage sheets, laundry invoices — so any signed-in user of any role could walk
 * ids 1, 2, 3 and read the lot, at every running room, regardless of scope.
 *
 * The fix resolves a file backwards: whichever table points at it is its owner,
 * and that record's running room and that record's own permission govern. A
 * file nothing claims is a 404.
 *
 * WHAT THIS TEST GUARDS. The resolver is only as complete as its list. A new
 * migration adding a `*_file_id` column creates a new kind of file, and if
 * nobody adds a line to OWNERS then — because the resolver denies by default —
 * that file becomes unreachable rather than public. Safe, but silently broken:
 * an officer clicks evidence and gets nothing. So the list is checked against
 * the MIGRATIONS, which is where a new column actually arrives.
 *
 * It cannot check that a mapping is CORRECT — whether staff documents should
 * need `staff.view` is a judgement about the Railway, not about the code. It
 * checks that somebody made the judgement.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + extra : '')); fail++; }
};

const { OWNERS, OWNED_TABLES } = require('../src/services/file-access');

const migDir = path.join(ROOT, 'db', 'migrations');
const referencing = new Set();
for (const file of fs.readdirSync(migDir).sort()) {
  const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
  let current = null;
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/--.*$/, '');
    const create = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?/i.exec(line);
    const alter  = /ALTER TABLE\s+`?(\w+)`?/i.exec(line);
    if (create) current = create[1];
    else if (alter) current = alter[1];
    if (current && /REFERENCES\s+`?files`?\s*\(/i.test(line)) referencing.add(current);
    /* A migration file is HISTORY, not the current schema. staff.photo_file_id
     * was created in 005 and dropped in 030, and reading only the CREATE made
     * this test demand an entry for a column that no longer exists. Dropping a
     * column that held a file removes that table from the list. */
    const drop = /ALTER TABLE\s+`?(\w+)`?\s+DROP COLUMN\s+`?(\w*file_id)`?/i.exec(line)
              || /DROP COLUMN\s+`?(\w*file_id)`?/i.exec(line) && [null, current, RegExp.$1];
    if (drop && drop[1]) referencing.delete(drop[1]);
  }
}

ok(`the migrations were read (${referencing.size} tables hold a file)`,
   referencing.size >= 20, [...referencing].sort().join(' '));

const unlisted = [...referencing].filter(t => !OWNED_TABLES.includes(t)).sort();
ok('every table that can hold a file is in OWNERS',
   unlisted.length === 0,
   unlisted.length
     ? `not listed: ${unlisted.join(', ')}\n`
       + `       Add a line to OWNERS in src/services/file-access.js saying which\n`
       + `       running room the file belongs to and which permission its own screen\n`
       + `       requires. Until then those files are refused to everybody — safe, but\n`
       + `       an officer clicking the evidence gets nothing and no error says why.`
     : '');

const phantom = OWNED_TABLES.filter(t => !referencing.has(t)).sort();
ok('OWNERS names no table that cannot hold a file', phantom.length === 0,
   phantom.join(', ') + '  — a stale entry, or a table renamed since');

const noPerm = OWNERS.filter(o => !o.perm).map(o => o.table);
ok('every entry names the permission its screen requires', noPerm.length === 0, noPerm.join(', '));

const noRoom = OWNERS.filter(o => o.rr === undefined).map(o => o.table);
ok('every entry states its running room, or states that it has none',
   noRoom.length === 0,
   noRoom.join(', ') + '  — use rr: null and say why, do not leave it out');

const joinNoAlias = OWNERS.filter(o => o.join && !/\bp\b/.test(String(o.rr))).map(o => o.table);
ok('a joined entry reads the room from the joined table', joinNoAlias.length === 0,
   joinNoAlias.join(', '));

/* WHAT IS DELIBERATELY NOT ASSERTED HERE, and why.
 *
 * The obvious seventh check is "no other route serves a file". It was written,
 * and it was wrong twice.
 *
 * Five routes serve files: this one and compliance, food-safety, staff, wages.
 * All four of the others are CORRECT, and correct in two different shapes.
 * compliance and wages take the file id from the URL, find the owning record by
 * that id, and refuse a file no record claims. food-safety and staff never let
 * the user name a file at all — the id is read off a record already reached
 * through a checked running room, which is stronger still.
 *
 * The route that leaked was neither: it took the id from the URL, read `files`,
 * and decided access from what the row said about itself. Every attempt to
 * separate that from the four correct shapes by pattern-matching source code
 * flagged three of the four. A test that cries wolf gets ignored, and then it is
 * worse than no test — so the check was removed rather than tuned until it
 * happened to agree. The durable answer is to route all five through
 * `fileFor`, which is on the list in PENDING.md, not a regex.
 *
 * The six checks above are the ones that hold mechanically: the OWNERS list is
 * complete against the migrations, names nothing stale, and every entry answers
 * both questions it must answer.
 */

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
