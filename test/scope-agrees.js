/**
 * THE THREE PLACES THAT SAY WHAT A ROLE IS SCOPED BY MUST AGREE.
 *
 * There are three, and on 07.09.2026 they did not:
 *
 *   roles.scope_level (the seed)   which filter runningRoomScope applies
 *   SCOPE_OF (src/routes/account.js)   what the user-admin screen demands
 *   SCOPE_OF (src/public/app.js)       which box the screen shows
 *
 * For contractor_sup the seed said `running_room` and the other two said
 * `contractor_id`, so the screen asked for a firm, set contractor_id, left
 * running_room_id empty, and the filter matched nothing. Every supervisor
 * account created through that screen was refused every page in the system with
 * "No running rooms within your access" — and that screen is the one the go-live
 * checklist tells you to use for everybody.
 *
 * It hid for weeks because db/create-user.js gets it right, and every account
 * made during development was made with that. It surfaced on the production
 * server, on the first supervisor account, three days before the contract began.
 *
 * Nothing here needs a database: all three are declarations in files.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/** The scope_level each role is seeded with. */
const seeded = {};
for (const m of read('db/seeds/01_reference.sql')
       .matchAll(/\('(\w+)','[^']*','[^']*','(\w+)'\)/g)) seeded[m[1]] = m[2];

/** A SCOPE_OF table, from wherever it is declared. */
function scopeTable(file) {
  const src = read(file);
  const i = src.indexOf('SCOPE_OF = {');
  if (i < 0) return null;
  const body = src.slice(i, src.indexOf('};', i));
  const out = {};
  for (const m of body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    out[m[1]] = m[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
  }
  return out;
}

const server = scopeTable('src/routes/account.js');
const client = scopeTable('src/public/app.js');

ok(server && Object.keys(server).length >= 5, 'the server declares a scope for every role');
ok(client && Object.keys(client).length >= 5, 'the screen declares a scope for every role');
ok(Object.keys(seeded).length >= 5, `the seed declares a scope_level for every role (${Object.keys(seeded).length})`);

/* What a scope_level implies the user column must be. `cr` and `self` need no
   column at all — HQ sees everything and crew sees only itself. */
const COLUMN_FOR = {
  division: 'division_id', running_room: 'running_room_id',
  contractor: 'contractor_id', cr: null, self: null,
};

for (const [role, level] of Object.entries(seeded)) {
  if (!server[role]) { ok(false, `${role}: declared in the seed but not in the server's table`); continue; }
  const want = COLUMN_FOR[level];
  const got = server[role];
  ok(want === null ? got.length === 0 : got.includes(want),
     `${role}: seed says scope_level "${level}", so the screen must demand `
     + `${want || 'nothing'} — it demands [${got.join(', ') || 'nothing'}]`);
  ok(JSON.stringify(client[role]) === JSON.stringify(got),
     `${role}: the screen and the server agree`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
