/**
 * Every audit action a route writes must be a value the ENUM actually holds.
 *
 * `audit_log.action` is an ENUM, and `services/audit.js` swallows its own
 * failures on purpose — an audit write must never break the user's action. The
 * two together are a trap: a route that writes `action: 'create'` when the
 * column knows only `insert` gets "Data truncated for column 'action'" in the
 * server log, the user's save succeeds, the screen looks perfect, and the audit
 * trail simply has a hole in it.
 *
 * That happened. Four call sites — creating a contract, attaching a running
 * room to one, opening a wage month, and raising clause M5 — all wrote
 * `'create'`, and every one of those events was missing from the trail of a
 * system whose whole purpose is to produce evidence in a contractual dispute.
 * Nothing failed loudly enough to notice; it was found in a log line while
 * chasing something else.
 *
 * So the vocabulary is checked mechanically instead. The ENUM is read from the
 * migrations rather than restated here, so widening it in a migration widens
 * this test in the same commit and the two cannot drift.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + extra : '')); fail++; }
};

// The last definition of the column across the migrations wins, in file order.
const migDir = path.join(ROOT, 'db', 'migrations');
let enumSrc = null;
for (const f of fs.readdirSync(migDir).sort()) {
  const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
  const m = [...sql.matchAll(/action\s+ENUM\s*\(([^)]*)\)/gi)];
  // Only the audit table's column; every other `action` is a different thing.
  if (m.length && /audit_log/i.test(sql)) enumSrc = m[m.length - 1][1];
}
const allowed = new Set((enumSrc || '').match(/'[a-z_]+'/g)?.map(s => s.slice(1, -1)) || []);
ok(`the audit ENUM is readable from the migrations (${allowed.size} values)`, allowed.size > 0);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const bad = [];
for (const file of walk(path.join(ROOT, 'src'))) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/action:\s*'([a-z_]+)'/g)) {
    if (!allowed.has(m[1])) {
      const line = src.slice(0, m.index).split('\n').length;
      bad.push(`${path.relative(ROOT, file)}:${line} writes action '${m[1]}'`);
    }
  }
}
ok('every audit action a route writes is a value the column holds',
   bad.length === 0, bad.join('\n       '));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
