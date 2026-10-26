#!/usr/bin/env node
/**
 * Every permission must be held by somebody, and the demo must agree with the
 * seed.
 *
 * TWO FAULTS THIS EXISTS TO CATCH, BOTH OF WHICH HAPPENED.
 *
 * 1. A PERMISSION NOBODY HOLDS. Nine permissions were declared in the migration
 *    that added their screen and granted there with a join against `roles`.
 *    Migrations run BEFORE seeds, so on a fresh install `roles` is empty at that
 *    moment: the permission row was written, the grant matched nothing, MySQL
 *    raised no error, and nine screens became unreachable by every role in the
 *    system — including the user admin screen, which is the one needed to give a
 *    running room its logins. Found on a real install, 28.08.2026, when the
 *    sysadmin could not open it.
 *
 * 2. THE DEMO DRIFTING FROM THE SEED. demo/server.js carries its own copy of the
 *    grants. Five hundred browser checks run against that copy, so if it says a
 *    role holds something the seed does not, every one of them passes against a
 *    permission the real system has never granted.
 *
 * Both are checked by reading the two files — no database, no server, so this
 * runs in `npm test` with everything else.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// EVERY seed file, not just 01. The fssai permissions are declared in
// 05_food_check_items.sql beside the checklist they govern, and a check that
// read only 01 reported them as demo-only — a false alarm that would have sent
// somebody hunting a fault that was not there.
const seedDir = path.join(root, 'db', 'seeds');
const seed = fs.readdirSync(seedDir).filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync(path.join(seedDir, f), 'utf8')).join('\n');
const demo = fs.readFileSync(path.join(root, 'demo', 'server.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (extra ? '\n       ' + extra : '')); fail++; }
};

/* ---- what the seed declares and grants ---------------------------------- */
// Strip SQL comments first: several permission codes appear inside the
// explanatory comments, and counting those would hide a genuinely missing one.
const bare = seed.replace(/--[^\n]*/g, '');

const declared = new Set();
// A seed file may hold more than one permissions block, so take them all.
for (const blk of bare.split('INSERT INTO permissions').slice(1)) {
  const upto = blk.indexOf('INSERT INTO');
  for (const m of (upto > -1 ? blk.slice(0, upto) : blk).matchAll(/\('([a-z_]+\.[a-z_]+)'\s*,/g))
    declared.add(m[1]);
}

const grants = new Set();
for (const blk of bare.split('INSERT INTO role_permissions').slice(1)) {
  for (const m of blk.matchAll(/\('([a-z_]+)'\s*,\s*'([a-z_]+\.[a-z_]+)'\)/g))
    grants.add(`${m[1]}|${m[2]}`);
}

const granted = new Set([...grants].map(g => g.split('|')[1]));

/* ---- 1 · nothing declared and ungranted --------------------------------- */
const orphans = [...declared].filter(p => !granted.has(p)).sort();
ok('every permission the seed declares is granted to somebody',
   orphans.length === 0,
   orphans.length ? 'nobody holds: ' + orphans.join(', ') : '');

/* ---- 2 · no NEW migration declares a permission -------------------------- */
//
// The rule the nine-permission fault settled: a permission is declared in a
// seed, never in a migration, because migrations run first and the join against
// `roles` silently matches nothing on a fresh install.
//
// The seven files below broke that rule and are GRANDFATHERED, not fixed. An
// applied migration must never be edited — migrate.js checksums every one and
// refuses to run if a byte has changed, so "tidying" these would stop the
// application upgrading on every database that has already applied them. Their
// INSERTs are now inert: the seed declares and grants all nine permissions
// itself, and `ON DUPLICATE KEY UPDATE` makes the migration's own attempt a
// no-op wherever it does run. They are left exactly as they shipped.
//
// Nothing may be added to this list.
const GRANDFATHERED = new Set([
  '018_crew_from_staff_master.sql', '019_user_admin_and_reliever.sql',
  '021_cctv.sql', '022_vendors_and_assets.sql', '023_staff_grading.sql',
  '025_signed_feedback_register.sql', '027_call_sheet.sql',
]);
const migDir = path.join(root, 'db', 'migrations');
const offenders = [];
for (const f of fs.readdirSync(migDir).filter(x => x.endsWith('.sql'))) {
  if (GRANDFATHERED.has(f)) continue;
  const sql = fs.readFileSync(path.join(migDir, f), 'utf8').replace(/--[^\n]*/g, '');
  if (/INSERT\s+INTO\s+(permissions|role_permissions)\b/i.test(sql)) offenders.push(f);
}
ok('no new migration declares or grants a permission — seeds run after migrations',
   offenders.length === 0,
   offenders.length ? 'found in: ' + offenders.join(', ')
     + ' — declare it in db/seeds/01_reference.sql instead' : '');

/* ---- 3 · the demo agrees with the seed ---------------------------------- */
const demoPerms = {};
const permsSrc = demo.slice(demo.indexOf('const PERMS'), demo.indexOf('const PERMS') + 4000);
for (const m of permsSrc.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
  const role = m[1];
  const codes = [...m[2].matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map(x => x[1]);
  if (codes.length) demoPerms[role] = new Set(codes);
}

const extraInDemo = [], missingInDemo = [];
for (const [role, codes] of Object.entries(demoPerms)) {
  for (const c of codes) if (!grants.has(`${role}|${c}`)) extraInDemo.push(`${role}:${c}`);
}
for (const g of grants) {
  const [role, code] = g.split('|');
  if (demoPerms[role] && !demoPerms[role].has(code)) missingInDemo.push(`${role}:${code}`);
}

ok('the demo grants nothing the seed does not',
   extraInDemo.length === 0,
   extraInDemo.length ? 'demo-only: ' + extraInDemo.sort().join(', ') : '');
ok('and the demo is not missing anything the seed grants',
   missingInDemo.length === 0,
   missingInDemo.length ? 'seed-only: ' + missingInDemo.sort().join(', ') : '');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
