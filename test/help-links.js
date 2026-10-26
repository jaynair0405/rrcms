/**
 * EVERY LINK THE HELP PAGE OFFERS MUST BE A REAL SCREEN.
 *
 * A help page is believed. That is the whole of its value and the whole of the
 * danger: a man sent to a 404 once stops believing the next line too, and then
 * the page is worse than nothing because it has cost him the habit of reading
 * it. RR-CMS has already done this to him with a real screen -- the wages page
 * offered "Open it" against a route that was never written -- and that was one
 * link on one screen, not a document whose entire job is to say where things
 * are.
 *
 * So every path in src/help/roles.js is checked against the routes actually
 * mounted by src/app.js. It walks the real router rather than a list kept by
 * hand, because a list kept by hand is the thing being guarded against.
 */
process.env.APP_BASE_PATH = '/rrcms';
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'development';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { ROLES } = require('../src/help/roles');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2713 ' + m); } else { fail++; console.log('  \u2717 ' + m); } };

/* THE ROUTER IS ASKED, NOT READ. Express 5 does not expose a mounted
   sub-router's prefix on its layer, so walking the stack cannot recover the
   paths -- and a check that quietly recovers none would pass for ever while
   proving nothing. So the app is started and every help path is actually
   requested. An anonymous request to a real screen redirects to the login page;
   an anonymous request to a path that does not exist returns 404. That is the
   discriminator, and it needs no session and no database. */
/* Signed in, because an ANONYMOUS request to a path that does not exist
   redirects to the login page exactly like a real one -- no discriminator at
   all. Signed in, an unknown path answers 404 and a real one answers something
   else, whatever the stub database does to it. */
const USER = { id: 1, username: 'test', full_name: 'Test Officer', designation: null,
  role_id: 1, division_id: 2, running_room_id: null, contractor_id: null, must_change_pw: 0,
  role_code: 'div_officer', role_name: 'officer', scope_level: 'cr' };
const stubPool = {
  query: async (sql) => [String(sql).includes('FROM sessions') ? [USER] : [], []],
  execute: async () => [{ insertId: 1, affectedRows: 1 }, []],
  getConnection: async () => ({ beginTransaction: async()=>{}, commit: async()=>{},
                                rollback: async()=>{}, release: ()=>{} }),
};
const sid = 'help-test-sid';
const cookie = `rrcms_sid=${encodeURIComponent(sid + '.'
  + crypto.createHmac('sha256', 'test-secret').update(sid).digest('base64url'))}`;
const host = express();
host.use('/rrcms', require('../src/app')({ pool: stubPool }));
const server = host.listen(0);
const port = server.address().port;
const get = path => new Promise(res => {
  http.get({ port, path: '/rrcms' + path, headers: { cookie } }, r => {
    let b = ''; r.on('data', c => b += c); r.on('end', () => res(r.statusCode));
  });
});

const wanted = new Set();
for (const role of Object.values(ROLES)) {
  role.sections.forEach(s => s.steps.forEach(st => wanted.add(st.at)));
  role.findIt.forEach(f => wanted.add(f[1]));
}

(async () => {
  // The discriminator itself is proved first. Without this the whole check
  // could be passing because every request returns the same thing.
  ok(await get('/no-such-screen-at-all') === 404, 'a path that does not exist answers 404');

  const missing = [];
  for (const p of wanted) if (await get(p) === 404) missing.push(p);
  ok(missing.length === 0, missing.length
    ? `every help link is a real screen — MISSING: ${missing.join(', ')}`
    : `every help link is a real screen (${wanted.size} checked)`);

/* And every role that has a page must have all three parts of it. A section
   with no steps, or an index with no entries, is a page that looks finished. */
for (const [code, role] of Object.entries(ROLES)) {
  ok(role.sections.length > 0 && role.sections.every(s => s.steps.length > 0),
     `${code}: every section has steps in it`);
  ok(role.findIt.length > 0 && role.notMine.length > 0,
     `${code}: has both "where to find what" and "not yours to do"`);
}

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  server.close();
  process.exit(fail ? 1 : 0);
})();
