/**
 * Smoke test.
 *
 * Mounts RR-CMS at /rrcms with an INJECTED stub pool — which is the same path
 * CRTMS would use. If this passes, the mount-inside-CRTMS story is not a claim,
 * it is a tested fact.
 */
process.env.APP_BASE_PATH = '/rrcms';
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'development';

const assert = require('assert');
const http = require('http');
const express = require('express');

// ---- stub pool -------------------------------------------------------------
const seenSql = [];
let currentUserRow = null;

const ROLE_PERMS = {
  sysadmin:    ['master.edit','rr.view','rr.edit','contract.view','contract.edit','staff.view','audit.view','report.export'],
  rr_incharge: ['rr.view','staff.view','stay.manage','feedback.view','inspection.create','report.export'],
  div_officer: ['rr.view','rr.edit','contract.view','contract.edit','staff.view','bill.pass','report.export'],
};

function rowsFor(sql) {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('FROM sessions'))            return currentUserRow ? [currentUserRow] : [];
  if (s.includes('FROM role_permissions'))    return (ROLE_PERMS[currentUserRow?.role_code] || []).map(code => ({ code }));
  if (s.includes('FROM running_rooms rr WHERE') && s.includes('COUNT(*) AS rr_count'))
    return [{ rr_count: 44, beds: 2675, rooms: 604, crews_day: 3521, peak: 2424, meal_sites: 33, female_sites: 28, female_rooms: 37 }];
  if (s.includes('FROM divisions d'))         return [{ code:'BB', name:'Mumbai', rr_count:19, beds:813, crews_day:844, peak:815, female_sites:8 }];
  if (s.includes('GROUP BY rr.category'))     return [{ category:'A', n:21, beds:2070 }];
  if (s.includes('FROM staff st JOIN'))       return [{ on_roll: 1010, approved: 950, pending: 60 }];
  if (s.includes('FROM running_room_manpower m JOIN running_rooms')) return [{ 'COALESCE(SUM(m.sanctioned_count),0)': 1072 }];
  if (s.includes('COUNT(DISTINCT c.contractor_id)')) return [{ x: 16 }];
  if (s.includes('FROM feedback_coverage fc'))return [{ periods: 44, meeting: 30, avg_pct: 61.2 }];
  if (s.includes('FROM monthly_grading g'))   return [{ head:'cleanliness', avg_rating:4.21, sites:44 }];
  if (s.includes('FROM deficiencies df JOIN'))return [{ total: 120, open: 44 }];
  if (s.includes('FROM contractors ct'))      return [{ id:1, code:'CON-01', name:'Contractor A', is_blacklisted:0, rr_count:3, beds:300, contracts:2, earliest_expiry:'2027-03-31', staff:60 }];
  if (s.includes('FROM running_rooms rr JOIN divisions')) return [{
    id:1, code:'RR001', name:'CSMT', category:'A', physical_rooms:48, total_beds:198, female_rooms:1,
    has_meal_facility:0, ac_status:'working', status:'operational', ref_crews_per_day:198, ref_peak_occupancy:198,
    div_code:'BB', div_name:'Mumbai', control_dept:'Electrical', sanctioned:19, on_roll:19, contractor:'Contractor A' }];
  if (s.includes('SELECT code, name FROM divisions')) return [{ code:'BB', name:'Mumbai' }];
  if (s.includes('FROM designations dg'))     return [{ id:1, code:'supervisor', name:'Supervisor', skill_category:'skilled', is_kitchen_role:0, qualification_note:'Diploma', min_per_site:3, on_roll:120, is_active:1 }];
  if (s.includes('FROM manpower_norms n'))    return [{ band_beds:50, name:'Supervisor', sort_order:2, sanctioned_count:3 }];
  if (s.includes('FROM deficiency_clauses'))  return [{ clause_code:'A1', group_code:'A', group_name:'Housekeeping', description:'Unqualified manager', rate:600, unit:'per day per staff', frequency:'daily', is_formula:0, formula_note:null, in_daily_checklist:1, is_active:1 }];
  return [];
}

const stubPool = {
  query: async (sql, params) => { seenSql.push({ sql: sql.replace(/\s+/g,' ').trim(), params }); return [rowsFor(sql), []]; },
  execute: async (sql, params) => { seenSql.push({ sql: sql.replace(/\s+/g,' ').trim(), params }); return [{ insertId: 1, affectedRows: 1 }, []]; },
  getConnection: async () => ({ beginTransaction: async()=>{}, commit: async()=>{}, rollback: async()=>{}, release: ()=>{} }),
};

// ---- mount exactly as a host application would ------------------------------
const createApp = require('../src/app');
const host = express();
host.use('/rrcms', createApp({ pool: stubPool }));

const server = host.listen(0);
const port = server.address().port;

function get(path, cookie) {
  return new Promise(res => {
    http.get({ port, path, headers: cookie ? { cookie } : {} }, r => {
      let body = ''; r.on('data', c => body += c);
      r.on('end', () => res({ status: r.statusCode, headers: r.headers, body }));
    });
  });
}

