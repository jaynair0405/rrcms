/**
 * NOTHING IN THIS SYSTEM MAY INVENT ITS OWN TODAY.
 *
 * Fifty-four places computed the date as `new Date().toISOString().slice(0,10)`
 * — the UTC date. A running room works round the clock, India is 5½ hours
 * ahead, and so between midnight and 05:30 IST every one of them called it
 * YESTERDAY. The date box opened on the wrong day; the guards that read
 * `if (date > today())` REFUSED the true current date as being in the future,
 * so a night supervisor could not record the day he was standing in; and the
 * database, running CURDATE() on its own clock, selected a different day from
 * the same table than the route did.
 *
 * None of it showed on a screen. It was found by the officer noticing a date
 * box open on yesterday's date, which is the only symptom it ever had.
 *
 * One clock, in src/lib/day.js. This test is what stops the fifty-fifth.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + extra : '')); fail++; }
};

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'public') walk(p, exts, out); }
    else if (exts.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// 1. Nobody reads the wall clock but the clock itself.
const bad = [];
for (const file of walk(path.join(ROOT, 'src'), ['.js', '.ejs'])) {
  if (file.endsWith(path.join('lib', 'day.js'))) continue;
  const src = fs.readFileSync(file, 'utf8');
  // `new Date()` with no argument, followed by anything that turns it into a
  // date or a month. Arithmetic on a date STRING already known to be correct
  // (new Date(Date.parse(iso + 'T00:00:00Z'))) is a different thing and fine.
  for (const m of src.matchAll(/new Date\(\s*\)\s*\.(?:toISOString|getUTC|getFullYear|getMonth|getDate)/g)) {
    bad.push(`${path.relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length}`);
  }
}
ok('no route or screen computes a date from the UTC wall clock', bad.length === 0,
   bad.join('\n       '));

// 2. The clock is on Indian time, and says so out loud.
const day = require(path.join(ROOT, 'src', 'lib', 'day.js'));
ok('the clock is set to a named Indian time zone', day.TZ === 'Asia/Kolkata',
   `it is ${day.TZ}`);
ok('today() is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(day.today()));

// 3. The half past midnight case, which is the whole reason for this file.
const justAfterMidnightIST = new Date('2026-09-03T19:00:00Z');
ok('half past midnight in Igatpuri is the new day, not the old one',
   day.today(justAfterMidnightIST) === '2026-09-04',
   `it says ${day.today(justAfterMidnightIST)}`);

// 4. The turn of the month, where the month helpers used to slip a month.
const twoAmOnTheFirst = new Date('2026-08-31T20:30:00Z'); // 02:00 IST, 1 Sep
const [y, m] = day.today(twoAmOnTheFirst).split('-');
ok('two in the morning on the first is the new month',
   `${y}-${m}` === '2026-09', `it says ${y}-${m}`);

// 5. The database is handed the same offset the application runs on.
ok('the database is given an offset, not left on the server clock',
   /^[+-]\d{2}:\d{2}$/.test(day.sqlOffset()), `it offered ${day.sqlOffset()}`);
const dbSrc = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');
ok('every pooled connection has its time zone set',
   /SET time_zone/.test(dbSrc) && /pool\.on\('connection'/.test(dbSrc));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
