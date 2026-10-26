/**
 * Annexure-A adds up, and its three corrections stay corrected.
 *
 * THE FAULT THIS EXISTS TO CATCH.
 *
 * IGP's cleaning materials sheet states each item's quantity TWICE -- once a
 * month, and once for the whole two years -- and on three lines the two
 * disagree. The officer ruled that the two-year figure governs, because that is
 * what the money was sanctioned against: the twenty-one line amounts add to
 * Rs 25,31,088 exactly, and the monthly column does not enter that sum at all.
 *
 * So the loader derives the monthly figure by division and never copies it. The
 * risk that creates is quieter than the one it removes: if a two-year quantity
 * is ever mistyped, the monthly obligation a supervisor is measured against
 * moves with it and NOTHING looks wrong. A store register would simply start
 * asking for a different amount of bleaching powder, and the first person to
 * notice would be the person short-supplied.
 *
 * The seeder refuses to load a list that does not add up. This test checks the
 * same arithmetic without a database, so a bad edit is caught by `npm test`
 * rather than on the evening someone runs the seeder.
 *
 * It also pins the three corrections. They are the kind of decision that gets
 * quietly reverted by the next person who compares the file against the scan
 * and "fixes" it back.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + extra : '')); fail++; }
};

const src = fs.readFileSync(path.join(ROOT, 'db', 'seed-igp-contract.js'), 'utf8');

// The list is read out of the seeder rather than duplicated here. A copy would
// pass this test forever while the seeder drifted away from it.
const block = src.match(/const MATERIALS = \[([\s\S]*?)\n\];/);
ok('the MATERIALS list is still in db/seed-igp-contract.js', !!block);
if (!block) { console.log(`\n  ${pass} passed, ${fail} failed\n`); process.exit(1); }

let MATERIALS;
try { MATERIALS = eval('[' + block[1] + ']'); }
catch (e) { ok('the MATERIALS list parses', false, e.message); MATERIALS = []; }

const TOTAL  = Number((src.match(/const MATERIALS_TOTAL\s*=\s*([\d.]+)/)  || [])[1]);
const MONTHS = Number((src.match(/const MATERIALS_MONTHS\s*=\s*(\d+)/)    || [])[1]);

ok('twenty-one items, as the sheet prints', MATERIALS.length === 21,
   `found ${MATERIALS.length}`);
ok('the contract period is 24 months', MONTHS === 24, `found ${MONTHS}`);

const sum = MATERIALS.reduce((t, m) => t + m[4] * m[5], 0);
ok(`the line amounts add to the sanctioned total (Rs ${TOTAL})`,
   Math.abs(sum - TOTAL) < 0.005, `they add to ${sum.toFixed(2)}`);

// Every code appears once. A duplicate would be swallowed by the loader's
// ON DUPLICATE KEY UPDATE and one item would silently vanish from the schedule.
const codes = MATERIALS.map(m => m[0]);
ok('no item code is used twice', new Set(codes).size === codes.length,
   codes.filter((c, i) => codes.indexOf(c) !== i).join(', '));

// A monthly figure a store register cannot hold is a figure nobody can supply.
const ragged = MATERIALS.filter(m => {
  const per = m[4] / MONTHS;
  return Math.abs(per - Math.round(per * 100) / 100) > 1e-9;
});
ok('every two-year quantity divides into a monthly figure a register can hold',
   ragged.length === 0, ragged.map(m => `${m[0]} ${m[4]}/${MONTHS}`).join(', '));

// THE THREE CORRECTIONS, pinned. The sheet's monthly column said 50, 10 and 10.
const CORRECTED = { 'IGP-M01': 100, 'IGP-M13': 40, 'IGP-M14': 20 };
for (const [code, monthly] of Object.entries(CORRECTED)) {
  const m = MATERIALS.find(x => x[0] === code);
  ok(`${code} is supplied at ${monthly} a month, not the sheet's monthly column`,
     !!m && m[4] / MONTHS === monthly, m ? `derived ${m[4] / MONTHS}` : 'item missing');
  ok(`${code} carries the sheet's own words about the difference`,
     !!m && typeof m[8] === 'string' && /sheet states|sheet names/.test(m[8]),
     m ? String(m[8]) : 'item missing');
}

// The perfume was renamed to its pack size. Its old name is the one thing a
// well-meaning correction against the scan would put back.
const perfume = MATERIALS.find(m => m[0] === 'IGP-M13');
ok('the air freshener perfume is named at its pack size, 250 ml',
   !!perfume && /250 ml/.test(perfume[1]) && !/300 ml/.test(perfume[1]),
   perfume ? perfume[1] : 'item missing');

// Every rate is defensible: the sheet gives a reference for all twenty-one and
// a rate without one is a number nobody can stand behind at an audit.
const unreferenced = MATERIALS.filter(m => !m[6] || !String(m[6]).trim());
ok('every rate carries its reference', unreferenced.length === 0,
   unreferenced.map(m => m[0]).join(', '));

// The generic Schedule-D "cleaning material ... lot" row must be categorised,
// or IGP's page prints the 21 real items AND the one-line stand-in for them.
const seed09 = fs.readFileSync(
  path.join(ROOT, 'db', 'seeds', '09_consumable_items.sql'), 'utf8');
ok("the generic cleaning row (SD14) is categorised so the contract replaces it",
   /category\s*=\s*'cleaning'[\s\S]{0,120}SD14/.test(seed09));
ok("the loader files IGP's materials in that same category",
   /'D','cleaning'/.test(src));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
