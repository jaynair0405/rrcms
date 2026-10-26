/**
 * A reference table that a contract can override must never be read unscoped.
 *
 * THE FAULT THIS EXISTS TO CATCH. RR-CMS's reference tables -- penalty clauses,
 * the cleaning schedule, consumables, meal rates -- were seeded from the
 * earlier, generic tender paper for Central Railway running rooms. The executed
 * contract for a particular site is a different document with different numbers.
 * IGP's contract caps the Railway's share of a lunch at Rs 64.74; the divisional
 * paper says 62.37. Its penalty schedule has 31 lettered clauses; the generic
 * one has 50 coded A1..M12, and several collide outright.
 *
 * None of that showed as an error. Every page rendered, every figure was
 * formatted, and every one of them was the wrong figure for that running room.
 * The only symptom was an officer asking, four separate times, whether the new
 * contract was reflected on the site -- and each answer fixed one table.
 *
 * So it is checked mechanically. Any SELECT in a route or service that reads
 * one of these tables must say `contract_id` somewhere in the same statement,
 * which is what scoping looks like however it is spelt. The exceptions are
 * narrow and named:
 *
 *   - masters/*  : the master-data screens exist to show the whole table,
 *                  every contract's rows and the generic ones together.
 *   - a join by id (`dc.id = df.clause_id`): reading back a clause a
 *                  deficiency was ALREADY recorded against is not a choice
 *                  between schedules, and re-scoping it would rewrite history.
 *   - services/contract-terms.js : this is the thing doing the scoping.
 *
 * A query that says `${scope}` counts as scoped: that is the WHERE fragment
 * contract-terms hands the builder, and it is either `contract_id = ?` or
 * `contract_id IS NULL`.
 *
 * Adding a new table to GOVERNED below is what makes a new override safe.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + extra : '')); fail++; }
};

// A table belongs here once a migration gives it a nullable contract_id: that
// column IS the statement that a contract may say otherwise.
const migSrc = fs.readdirSync(path.join(ROOT, 'db', 'migrations')).sort()
  .map(f => fs.readFileSync(path.join(ROOT, 'db', 'migrations', f), 'utf8')).join('\n');

const GOVERNED = ['deficiency_clauses', 'cleaning_schedule', 'consumable_items',
                  'meal_rates', 'linen_schedule'];

const missingColumn = GOVERNED.filter(t => {
  const block = new RegExp(`ALTER TABLE ${t}[\\s\\S]{0,900}?contract_id|CREATE TABLE ${t}[\\s\\S]{0,2000}?contract_id`, 'i');
  return !block.test(migSrc);
});
ok(`every governed table has a contract_id in the migrations (${GOVERNED.length} tables)`,
   missingColumn.length === 0, missingColumn.join(', '));

const EXEMPT_FILES = [
  path.join('src', 'routes', 'masters.js'),
  path.join('src', 'services', 'contract-terms.js'),
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// The SQL statement a table name sits inside: back to the nearest SELECT, on to
// the nearest closing backtick. Crude, and crude is right -- it must not need
// maintaining every time a query is reformatted.
function statementAround(src, at) {
  const start = src.lastIndexOf('SELECT', at);
  let end = src.indexOf('`', at);
  if (end === -1) end = src.length;
  return src.slice(start === -1 ? Math.max(0, at - 400) : start, end);
}

const bad = [];
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file);
  if (EXEMPT_FILES.includes(rel)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const table of GOVERNED) {
    for (const m of src.matchAll(new RegExp(`FROM\\s+${table}\\b`, 'g'))) {
      const stmt = statementAround(src, m.index);
      // Scoping spelt either way: the column named outright, or the WHERE
      // fragment that services/contract-terms hands the query builder.
      if (/contract_id/.test(stmt)) continue;
      if (/\$\{scope\}/.test(stmt)) continue;
      // Reading back a row a record already points at, rather than choosing one.
      if (new RegExp(`\\w+\\.id\\s*=\\s*\\w+\\.(clause_id|schedule_id|consumable_item_id|item_id)`).test(stmt)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      bad.push(`${rel}:${line} reads ${table} without contract_id`);
    }
  }
}
ok('no route or service reads a contract-governed table unscoped',
   bad.length === 0, bad.join('\n       '));

// The rule the scoping follows, stated once so it cannot quietly invert: a
// contract's rows REPLACE the generic ones for its rooms; they are not merged
// underneath. If scopedRows ever starts returning both, this catches it.
const svc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'contract-terms.js'), 'utf8');
ok('contract rows replace the generic ones rather than being merged with them',
   /if \(own\.length\) return/.test(svc) && !/UNION/i.test(svc));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