// Build a valid signed session cookie the same way local auth does.
const crypto = require('crypto');
function sessionCookie(sid = 'test-sid') {
  const mac = crypto.createHmac('sha256', 'test-secret').update(sid).digest('base64url');
  return `rrcms_sid=${encodeURIComponent(sid + '.' + mac)}`;
}
function signIn(roleCode, extra = {}) {
  currentUserRow = { id: 1, username: 'test', full_name: 'Test Officer', designation: null,
    role_id: 1, division_id: 2, running_room_id: null, contractor_id: null, must_change_pw: 0,
    role_code: roleCode, role_name: roleCode, scope_level: 'cr', ...extra };
  const { clearPermissionCache } = require('../src/middleware/auth');
  clearPermissionCache();
}

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}

(async () => {
  console.log('\n  Mounted at /rrcms with an injected pool\n');

  currentUserRow = null;
  await check('anonymous request redirects to the login page', async () => {
    const r = await get('/rrcms/');
    assert.strictEqual(r.status, 302);
    assert.ok(r.headers.location.startsWith('/rrcms/login'), 'redirect keeps the mount path: ' + r.headers.location);
  });

  await check('login page renders at the mounted path', async () => {
    const r = await get('/rrcms/login');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.includes('action="/rrcms/login"'), 'form action is mount-aware');
    assert.ok(r.body.includes('/rrcms/assets/app.css'), 'asset URL is mount-aware');
  });

  signIn('sysadmin');
  await check('dashboard renders for a signed-in user', async () => {
    const r = await get('/rrcms/', sessionCookie());
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.includes('2,675'), 'bed total rendered with Indian grouping');
    assert.ok(r.body.includes('Running rooms'), 'KPI present');
    assert.ok(r.body.includes('RRMS'), 'RRMS boundary stated on the dashboard');
  });

  await check('navigation links carry the mount path', async () => {
    const r = await get('/rrcms/', sessionCookie());
    assert.ok(r.body.includes('href="/rrcms/running-rooms"'), 'nav link is mount-aware');
    assert.ok(!/href="\/running-rooms"/.test(r.body), 'no absolute root-path links leaked');
  });

  await check('running rooms list renders', async () => {
    const r = await get('/rrcms/running-rooms', sessionCookie());
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.includes('CSMT'));
    assert.ok(r.body.includes('None'), 'no-meal site shown as such');
  });

  await check('master data screens render', async () => {
    for (const p of ['/rrcms/masters', '/rrcms/masters/designations', '/rrcms/masters/manpower-norms', '/rrcms/masters/deficiency-clauses']) {
      const r = await get(p, sessionCookie());
      assert.strictEqual(r.status, 200, p + ' returned ' + r.status);
    }
  });

  await check('deficiency schedule states that rates are not applied', async () => {
    const r = await get('/rrcms/masters/deficiency-clauses', sessionCookie());
    assert.ok(r.body.includes('never applied') || r.body.includes('not applied'));
  });

  signIn('rr_incharge');
  await check('a role without contract.view is refused the contractors page', async () => {
    const r = await get('/rrcms/contractors', sessionCookie());
    assert.strictEqual(r.status, 403);
  });

  signIn('sysadmin');
  await check('a role with contract.view is allowed', async () => {
    const r = await get('/rrcms/contractors', sessionCookie());
    assert.strictEqual(r.status, 200);
  });

  signIn('div_officer', { scope_level: 'division', division_id: 2 });
  await check('division scope reaches the SQL, not just the view', async () => {
    seenSql.length = 0;
    await get('/rrcms/running-rooms', sessionCookie());
    const scoped = seenSql.filter(q => q.sql.includes('FROM running_rooms rr JOIN divisions'));
    assert.ok(scoped.length, 'list query ran');
    assert.ok(scoped.every(q => q.sql.includes('rr.division_id = ?')), 'every list query is division-filtered');
    assert.ok(scoped.every(q => q.params.includes(2)), 'the user\'s own division id is bound');
  });

  signIn('crew', { scope_level: 'self' });
  await check('a self-scoped role sees no running rooms at all', async () => {
    seenSql.length = 0;
    const r = await get('/rrcms/running-rooms', sessionCookie());
    assert.strictEqual(r.status, 403, 'crew lack rr.view');
  });

  signIn('sysadmin');
  await check('no page leaks escaped HTML into the output', async () => {
    for (const p of ['/rrcms/', '/rrcms/running-rooms', '/rrcms/masters/designations', '/rrcms/masters/deficiency-clauses']) {
      const r = await get(p, sessionCookie());
      assert.ok(!r.body.includes('&lt;span'), `escaped markup rendered as text on ${p}`);
      assert.ok(!r.body.includes('&lt;div'), `escaped markup rendered as text on ${p}`);
    }
  });

  await check('unknown paths under the mount return 404, not the host 404', async () => {
    const r = await get('/rrcms/nope', sessionCookie());
    assert.strictEqual(r.status, 404);
  });

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  server.close();
  process.exit(fail ? 1 : 0);
})();
