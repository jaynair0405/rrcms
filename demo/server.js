#!/usr/bin/env node
/**
 * DEMO SERVER — the real application, with no database.
 *
 *     node demo/server.js      then open http://localhost:3100
 *
 * Every screen, route, permission check and scoping rule is the real code from
 * src/. Only the database is replaced: an in-memory stub answers the queries.
 * Nothing is installed and MySQL is not involved. One file is written: a
 * placeholder PDF under storage/uploads, so that the "open the certificate"
 * links on the seeded food licences lead somewhere instead of dead-ending.
 *
 * Sign in with the ROLE NAME as the username and "demo" as the password:
 *
 *     sysadmin        sees all 44 running rooms
 *     div_officer     sees only Solapur's 5
 *     rr_incharge     sees only Kalyan
 *     contractor_sup  sees only Contractor A's running rooms
 *     hq              sees everything, read-only
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'demo-only-secret';
process.env.APP_BASE_PATH  = process.env.APP_BASE_PATH  || '/';
process.env.NODE_ENV       = 'development';

const express = require('express');
const D = require('./data');

// The pilot: four running rooms and the rosters the Railway supplied, in place
// of the generated sample data. See demo/pilot-overlay.js.
const PILOT = process.env.DEMO_PILOT === '1'
  ? require('./pilot-overlay').apply(D) : null;

// Invented particulars for one site, so the screens downstream of the staff
// register can be tested before the Railway has collected the real ones.
// Loudly separate from the pilot data — see demo/test-data.js.
const TEST_DATA = (PILOT && process.env.DEMO_TEST_DATA === '1')
  ? require('./test-data').apply(D, { site: process.env.DEMO_TEST_SITE || 'IGP' }) : null;
const { hashPassword } = require('../src/auth/local');

const PORT = +(process.env.PORT || 3100);
const PASSWORD_HASH = hashPassword('demo');

// --- demo users, one per role -----------------------------------------------
const KYN = D.RUNNING_ROOMS.find(r => r.name === 'KYN');
const SUR = D.DIVS.find(d => d.code === 'SUR');
const USERS = [
  { id: 1, username: 'sysadmin',       full_name: 'System Administrator',   role_code: 'sysadmin',       role_name: 'System Administrator',      scope_level: 'cr' },
  { id: 2, username: 'hq',             full_name: 'PCEE Office',            role_code: 'hq',             role_name: 'HQ / PCEE Office',          scope_level: 'cr' },
  { id: 3, username: 'div_officer',    full_name: 'Sr. DEE (TRO) Solapur',  role_code: 'div_officer',    role_name: 'Sr. DEE (TRO) / DME (O&C)', scope_level: 'division',     division_id: SUR.id },
  { id: 4, username: 'rr_incharge',    full_name: 'RR In-charge, Kalyan',   role_code: 'rr_incharge',    role_name: 'RR In-charge / CLI',        scope_level: 'running_room', running_room_id: KYN.id },
  { id: 5, username: 'contractor_sup', full_name: `Supervisor, ${KYN.contractor}`, role_code:'contractor_sup', role_name: 'Contractor Supervisor', scope_level: 'contractor', contractor_id: KYN.contractor_id },
].map(u => ({ role_id: u.id, division_id: null, running_room_id: null, contractor_id: null,
              designation: null, must_change_pw: 0, ...u }));

// In pilot mode the scoped demo users must point at pilot sites, or the
// divisional officer, the RR in-charge and the contractor supervisor all sign
// in to an empty screen — which looks like a fault and is only a mis-set scope.
if (PILOT) {
  // Point the scoped logins at ONE site, and the same site for both, so the
  // in-charge and the supervisor are looking at the same people. Taking the
  // contractor from the top of the list was a mistake: reordering the
  // contractors file silently moved the supervisor to another running room,
  // and a person approved at one site read as pending at the other.
  const SITE = process.env.DEMO_TEST_SITE || 'IGP';
  const site = D.RUNNING_ROOMS.find(r => r.name === SITE && r.status === 'operational')
            || D.RUNNING_ROOMS.find(r => r.status === 'operational');
  const bb   = D.DIVS.find(d => d.code === 'BB');
  const ct   = site ? D.CONTRACTORS.find(c => c.id === site.contractor_id) : null;
  const u = c => USERS.find(x => x.role_code === c);
  if (bb)   { u('div_officer').division_id = bb.id;
              u('div_officer').full_name = 'Sr. DEE (TRO) Mumbai'; }
  if (site) { u('rr_incharge').running_room_id = site.id;
              u('rr_incharge').full_name = `RR In-charge, ${site.name}`; }
  if (ct)   { u('contractor_sup').contractor_id = ct.id;
              u('contractor_sup').full_name = `Supervisor, ${ct.name}`; }
  PILOT.boundSite = site ? site.name : '—';
  PILOT.boundContractor = ct ? ct.name : 'no contractor attached';
}

// Exactly the grants seeded in db/seeds/01_reference.sql — the demo must not be
// more permissive than the real thing, or role testing here proves nothing.
const PERMS = {
  hq:             ['rr.view','contract.view','staff.view','feedback.view','report.export','audit.view',
                   'fssai.view','crew.contact','wages.view'],
  div_officer:    ['rr.view','rr.edit','contract.view','contract.edit','staff.view','staff.screen',
                   'muster.countersign','feedback.view','feedback.close','inspection.create','inspection.sign',
                   'deficiency.record','deficiency.close','bill.prepare','bill.pass','report.export','audit.view',
                   'fssai.view','fssai.edit','fssai.inspect','crew.contact','crew.link','cctv.record',
                   'vendor.approve','asset.manage','staff.grade','staff.admit','feedback.enter','callsheet.manage','menu.manage','cleaning.verify','linen.accept',
                   'wages.view','wages.record','wages.verify','incident.record','incident.close','compliance.record','occupancy.record'],
  rr_incharge:    ['rr.view','staff.view','staff.edit','muster.countersign','stay.manage','meal.record',
                   'feedback.view','feedback.close','inspection.create','inspection.sign','deficiency.record',
                   'report.export','bill.prepare','fssai.view','fssai.edit','fssai.inspect','crew.contact','crew.link','cctv.record','asset.manage','staff.grade','staff.admit','feedback.enter','callsheet.manage','menu.manage','cleaning.verify','linen.accept',
                   'wages.view','wages.verify','incident.record','incident.close','compliance.record','occupancy.record'],
  contractor_sup: ['rr.view','staff.view','staff.edit','muster.mark','stay.manage','meal.record',
                   'fssai.view','fssai.edit','cctv.record','wages.view','wages.record','incident.record','compliance.record'],
  crew:           ['feedback.submit'],
  // Reads everything (they already hold master.edit); makes none of the
  // operational decisions — no screening, closing, counter-signing or bill passing.
  sysadmin:       ['master.edit','menu.manage','cleaning.verify','linen.accept',
                   'rr.view','rr.edit','contract.view','contract.edit','staff.view',
                   'feedback.view','audit.view','report.export','fssai.view','crew.contact',
                   'user.manage','vendor.approve','asset.manage','callsheet.manage',
                   'wages.view','wages.record','wages.verify','incident.record','incident.close','compliance.record','occupancy.record'],
};

// --- in-memory state ---------------------------------------------------------
let lastInsertId = 1;
let lastAffected = 1;   // so a stub can say whether a row was actually new

/** A bill with the joins the real query carries. */
function decorateBill(b) {
  const rr = b.running_room_id ? D.RUNNING_ROOMS.find(r => r.id === b.running_room_id) : null;
  const c = D.CONTRACTORS.find(x => x.id === b.contract_id);
  return { ...b, rr_name: rr ? rr.name : null, div_code: rr ? rr.div_code : null,
    contractor_name: c ? c.name : 'Contractor',
    agreement_no: c ? `AGREEMENT-AWAITED/${c.code}` : null,
    checked_by_name: (USERS.find(u => u.id === b.checked_by) || {}).full_name || null,
    passed_by_name: (USERS.find(u => u.id === b.passed_by) || {}).full_name || null,
    docs_in: [...D.BILL_DOCS.values()].filter(d => d.bill_id === b.id && d.is_received).length };
}
const sessions = new Map();                 // session id -> user id
const occupancyEdits = new Map();           // `${rrId}|${month}` -> occupants
require('./data').OCC_EDITS = occupancyEdits;
// The month is written as '2026-08-01' by one caller and read as '2026-08' by
// another. Rather than have the two silently miss each other -- which is how
// the demo came to show "not entered" for a figure that had just been typed in
// -- every lookup goes through here and matches on the month, however written.
const occupancyOf = (rrId, month) => {
  const m = String(month).slice(0, 7);
  for (const [k, v] of occupancyEdits) {
    const [id, mo] = k.split('|');
    if (Number(id) === Number(rrId) && String(mo).slice(0, 7) === m) return v;
  }
  return undefined;
};
require('./data').OCC_OF = occupancyOf;

// --- scope helpers -----------------------------------------------------------
function visibleRooms(userId) {
  const u = USERS.find(x => x.id === userId);
  if (!u) return [];
  if (u.scope_level === 'cr') return D.RUNNING_ROOMS;
  if (u.scope_level === 'division') return D.RUNNING_ROOMS.filter(r => r.division_id === u.division_id);
  if (u.scope_level === 'running_room') return D.RUNNING_ROOMS.filter(r => r.id === u.running_room_id);
  if (u.scope_level === 'contractor') return D.RUNNING_ROOMS.filter(r => r.contractor_id === u.contractor_id);
  return [];
}
let currentUserId = null;                   // set per request by the sessions lookup

// --- the stub pool -----------------------------------------------------------
// Ids and timestamps for rows the demo creates while it runs. `nextId` climbs
// well clear of the generated data so a new call can never collide with a
// seeded one, and `stamp` writes the same 'YYYY-MM-DD HH:MM:SS' shape MySQL
// hands back -- the views slice these strings by position.
let runtimeId = 900000;
const nextId = () => ++runtimeId;
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function handle(sql, params = []) {
  const s = sql.replace(/\s+/g, ' ').trim();
  const P = Array.isArray(params) ? params.flat() : [];

  if (s.startsWith('SELECT u.id, u.username') && s.includes('FROM sessions')) {
    const uid = sessions.get(P[0]);
    currentUserId = uid || null;
    const u = USERS.find(x => x.id === uid);
    return u ? [u] : [];
  }
  if (s.includes('FROM role_permissions')) {
    const u = USERS.find(x => x.role_id === P[0]);
    return (PERMS[u ? u.role_code : ''] || []).map(code => ({ code }));
  }
  if (s.includes('FROM users WHERE username')) {
    const u = USERS.find(x => x.username === P[0]);
    return u ? [{ id: u.id, password_hash: PASSWORD_HASH, is_active: 1, failed_logins: 0, locked_until: null }] : [];
  }
  if (s.startsWith('INSERT INTO sessions')) { sessions.set(P[0], P[1]); return []; }
  if (s.startsWith('UPDATE sessions'))      { sessions.delete(P[0]); return []; }
  if (s.startsWith('INSERT INTO audit_log'))return [];

  // ---------- accounts: own password, and administering everyone else's -----
  // The demo keeps its five fixed logins so the sign-in card stays true, but
  // the screens are real code and must be exercisable.
  if (s.startsWith('SELECT password_hash, username FROM users')) {
    const u = USERS.find(x => x.id === P[0]);
    return u ? [{ password_hash: PASSWORD_HASH, username: u.username }] : [];
  }
  if (s.startsWith('SELECT u.id, u.username, u.full_name, u.designation, u.phone, u.is_active')) {
    return USERS.map(u => ({
      id: u.id, username: u.username, full_name: u.full_name, designation: u.designation,
      phone: u.phone || null, is_active: u.is_active === undefined ? 1 : u.is_active,
      must_change_pw: u.must_change_pw || 0, last_login_at: u.last_login_at || null,
      locked_until: null, role_code: u.role_code, role_name: u.role_name,
      div_code: u.division_id ? (D.DIVS.find(d => d.id === u.division_id) || {}).code : null,
      rr_name: u.running_room_id ? (D.RUNNING_ROOMS.find(r => r.id === u.running_room_id) || {}).name : null,
      contractor_name: u.contractor_id ? (D.CONTRACTORS.find(c => c.id === u.contractor_id) || {}).name : null,
    }));
  }
  if (s.startsWith('SELECT id, code, name FROM roles'))
    return [...new Map(USERS.map(u => [u.role_code, u])).values()]
      .map(u => ({ id: u.role_id, code: u.role_code, name: u.role_name }));
  if (s.startsWith('SELECT id, code, name FROM divisions'))
    return D.DIVS.map(d => ({ id: d.id, code: d.code, name: d.name }));
  if (s.startsWith('SELECT id, code, name FROM contractors'))
    return D.CONTRACTORS.map(c => ({ id: c.id, code: c.code, name: c.name }));
  if (s.includes('FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id WHERE rr.status')
      && s.includes('rr.status AS status') === false && s.includes('ORDER BY d.sort_order, rr.name'))
    return D.RUNNING_ROOMS.filter(r => r.status === 'operational')
      .map(r => ({ id: r.id, name: r.name, status: r.status, div_code: r.div_code }));
  if (s.startsWith('SELECT id, code FROM roles WHERE code')) {
    const u = USERS.find(x => x.role_code === P[0]);
    return u ? [{ id: u.role_id, code: u.role_code }] : [];
  }
  if (s.startsWith('SELECT id FROM users WHERE username')) {
    const u = USERS.find(x => x.username === P[0]);
    return u ? [{ id: u.id }] : [];
  }
  if (s.includes("SELECT COUNT(*) AS n FROM users u JOIN roles r"))
    return [{ n: USERS.filter(u => u.role_code === 'sysadmin' && u.id !== P[0]
                                && u.is_active !== 0).length }];
  if (s.startsWith('SELECT u.*, r.code AS role_code FROM users u')) {
    const u = USERS.find(x => x.id === P[0]);
    return u ? [{ ...u, is_active: u.is_active === undefined ? 1 : u.is_active }] : [];
  }
  if (s.startsWith('INSERT INTO users')) {
    const id = Math.max(...USERS.map(u => u.id)) + 1;
    const role = USERS.find(x => x.role_id === P[5]) || {};
    USERS.push({ id, role_id: P[5], username: P[0], full_name: P[1], designation: P[2],
      phone: P[3], role_code: role.role_code, role_name: role.role_name,
      scope_level: role.scope_level, division_id: P[6], running_room_id: P[7],
      contractor_id: P[8], is_active: 1, must_change_pw: 1, last_login_at: null });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE users SET full_name')) {
    const u = USERS.find(x => x.id === P[7]);
    if (u) { const role = USERS.find(x => x.role_id === P[3]) || {};
      Object.assign(u, { full_name: P[0], designation: P[1], phone: P[2], role_id: P[3],
        role_code: role.role_code || u.role_code, role_name: role.role_name || u.role_name,
        scope_level: role.scope_level || u.scope_level,
        division_id: P[4], running_room_id: P[5], contractor_id: P[6] }); }
    return [];
  }
  // Changing a password must actually clear the flag, or the account is sent
  // back to the same screen for ever. The demo keeps one shared password, so
  // the new one is not stored -- but the flag is, because that is what is
  // being demonstrated.
  if (s.startsWith('UPDATE users SET password_hash')) {
    const u = USERS.find(x => x.id === P[1]);
    if (u) { u.must_change_pw = s.includes('must_change_pw = 1') ? 1 : 0; }
    return [];
  }
  if (s.startsWith('UPDATE users SET is_active')) {
    const u = USERS.find(x => x.id === P[1]); if (u) u.is_active = P[0]; return [];
  }
  if (s.startsWith('UPDATE users'))         return [];

  // ---------- food safety / FSSAI (stage 9) ----------
  if (s.includes('LEFT JOIN food_licences fl ON fl.running_room_id = rr.id')) {
    return visibleRooms(currentUserId)
      .filter(r => r.has_meal_facility && r.status === 'operational').map(r => {
      const fl = D.FOOD_LICENCES.find(l => l.running_room_id === r.id && l.is_current) || {};
      const insp = D.FOOD_INSPECTIONS.filter(i => i.running_room_id === r.id)
        .sort((a, b) => b.inspection_date.localeCompare(a.inspection_date));
      return { id: r.id, name: r.name, has_meal_facility: 1, div_code: r.div_code,
        contractor: r.contractor, licence_id: fl.id || null, licence_number: fl.licence_number || null,
        licensee_name: fl.licensee_name || null, valid_from: fl.valid_from || null,
        valid_upto: fl.valid_upto || null, licence_status: fl.status || null,
        certificate_file_id: fl.certificate_file_id || null,
        tech_person_name: fl.tech_person_name || null, tech_person_qual: fl.tech_person_qual || null,
        last_inspection: insp.length ? insp[0].inspection_date : null,
        last_result: insp.length ? insp[0].result : null };
    }).sort((a, b) => a.div_code.localeCompare(b.div_code) || a.name.localeCompare(b.name));
  }
  if (s.includes('FROM food_licence_returns flr JOIN running_rooms rr')) {
    const ids = new Set(visibleRooms(currentUserId).filter(r => r.status === 'operational').map(r => r.id));
    return D.FOOD_RETURNS.filter(r => ids.has(r.running_room_id) && r.completed_on)
      .map(r => ({ running_room_id: r.running_room_id, obligation: r.obligation,
                   period_label: r.period_label, completed_on: r.completed_on }));
  }
  // One running room by id. The dashboard's "no agreement covers this site"
  // query opens with exactly the same eleven words and had to be excluded by
  // hand: without the guard it came back as running room number 1 -- the
  // division id arriving as P[0] and being read as a room id -- so the panel
  // accused CSMT of having no contractor. Eighth collision of this shape in
  // this file. `rooms` is not in scope this high up, which is why the narrower
  // query cannot simply be moved above this one.
  if (s.startsWith('SELECT rr.id, rr.name, d.code AS div_code FROM running_rooms')
      && !s.includes('NOT EXISTS')) {
    const r = D.RUNNING_ROOMS.find(x => x.id === P[0]);
    return r ? [{ id: r.id, name: r.name, div_code: r.div_code }] : [];
  }
  if (s.startsWith('SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code, ct.id AS contractor_id')) {
    const r = D.RUNNING_ROOMS.find(x => x.id === P[0]);
    return r ? [{ id: r.id, name: r.name, has_meal_facility: r.has_meal_facility,
                  contractor_id: r.contractor_id, div_code: r.div_code, contractor: r.contractor }] : [];
  }
  if (s.startsWith('SELECT fl.*, ct.name AS contractor_name'))
    return D.FOOD_LICENCES.filter(l => l.running_room_id === P[0])
      .sort((a, b) => (!!b.is_current - !!a.is_current) || b.valid_upto.localeCompare(a.valid_upto));
  if (s.startsWith('SELECT * FROM food_licence_returns WHERE running_room_id'))
    return D.FOOD_RETURNS.filter(r => r.running_room_id === P[0])
      .sort((a, b) => b.due_on.localeCompare(a.due_on) || b.id - a.id).slice(0, 40);
  if (s.startsWith('SELECT fi.*, u.full_name AS inspector FROM food_inspections'))
    return D.FOOD_INSPECTIONS.filter(i => i.running_room_id === P[0])
      .sort((a, b) => b.inspection_date.localeCompare(a.inspection_date)).slice(0, 12);
  if (s.startsWith('SELECT fi.*, rr.name AS rr_name')) {
    const i = D.FOOD_INSPECTIONS.find(x => x.id === P[0]);
    return i ? [i] : [];
  }
  if (s.startsWith('SELECT fii.*, ci.item_code'))
    return D.FOOD_INSPECTION_ITEMS.filter(x => x.inspection_id === P[0])
      .map(x => ({ ...x, ...D.FOOD_CHECK_ITEMS.find(c => c.id === x.item_id) , id: x.id }))
      .sort((a, b) => a.sort_order - b.sort_order);
  if (s.startsWith('SELECT * FROM food_check_items') ||
      s.startsWith('SELECT id, is_critical FROM food_check_items')) return D.FOOD_CHECK_ITEMS;
  if (s.startsWith('SELECT * FROM food_licences WHERE running_room_id') ||
      s.startsWith('SELECT id FROM food_licences WHERE running_room_id')) {
    const l = D.FOOD_LICENCES.find(x => x.running_room_id === P[0] && x.is_current);
    return l ? [l] : [];
  }
  if (s.startsWith('SELECT id, certificate_file_id FROM food_licences')) {
    const l = D.FOOD_LICENCES.find(x => x.id === P[0] && x.running_room_id === P[1]);
    return l ? [l] : [];
  }
  if (s.startsWith('SELECT id, document_file_id FROM food_licence_returns')) {
    const r = D.FOOD_RETURNS.find(x => x.id === P[0] && x.running_room_id === P[1]);
    return r ? [r] : [];
  }
  if (s.startsWith('UPDATE food_licences SET is_current = NULL')) {
    D.FOOD_LICENCES.forEach(l => { if (l.running_room_id === P[0]) l.is_current = null; });
    return [];
  }
  if (s.startsWith('INSERT INTO food_licences')) {
    const rr = D.RUNNING_ROOMS.find(x => x.id === P[0]) || {};
    const id = D.nextFoodId();
    D.FOOD_LICENCES.unshift({ id, running_room_id: P[0], contractor_id: P[1], licence_number: P[2],
      licensee_name: P[3], premises_address: P[4], kind_of_business: P[5], licence_category: P[6],
      issuing_authority: P[7], issued_on: P[8], valid_from: P[9], valid_upto: P[10], status: P[11],
      tech_person_name: P[12], tech_person_qual: P[13], tech_person_mobile: P[14],
      form_ix_name: P[15], form_ix_mobile: P[16], remarks: P[17],
      certificate_file_id: null, is_current: 1, recorded_by: P[18], contractor_name: rr.contractor });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE food_licences SET certificate_file_id')) {
    const l = D.FOOD_LICENCES.find(x => x.id === P[1]); if (l) l.certificate_file_id = P[0];
    return [];
  }
  if (s.startsWith('INSERT INTO food_licence_returns')) {
    const found = D.FOOD_RETURNS.find(r => r.running_room_id === P[0]
      && r.obligation === P[2] && r.period_label === P[3]);
    if (found) {
      Object.assign(found, { completed_on: P[5], reference_no: P[6],
                             agency_name: P[7], result_summary: P[8] });
      lastInsertId = 0;
    } else {
      const id = D.nextFoodReturnId();
      D.FOOD_RETURNS.push({ id, running_room_id: P[0], licence_id: P[1], obligation: P[2],
        period_label: P[3], due_on: P[4], completed_on: P[5], reference_no: P[6],
        agency_name: P[7], result_summary: P[8], document_file_id: null, recorded_by: P[9] });
      lastInsertId = id;
    }
    return [];
  }
  if (s.startsWith('SELECT id FROM food_licence_returns')) {
    const r = D.FOOD_RETURNS.find(x => x.running_room_id === P[0]
      && x.obligation === P[1] && x.period_label === P[2]);
    return r ? [{ id: r.id }] : [];
  }
  if (s.startsWith('UPDATE food_licence_returns SET document_file_id')) {
    const r = D.FOOD_RETURNS.find(x => x.id === P[1]); if (r) r.document_file_id = P[0];
    return [];
  }
  if (s.startsWith('INSERT INTO food_inspections')) {
    const rr = D.RUNNING_ROOMS.find(x => x.id === P[0]) || {};
    const found = D.FOOD_INSPECTIONS.find(i => i.running_room_id === P[0] && i.inspection_date === P[2]);
    if (found) {
      Object.assign(found, { items_checked: P[6], items_failed: P[7], critical_failed: P[8],
                             result: P[9], remarks: P[10] });
      lastInsertId = found.id;
    } else {
      const id = D.nextFoodInspId();
      D.FOOD_INSPECTIONS.push({ id, running_room_id: P[0], licence_id: P[1], inspection_date: P[2],
        inspected_by: P[3], inspector_name: P[4], contractor_rep_name: P[5], items_checked: P[6],
        items_failed: P[7], critical_failed: P[8], result: P[9], remarks: P[10],
        rr_name: rr.name, rr_id: rr.id, div_code: rr.div_code,
        inspector: (USERS.find(u => u.id === P[3]) || {}).full_name || null });
      lastInsertId = id;
    }
    return [];
  }
  if (s.startsWith('SELECT id FROM food_inspections WHERE running_room_id')) {
    const i = D.FOOD_INSPECTIONS.find(x => x.running_room_id === P[0] && x.inspection_date === P[1]);
    return i ? [{ id: i.id }] : [];
  }
  if (s.startsWith('INSERT INTO food_inspection_items')) {
    const found = D.FOOD_INSPECTION_ITEMS.find(x => x.inspection_id === P[0] && x.item_id === P[1]);
    if (found) { found.status = P[2]; found.observation = P[3]; }
    else D.FOOD_INSPECTION_ITEMS.push({ id: D.nextFoodItemId(), inspection_id: P[0],
      item_id: P[1], status: P[2], observation: P[3], evidence_file_id: null });
    return [];
  }


  // The real scope helper appends "status = 'operational'" for the screens
  // that ask what is live now rather than what is on the register. The stub
  // reads that off the statement so both answer the same question.
  const rooms = visibleRooms(currentUserId).filter(
    r => !s.includes("status = 'operational'") || r.status === 'operational');
  const sum = (a, f) => a.reduce((t, r) => t + (r[f] || 0), 0);

  if (s.includes('COUNT(*) AS rr_count')) return [{
    rr_count: rooms.length, beds: sum(rooms,'total_beds'), rooms: sum(rooms,'physical_rooms'),
    crews_day: sum(rooms,'ref_crews_per_day'), peak: sum(rooms,'ref_peak_occupancy'),
    meal_sites: rooms.filter(r=>r.has_meal_facility).length,
    female_sites: rooms.filter(r=>r.female_rooms>0).length, female_rooms: sum(rooms,'female_rooms') }];

  if (s.includes('FROM divisions d JOIN running_rooms'))
    return D.DIVS.map(d => { const g = rooms.filter(r => r.division_id === d.id); return g.length ? {
      code:d.code, name:d.name, rr_count:g.length, beds:sum(g,'total_beds'),
      crews_day:sum(g,'ref_crews_per_day'), peak:sum(g,'ref_peak_occupancy'),
      female_sites:g.filter(r=>r.female_rooms>0).length } : null; }).filter(Boolean);

  if (s.includes('GROUP BY rr.category'))
    return ['A','B','C'].map(c => { const g = rooms.filter(r => r.category === c);
      return g.length ? { category:c, n:g.length, beds:sum(g,'total_beds') } : null; }).filter(Boolean);

  if (s.includes("SUM(st.screening_status = 'approved') AS approved")) {   // dashboard tile only
    const on = sum(rooms,'on_roll');
    return [{ on_roll: on, approved: Math.round(on*0.94), pending: on - Math.round(on*0.94) }];
  }
  if (s.startsWith('SELECT COALESCE(SUM(m.sanctioned_count),0) FROM running_room_manpower')) return [{ x: sum(rooms,'sanctioned') }];
  if (s.includes('COUNT(DISTINCT c.contractor_id)')) return [{ x: new Set(rooms.map(r=>r.contractor_id)).size }];

  // ---------- monthly certification pack (stage 8) ----------
  // Placed before the older aggregate matchers: several of these queries touch
  // the same tables and would otherwise be answered by a looser rule.
  const CERT_FIELDS = require('../src/routes/certificates').FIELDS;
  const monthArg0 = () => P.find(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x));
  const certKey = (rrId, month) => `${rrId}|${String(month).slice(0, 10)}`;
  const userName = id => { const u = USERS.find(x => x.id === id); return u ? u.full_name : null; };
  const inMonth = (d, month) => String(d).slice(0, 7) === String(month).slice(0, 7);

  if (s.includes('LEFT JOIN monthly_certificates mc')) {
    const month = monthArg0();
    return rooms.map(r => {
      const c = D.CERTIFICATES.get(certKey(r.id, month));
      return { id: r.id, code: r.code, name: r.name, total_beds: r.total_beds,
        has_meal_facility: r.has_meal_facility, div_code: r.div_code, contractor: r.contractor,
        cert_id: c ? c.id : null, status: c ? c.status : null,
        coverage_pct: c ? c.coverage_pct : null, meets_floor: c ? c.meets_floor : null,
        deficiencies_raised: c ? c.deficiencies_raised : null,
        deficiencies_open: c ? c.deficiencies_open : null,
        man_days_due: c ? c.man_days_due : null, man_days_present: c ? c.man_days_present : null,
        certified_at: c ? c.certified_at : null, countersigned_at: c ? c.countersigned_at : null };
    }).sort((a, b) => (a.cert_id === null ? 0 : 1) - (b.cert_id === null ? 0 : 1)
      || a.name.localeCompare(b.name));
  }

  // ------------------- the agreements panel on the dashboard (stage 27) ------
  //
  // PLACED HERE, ABOVE `SELECT c.id, c.agreement_no`, ON PURPOSE. That older
  // stub answers a different question -- one running room's contract -- and it
  // starts with the same eleven characters as this one, so written below it
  // this query came back as a single fabricated row with every field empty and
  // a contractor code of "CON-null". Seventh collision of this shape in this
  // file; every one has been a narrower query swallowed by a wider one above
  // it, and the only reliable cure is to put the narrower one first.
  //
  // `rooms` is already the caller's scope, so an agreement is visible exactly
  // when it covers a room the signed-in user can see -- the same rule the SQL
  // enforces with the scope clause.
  if (s.includes('GROUP_CONCAT(DISTINCT rr.name')) {
    const visible = new Set(rooms.map(r => r.id));
    return (D.CONTRACTS || [])
      .map(c => {
        const mine = c.rooms.filter(r => visible.has(r.id));
        if (!mine.length) return null;
        return Object.assign({}, c, {
          rooms: mine.length,
          room_names: mine.map(r => r.name).sort().join(', '),
        });
      })
      .filter(Boolean)
      .sort((a, b) => String(a.extended_to || a.end_date).localeCompare(String(b.extended_to || b.end_date)));
  }
  // Operational rooms no live agreement covers.
  if (s.includes('NOT EXISTS') && s.includes('contract_running_rooms crr')) {
    const covered = new Set();
    (D.CONTRACTS || []).forEach(c => c.rooms.forEach(r => covered.add(r.id)));
    return rooms.filter(r => !covered.has(r.id))
      .map(r => ({ id: r.id, name: r.name, div_code: r.div_code }));
  }

  /* ---------------- the agreement screen (stage 29) ------------------------
   *
   * The contract form is the first place in RR-CMS where a contract can be
   * written down at all -- until it existed the table could only be filled by
   * the pilot loader from a terminal, so the officer's LOA panel was a list of
   * things nobody could enter. The demo therefore has to answer both halves:
   * what the form reads, and what the save does.
   *
   * PLACED ABOVE `SELECT c.id, c.agreement_no` ON PURPOSE. The contractor's own
   * agreements query now begins with those same eleven characters, and written
   * below it it came back as one fabricated row belonging to a running room.
   * Ninth collision of this shape in this file, every one a narrower query
   * swallowed by a wider one above it. The cure is always the same: put the
   * narrower one first.
   */
  if (s.startsWith('SELECT DISTINCT dv.id, dv.code, dv.name')) {
    const seen = new Map();
    rooms.forEach(r => {
      if (seen.has(r.division_id)) return;
      const d = D.DIVS.find(x => x.id === r.division_id);
      if (d) seen.set(r.division_id, { id: d.id, code: d.code, name: d.name });
    });
    return [...seen.values()];
  }
  if (s.startsWith('SELECT rr.id AS rr_id, rr.name AS rr_name')) {
    const holder = new Map();
    (D.CONTRACTS || []).forEach(c => c.rooms.forEach(r => holder.set(r.id, c)));
    // Operational rooms, plus whatever this agreement already holds -- the
    // real query's rule, so the demo cannot hide the not_in_scope noise that
    // the first cut of this screen showed.
    const mine = new Set(((D.CONTRACTS || []).find(c => c.id === P[P.length - 1]) || { rooms: [] })
      .rooms.map(r => r.id));
    return rooms.filter(r => r.status === 'operational' || mine.has(r.id)).map(r => {
      const h = holder.get(r.id) || null;
      return { rr_id: r.id, rr_name: r.name, rr_status: r.status,
        division_id: r.division_id, dv_code: r.div_code,
        held_contract_id: h ? h.id : null, held_agreement: h ? h.agreement_no : null,
        held_contractor: h ? h.contractor_name : null };
    });
  }
  if (s.startsWith('SELECT id, code, name, is_blacklisted FROM contractors'))
    return D.CONTRACTORS.map(c => ({ id: c.id, code: c.code, name: c.name,
      is_blacklisted: c.is_blacklisted || 0 }));
  if (s.startsWith('SELECT crr.running_room_id, crr.effective_from')) {
    const c = (D.CONTRACTS || []).find(x => x.id === P[0]);
    return c ? c.rooms.map(r => ({ running_room_id: r.id,
      effective_from: c.start_date, effective_to: null })) : [];
  }
  if (s.startsWith('SELECT running_room_id FROM contract_running_rooms WHERE contract_id')) {
    const c = (D.CONTRACTS || []).find(x => x.id === P[0]);
    return c ? c.rooms.map(r => ({ running_room_id: r.id })) : [];
  }
  if (s.startsWith('SELECT c.*, ct.name AS contractor_name')
      || s.startsWith('SELECT * FROM contracts WHERE id')) {
    const c = (D.CONTRACTS || []).find(x => x.id === P[0]);
    return c ? [{ total_value: null, remarks: null, ...c }] : [];
  }
  // A link id has no meaning in the demo, so one is synthesised from the room
  // it points at and decoded again by the UPDATE below.
  if (s.startsWith('SELECT crr.id, crr.contract_id FROM contract_running_rooms crr')) {
    const out = [];
    (D.CONTRACTS || []).forEach(c => {
      if (c.id !== P[1] && c.rooms.some(r => r.id === P[0])) out.push({ id: 9000 + P[0], contract_id: c.id });
    });
    return out;
  }
  // The contractor's own agreements, with the gaps the officer is chasing.
  if (s.includes('c.loa_no') && s.includes('WHERE c.contractor_id = ?')) {
    return (D.CONTRACTS || []).filter(c => c.contractor_id === P[0]).map(c => ({
      ...c, division: (D.DIVS.find(d => d.id === c.division_id) || {}).name || null,
      rr_count: c.rooms.length }));
  }
  if (s.startsWith('INSERT INTO contracts (agreement_no')) {
    const id = Math.max(0, ...(D.CONTRACTS || []).map(c => c.id)) + 1;
    const ct = D.CONTRACTORS.find(x => x.id === P[1]) || {};
    const dv = D.DIVS.find(x => x.id === P[2]) || {};
    D.CONTRACTS.push({ id, agreement_no: P[0], contractor_id: P[1], division_id: P[2],
      loa_no: P[3], loa_date: P[4], start_date: P[5], end_date: P[6], extended_to: P[7],
      status: P[8], security_deposit: P[9], performance_guarantee: P[10], total_value: P[11],
      remarks: P[12], contractor_name: ct.name || null, contractor_code: ct.code || null,
      div_code: dv.code || null, rooms: [] });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE contracts SET agreement_no')) {
    const c = (D.CONTRACTS || []).find(x => x.id === P[13]);
    if (c) {
      const ct = D.CONTRACTORS.find(x => x.id === P[1]) || {};
      Object.assign(c, { agreement_no: P[0], contractor_id: P[1], division_id: P[2],
        loa_no: P[3], loa_date: P[4], start_date: P[5], end_date: P[6], extended_to: P[7],
        status: P[8], security_deposit: P[9], performance_guarantee: P[10], total_value: P[11],
        remarks: P[12], contractor_name: ct.name || c.contractor_name,
        contractor_code: ct.code || c.contractor_code });
    }
    return [];
  }
  if (s.startsWith('INSERT INTO contract_running_rooms')) {
    const c = (D.CONTRACTS || []).find(x => x.id === P[0]);
    const rr = D.RUNNING_ROOMS.find(x => x.id === P[1]);
    if (c && rr && !c.rooms.some(r => r.id === rr.id)) c.rooms.push(rr);
    lastInsertId = 9000 + (P[1] || 0);
    return [];
  }
  if (s.startsWith('UPDATE contract_running_rooms SET effective_to')) {
    // Standing a room down in the demo means dropping it from the agreement's
    // live list; the demo keeps no history, which is the one thing it cannot
    // show and the real table exists to hold.
    const drop = (c, rrId) => { const i = c.rooms.findIndex(r => r.id === rrId); if (i >= 0) c.rooms.splice(i, 1); };
    if (s.includes('WHERE id = ?')) {
      const rrId = (P[1] || 0) - 9000;
      (D.CONTRACTS || []).forEach(c => drop(c, rrId));
    } else {
      const c = (D.CONTRACTS || []).find(x => x.id === P[1]);
      if (c) drop(c, P[2]);
    }
    return [];
  }

  if (s.startsWith('SELECT c.id, c.agreement_no')) {
    const r = D.RUNNING_ROOMS.find(x => x.id === P[0]);
    return r ? [{ id: 1000 + r.contractor_id, agreement_no: r.agreement_no, contractor: r.contractor,
      contractor_code: `CON-${String(r.contractor_id).padStart(2, '0')}` }] : [];
  }

  if (s.includes('AS man_days_present') && s.includes('FROM running_room_manpower m')) {
    const rrId = P[0], from = P[2], to = P[3];
    // One pass over the attendance map rather than one pass per designation:
    // the demo holds three months of per-person marks.
    const desigOf = new Map(D.STAFF.filter(x => x.running_room_id === rrId && x.is_active)
      .map(x => [x.id, x.designation_id]));
    const onRoll = {}, present = {};
    for (const [, dg] of desigOf) onRoll[dg] = (onRoll[dg] || 0) + 1;
    for (const [k, v] of D.ATTENDANCE.entries()) {
      if (v.status !== 'present' && v.status !== 'reliever') continue;
      const i1 = k.indexOf('|'), i2 = k.indexOf('|', i1 + 1);
      if (+k.slice(0, i1) !== rrId) continue;
      const date = k.slice(i1 + 1, i2);
      if (date < from || date > to) continue;
      const dg = desigOf.get(+k.slice(i2 + 1));
      if (dg) present[dg] = (present[dg] || 0) + 1;
    }
    return (D.MANPOWER[rrId] || []).filter(m => m.sanctioned_count > 0).map(m => ({
      id: m.designation_id, name: m.name, sort_order: 0,
      sanctioned_count: m.sanctioned_count,
      on_roll: onRoll[m.designation_id] || 0,
      man_days_present: present[m.designation_id] || 0 }));
  }

  if (s.includes('COUNT(DISTINCT attendance_date) AS days_marked')) {
    const rrId = P[0], from = P[1], to = P[2];
    const days = new Set(), signed = new Set();
    for (const k of D.ATTENDANCE.keys()) {
      const i1 = k.indexOf('|'), i2 = k.indexOf('|', i1 + 1);
      if (+k.slice(0, i1) !== rrId) continue;
      const date = k.slice(i1 + 1, i2);
      if (date >= from && date <= to) days.add(date);
    }
    for (const k of D.COUNTERSIGNED) {
      const [r2, date] = k.split('|');
      if (+r2 === rrId && date >= from && date <= to) signed.add(date);
    }
    return [{ days_marked: days.size, days_countersigned: signed.size }];
  }

  if (s.includes("screening_status <> 'approved'") && s.startsWith('SELECT COUNT(*) FROM staff'))
    return [{ n: D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active
      && x.screening_status !== 'approved').length }];

  if (s.startsWith('SELECT * FROM feedback_coverage WHERE running_room_id')) {
    const c = (D.COVERAGE[P[0]] || []).find(x => x.period_month === String(P[1]).slice(0, 10));
    return c ? [c] : [];
  }
  if (s.startsWith('SELECT head, avg_rating, r_value, sample_size FROM monthly_grading'))
    return (D.GRADING[P[0]] || []).filter(x => x.period_month === String(P[1]).slice(0, 10));

  if (s.includes("SUM(result = 'compliant') AS compliant") && s.includes('FROM inspections WHERE running_room_id')) {
    const list = (D.INSPECTIONS[P[0]] || []).filter(i => i.inspection_date >= P[1] && i.inspection_date <= P[2]);
    return [{ done: list.length, compliant: list.filter(i => i.result === 'compliant').length }];
  }

  if (s.includes('df.occurred_on BETWEEN ? AND ?'))
    return (D.DEFICIENCIES[P[0]] || [])
      .filter(d => d.occurred_on >= P[1] && d.occurred_on <= P[2])
      .map(d => ({ id: d.id, occurred_on: d.occurred_on, quantity: d.quantity, status: d.status,
        description: d.description, clause_code: d.clause_code, group_name: d.group_name, unit: d.unit }))
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.clause_code.localeCompare(b.clause_code));

  if (s.includes('AS laundry_no_invoice')) {
    const rrId = P[0], from = P[1], to = P[2];
    const between = d => d && String(d).slice(0, 10) >= from && String(d).slice(0, 10) <= to;
    return [{
      laundry_no_invoice: (D.LAUNDRY[rrId] || []).filter(x => between(x.dispatch_date) && !x.invoice_no).length,
      consumable_short: (D.CONSUMABLE_ISSUES[rrId] || [])
        .filter(x => between(x.due_date) && x.quantity_supplied < x.quantity_due).length,
      asset_faults_overdue: (D.BREAKDOWNS[rrId] || [])
        .filter(x => between(String(x.reported_at).slice(0, 10))
          && (x.rectified_at === null || x.hours_to_rectify > 24)).length,
      kitchen_shortfalls: (D.KITCHEN_COMPLIANCE[rrId] || [])
        .filter(x => between(x.as_on_date) && x.status === 'shortfall').length,
      pest_overdue: (D.PEST[rrId] || [])
        .filter(x => between(x.scheduled_on) && (!x.performed_on || x.delay_days > 0)).length,
    }];
  }

  if (s.startsWith('SELECT mc.*, gu.full_name AS generated_name')) {
    const c = D.CERTIFICATES.get(certKey(P[0], P[1]));
    return c ? [{ ...c, generated_name: userName(c.generated_by),
      certified_name: userName(c.certified_by), countersigned_name: userName(c.countersigned_by) }] : [];
  }
  if (s.startsWith('SELECT id, status FROM monthly_certificates')) {
    const c = D.CERTIFICATES.get(certKey(P[0], P[1]));
    return c ? [{ id: c.id, status: c.status }] : [];
  }
  if (s.startsWith('SELECT * FROM monthly_certificates')) {
    const c = D.CERTIFICATES.get(certKey(P[0], P[1]));
    return c ? [c] : [];
  }
  if (s.startsWith('SELECT id FROM monthly_certificates')) {
    const c = D.CERTIFICATES.get(certKey(P[0], P[1]));
    return c ? [{ id: c.id }] : [];
  }
  if (s.startsWith('INSERT INTO monthly_certificates')) {
    const row = { id: D.nextCertId(), running_room_id: P[0], period_month: String(P[1]).slice(0, 10),
      status: 'draft', generated_by: P[P.length - 1],
      generated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      certified_by: null, certified_at: null, countersigned_by: null, countersigned_at: null,
      returned_reason: null, remarks: null };
    CERT_FIELDS.forEach((f, i) => { row[f] = P[2 + i]; });
    D.CERTIFICATES.set(certKey(P[0], P[1]), row);
    lastInsertId = row.id;
    return [];
  }
  if (s.startsWith('UPDATE monthly_certificates SET contract_id')) {
    const id = P[P.length - 1];
    for (const row of D.CERTIFICATES.values()) {
      if (row.id !== id) continue;
      CERT_FIELDS.forEach((f, i) => { row[f] = P[i]; });
      row.status = 'draft'; row.returned_reason = null;
      row.generated_by = P[P.length - 2];
      row.generated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      break;
    }
    return [];
  }
  if (s.startsWith("UPDATE monthly_certificates SET status = 'certified'")) {
    for (const row of D.CERTIFICATES.values()) {
      if (row.id !== P[2]) continue;
      row.status = 'certified'; row.certified_by = P[0];
      row.certified_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      row.remarks = P[1]; row.returned_reason = null;
      break;
    }
    return [];
  }
  if (s.startsWith("UPDATE monthly_certificates SET status = 'countersigned'")) {
    for (const row of D.CERTIFICATES.values()) {
      if (row.id !== P[1]) continue;
      row.status = 'countersigned'; row.countersigned_by = P[0];
      row.countersigned_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      break;
    }
    return [];
  }
  if (s.startsWith("UPDATE monthly_certificates SET status = 'returned'")) {
    for (const row of D.CERTIFICATES.values()) {
      if (row.id !== P[1]) continue;
      row.status = 'returned'; row.returned_reason = P[0];
      row.certified_by = null; row.certified_at = null;
      break;
    }
    return [];
  }
  if (s.startsWith('DELETE FROM certificate_deficiencies')) { D.CERT_DEFICIENCIES.set(P[0], []); return []; }
  if (s.startsWith('INSERT INTO certificate_deficiencies')) {
    const list = D.CERT_DEFICIENCIES.get(P[0]) || [];
    list.push({ certificate_id: P[0], deficiency_id: P[1], clause_code: P[2], group_name: P[3],
      description: P[4], occurred_on: P[5], quantity: P[6], unit: P[7], status_at_signing: P[8] });
    D.CERT_DEFICIENCIES.set(P[0], list);
    return [];
  }
  if (s.startsWith('SELECT * FROM certificate_deficiencies'))
    return (D.CERT_DEFICIENCIES.get(P[0]) || []).slice()
      .sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on))
        || a.clause_code.localeCompare(b.clause_code));

  // ---------- charts and reports (stage 7) ----------
  // These come first: several of them join the same tables as the older
  // aggregate queries and would otherwise be swallowed by a looser matcher.
  const rIds = new Set(rooms.map(r => r.id));
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  const gradingIn = () => rooms.flatMap(r => D.GRADING[r.id] || []);
  const coverageIn = () => rooms.flatMap(r => D.COVERAGE[r.id] || []);
  const defsIn = () => Object.values(D.DEFICIENCIES).flat().filter(x => rIds.has(x.running_room_id));
  const inspIn = () => Object.values(D.INSPECTIONS).flat().filter(x => rIds.has(x.running_room_id));
  const contractorsIn = () => {
    const by = new Map();
    rooms.forEach(r => {
      if (!by.has(r.contractor_id)) by.set(r.contractor_id, []);
      by.get(r.contractor_id).push(r);
    });
    return [...by.entries()]
      .map(([id, rs]) => ({ c: D.CONTRACTORS.find(x => x.id === id), rs }))
      .filter(x => x.c).sort((a, b) => a.c.name.localeCompare(b.c.name));
  };
  const monthArg = () => P.find(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x));

  // dashboard: rating trend, one point per month
  if (s.includes('AS avg_rating') && s.includes('GROUP BY g.period_month ORDER BY')) {
    const from = monthArg();
    const by = {};
    gradingIn().filter(g => g.period_month >= from).forEach(g => (by[g.period_month] ||= []).push(g.avg_rating));
    return Object.keys(by).sort().map(m => ({ period_month: m, avg_rating: avg(by[m]) }));
  }
  // reports: rating trend split by head
  if (s.includes('g.period_month, g.head') && s.includes('GROUP BY g.period_month, g.head')) {
    const from = monthArg();
    const by = {};
    gradingIn().filter(g => g.period_month >= from).forEach(g => {
      const k = g.period_month + '|' + g.head;
      (by[k] ||= { period_month: g.period_month, head: g.head, v: [], sample: 0 });
      by[k].v.push(g.avg_rating); by[k].sample += g.sample_size;
    });
    return Object.values(by).sort((a, b) => a.period_month.localeCompare(b.period_month))
      .map(x => ({ period_month: x.period_month, head: x.head, avg_rating: avg(x.v), sample: x.sample }));
  }
  // coverage trend, one point per month
  if (s.includes('fc.period_month, ROUND(AVG(fc.coverage_pct),1) AS avg_pct')) {
    const from = monthArg();
    const by = {};
    coverageIn().filter(c => c.period_month >= from).forEach(c => (by[c.period_month] ||= []).push(c));
    return Object.keys(by).sort().map(m => ({ period_month: m,
      avg_pct: +(by[m].reduce((a, c) => a + c.coverage_pct, 0) / by[m].length).toFixed(1),
      meeting: by[m].filter(c => c.meets_floor).length, sites: by[m].length }));
  }
  // coverage by division for one month
  if (s.includes('ROUND(AVG(fc.coverage_pct),1) AS avg_pct') && s.includes('GROUP BY d.id, d.code, d.name')) {
    const month = monthArg();
    return D.DIVS.map(d => {
      const rs = rooms.filter(r => r.division_id === d.id);
      const cs = rs.map(r => (D.COVERAGE[r.id] || []).find(c => c.period_month === month)).filter(Boolean);
      return cs.length ? { code: d.code, name: d.name,
        avg_pct: +(cs.reduce((a, c) => a + c.coverage_pct, 0) / cs.length).toFixed(1),
        meeting: cs.filter(c => c.meets_floor).length, sites: cs.length } : null;
    }).filter(Boolean);
  }
  // inspections by month
  if (s.includes("DATE_FORMAT(i.inspection_date, '%Y-%m-01')")) {
    const dates = P.filter(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x));
    const from = dates[0], upto = dates[1] || '9999-12-31';
    const by = {};
    inspIn().filter(i => i.inspection_date >= from && i.inspection_date < upto).forEach(i => {
      const m = i.inspection_date.slice(0, 8) + '01';
      (by[m] ||= { period_month: m, total: 0, compliant: 0, minor: 0, major: 0 });
      by[m].total++;
      if (i.result === 'compliant') by[m].compliant++;
      else if (i.result === 'minor_deficiencies') by[m].minor++;
      else by[m].major++;
    });
    return Object.keys(by).sort().map(m => by[m]);
  }
  // deficiencies by head, with the open count — dashboard and trends
  if (s.includes('GROUP BY dc.group_code, dc.group_name') && s.includes("SUM(df.status = 'open') AS open")) {
    const from = monthArg();
    const by = {};
    defsIn().filter(x => x.occurred_on >= from).forEach(x => {
      (by[x.group_code] ||= { group_code: x.group_code, group_name: x.group_name, n: 0, open: 0 });
      by[x.group_code].n++;
      if (x.status === 'open') by[x.group_code].open++;
    });
    return Object.values(by).sort((a, b) => b.n - a.n);
  }

  // ---------- contractor scorecard ----------
  if (s.startsWith('SELECT ct.id, ct.code, ct.name, ct.is_blacklisted'))
    return contractorsIn().map(({ c, rs }) => ({ id: c.id, code: c.code, name: c.name,
      is_blacklisted: c.is_blacklisted, rr_count: rs.length,
      beds: rs.reduce((a, r) => a + r.total_beds, 0),
      meal_sites: rs.filter(r => r.has_meal_facility).length }));

  if (s.startsWith('SELECT ct.id, ROUND(AVG(g.avg_rating),2) AS rating')) {
    const month = monthArg();
    return contractorsIn().map(({ c, rs }) => {
      const g = rs.flatMap(r => (D.GRADING[r.id] || []).filter(x => x.period_month === month));
      return g.length ? { id: c.id, rating: avg(g.map(x => x.avg_rating)),
        worst_r: Math.min(...g.map(x => x.r_value)) } : null;
    }).filter(Boolean);
  }
  if (s.startsWith('SELECT ct.id, ROUND(AVG(fc.coverage_pct),1) AS coverage_pct')) {
    const month = monthArg();
    return contractorsIn().map(({ c, rs }) => {
      const cs = rs.map(r => (D.COVERAGE[r.id] || []).find(x => x.period_month === month)).filter(Boolean);
      return cs.length ? { id: c.id,
        coverage_pct: +(cs.reduce((a, x) => a + x.coverage_pct, 0) / cs.length).toFixed(1),
        meeting: cs.filter(x => x.meets_floor).length, periods: cs.length } : null;
    }).filter(Boolean);
  }
  if (s.startsWith("SELECT ct.id, COUNT(*) AS total, SUM(df.status = 'open') AS open")) {
    const from = monthArg();
    return contractorsIn().map(({ c, rs }) => {
      const ds = rs.flatMap(r => (D.DEFICIENCIES[r.id] || []).filter(x => x.occurred_on >= from));
      return { id: c.id, total: ds.length, open: ds.filter(x => x.status === 'open').length };
    });
  }
  if (s.startsWith("SELECT ct.id, COUNT(*) AS total, SUM(i.result = 'compliant') AS compliant")) {
    const from = monthArg();
    return contractorsIn().map(({ c, rs }) => {
      const is = rs.flatMap(r => (D.INSPECTIONS[r.id] || []).filter(x => x.inspection_date >= from));
      return { id: c.id, total: is.length, compliant: is.filter(x => x.result === 'compliant').length };
    });
  }
  if (s.startsWith('SELECT ct.id, COUNT(*) AS on_roll'))
    return contractorsIn().map(({ c, rs }) => {
      const ids = new Set(rs.map(r => r.id));
      const st = D.STAFF.filter(x => ids.has(x.running_room_id) && x.is_active);
      return { id: c.id, on_roll: st.length,
        unscreened: st.filter(x => x.screening_status !== 'approved').length };
    });
  if (s.startsWith('SELECT ct.id, COALESCE(SUM(m.sanctioned_count),0) AS sanctioned'))
    return contractorsIn().map(({ c, rs }) => ({ id: c.id,
      sanctioned: rs.reduce((a, r) => a + (D.MANPOWER[r.id] || [])
        .reduce((x, m) => x + m.sanctioned_count, 0), 0) }));

  // ---------- running-room league table ----------
  if (s.startsWith('SELECT rr.id, rr.code, rr.name, rr.total_beds, rr.has_meal_facility') &&
      s.includes('ct.name AS contractor')) {
    const month = P[0], from = P[2];
    const out = rooms.map(r => {
      const g = (D.GRADING[r.id] || []).filter(x => x.period_month === month);
      const c = (D.COVERAGE[r.id] || []).find(x => x.period_month === month);
      const ds = D.DEFICIENCIES[r.id] || [];
      const on = D.STAFF.filter(x => x.running_room_id === r.id && x.is_active).length;
      return { id: r.id, code: r.code, name: r.name, total_beds: r.total_beds,
        has_meal_facility: r.has_meal_facility, div_code: r.div_code, contractor: r.contractor,
        rating: g.length ? avg(g.map(x => x.avg_rating)) : null,
        coverage_pct: c ? c.coverage_pct : null,
        def_open: ds.filter(x => x.status === 'open').length,
        def_total: ds.filter(x => x.occurred_on >= from).length,
        insp_total: (D.INSPECTIONS[r.id] || []).filter(x => x.inspection_date >= from).length,
        on_roll: on,
        sanctioned: (D.MANPOWER[r.id] || []).reduce((a, m) => a + m.sanctioned_count, 0) };
    });
    const cmp = {
      'rr.name': (a, b) => a.name.localeCompare(b.name),
      'rating IS NULL, rating ASC': (a, b) => (a.rating === null) - (b.rating === null) || a.rating - b.rating,
      'coverage_pct IS NULL, coverage_pct ASC': (a, b) =>
        (a.coverage_pct === null) - (b.coverage_pct === null) || a.coverage_pct - b.coverage_pct,
      'def_open DESC': (a, b) => b.def_open - a.def_open,
      'rr.total_beds DESC': (a, b) => b.total_beds - a.total_beds,
    };
    const key = Object.keys(cmp).find(k => s.includes('ORDER BY ' + k));
    return out.sort(cmp[key] || cmp['rating IS NULL, rating ASC']);
  }

  if (s.includes('FROM feedback_coverage fc')) {
    // A running room with no feedback coverage on record is a legitimate
    // state -- the pilot has exactly four of them -- so this must not assume.
    const cov = rooms.map(r => (D.COVERAGE[r.id] || [])[0]).filter(Boolean);
    return [{ periods: cov.length, meeting: cov.filter(c=>c.meets_floor).length,
      avg_pct: cov.length ? +(cov.reduce((a,c)=>a+c.coverage_pct,0)/cov.length).toFixed(1) : null }];
  }
  if (s.includes('FROM monthly_grading g JOIN running_rooms')) {
    const out = {};
    for (const r of rooms) for (const g of (D.GRADING[r.id] || [])) {
      (out[g.head] ||= []).push(g.avg_rating);
    }
    return Object.entries(out).map(([head, v]) => ({ head,
      avg_rating: +(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2), sites: v.length }));
  }
  if (s.includes('FROM deficiencies df JOIN running_rooms')) {
    const all = rooms.flatMap(r => D.DEFICIENCIES[r.id] || []);
    return [{ total: all.length, open: all.filter(d=>d.status==='open').length }];
  }

  // running rooms list
  // The plain running-room list. Several richer screens list the same rooms
  // with figures hung off them, and they join the same two tables in the same
  // order -- so this stub has to stand aside for them, or it answers first with
  // bare rooms and every figure on the screen reads zero. That is exactly how
  // the coverage screen came to show "not entered" for a figure just typed in.
  if (s.includes('FROM running_rooms rr JOIN divisions d') && s.includes('ORDER BY d.sort_order')
      && !s.includes('LEFT JOIN occupancy_monthly')) {
    let out = rooms;
    const q = P.find(p => typeof p === 'string' && p.startsWith('%'));
    if (q) out = out.filter(r => r.name.toLowerCase().includes(q.replace(/%/g,'').toLowerCase()));
    if (s.includes('d.code = ?')) { const c = P.find(p => typeof p==='string' && /^[A-Z]{2,4}$/.test(p)); if (c) out = out.filter(r=>r.div_code===c); }
    if (s.includes('rr.category = ?')) { const c = P.find(p => ['A','B','C'].includes(p)); if (c) out = out.filter(r=>r.category===c); }
    return out;
  }
  if (s.includes('SELECT code, name FROM divisions')) return D.DIVS;

  // running room detail
  if (s.startsWith('SELECT rr.*, d.code AS div_code')) {
    const r = rooms.find(x => x.id === P[0]);
    return r ? [r] : [];
  }
  if (s.includes('FROM running_rooms rr WHERE rr.id = ?')) {
    const r = rooms.find(x => x.id === P[0]);
    return r ? [{ id: r.id }] : [];                        // scope check
  }
  // The running-room detail sheet. The add-staff form queries the same tables
  // for a different shape (dg.id first, plus a live on-roll count per post) and
  // is answered further down, so anchor this one on the columns it selects.
  if (s.startsWith('SELECT dg.name, dg.skill_category') && s.includes('FROM running_room_manpower m'))
    return D.MANPOWER[P[0]] || [];
  if (s.includes('FROM contract_running_rooms crr JOIN contracts c JOIN contractors ct') ||
      (s.includes('crr.running_room_id = ?') && s.includes('ct.name AS contractor'))) {
    const r = D.RUNNING_ROOMS.find(x => x.id === P[0]);
    return r ? [{ agreement_no: r.agreement_no, start_date: '2025-04-01', end_date: '2027-03-31',
      status: 'active', contractor: r.contractor, contractor_code: `CON-${String(r.contractor_id).padStart(2,'0')}` }] : [];
  }
  if (s.includes('FROM feedback_coverage WHERE running_room_id')) {
    const base = D.COVERAGE[P[0]] || [];
    const edits = [...occupancyEdits.entries()].filter(([k]) => k.startsWith(P[0] + '|'))
      .map(([k, v]) => { const m = k.split('|')[1];
        const rec = base[0] ? base[0].feedback_received : 0;
        const pct = v ? +(rec / v * 100).toFixed(1) : 0;
        return { period_month: m, occupants_total: v, feedback_received: rec, coverage_pct: pct, meets_floor: pct >= 50 ? 1 : 0 }; });
    return [...edits, ...base];
  }
  if (s.includes('FROM monthly_grading WHERE running_room_id')) return D.GRADING[P[0]] || [];
  // Running-room detail only — must not swallow the register query, which
  // joins the same tables but is scoped by role rather than by running room.
  if (s.includes('FROM deficiencies df JOIN deficiency_clauses') && s.includes('WHERE df.running_room_id = ?'))
    return (D.DEFICIENCIES[P[0]] || []).slice(0, 20);
  if (s.startsWith('INSERT INTO occupancy_monthly')) {
    occupancyEdits.set(`${P[0]}|${P[1]}`, P[2]); return [];
  }
  // Was `return []` — a catch-all that answered "nothing on record" to every
  // shape of this query, including the `SELECT *` the coverage page's bulk entry
  // reads for its audit `before` value. That made every entry look like a first
  // insert. It now answers from the same edit map the other two occupancy stubs
  // read, so a figure typed on one screen is seen by all three.
  if (s.includes('FROM occupancy_monthly WHERE running_room_id')) {
    const v = occupancyOf(P[0], P[1]);
    return v === undefined ? [] : [{ running_room_id: P[0], period_month: P[1],
      occupants_total: v, source: 'manual', source_reference: null, entered_by: null }];
  }

  // contractors
  if (s.includes('FROM contractors ct JOIN contracts')) {
    const byC = {};
    for (const r of rooms) (byC[r.contractor_id] ||= []).push(r);
    return Object.entries(byC).map(([cid, rs]) => { const c = D.CONTRACTORS[cid - 1]; return {
      id: c.id, code: c.code, name: c.name, is_blacklisted: 0, rr_count: rs.length,
      beds: rs.reduce((a,r)=>a+r.total_beds,0), contracts: new Set(rs.map(r=>r.div_code)).size,
      earliest_expiry: '2027-03-31', staff: rs.reduce((a,r)=>a+r.on_roll,0) }; })
      .sort((a,b)=>a.name.localeCompare(b.name));
  }
  if (s.startsWith('SELECT * FROM contractors WHERE id')) {
    const c = D.CONTRACTORS[P[0] - 1]; return c ? [c] : [];
  }
  if (s.includes('FROM contracts c JOIN divisions d')) {
    const rs = D.RUNNING_ROOMS.filter(r => r.contractor_id === P[0]);
    const byDiv = {};
    for (const r of rs) (byDiv[r.div_code] ||= []).push(r);
    return Object.entries(byDiv).map(([code, g], i) => ({ id: i+1,
      agreement_no: g[0].agreement_no, start_date: '2025-04-01', end_date: '2027-03-31',
      status: 'active', division: D.DIVS.find(d=>d.code===code).name, rr_count: g.length }));
  }
  if (s.includes('FROM contract_running_rooms crr JOIN contracts c JOIN running_rooms rr'))
    return rooms.filter(r => r.contractor_id === P[0]);
  if (s.includes('FROM staff WHERE contractor_id')) {
    const rs = D.RUNNING_ROOMS.filter(r => r.contractor_id === P[0]);
    const t = rs.reduce((a,r)=>a+r.on_roll,0);
    return [{ total: t, approved: Math.round(t*0.94), pending: t - Math.round(t*0.94) }];
  }

  // ---------- contract staff ----------
  const roomIds = new Set(rooms.map(r => r.id));
  const myStaff = () => D.STAFF.filter(x => roomIds.has(x.running_room_id) && x.is_active);
  const myStaffLeft = () => D.STAFF.filter(x => roomIds.has(x.running_room_id) && !x.is_active);
  const docsOf  = id => D.DOCS[id] || [];
  const today   = D.TODAY.toISOString().slice(0, 10);
  const plus    = n => new Date(D.TODAY.getTime() + n * 86400000).toISOString().slice(0, 10);

  // ---------- adding, leaving and replacement (stage 8c) ----------
  if (s.startsWith('SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code'))
    return rooms.map(r => ({ id: r.id, name: r.name, has_meal_facility: r.has_meal_facility,
      div_code: r.div_code }));
  if (s.startsWith('SELECT id, code, name, skill_category, requires_qualification FROM designations'))
    return D.DESIGNATIONS.map(d => ({ id: d.id, code: d.code, name: d.name,
      skill_category: d.skill_category, requires_qualification: d.requires_qualification }));
  // Distinct from the running-room detail query, which starts with dg.name.
  if (s.startsWith('SELECT dg.id, dg.name, m.sanctioned_count'))
    return (D.MANPOWER[P[0]] || []).map(m => ({ id: m.designation_id, name: m.name,
      sanctioned_count: m.sanctioned_count,
      on_roll: D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active
        && x.designation_id === m.designation_id).length }));
  if (s.startsWith('SELECT m.sanctioned_count,') && s.includes('AS on_roll')) {
    const m = (D.MANPOWER[P[0]] || []).find(x => x.designation_id === P[1]);
    return m ? [{ sanctioned_count: m.sanctioned_count,
      on_roll: D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active
        && x.designation_id === P[1]).length }] : [];
  }
  if (s.startsWith('SELECT sanctioned_count FROM running_room_manpower')) {
    const m = (D.MANPOWER[P[0]] || []).find(x => x.designation_id === P[1]);
    return m ? [{ sanctioned_count: m.sanctioned_count }] : [];
  }
  if (s.startsWith('SELECT name FROM designations WHERE id')) {
    const d = D.DESIGNATIONS.find(x => x.id === P[0]);
    return d ? [{ name: d.name }] : [];
  }
  if (s.startsWith('SELECT c.contractor_id FROM contract_running_rooms')) {
    const r = D.RUNNING_ROOMS.find(x => x.id === P[0]);
    return r ? [{ contractor_id: r.contractor_id }] : [];
  }
  if (s.startsWith('INSERT INTO staff (')) {
    // staff_code is the literal '' in the statement, not a placeholder, so the
    // parameters start at full_name.
    const [name, father, dob, gender, phone, address, designationId, rrId, contractorId,
           joining, bankNo, ifsc, epf, esic] = P;
    const id = 500000 + D.STAFF.length;
    const rr = D.RUNNING_ROOMS.find(x => x.id === rrId);
    const dg = D.DESIGNATIONS.find(x => x.id === designationId) || {};
    D.STAFF.push({ id, staff_code: '', full_name: name, father_name: father, date_of_birth: dob,
      gender, phone, address,
      designation_id: designationId, designation: dg.name, skill_category: dg.skill_category,
      requires_qualification: dg.requires_qualification, qualification_note: dg.qualification_note,
      running_room_id: rrId, rr_id: rrId, rr_name: rr ? rr.name : '', div_code: rr ? rr.div_code : '',
      contractor_id: contractorId, contractor: rr ? rr.contractor : '',
      contractor_code: `CON-${String(contractorId).padStart(2, '0')}`,
      contractor_address: 'Plot 14, MIDC, Maharashtra',
      date_of_joining: joining, date_of_leaving: null,
      bank_account_no: bankNo, bank_ifsc: ifsc, epf_no: epf, esic_no: esic,
      screening_status: 'pending', screened_on: null, rejection_reason: null,
      id_card_no: null, id_card_issued_on: null,
      agreement_no: rr ? rr.agreement_no : null, is_active: 1 });
    D.DOCS[id] = []; D.ISSUES[id] = []; D.REPLACEMENTS[id] = [];
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE staff SET staff_code')) {
    const x = D.STAFF.find(y => y.id === P[1]);
    if (x) x.staff_code = 'CS' + String(P[0]).padStart(5, '0');
    return [];
  }
  if (s.startsWith('SELECT id, running_room_id, designation_id, is_active, date_of_joining FROM staff')) {
    const x = D.STAFF.find(y => y.id === P[0]);
    return x ? [{ id: x.id, running_room_id: x.running_room_id, designation_id: x.designation_id,
      is_active: x.is_active, date_of_joining: x.date_of_joining }] : [];
  }
  if (s.startsWith('SELECT id FROM staff WHERE id = ? AND running_room_id')) {
    const x = D.STAFF.find(y => y.id === P[0] && y.running_room_id === P[1]
      && y.designation_id === P[2] && y.is_active);
    return x ? [{ id: x.id }] : [];
  }
  if (s.startsWith('SELECT id, staff_code, full_name FROM staff WHERE running_room_id'))
    return D.STAFF.filter(x => x.running_room_id === P[0] && x.designation_id === P[1]
      && x.is_active && x.id !== P[2])
      .map(x => ({ id: x.id, staff_code: x.staff_code, full_name: x.full_name }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (s.startsWith('UPDATE staff SET is_active = 0')) {
    const x = D.STAFF.find(y => y.id === P[1]);
    if (x) { x.is_active = 0; x.date_of_leaving = P[0]; }
    return [];
  }
  if (s.startsWith('INSERT INTO staff_replacements')) {
    const dg = D.DESIGNATIONS.find(x => x.id === P[3]) || {};
    const out = D.STAFF.find(x => x.id === P[1]);
    const inc = P[2] ? D.STAFF.find(x => x.id === P[2]) : null;
    const row = { id: 600000 + Object.values(D.REPLACEMENTS).reduce((a, x) => a + x.length, 0),
      running_room_id: P[0], outgoing_staff_id: P[1], incoming_staff_id: P[2],
      designation_id: P[3], designation: dg.name, reason: P[4], railway_permission: 0,
      permitted_by: null, permitted_on: null, permitted_name: null, effective_date: P[5],
      outgoing_name: out ? out.full_name : null, incoming_name: inc ? inc.full_name : null };
    (D.REPLACEMENTS[P[1]] ||= []).unshift(row);
    if (P[2]) (D.REPLACEMENTS[P[2]] ||= []).unshift(row);
    return [];
  }
  if (s.startsWith('SELECT id, running_room_id, railway_permission FROM staff_replacements')) {
    const r = Object.values(D.REPLACEMENTS).flat().find(x => x.id === P[0]);
    return r ? [{ id: r.id, running_room_id: r.running_room_id,
      railway_permission: r.railway_permission }] : [];
  }
  if (s.startsWith('UPDATE staff_replacements SET railway_permission')) {
    Object.values(D.REPLACEMENTS).flat().filter(x => x.id === P[1]).forEach(r => {
      r.railway_permission = 1; r.permitted_by = P[0];
      r.permitted_on = new Date().toISOString().slice(0, 10);
      const u = USERS.find(x => x.id === P[0]);
      r.permitted_name = u ? u.full_name : null;
    });
    return [];
  }

  if (s.includes('FROM staff st JOIN designations dg JOIN running_rooms rr') ||
      (s.includes('FROM staff st') && s.includes('ORDER BY rr.name, dg.sort_order'))) {
    let out = s.includes('st.is_active = 0') ? myStaffLeft() : myStaff();
    for (const p of P) {
      if (typeof p === 'string' && p.startsWith('%')) {
        const t = p.replace(/%/g, '').toLowerCase();
        out = out.filter(x => x.full_name.toLowerCase().includes(t) || x.staff_code.toLowerCase().includes(t));
      }
      if (typeof p === 'string' && ['pending','approved','rejected'].includes(p))
        out = out.filter(x => x.screening_status === p);
    }
    if (s.includes('rr.id = ?')) { const v = P.find(p => typeof p === 'number' && rooms.some(r => r.id === p));
      if (v) out = out.filter(x => x.running_room_id === v); }
    if (s.includes('dg.id = ?')) { const v = P.filter(p => typeof p === 'number').pop();
      if (v && D.DESIGNATIONS.some(d => d.id === v)) out = out.filter(x => x.designation_id === v); }
    if (s.includes("st.screening_status IN ('pending','provisional')"))
      out = out.filter(x => x.screening_status === 'pending' || x.screening_status === 'provisional');
    if (s.includes("st.screening_status = 'provisional'"))
      out = out.filter(x => x.screening_status === 'provisional');
    if (s.includes("st.screening_status <> 'approved'")) out = out.filter(x => x.screening_status !== 'approved');
    if (s.includes("d.doc_type = 'medical_fitness'"))
      out = out.filter(x => !docsOf(x.id).some(d => d.doc_type === 'medical_fitness' && (!d.valid_till || d.valid_till >= today)));
    if (s.includes('dg.requires_qualification = 1'))
      out = out.filter(x => x.requires_qualification && !docsOf(x.id).some(d => d.doc_type === 'qualification'));
    if (s.includes('BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)'))
      out = out.filter(x => docsOf(x.id).some(d => d.valid_till && d.valid_till >= today && d.valid_till <= plus(60)));
    if (s.includes("i.issue_type = 'uniform'"))
      out = out.filter(x => !(D.ISSUES[x.id] || []).some(i => i.issue_type === 'uniform' && i.issued_on >= plus(-182)));
    return out.slice(0, 500).map(x => ({ ...x,
      doc_count: docsOf(x.id).length,
      last_uniform: (D.ISSUES[x.id] || []).filter(i => i.issue_type === 'uniform').map(i => i.issued_on).sort().pop() || null,
      next_expiry: docsOf(x.id).map(d => d.valid_till).filter(Boolean).sort()[0] || null }));
  }

  if (s.includes("SUM(st.screening_status = 'approved') AS approved")) {
    const all = myStaff();
    return [{ total: all.length,
      approved:    all.filter(x => x.screening_status === 'approved').length,
      pending:     all.filter(x => x.screening_status === 'pending').length,
      provisional: all.filter(x => x.screening_status === 'provisional').length,
      rejected:    all.filter(x => x.screening_status === 'rejected').length }];
  }
  if (s.includes('SELECT rr.id, rr.name FROM running_rooms rr WHERE')) return rooms.map(r => ({ id: r.id, name: r.name }));
  if (s.includes('SELECT id, name FROM designations WHERE is_active')) return D.DESIGNATIONS.map(d => ({ id: d.id, name: d.name }));

  if (s.startsWith('SELECT st.*, dg.name AS designation') || s.includes('SELECT st.*, dg.name AS designation, rr.name')) {
    const x = D.STAFF.find(y => y.id === P[0]);
    return x && roomIds.has(x.running_room_id) ? [x] : (x ? [x] : []);
  }
  if (s.includes('SELECT id, running_room_id, screening_status FROM staff') ||
      s.includes('SELECT id, running_room_id FROM staff')) {
    const x = D.STAFF.find(y => y.id === P[0]);
    return x ? [{ id: x.id, running_room_id: x.running_room_id, screening_status: x.screening_status }] : [];
  }
  // A photograph replaces the one on record rather than joining it; the stub
  // has to follow the same rule or the demo shows a behaviour the real thing
  // does not have.
  if (s.startsWith("SELECT id FROM staff_documents WHERE staff_id = ? AND doc_type = 'photograph'")) {
    const list = (D.DOCS[P[0]] || []).filter(d => d.doc_type === 'photograph');
    return list.length ? [{ id: list[list.length - 1].id }] : [];
  }
  if (s.includes('FROM staff_documents WHERE staff_id')) return docsOf(P[0]);
  if (s.includes('FROM staff_issues WHERE staff_id'))    return D.ISSUES[P[0]] || [];
  if (s.includes('FROM staff_replacements sr'))          return D.REPLACEMENTS[P[0]] || [];

  if (s.startsWith('SELECT id, running_room_id, full_name, father_name')) {
    const x = D.STAFF.find(y => y.id === P[0]);
    return x ? [x] : [];
  }
  if (s.startsWith('UPDATE staff SET full_name = ?, father_name')) {
    const x = D.STAFF.find(y => y.id === P[11]);
    if (x) {
      x.full_name = P[0]; x.father_name = P[1]; x.date_of_birth = P[2]; x.gender = P[3];
      x.phone = P[4]; x.address = P[5]; x.date_of_joining = P[6];
      x.bank_account_no = P[7]; x.bank_ifsc = P[8]; x.epf_no = P[9]; x.esic_no = P[10];
    }
    return [];
  }
  if (s.includes("UPDATE staff SET screening_status = 'provisional'")) {
    const st = D.STAFF.find(x => x.id === +P[1]);
    if (st) { st.screening_status = 'provisional'; st.provisional_note = P[0];
              st.provisional_on = stamp().slice(0, 10); st.rejection_reason = null; }
    return [];
  }
  if (s.startsWith('UPDATE staff SET screening_status')) {
    const x = D.STAFF.find(y => y.id === P[3]);
    if (x) { x.screening_status = P[0]; x.screened_on = today; x.rejection_reason = P[2]; }
    return [];
  }
  if (s.startsWith('UPDATE staff_documents SET reference_no')) {
    for (const list of Object.values(D.DOCS)) {
      const d = list.find(x => x.id === P[4]);
      if (d) { d.reference_no = P[0]; d.issued_on = P[1]; d.valid_till = P[2]; break; }
    }
    return [];
  }
  if (s.startsWith("DELETE FROM staff_documents WHERE staff_id = ? AND doc_type = 'photograph'")) {
    const list = D.DOCS[P[0]] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].doc_type === 'photograph' && list[i].id !== P[1]) list.splice(i, 1);
    }
    return [];
  }
  if (s.startsWith('INSERT INTO staff_documents')) {
    const id = 400000 + Object.values(D.DOCS).reduce((a, x) => a + x.length, 0);
    (D.DOCS[P[0]] ||= []).push({ id, staff_id: P[0], doc_type: P[1],
      reference_no: P[2], issued_on: P[3], valid_till: P[4], file_id: null });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE staff_documents SET file_id')) {
    for (const list of Object.values(D.DOCS)) {
      const d = list.find(x => x.id === P[1]);
      if (d) { d.file_id = P[0]; break; }
    }
    return [];
  }
  if (s.startsWith('SELECT id, staff_id, file_id FROM staff_documents')) {
    const d = (D.DOCS[P[1]] || []).find(x => x.id === P[0]);
    return d ? [{ id: d.id, staff_id: d.staff_id, file_id: d.file_id }] : [];
  }
  if (s.includes("doc_type = 'photograph'")) {
    const d = (D.DOCS[P[0]] || []).filter(x => x.doc_type === 'photograph' && x.file_id).pop();
    return d ? [{ id: d.id }] : [];
  }
  if (s.startsWith('INSERT INTO staff_issues')) {
    const months = s.includes('INTERVAL 6 MONTH') ? 182 : 365;
    const on = P[3];
    (D.ISSUES[P[0]] ||= []).unshift({ id: Date.now() % 100000, staff_id: P[0], issue_type: P[1],
      quantity: P[2], issued_on: on,
      due_next_on: new Date(new Date(on).getTime() + months * 86400000).toISOString().slice(0, 10),
      acknowledged: 0 });
    return [];
  }

  // ---------- service records ----------
  const dOnly = v => String(v).slice(0, 10);

  if (s.includes('SELECT rr.id, rr.name, rr.total_beds, rr.has_meal_facility'))
    return rooms.map(r => ({ id: r.id, name: r.name, total_beds: r.total_beds,
      has_meal_facility: r.has_meal_facility, call_sheet_default: r.call_sheet_default || null,
      div_code: r.div_code }));

  // muster roster for a date
  // One person's month, for the calendar on their record.
  if (s.startsWith('SELECT attendance_date, status, countersigned_at FROM attendance_daily')) {
    const staffId = P[0], from = P[1], to = P[2];
    const out = [];
    for (const [key, a] of D.ATTENDANCE.entries()) {
      const [rrId, date, sid] = key.split('|');
      if (+sid !== staffId || date < from || date >= to) continue;
      out.push({ attendance_date: date, status: a.status,
                 countersigned_at: D.COUNTERSIGNED.has(`${rrId}|${date}`) ? 'signed' : null });
    }
    return out.sort((x, y) => x.attendance_date.localeCompare(y.attendance_date));
  }
  if (s.includes('LEFT JOIN attendance_daily a')) {
    // The query now carries the previous day's mark as well: [date, date, rr].
    const date = P[0], rrId = P[P.length - 1];
    const prev = new Date(new Date(date + 'T00:00:00Z').getTime() - 86400000)
      .toISOString().slice(0, 10);
    return D.STAFF.filter(x => x.running_room_id === rrId && x.is_active).map(x => {
      const a = D.ATTENDANCE.get(`${rrId}|${date}|${x.id}`);
      const y = D.ATTENDANCE.get(`${rrId}|${prev}|${x.id}`);
      return { id: x.id, staff_code: x.staff_code, full_name: x.full_name,
        screening_status: x.screening_status, designation_id: x.designation_id,
        designation: x.designation, sort_order: 0,
        status: a ? a.status : null, shift: 'general',
        marked_at: a ? a.marked_at : null,
        relieved_staff_id: a ? (a.relieved_staff_id || null) : null,
        relieved_name: a && a.relieved_staff_id
          ? (D.STAFF.find(z => z.id === a.relieved_staff_id) || {}).full_name || null : null,
        yesterday_status: y ? y.status : null,
        countersigned_at: D.COUNTERSIGNED.has(`${rrId}|${date}`) ? 'signed' : null };
    }).sort((a, b) => a.designation.localeCompare(b.designation));
  }
  if (s.includes('SELECT dg.id, dg.name, dg.sort_order, m.sanctioned_count'))
    return (D.MANPOWER[P[0]] || []).filter(m => m.sanctioned_count > 0)
      .map(m => ({ id: m.designation_id, name: m.name, sort_order: 0, sanctioned_count: m.sanctioned_count }));

  if (s === 'SELECT id FROM staff WHERE running_room_id = ? AND is_active = 1')
    return D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active).map(x => ({ id: x.id }));
  // Who may be marked present: screened, OR admitted provisionally because he
  // was already working when RR-CMS arrived. Not `pending` — nobody has decided
  // about him.
  if (s.includes("screening_status IN ('approved','provisional')") && s.includes('SELECT id FROM staff'))
    return D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active
      && (x.screening_status === 'approved' || x.screening_status === 'provisional'))
      .map(x => ({ id: x.id }));
  if (s.includes("screening_status = 'approved'") && s.includes('SELECT id FROM staff'))
    return D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active && x.screening_status === 'approved')
      .map(x => ({ id: x.id }));

  if (s.startsWith('INSERT INTO attendance_daily')) {
    D.ATTENDANCE.set(`${P[0]}|${P[2]}|${P[1]}`,
      { status: P[3], relieved_staff_id: P[4] || null, marked_at: new Date().toISOString() });
    return [];
  }
  if (s.startsWith('UPDATE attendance_daily SET countersigned_by')) {
    D.COUNTERSIGNED.add(`${P[1]}|${P[2]}`); return [];
  }

  // ---------- call book: a call, with the men under it ----------
  // Every one of these works on CALLS (the header) and CALLBOOK (the lines).
  // The lines query has to be tested BEFORE the day query, because both name
  // `FROM call_book cb` and the first match wins.
  const allCalls = () => Object.values(D.CALLS || {}).flat();
  const allLines = () => Object.values(D.CALLBOOK || {}).flat();
  const withCrew = l => {
    const m = l.crew_id ? D.CREW.find(x => x.id === l.crew_id) : null;
    return { ...l, crew_source: m ? m.source : null,
             crew_id_no: m ? m.crew_id_no : null,
             crew_designation: m ? m.designation : null };
  };

  if (s.includes('FROM call_book cb') && s.includes('cb.call_id IN')) {
    const ids = P.map(Number);
    return allLines().filter(l => ids.includes(l.call_id)).map(withCrew)
      .sort((a, b) => a.id - b.id);
  }
  // ---- the sheet: the room's train list, and the day's calls against it ----
  const allSheet = () => Object.values(D.SHEET_TRAINS || {}).flat();
  if (s.startsWith('SELECT * FROM call_sheet_trains WHERE running_room_id = ? AND is_active')) {
    return (D.SHEET_TRAINS[P[0]] || []).filter(t => t.is_active && (t.service || 'mail') === P[1])
      .sort((a, b) => String(a.sign_on_time || '99:99').localeCompare(String(b.sign_on_time || '99:99'))
                   || String(a.train_no).localeCompare(String(b.train_no)));
  }
  if (s.startsWith('SELECT * FROM call_sheet_trains WHERE id = ?')) {
    const t = allSheet().find(x => x.id === +P[0] && x.running_room_id === +P[1]);
    return t ? [t] : [];
  }
  if (s.startsWith('SELECT * FROM call_sheet_trains WHERE running_room_id = ? ORDER BY')) {
    return (D.SHEET_TRAINS[P[0]] || []).slice()
      .sort((a, b) => (b.is_active - a.is_active)
                   || String(a.sign_on_time || '99:99').localeCompare(String(b.sign_on_time || '99:99')));
  }
  if (s.includes('COUNT(*) AS n FROM call_sheet_trains')) {
    return [{ n: (D.SHEET_TRAINS[P[0]] || [])
      .filter(t => t.is_active && (t.service || 'mail') === P[1]).length }];
  }
  if (s.startsWith('UPDATE running_rooms SET call_sheet_default')) {
    const r = D.RUNNING_ROOMS.find(x => x.id === +P[1]);
    if (r) r.call_sheet_default = P[0];
    return [];
  }
  if (s.startsWith('INSERT INTO call_sheet_trains')) {
    const list = (D.SHEET_TRAINS[P[0]] ||= []);
    const found = list.find(t => t.train_no === P[1] && t.direction === P[3]);
    if (found) Object.assign(found, { train_name: P[2], service: P[4], sign_on_time: P[5],
                                      run_days: P[6], notes: P[7], source: 'manual', is_active: 1 });
    else list.push({ id: nextId(), running_room_id: P[0], train_no: P[1], train_name: P[2],
      direction: P[3], service: P[4], sign_on_time: P[5], arrives_at: null,
      from_station: null, to_station: null,
      run_days: P[6], effective_from: null, effective_until: null, notes: P[7],
      source: 'manual', is_active: 1 });
    return [];
  }
  if (s.startsWith('UPDATE call_sheet_trains SET is_active = 0')) {
    const t = allSheet().find(x => x.id === +P[0]);
    if (t) t.is_active = 0;
    return [];
  }

  if (s.startsWith('SELECT * FROM call_book_calls WHERE running_room_id = ? AND working_date = ? AND sheet_train_id')) {
    const c = (D.CALLS[P[0]] || []).find(x => x.working_date === P[1] && x.sheet_train_id === +P[2]);
    return c ? [c] : [];
  }
  // Two shapes on purpose: the SHEET asks for one service at a time, the
  // CHANGES tab asks for the whole day. A stub that only answered the first
  // left the changes tab empty and no error anywhere -- exactly the kind of
  // silent wrong answer this file keeps producing.
  if (s.startsWith('SELECT * FROM call_book_calls WHERE running_room_id = ? AND working_date')) {
    const svc = s.includes('AND service = ?') ? P[2] : null;
    return (D.CALLS[P[0]] || [])
      .filter(c => c.working_date === P[1] && (!svc || (c.service || 'mail') === svc))
      .sort((a, b) => String(a.call_received_at || '~').localeCompare(String(b.call_received_at || '~')) || a.id - b.id);
  }
  if (s.startsWith('SELECT * FROM call_book_calls WHERE id = ? AND running_room_id')) {
    const c = allCalls().find(x => x.id === +P[0] && x.running_room_id === +P[1]);
    return c ? [c] : [];
  }
  if (s.includes('FROM call_book_calls c') && s.includes('LEFT JOIN users u')) {
    return (D.CALLS[P[0]] || []).filter(c => c.working_date === P[1])
      .map(c => ({ ...c, recorded_by_name: null }))
      .sort((a, b) => String(b.call_received_at || '').localeCompare(String(a.call_received_at || '')) || b.id - a.id);
  }
  if (s.startsWith('SELECT * FROM call_book WHERE call_id')) {
    return allLines().filter(l => l.call_id === +P[0]);
  }
  if (s.includes('FROM call_book_changes ch')) {
    const ids = P.map(Number);
    return (D.CALL_CHANGES || []).filter(ch => ids.includes(ch.call_id))
      .map(ch => ({ ...ch, by_name: 'demo' }))
      .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)));
  }
  if (s.startsWith('INSERT INTO call_book_changes')) {
    // Two shapes: a withdrawal (4 params) and a crew change (7).
    const isWithdraw = s.includes("'withdrawn'");
    (D.CALL_CHANGES ||= []).push(isWithdraw
      ? { id: nextId(), call_id: +P[0], line_id: null, change_type: 'withdrawn',
          was_crew_name: null, now_crew_name: null, reason: P[1], advised_by: P[2],
          changed_by: P[3], changed_at: stamp() }
      : { id: nextId(), call_id: +P[0], line_id: +P[1], change_type: 'crew_changed',
          was_crew_name: P[2], now_crew_name: P[3], reason: P[4], advised_by: P[5],
          changed_by: P[6], changed_at: stamp() });
    return [];
  }
  if (s.includes('UPDATE call_book_calls SET repeated_to_lobby_at = NULL')) {
    const c = allCalls().find(x => x.id === +P[0]);
    if (c) { c.repeated_to_lobby_at = null; c.repeated_to = null; }
    return [];
  }
  if (s.startsWith('UPDATE call_book_calls SET train_no = ?')) {
    const c = allCalls().find(x => x.id === +P[7]);
    if (c) Object.assign(c, { train_no: P[0], train_name: P[1], sign_on_at: P[2],
      received_from: P[3], lobby: P[4], call_received_at: P[5] || c.call_received_at, remarks: P[6] });
    return [];
  }
  if (s.startsWith('UPDATE call_book SET crew_id = ?, crew_name = ?, bed_no')) {
    const l = allLines().find(x => x.id === +P[5]);
    if (l) Object.assign(l, { crew_id: P[0], crew_name: P[1], bed_no: P[2],
                              call_for_train: P[3], booked_on_duty_at: P[4] });
    return [];
  }
  if (s.includes("UPDATE call_book SET crew_id = ?, crew_name = ?, ack_outcome = 'pending'")) {
    const l = allLines().find(x => x.id === +P[2]);
    if (l) Object.assign(l, { crew_id: P[0], crew_name: P[1], ack_outcome: 'pending',
      acknowledged: 0, ack_method: null, acknowledged_at: null, ack_recorded_at: null, served_at: null });
    return [];
  }
  if (s.startsWith('SELECT * FROM call_book_calls WHERE id')) {
    const c = allCalls().find(x => x.id === +P[0]);
    return c ? [c] : [];
  }
  if (s.includes("SUM(cb.ack_outcome = 'acknowledged') AS acknowledged")) {
    const month = String(P[1]).slice(0, 7);
    const calls = (D.CALLS[P[0]] || []).filter(c => String(c.working_date).slice(0, 7) === month);
    const ids = new Set(calls.map(c => c.id));
    const men = (D.CALLBOOK[P[0]] || []).filter(l => ids.has(l.call_id));
    const byCall = new Map(calls.map(c => [c.id, c]));
    const delays = men.map(l => {
      const c = byCall.get(l.call_id);
      return c && l.served_at
        ? Math.round((new Date(String(l.served_at).replace(' ', 'T'))
                    - new Date(String(c.call_received_at).replace(' ', 'T'))) / 60000)
        : null;
    }).filter(v => v !== null);
    const count = f => men.filter(f).length;
    return [{
      men: men.length,
      acknowledged: count(l => l.ack_outcome === 'acknowledged'),
      refused: count(l => l.ack_outcome === 'refused'),
      absent: count(l => l.ack_outcome === 'not_present'),
      pending: count(l => l.ack_outcome === 'pending'),
      late_on_duty: count(l => l.crew_reported_late),
      // A case under Schedule C item 6 needs BOTH limbs: served after the
      // sign-on time, and the man actually late on duty.
      cases: count(l => {
        const c = byCall.get(l.call_id);
        return l.crew_reported_late && l.served_at && c && c.sign_on_at && l.served_at > c.sign_on_at;
      }),
      unadvised: count(l => (l.ack_outcome === 'refused' || l.ack_outcome === 'not_present')
                            && !l.lobby_advised_at),
      avg_delay: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    }];
  }
  if (s.includes('SUM(repeated_to_lobby_at IS NULL')) {
    const month = String(P[1]).slice(0, 7);
    const calls = (D.CALLS[P[0]] || []).filter(c => String(c.working_date).slice(0, 7) === month);
    return [{ total: calls.length,
      unrepeated: calls.filter(c => !c.repeated_to_lobby_at && !c.cancelled_at).length }];
  }
  // The crew register, built from use. Only men actually called at this room
  // are offered back, which is what the SQL does with its join on call_book.
  if (s.includes('MAX(cb.call_received_at) AS last_seen')) {
    const seen = new Map();
    (D.CALLBOOK[P[0]] || []).forEach(c => {
      if (!c.crew_id) return;
      const at = String(c.call_received_at);
      if (!seen.has(c.crew_id) || at > seen.get(c.crew_id)) seen.set(c.crew_id, at);
    });
    return [...seen.entries()]
      .map(([id, last_seen]) => {
        const m = D.CREW.find(x => x.id === id);
        return m && m.is_active
          ? { id, full_name: m.full_name, crew_id_no: m.crew_id_no, source: m.source,
              designation: m.designation, last_seen } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.last_seen.localeCompare(a.last_seen)).slice(0, 300);
  }
  if (s.startsWith('SELECT division_id FROM running_rooms WHERE id')) {
    const r = D.RUNNING_ROOMS.find(x => x.id === P[0]);
    return r ? [{ division_id: r.division_id }] : [];
  }

  // ---------- the division staff master, read through its two narrow views ----
  // On a real installation these live in another schema entirely (bbtro for
  // Mumbai) and RR-CMS is granted SELECT on the views alone. The demo answers
  // the same two queries from invented people.
  if (s.includes('crtms_schema')) {
    const r = D.RUNNING_ROOMS.find(x => x.id === P[0]);
    // Only the pilot division has a master wired up, which is the truth of it.
    return r ? [{ crtms_schema: r.div_code === 'BB' ? 'crtms_demo' : null }] : [];
  }
  if (s.includes('v_rr_crew_lookup')) {
    if (s.includes('WHERE hrms_id = ?'))
      return D.CREW_MASTER.filter(m => m.hrms_id === P[0]);
    const term = String(P[0] || '').replace(/%/g, '').toLowerCase();
    // The narrowed form carries the designation ids between the two LIKEs and
    // the exact-match term; the older form does not. Honouring it here is what
    // stops the demo offering an assistant into the Loco Pilot box.
    const ids = s.includes('designation_id IN')
      ? P.slice(2, P.length - 1).map(Number).filter(n => n > 0) : null;
    return D.CREW_MASTER
      .filter(m => m.full_name.toLowerCase().includes(term)
                || String(m.cms_id || '').toLowerCase().includes(term))
      .filter(m => !ids || !ids.length || ids.includes(m.designation_id))
      .sort((a, b) => (String(b.cms_id).toLowerCase() === term)
                    - (String(a.cms_id).toLowerCase() === term)
                    || a.full_name.localeCompare(b.full_name))
      .slice(0, 20);
  }
  if (s.includes('v_rr_train_lookup')) {
    const term = String(P[0] || '').replace(/%/g, '').toLowerCase();
    return D.TRAIN_MASTER
      .filter(t => t.train_no.toLowerCase().includes(term)
                || String(t.train_name || '').toLowerCase().includes(term))
      .sort((a, b) => (b.train_no.toLowerCase() === term) - (a.train_no.toLowerCase() === term)
                    || a.train_no.length - b.train_no.length
                    || a.train_no.localeCompare(b.train_no))
      .slice(0, 20);
  }
  if (s.includes('v_rr_crew_contact'))
    return D.CREW_MASTER.filter(m => m.hrms_id === P[0])
      .map(m => ({ contact_number: m.contact_number }));

  if (s.includes('FROM crew WHERE hrms_id = ?'))
    return D.CREW.filter(c => c.hrms_id === P[0]).map(c => ({ id: c.id }));
  if (s.includes('FROM crew WHERE crew_id_no = ?'))
    return D.CREW.filter(c => c.crew_id_no === P[0]).map(c => ({ id: c.id }));
  if (s.includes('FROM crew WHERE LOWER(full_name)'))
    return D.CREW.filter(c => c.is_active
      && c.full_name.toLowerCase() === String(P[0]).toLowerCase()).slice(0, 1).map(c => ({ id: c.id }));
  if (s.startsWith('UPDATE crew SET full_name')) {
    const c = D.CREW.find(x => x.id === P[5]);
    if (c) { c.full_name = P[0]; c.crew_id_no = P[1] || c.crew_id_no;
             c.designation = P[2]; c.headquarters = P[3]; c.source = 'div_master'; }
    return [];
  }
  if (s.startsWith('UPDATE crew SET crew_id_no')) {
    const c = D.CREW.find(x => x.id === P[1]);
    if (c && !c.crew_id_no) c.crew_id_no = P[0];
    return [];
  }
  if (s.startsWith('INSERT INTO crew')) {
    const id = Math.max(0, ...D.CREW.map(c => c.id)) + 1;
    // Two shapes: one from the master, one typed at the counter.
    const fromMaster = s.includes('hrms_id');
    D.CREW.push(fromMaster
      ? { id, hrms_id: P[0], crew_id_no: P[1], full_name: P[2], designation: P[3],
          headquarters: P[4], division_id: P[5], source: 'div_master', is_active: 1 }
      : { id, hrms_id: null, crew_id_no: P[0], full_name: P[1], division_id: P[2],
          designation: null, headquarters: null, source: 'typed', is_active: 1 });
    lastInsertId = id;
    return [];
  }

  // Provisional admission: the go-live action, and the muster's gate.
  if (s.includes("screening_status = 'provisional'") && s.startsWith('UPDATE staff')) {
    const rrId = +P[1];
    (D.STAFF || []).filter(x => x.running_room_id === rrId && x.screening_status === 'pending')
      .forEach(x => { x.screening_status = 'provisional'; x.provisional_note = P[0];
                      x.provisional_on = stamp().slice(0, 10); });
    return [];
  }
  if (s.startsWith('SELECT id, full_name FROM staff') && s.includes("screening_status = 'pending'"))
    return (D.STAFF || []).filter(x => x.running_room_id === +P[0] && x.screening_status === 'pending')
      .map(x => ({ id: x.id, full_name: x.full_name }));

  if (s.startsWith('INSERT INTO call_book_calls')) {
    const id = nextId();
    (D.CALLS[P[0]] ||= []).push({ id, running_room_id: P[0], sheet_train_id: P[1] || null,
      working_date: P[2], service: P[3] || 'mail', train_no: P[4], train_name: P[5], sign_on_at: P[6],
      received_from: P[7], lobby: P[8], call_received_at: P[9], created_at: stamp(),
      remarks: P[10], recorded_by: P[11],
      repeated_to_lobby_at: null, repeated_to: null, cancelled_at: null, cancelled_reason: null });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('INSERT INTO call_book')) {
    const id = nextId();
    (D.CALLBOOK[P[0]] ||= []).push({ id, running_room_id: P[0], call_id: P[1],
      crew_id: P[2], crew_name: P[3], crew_role: P[4], bed_no: P[5], call_for_train: P[6],
      call_received_at: P[7], booked_on_duty_at: P[8], served_at: null, delay_minutes: null,
      acknowledged: 0, ack_outcome: 'pending', ack_method: null, ack_recorded_at: null,
      acknowledged_at: null, lobby_advised_at: null, lobby_advised_to: null,
      crew_reported_late: 0, remarks: null, recorded_by: P[9], served_by: null });
    lastInsertId = id;
    return [];
  }
  if (s.includes("UPDATE call_book SET ack_outcome = 'acknowledged'")) {
    const l = allLines().find(x => x.id === +P[0]);
    if (l) {
      const now = stamp();
      Object.assign(l, { ack_outcome: 'acknowledged', ack_method: 'tap', acknowledged: 1,
        ack_recorded_at: now, acknowledged_at: now, served_at: l.served_at || now });
    }
    return [];
  }
  if (s.startsWith('UPDATE call_book SET ack_outcome = ?')) {
    const l = allLines().find(x => x.id === +P[5]);
    if (l) {
      const now = stamp();
      const outcome = P[0], advise = P[2] === 1 || P[2] === '1';
      Object.assign(l, { ack_outcome: outcome, acknowledged: 0, ack_method: null,
        acknowledged_at: null, ack_recorded_at: null,
        served_at: outcome === 'pending' ? l.served_at : (l.served_at || now) });
      if (advise) {
        l.lobby_advised_at = l.lobby_advised_at || now;
        l.lobby_advised_to = P[4];
      }
    }
    return [];
  }
  if (s.startsWith('UPDATE call_book SET crew_reported_late')) {
    const l = allLines().find(x => x.id === +P[2]);
    if (l) { l.crew_reported_late = +P[0]; l.remarks = P[1]; }
    return [];
  }
  if (s.includes('UPDATE call_book_calls SET repeated_to_lobby_at')) {
    const c = allCalls().find(x => x.id === +P[2]);
    if (c) { c.repeated_to_lobby_at = c.repeated_to_lobby_at || stamp();
             c.repeated_to = P[0]; c.repeated_by = P[1]; }
    return [];
  }
  if (s.includes('UPDATE call_book_calls SET cancelled_at')) {
    const c = allCalls().find(x => x.id === +P[1]);
    if (c) { c.cancelled_at = stamp(); c.cancelled_reason = P[0]; }
    return [];
  }

  // ---------- meals: one tick per crew per service ----------
  if (s.includes('LEFT JOIN meal_services ms ON ms.crew_id = c.id')) {
    const rrId = P[0], date = P[1];
    const called = new Map();
    (D.CALLBOOK[rrId] || []).forEach(c => {
      if (!c.crew_id || dOnly(c.call_received_at) !== date) return;
      const at = String(c.call_received_at);
      if (!called.has(c.crew_id) || at < called.get(c.crew_id)) called.set(c.crew_id, at);
    });
    const ids = new Set(called.keys());
    for (const k of D.MEALS.keys()) {
      const [r, d, , crew] = k.split('|');
      if (+r === rrId && d === date) ids.add(+crew);
    }
    return [...ids].map(id => {
      const m = D.CREW.find(x => x.id === id);
      return m && m.is_active
        ? { id, full_name: m.full_name, crew_id_no: m.crew_id_no, source: m.source,
            designation: m.designation, called_at: called.get(id) || null } : null;
    }).filter(Boolean).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }
  if (s.startsWith('SELECT crew_id, meal_type FROM meal_services')) {
    const out = [];
    for (const k of D.MEALS.keys()) {
      const [r, d, meal, crew] = k.split('|');
      if (+r === P[0] && d === P[1]) out.push({ crew_id: +crew, meal_type: meal });
    }
    return out;
  }
  if (s.includes('SELECT meal_type, COUNT(*) AS n FROM meal_services')) {
    const month = String(P[1]).slice(0, 7);
    const by = {};
    for (const k of D.MEALS.keys()) {
      const [r, d, meal] = k.split('|');
      if (+r === P[0] && d.slice(0, 7) === month) by[meal] = (by[meal] || 0) + 1;
    }
    return Object.entries(by).map(([meal_type, n]) => ({ meal_type, n }));
  }
  if (s.includes('FROM meal_rates WHERE effective_from')) return D.MEAL_RATES;
  if (s.includes('FROM meal_rates ORDER BY meal_type')) return D.MEAL_RATES;

  // ------- raw-foodstuff quality register and garden upkeep (stage 28) ------
  if (s.includes('FROM foodstuff_checks c'))
    return (D.FOODSTUFF_CHECKS || []).filter(c => c.running_room_id === P[0])
      .slice().sort((a, b) => String(b.checked_on).localeCompare(String(a.checked_on)) || b.id - a.id)
      .slice(0, 30);
  if (s.includes('FROM foodstuff_check_items WHERE check_id IN'))
    return (D.FOODSTUFF_ITEMS_ROWS || []).filter(i => P.includes(i.check_id));
  if (s.includes('FROM foodstuff_check_signatures WHERE check_id IN'))
    return (D.FOODSTUFF_SIGS || []).filter(g => P.includes(g.check_id));
  if (s.startsWith('INSERT INTO foodstuff_checks')) {
    const id = 800000 + (D.FOODSTUFF_CHECKS || []).length;
    (D.FOODSTUFF_CHECKS ||= []).unshift({ id, running_room_id: P[0], checked_on: P[1],
      checked_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      conducted_by: P[2], remarks: P[3], recorded_by: P[4], recorded_name: 'RR In-charge' });
    // The pool reads `lastInsertId`, not this function's return value — a stub
    // that returns {insertId} instead of setting it hands the caller undefined,
    // and every child row is then written against a check that does not exist.
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('INSERT INTO foodstuff_check_items')) {
    (D.FOODSTUFF_ITEMS_ROWS ||= []).push({ id: 810000 + D.FOODSTUFF_ITEMS_ROWS.length,
      check_id: P[0], item: P[1], brand: P[2], seal_intact: P[3], fssai_mark: P[4],
      quality: P[5], remarks: P[6] });
    return [];
  }
  if (s.startsWith('INSERT INTO foodstuff_check_signatures')) {
    (D.FOODSTUFF_SIGS ||= []).push({ id: 820000 + D.FOODSTUFF_SIGS.length,
      check_id: P[0], crew_id: null, signatory_name: P[1], designation: P[2],
      signed_at: new Date().toISOString().slice(0, 19).replace('T', ' '), signature_file_id: null });
    return [];
  }
  // The contractor's men offered on the garden form and the cleaning register.
  if (s.includes('SELECT s.id, s.full_name FROM staff s'))
    return (D.STAFF || []).filter(x => x.running_room_id === P[0] && x.is_active
      && ['approved', 'provisional'].includes(x.screening_status))
      .map(x => ({ id: x.id, full_name: x.full_name }));
  if (s.includes('FROM garden_upkeep g'))
    return ((D.GARDEN || {})[P[0]] || []).slice(0, 40);
  if (s.startsWith('INSERT INTO garden_upkeep')) {
    const list = ((D.GARDEN ||= {})[P[0]] ||= []);
    list.unshift({ id: 830000 + list.length, running_room_id: P[0], work_date: P[1],
      work_type: P[2], plants_supplied: P[3], pot_material: P[4], pot_size_inches: P[5],
      organic: P[6], detail: P[7], done_by_staff_id: P[8], done_by_name: null, recorded_by: P[9] });
    return [];
  }

  // ---------------------- the daily cleaning record (stage 26) ----------------
  if (s.includes('FROM cleaning_schedule WHERE is_active'))
    return D.CLEANING_SCHEDULE.slice();
  // ORDER MATTERS, TWICE OVER.
  //
  // The count query ends in exactly the same WHERE clause as the day's rounds,
  // so it has to be matched FIRST or it comes back as an array of rows and
  // `[0].n` is undefined -- the verification then refuses every day on the
  // ground that nothing was recorded. Found by trying to verify a day that had
  // just been filled: the sixth stub collision in this file, and every one of
  // them has been a narrower query swallowed by a wider one written above it.
  if (s.includes('COUNT(*) AS n FROM cleaning_log'))
    return [{ n: [...D.CLEANING_LOG.values()]
      .filter(l => l.running_room_id === P[0] && l.work_date === P[1]).length }];
  // Then the day's rounds, before the fortnight query below, which also selects
  // FROM cleaning_log.
  if (s.includes('FROM cleaning_log WHERE running_room_id = ? AND work_date = ?'))
    return [...D.CLEANING_LOG.values()]
      .filter(l => l.running_room_id === P[0] && l.work_date === P[1]);
  if (s.includes('FROM cleaning_log') && s.includes('BETWEEN DATE_SUB')) {
    const to = P[1];
    const from = new Date(Date.parse(to + 'T00:00:00Z') - 13 * 86400000).toISOString().slice(0, 10);
    return [...D.CLEANING_LOG.values()]
      .filter(l => l.running_room_id === P[0] && l.work_date >= from && l.work_date <= to)
      .map(l => ({ work_date: l.work_date, schedule_id: l.schedule_id, status: l.status }));
  }
  if (s.startsWith('INSERT INTO cleaning_log')) {
    D.CLEANING_LOG.set(`${P[0]}|${P[1]}|${P[2]}`, {
      running_room_id: P[0], work_date: P[1], schedule_id: P[2], status: P[3],
      done_at: P[4], done_by_staff_id: P[5], freshener: P[6], remarks: P[7], recorded_by: P[8] });
    return [];
  }
  if (s.startsWith('DELETE FROM cleaning_log')) {
    const had = D.CLEANING_LOG.delete(`${P[0]}|${P[1]}|${P[2]}`);
    return { affectedRows: had ? 1 : 0 };
  }
  if (s.includes('FROM cleaning_day d')) {
    const d = D.CLEANING_DAY.get(`${P[0]}|${P[1]}`);
    return d ? [d] : [];
  }
  if (s.startsWith('INSERT INTO cleaning_day')) {
    D.CLEANING_DAY.set(`${P[0]}|${P[1]}`, { running_room_id: P[0], work_date: P[1],
      verified_by: P[2], verified_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      verify_remarks: P[3], verified_name: 'RR In-charge' });
    return [];
  }
  if (s.startsWith('DELETE FROM cleaning_day')) {
    D.CLEANING_DAY.delete(`${P[0]}|${P[1]}`);
    return [];
  }

  // ---------- menu card, rate board and the weekly menu (stage 25) ----------
  if (s.includes("FROM menu_items WHERE schedule_table = 'A'"))
    return D.MENU_ITEMS.filter(i => i.schedule_table === 'A');
  if (s.includes("FROM menu_items WHERE schedule_table = 'B'"))
    return D.MENU_ITEMS.filter(i => i.schedule_table === 'B').map(i => ({ id: i.id }));
  if (s.includes('FROM menu_items WHERE is_active')) return D.MENU_ITEMS;
  // The rate board as it stands on a date — the latest rate for each item that
  // had taken effect by then, which is what a complaint has to be judged against.
  if (s.includes('MAX(effective_from) AS d FROM menu_item_rates')) {
    const on = P[0], latest = {};
    D.MENU_RATES.filter(r => r.effective_from <= on).forEach(r => {
      if (!latest[r.menu_item_id] || r.effective_from > latest[r.menu_item_id].effective_from)
        latest[r.menu_item_id] = r;
    });
    return Object.values(latest);
  }
  if (s.includes('FROM menu_item_rates ORDER BY'))
    return D.MENU_RATES.slice().sort((a, b) => a.menu_item_id - b.menu_item_id
      || String(b.effective_from).localeCompare(String(a.effective_from)));
  if (s.startsWith('INSERT INTO menu_item_rates')) {
    const [itemId, on, rate, authority] = P;
    const found = D.MENU_RATES.find(r => r.menu_item_id === itemId && r.effective_from === on);
    if (found) Object.assign(found, { rate, authority });
    else D.MENU_RATES.push({ id: D.MENU_RATES.length + 1, menu_item_id: itemId,
      effective_from: on, rate, authority, recorded_by: P[4] });
    return [];
  }

  if (s.includes('FROM menu_plans p')) {
    const p = D.MENU_PLANS.get(`${P[0]}|${P[1]}`);
    return p ? [Object.assign({}, p, {
      prepared_name: p.prepared_by ? 'Contractor Supervisor' : null,
      agreed_name: p.agreed_by ? 'RR In-charge' : null })] : [];
  }
  if (s.includes('FROM menu_plans WHERE running_room_id')) {
    const p = D.MENU_PLANS.get(`${P[0]}|${P[1]}`);
    return p ? [p] : [];
  }
  if (s.startsWith('INSERT INTO menu_plans')) {
    const key = `${P[0]}|${P[1]}`;
    const p = D.MENU_PLANS.get(key);
    if (p) Object.assign(p, { prepared_by: P[2], remarks: P[3] });
    else D.MENU_PLANS.set(key, { id: 700000 + D.MENU_PLANS.size, running_room_id: P[0],
      week_start: P[1], status: 'draft', prepared_by: P[2], agreed_by: null,
      agreed_on: null, remarks: P[3] });
    return [];
  }
  if (s.startsWith('UPDATE menu_plans')) {
    const p = D.MENU_PLANS.get(`${P[3]}|${P[4]}`);
    if (p) Object.assign(p, { status: P[0], agreed_by: P[1], agreed_on: P[2] });
    return [];
  }
  if (s.includes('FROM menu_plan_days WHERE menu_plan_id'))
    return (D.MENU_PLAN_DAYS.get(P[0]) || []).slice();
  if (s.startsWith('INSERT INTO menu_plan_days')) {
    const list = D.MENU_PLAN_DAYS.get(P[0]) || [];
    const i = list.findIndex(x => x.day_of_week === P[1] && x.meal_type === P[2]);
    const row = { menu_plan_id: P[0], day_of_week: P[1], meal_type: P[2],
      main_item: P[3], veg_dry: P[4], veg_curry: P[5], notes: P[6] };
    if (i > -1) list[i] = row; else list.push(row);
    D.MENU_PLAN_DAYS.set(P[0], list);
    return [];
  }
  if (s.startsWith('DELETE FROM menu_plan_days')) {
    const list = D.MENU_PLAN_DAYS.get(P[0]) || [];
    D.MENU_PLAN_DAYS.set(P[0], list.filter(x => !(x.day_of_week === P[1] && x.meal_type === P[2])));
    return [];
  }
  if (s.startsWith('SELECT id, full_name FROM crew WHERE id IN'))
    return D.CREW.filter(c => P.includes(c.id)).map(c => ({ id: c.id, full_name: c.full_name }));
  if (s.startsWith('INSERT INTO meal_services')) {
    const key = `${P[0]}|${P[1]}|${P[2]}|${P[3]}`;
    lastAffected = D.MEALS.has(key) ? 2 : 1;      // MySQL: 1 inserted, 2 updated
    D.MEALS.set(key, { crew_name: P[4] });
    return [];
  }
  if (s.startsWith('DELETE FROM meal_services')) {
    const key = `${P[0]}|${P[1]}|${P[2]}|${P[3]}`;
    lastAffected = D.MEALS.delete(key) ? 1 : 0;
    return [];
  }

  // ---------- the signed feedback register, and stored coverage ----------
  if (s.includes('FROM feedback f LEFT JOIN users u ON u.id = f.entered_by')) {
    const month = String(P[1]).slice(0, 7);
    return D.FEEDBACK.filter(f => f.running_room_id === P[0]
        && f.channel === 'checkout_register'
        && String(f.submitted_at).slice(0, 7) === month)
      .sort((a, b) => String(a.register_page_no || '').localeCompare(String(b.register_page_no || ''))
                   || a.id - b.id);
  }
  if (s.startsWith('SELECT occupants_total FROM occupancy_monthly')) {
    const v = occupancyOf(P[0], P[1]);
    // No figure typed in means no denominator -- and the screen has to say so,
    // not quietly invent one from the reference crews-per-day.
    return v === undefined ? [] : [{ occupants_total: v }];
  }
  if (s.includes("SUM(channel = 'checkout_register') AS signed_received")) {
    const month = String(P[1]).slice(0, 7);
    const mine = D.FEEDBACK.filter(f => f.running_room_id === P[0]
      && String(f.submitted_at).slice(0, 7) === month);
    return [{ received: mine.length,
              signed_received: mine.filter(f => f.channel === 'checkout_register').length }];
  }
  if (s.startsWith('INSERT INTO feedback_coverage')) {
    D.COVERAGE[`${P[0]}|${String(P[1]).slice(0, 7)}`] = {
      running_room_id: P[0], period_month: P[1], occupants_total: P[2],
      feedback_received: P[3], signed_received: P[4], coverage_pct: P[5],
      signed_pct: P[6], meets_floor: P[7], meets_signed_floor: P[8] };
    return [];
  }
  if (s.includes('signed_pct, meets_floor, meets_signed_floor') && s.includes('FROM feedback_coverage'))
    return Object.values(D.COVERAGE)
      .filter(c => c && String(c.period_month).slice(0, 7) === String(P[0]).slice(0, 7));
  if (s.startsWith('SELECT rr.id FROM running_rooms rr WHERE'))
    return rooms.map(r => ({ id: r.id }));

  // ---------- vendors: approval, inspection, withdrawal ----------
  if (s.includes('FROM vendors v') && s.includes('LEFT JOIN vendor_inspections'))
    return D.VENDORS.map(v => {
      const k = D.VENDOR_INSPECTIONS.filter(x => x.vendor_id === v.id)
        .sort((a, b) => String(b.inspected_on).localeCompare(String(a.inspected_on)))[0];
      return { ...v, approved_by_name: v.approved_by_name || null,
        sites: (D.RR_VENDORS ? Object.values(D.RR_VENDORS).flat() : [])
          .filter(x => x.vendor_id === v.id).length,
        dispatches: Object.values(D.LAUNDRY || {}).flat().filter(x => x.vendor_id === v.id).length,
        last_inspected_on: k ? k.inspected_on : null, last_result: k ? k.result : null };
    }).sort((a, b) => (b.is_active - a.is_active)
      || a.vendor_type.localeCompare(b.vendor_type) || a.name.localeCompare(b.name));
  if (s.startsWith('SELECT * FROM vendors WHERE id')) {
    const v = D.VENDORS.find(x => x.id === P[0]);
    return v ? [v] : [];
  }
  if (s.startsWith('INSERT INTO vendors')) {
    const id = Math.max(0, ...D.VENDORS.map(v => v.id)) + 1;
    D.VENDORS.push({ id, vendor_type: P[0], name: P[1], address: P[2], contact_person: P[3],
      phone: P[4], gst_no: P[5], licence_no: P[6], licence_valid_till: P[7],
      is_approved: 0, is_active: 1, approved_on: null, approved_by: null,
      blacklisted_on: null, blacklist_reason: null });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE vendors SET is_approved = 1')) {
    const v = D.VENDORS.find(x => x.id === P[2]);
    if (v) { v.is_approved = 1; v.approved_on = P[0]; v.approved_by = P[1];
             v.approved_by_name = (USERS.find(u => u.id === P[1]) || {}).full_name || null;
             v.blacklisted_on = null; v.blacklist_reason = null; }
    return [];
  }
  if (s.startsWith('UPDATE vendors SET is_approved = 0')) {
    // Two shapes: the withdrawal (reason, id) and the unfit finding (date, reason, id).
    const id = P[P.length - 1];
    const v = D.VENDORS.find(x => x.id === id);
    if (v) { v.is_approved = 0;
             v.blacklisted_on = P.length === 3 ? P[0] : D.TODAY;
             v.blacklist_reason = P.length === 3 ? P[1] : P[0]; }
    return [];
  }
  if (s.includes('FROM vendor_inspections k LEFT JOIN users u'))
    return D.VENDOR_INSPECTIONS.filter(k => k.vendor_id === P[0])
      .sort((a, b) => String(b.inspected_on).localeCompare(String(a.inspected_on)));
  if (s.startsWith('INSERT INTO vendor_inspections')) {
    D.VENDOR_INSPECTIONS.push({ id: D.VENDOR_INSPECTIONS.length + 1, vendor_id: P[0],
      inspected_on: P[1], inspected_by: P[2], result: P[3], observations: P[4],
      evidence_file_id: P[5],
      inspected_by_name: (USERS.find(u => u.id === P[2]) || {}).full_name || null });
    return [];
  }
  if (s.includes('FROM running_room_vendors rv JOIN running_rooms rr'))
    return [];

  // ---------- assets: creation and the three-monthly joint check ----------
  if (s.startsWith('INSERT INTO assets')) {
    const id = Math.max(0, ...Object.values(D.ASSETS).flat().map(a => a.id)) + 1;
    (D.ASSETS[P[0]] ||= []).push({ id, running_room_id: P[0], asset_code: P[1], name: P[2],
      category: P[3], owned_by: P[4], quantity: P[5], condition_status: P[6],
      handed_over_on: P[7], joint_note_file_id: P[8], returned_on: null, remarks: P[9],
      open_faults: 0 });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE assets SET returned_on')) {
    for (const list of Object.values(D.ASSETS)) {
      const a = list.find(x => x.id === P[2]);
      if (a) { a.returned_on = P[0]; a.remarks = P[1]; break; }
    }
    return [];
  }
  if (s.startsWith("UPDATE assets SET condition_status = 'condemned'")) {
    for (const list of Object.values(D.ASSETS)) {
      const a = list.find(x => x.id === P[1]);
      if (a) { a.condition_status = 'condemned'; a.remarks = P[0]; break; }
    }
    return [];
  }
  if (s.startsWith('UPDATE assets SET condition_status = ? WHERE id')) {
    for (const list of Object.values(D.ASSETS)) {
      const a = list.find(x => x.id === P[1]);
      if (a) { a.condition_status = P[0]; break; }
    }
    return [];
  }
  if (s.startsWith("SELECT id, name, quantity FROM assets"))
    return (D.ASSETS[P[0]] || []).filter(a => a.owned_by === 'railway' && !a.returned_on)
      .map(a => ({ id: a.id, name: a.name, quantity: a.quantity }));
  if (s.includes('FROM asset_checks c LEFT JOIN users u'))
    return D.ASSET_CHECKS.filter(c => c.running_room_id === P[0])
      .sort((a, b) => String(b.checked_on).localeCompare(String(a.checked_on)))
      .slice(0, 12)
      .map(c => ({ ...c, items: undefined, checked_by_name: c.checked_by_name,
        short: c.items.filter(i => i.quantity_found < i.quantity_expected
                                || i.condition_status === 'missing').length }));
  if (s.startsWith('INSERT INTO asset_checks')) {
    let c = D.ASSET_CHECKS.find(x => x.running_room_id === P[0] && x.checked_on === P[1]);
    if (!c) {
      c = { id: D.ASSET_CHECKS.length + 1, running_room_id: P[0], checked_on: P[1],
            checked_by: P[2], contractor_rep: P[3], remarks: P[4], items: [],
            checked_by_name: (USERS.find(u => u.id === P[2]) || {}).full_name || null };
      D.ASSET_CHECKS.push(c);
    } else { c.checked_by = P[2]; c.contractor_rep = P[3]; c.remarks = P[4]; }
    lastInsertId = c.id;
    return [];
  }
  if (s.startsWith('SELECT id FROM asset_checks')) {
    const c = D.ASSET_CHECKS.find(x => x.running_room_id === P[0] && x.checked_on === P[1]);
    return c ? [{ id: c.id }] : [];
  }
  if (s.startsWith('INSERT INTO asset_check_items')) {
    const c = D.ASSET_CHECKS.find(x => x.id === P[0]);
    if (c) {
      const i = c.items.findIndex(x => x.asset_id === P[1]);
      const row = { check_id: P[0], asset_id: P[1], quantity_expected: P[2],
                    quantity_found: P[3], condition_status: P[4], remarks: P[5] };
      if (i > -1) c.items[i] = row; else c.items.push(row);
    }
    return [];
  }

  // ---------- staff grading ----------
  if (s.includes('LEFT JOIN staff_ratings r ON r.staff_id = st.id')) {
    return D.STAFF.filter(x => x.running_room_id === P[1] && x.is_active).map(x => {
      const r = D.STAFF_RATINGS.get(`${x.id}|${P[0]}`) || {};
      return { id: x.id, staff_code: x.staff_code, full_name: x.full_name,
        designation: x.designation, sort_order: 0, screening_status: x.screening_status,
        date_of_joining: x.date_of_joining,
        occupant_avg: r.occupant_avg ?? null, occupant_count: r.occupant_count ?? 0,
        joint_eval_score: r.joint_eval_score ?? null, attendance_pct: r.attendance_pct ?? null,
        recommendation: r.recommendation ?? null, remarks: r.remarks ?? null,
        evaluated_on: r.evaluated_on ?? null, evaluated_by_name: r.evaluated_by_name ?? null };
    }).sort((a, b) => a.designation.localeCompare(b.designation) || a.full_name.localeCompare(b.full_name));
  }
  if (s.includes('f.named_staff_id AS staff_id')) {
    const month = String(P[1]).slice(0, 7);
    const by = {};
    D.FEEDBACK.filter(f => f.running_room_id === P[0] && f.named_staff_id
                        && f.rating_overall !== null
                        && String(f.submitted_at).slice(0, 7) === month)
      .forEach(f => { (by[f.named_staff_id] ||= []).push(f.rating_overall); });
    return Object.entries(by).map(([id, xs]) => ({ staff_id: +id, n: xs.length,
      avg_overall: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 }));
  }
  if (s.includes('SUM(a.status IN (') && s.includes('FROM attendance_daily a')) {
    const month = String(P[1]).slice(0, 7);
    const by = {};
    for (const [k, v] of D.ATTENDANCE.entries()) {
      const [rr, date, staff] = k.split('|');
      if (+rr !== P[0] || date.slice(0, 7) !== month) continue;
      const b = (by[staff] ||= { days: 0, present: 0 });
      b.days++;
      if (v.status === 'present' || v.status === 'reliever') b.present++;
    }
    return Object.entries(by).map(([staff_id, b]) => ({ staff_id: +staff_id, days: b.days, present: b.present }));
  }
  if (s.startsWith('INSERT INTO staff_ratings')) {
    D.STAFF_RATINGS.set(`${P[0]}|${P[2]}`, { staff_id: P[0], running_room_id: P[1],
      period_month: P[2], occupant_avg: P[3], occupant_count: P[4], joint_eval_score: P[5],
      attendance_pct: P[6], recommendation: P[7], evaluated_by: P[8], remarks: P[9],
      evaluated_on: D.TODAY,
      evaluated_by_name: (USERS.find(u => u.id === P[8]) || {}).full_name || null });
    return [];
  }

  // ---------- bills ----------
  if (s.includes('FROM bills b') && s.includes('JOIN contractors c')) {
    if (s.includes('WHERE b.id = ?')) {
      const b = D.BILLS.find(x => x.id === P[0]);
      return b ? [decorateBill(b)] : [];
    }
    return D.BILLS.slice().sort((a, b) => String(b.period_month).localeCompare(String(a.period_month)))
      .map(decorateBill);
  }
  if (s.includes('FROM contracts ct') && s.includes('JOIN contract_running_rooms crr'))
    return D.CONTRACTORS.map(c => ({ id: c.id, agreement_no: `AGREEMENT-AWAITED/${c.code}`,
      contractor_name: c.name }));
  if (s.startsWith('SELECT id FROM contracts WHERE id'))
    return D.CONTRACTORS.filter(c => c.id === P[0]).map(c => ({ id: c.id }));
  if (s.startsWith('SELECT id FROM bills WHERE contract_id')) {
    const b = D.BILLS.find(x => x.contract_id === P[0] && x.period_month === P[1]
      && (P.length === 3 ? x.running_room_id === P[2] : x.running_room_id === null));
    return b ? [{ id: b.id }] : [];
  }
  if (s.startsWith('INSERT INTO bills')) {
    const id = D.BILLS.length + 1;
    D.BILLS.push({ id, contract_id: P[0], running_room_id: P[1], period_month: P[2],
      due_on: P[3], status: 'draft', bill_no: null, submitted_on: null,
      gross_schedule_a: 0, gross_schedule_b: 0, gross_schedule_c: 0, gross_schedule_d: 0,
      gross_total: 0, deduction_amount: 0, net_payable: 0, schedule_b_source_ref: null,
      remarks: null, checked_by: null, passed_by: null, passed_on: null, paid_on: null });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE bills SET bill_no')) {
    const b = D.BILLS.find(x => x.id === P[10]);
    if (b) Object.assign(b, { bill_no: P[0], submitted_on: P[1], gross_schedule_a: P[2],
      gross_schedule_b: P[3], schedule_b_source_ref: P[4], gross_schedule_c: P[5],
      gross_schedule_d: P[6], gross_total: P[7], net_payable: P[8], remarks: P[9] });
    return [];
  }
  if (s.startsWith('UPDATE bills SET status')) {
    const b = D.BILLS.find(x => x.id === P[P.length - 1]);
    if (b) {
      b.status = P[0];
      if (s.includes('checked_by')) b.checked_by = P[1];
      if (s.includes('passed_by')) { b.passed_by = P[1]; b.passed_on = D.TODAY; }
      if (s.includes('paid_on = ?')) b.paid_on = P[1];
      if (s.includes('remarks = ?')) b.remarks = P[P.length - 2];
    }
    return [];
  }
  if (s.includes('FROM bill_documents bd LEFT JOIN users u'))
    return [...D.BILL_DOCS.values()].filter(d => d.bill_id === P[0]);
  if (s.startsWith('SELECT doc_type FROM bill_documents'))
    return [...D.BILL_DOCS.values()].filter(d => d.bill_id === P[0] && !d.is_received)
      .map(d => ({ doc_type: d.doc_type }));
  if (s.startsWith('INSERT INTO bill_documents')) {
    const key = `${P[0]}|${P[1]}`;
    const was = D.BILL_DOCS.get(key) || {};
    D.BILL_DOCS.set(key, { bill_id: P[0], doc_type: P[1],
      is_received: P.length > 2 ? P[2] : 0,
      received_on: P.length > 3 ? P[3] : null,
      file_id: (P.length > 4 ? P[4] : null) || was.file_id || null,
      verified_by: P.length > 5 ? P[5] : null, remarks: P.length > 6 ? P[6] : null,
      verified_by_name: (USERS.find(u => u.id === (P.length > 5 ? P[5] : null)) || {}).full_name || null });
    return [];
  }
  if (s.includes('FROM deficiencies df JOIN deficiency_clauses dc') && s.includes('GROUP BY dc.clause_code')) {
    const month = String(P[1]).slice(0, 7);
    const by = {};
    (D.DEFICIENCIES[P[0]] || [])
      .filter(d => String(d.occurred_on).slice(0, 7) === month && d.status !== 'withdrawn')
      .forEach(d => {
        const k = d.clause_code;
        (by[k] ||= { clause_code: k, description: d.clause_description, rate: d.rate,
                     unit: d.unit, cases: 0, units: 0 });
        by[k].cases++; by[k].units += d.quantity || 1;
      });
    return Object.values(by).sort((a, b) => a.clause_code.localeCompare(b.clause_code));
  }

  // ---------- the periodic review: weekly and monthly clauses ----------
  if (s.includes('FROM deficiency_clauses') && s.includes('frequency = ?'))
    return D.CLAUSES.filter(c => c.frequency === P[0] && !c.is_formula
      && (!s.includes('applies_to_meals = 0') || !c.applies_to_meals))
      .sort((a, b) => a.group_code.localeCompare(b.group_code)
                   || a.clause_code.length - b.clause_code.length
                   || a.clause_code.localeCompare(b.clause_code));
  if (s.startsWith('SELECT clause_id, quantity, description, status FROM deficiencies')) {
    return (D.DEFICIENCIES[P[0]] || [])
      .filter(d => String(d.occurred_on).slice(0, 10) === P[1] && d.source === 'review')
      .map(d => ({ clause_id: d.clause_id, quantity: d.quantity,
                   description: d.description, status: d.status }));
  }
  if (s.startsWith('DELETE FROM deficiencies')) {
    const list = D.DEFICIENCIES[P[0]] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (String(d.occurred_on).slice(0, 10) === P[1] && d.source === 'review' && d.status === 'open')
        list.splice(i, 1);
    }
    return [];
  }

  // ---------- CCTV ----------
  if (s.includes('FROM cctv_cameras c') && s.includes('LEFT JOIN cctv_checks'))
    return (D.CCTV[P[0]] || []).slice().sort((a, b) =>
      (b.is_active - a.is_active)
      || ['kitchen','dining','corridor','entrance','store','other'].indexOf(a.zone)
       - ['kitchen','dining','corridor','entrance','store','other'].indexOf(b.zone)
      || a.label.localeCompare(b.label));
  if (s.startsWith('SELECT id FROM cctv_cameras WHERE running_room_id'))
    return (D.CCTV[P[0]] || []).filter(c => c.is_active).map(c => ({ id: c.id }));
  if (s.startsWith('SELECT id, running_room_id, label FROM cctv_cameras')) {
    for (const list of Object.values(D.CCTV)) {
      const c = list.find(x => x.id === P[0]);
      if (c) return [{ id: c.id, running_room_id: c.running_room_id, label: c.label }];
    }
    return [];
  }
  if (s.startsWith('INSERT INTO cctv_cameras')) {
    const list = (D.CCTV[P[0]] ||= []);
    const id = Math.max(0, ...Object.values(D.CCTV).flat().map(c => c.id)) + 1;
    list.push({ id, running_room_id: P[0], zone: P[1], label: P[2], location_note: P[3],
      installed_on: P[4], is_active: 1, retired_on: null, retired_reason: null,
      checked_on: null, last_working: null, last_recording: null,
      footage_days_seen: null, last_remarks: null, checked_by_name: null });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('UPDATE cctv_cameras SET is_active = 0')) {
    for (const list of Object.values(D.CCTV)) {
      const c = list.find(x => x.id === P[1]);
      if (c) { c.is_active = 0; c.retired_on = D.TODAY; c.retired_reason = P[0]; break; }
    }
    return [];
  }
  if (s.startsWith('INSERT INTO cctv_checks')) {
    for (const list of Object.values(D.CCTV)) {
      const c = list.find(x => x.id === P[0]);
      if (!c) continue;
      c.checked_on = P[1]; c.last_working = P[2]; c.last_recording = P[3];
      c.footage_days_seen = P[4]; c.last_remarks = P[6];
      c.checked_by_name = (USERS.find(u => u.id === P[5]) || {}).full_name || null;
      break;
    }
    return [];
  }

  // linen stock -- counted by item, never carried forward
  if (s.includes('FROM linen_stock s LEFT JOIN users u')) {
    return (D.LINEN_STOCK[P[0]] || []).slice()
      .sort((a, b) => String(b.as_on_date).localeCompare(String(a.as_on_date))
                   || a.item_type.localeCompare(b.item_type));
  }
  if (s.startsWith('INSERT INTO linen_stock')) {
    const list = (D.LINEN_STOCK[P[0]] ||= []);
    const row = { running_room_id: P[0], item_type: P[1], issued_by_railway: P[2],
      in_service: P[3], at_laundry: P[4], condemned: P[5], lost_damaged: P[6],
      as_on_date: P[7], counted_by: P[8], remarks: P[9],
      counted_by_name: (USERS.find(u => u.id === P[8]) || {}).full_name || null };
    const i = list.findIndex(x => x.item_type === P[1] && x.as_on_date === P[7]);
    if (i > -1) list[i] = row; else list.push(row);
    return [];
  }

  // linen
  //
  // ORDER MATTERS. `INSERT INTO linen_daily_item` also starts with
  // `INSERT INTO linen_daily`, so the item table must be matched first or every
  // item row is written into the day header and the register reads empty. Five
  // wrong-data bugs in this file have been exactly this shape.
  if (s.includes('FROM linen_daily_item WHERE running_room_id')) {
    const from = P[1];   // the date the page is showing; the query reaches back 20 days
    const floor = new Date(Date.parse(from + 'T00:00:00Z') - 20 * 86400000).toISOString().slice(0, 10);
    return (D.LINEN_ITEM[P[0]] || []).filter(x => x.record_date >= floor);
  }
  if (s.includes('SELECT item_type, fresh_in_hand FROM linen_daily_item'))
    return (D.LINEN_ITEM[P[0]] || []).filter(x => x.record_date === P[1])
      .map(x => ({ item_type: x.item_type, fresh_in_hand: x.fresh_in_hand }));
  if (s.startsWith('INSERT INTO linen_daily_item')) {
    const list = (D.LINEN_ITEM[P[0]] ||= []);
    const row = { running_room_id: P[0], record_date: P[1], item_type: P[2],
      issued: P[3], fresh_in_hand: P[4] };
    const i = list.findIndex(x => x.record_date === P[1] && x.item_type === P[2]);
    if (i > -1) list[i] = row; else list.push(row);
    return [];
  }
  if (s.includes('FROM linen_daily WHERE running_room_id'))
    return (D.LINEN[P[0]] || []).slice().sort((a, b) => b.record_date.localeCompare(a.record_date)).slice(0, 14);
  if (s.startsWith('INSERT INTO linen_daily')) {
    const list = (D.LINEN[P[0]] ||= []);
    const row = { running_room_id: P[0], record_date: P[1], min_stock_met: P[2],
      used_linen_reported: P[3], remarks: P[4], recorded_by: P[5], verified_by: null };
    const i = list.findIndex(x => x.record_date === P[1]);
    if (i > -1) list[i] = row; else list.push(row);
    return [];
  }
  if (s.includes('SELECT total_beds FROM running_rooms WHERE id')) {
    const r = rooms.find(x => x.id === P[0]);
    return r ? [{ total_beds: r.total_beds }] : [];
  }

  // The wash cycle as the linen page reads it — summed per item out of the
  // laundry record, which owns it.
  if (s.includes('SUM(ld.quantity_sent) AS qty')) {
    const by = {};
    (D.LAUNDRY[P[0]] || []).filter(x => x.dispatch_date === P[1])
      .forEach(x => { by[x.item_type] = (by[x.item_type] || 0) + x.quantity_sent; });
    return Object.keys(by).map(k => ({ item_type: k, qty: by[k], n: 1 }));
  }
  if (s.includes('SUM(ld.quantity_returned) AS qty')) {
    const by = {};
    (D.LAUNDRY[P[0]] || []).filter(x => x.returned_on === P[1])
      .forEach(x => { by[x.item_type] = (by[x.item_type] || 0) + x.quantity_returned; });
    return Object.keys(by).map(k => ({ item_type: k, qty: by[k] }));
  }
  // What has gone to the wash over the week behind the page — used to work out
  // how much soiled linen is still lying stripped off the beds.
  if (s.includes('SUM(quantity_sent) AS qty')) {
    const by = {};
    (D.LAUNDRY[P[0]] || []).filter(x => x.dispatch_date >= P[1] && x.dispatch_date <= P[2])
      .forEach(x => { by[x.item_type] = (by[x.item_type] || 0) + x.quantity_sent; });
    return Object.keys(by).map(k => ({ item_type: k, qty: by[k] }));
  }
  // The latest stock count of each item — the ceiling a dispatch is checked
  // against, since a room cannot send more than the Railway ever gave it.
  if (s.includes('MAX(as_on_date) AS d FROM linen_stock')) {
    const latest = {};
    (D.LINEN_STOCK[P[0]] || []).forEach(r => {
      if (!latest[r.item_type] || r.as_on_date > latest[r.item_type].as_on_date) latest[r.item_type] = r;
    });
    return Object.values(latest)
      .map(r => ({ item_type: r.item_type, issued_by_railway: r.issued_by_railway }));
  }
  if (s.includes('ld.quantity_returned < ld.quantity_sent')) {
    const asOn = P[0];
    return (D.LAUNDRY[P[1]] || []).filter(x => x.quantity_returned < x.quantity_sent)
      .sort((a, b) => a.dispatch_date.localeCompare(b.dispatch_date) || a.id - b.id)
      .map(x => Object.assign({}, x, {
        days_out: Math.round((Date.parse(asOn) - Date.parse(x.dispatch_date)) / 86400000) }));
  }
  if (s.includes('FROM laundry_dispatch WHERE id')) {
    const row = Object.values(D.LAUNDRY).flat().find(x => x.id === P[0]);
    return row ? [row] : [];
  }
  if (s.startsWith('UPDATE laundry_dispatch')) {
    const row = Object.values(D.LAUNDRY).flat().find(x => x.id === P[4]);
    if (row) Object.assign(row, { quantity_returned: P[0], returned_on: P[1],
      quality_ok: P[2], quality_remarks: P[3] });
    return [];
  }

  // complaints
  if (s.includes('FROM complaints WHERE running_room_id'))
    return (D.COMPLAINTS[P[0]] || []).slice()
      .sort((a, b) => (b.status === 'open') - (a.status === 'open') || String(b.raised_at).localeCompare(String(a.raised_at)));
  if (s.includes('SELECT id, running_room_id, status FROM complaints')) {
    for (const list of Object.values(D.COMPLAINTS)) {
      const c = list.find(x => x.id === P[0]);
      if (c) return [{ id: c.id, running_room_id: c.running_room_id, status: c.status }];
    }
    return [];
  }
  if (s.startsWith('INSERT INTO complaints')) {
    (D.COMPLAINTS[P[0]] ||= []).unshift({ id: Date.now() % 100000, running_room_id: P[0],
      source: 'complaint_book', raised_by_name: P[1], raised_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      category: P[2], description: P[3], severity: P[4], status: 'open', closure_remarks: null });
    return [];
  }
  if (s.startsWith('UPDATE complaints SET')) {
    for (const list of Object.values(D.COMPLAINTS)) {
      const c = list.find(x => x.id === P[2]);
      if (c) { c.status = 'closed'; c.closure_remarks = P[1]; break; }
    }
    return [];
  }

  // ---------- crew feedback ----------
  const myFeedback = () => D.FEEDBACK.filter(f => roomIds.has(f.running_room_id));

  // Match on a fragment that does not move when the sort changes.
  if (s.includes('LEFT JOIN staff st ON st.id = f.named_staff_id')) {
    let out = myFeedback();
    if (s.includes('f.status = ?')) { const v = P.find(p => ['open','under_action','closed'].includes(p)); if (v) out = out.filter(f => f.status === v); }
    if (s.includes('f.severity = ?')) { const v = P.find(p => ['critical','major','normal'].includes(p)); if (v) out = out.filter(f => f.severity === v); }
    if (s.includes('rr.id = ?')) { const v = P.find(p => typeof p === 'number' && rooms.some(r => r.id === p)); if (v) out = out.filter(f => f.running_room_id === v); }
    const newestFirst = !s.includes("ORDER BY (f.status = 'open') DESC");
    return out.slice().sort((a, b) =>
      (newestFirst ? 0 : (b.status === 'open') - (a.status === 'open'))
      || String(b.submitted_at).localeCompare(String(a.submitted_at))).slice(0, 200);
  }
  if (s.includes("SUM(f.status = 'open') AS open")) {
    const all = myFeedback();
    const rated = all.filter(f => f.rating_overall !== null);
    return [{ total: all.length, open: all.filter(f => f.status === 'open').length,
      critical: all.filter(f => f.severity === 'critical').length,
      avg_overall: rated.length ? +(rated.reduce((a, f) => a + f.rating_overall, 0) / rated.length).toFixed(2) : null }];
  }
  if (s.startsWith('SELECT id, running_room_id, status FROM feedback')) {
    const f = D.FEEDBACK.find(x => x.id === P[0]);
    return f ? [{ id: f.id, running_room_id: f.running_room_id, status: f.status }] : [];
  }
  if (s.startsWith("UPDATE feedback SET status='closed'")) {
    const f = D.FEEDBACK.find(x => x.id === P[1]); if (f) f.status = 'closed'; return [];
  }

  // coverage view
  if (s.includes('LEFT JOIN occupancy_monthly o') && s.includes('AS received')) {
    const month = String(P[0]).slice(0, 7);
    return rooms.map(r => {
      const edited = occupancyOf(r.id, month);
      // A site with no occupancy figure on record still belongs on the
      // coverage screen -- as a blank, which is the finding.
      const base = (D.COVERAGE[r.id] || [])[0];
      const occ = edited !== undefined ? edited
        : (base && String(base.period_month).slice(0, 7) === month ? base.occupants_total : null);
      const mine = D.FEEDBACK.filter(f => f.running_room_id === r.id
        && String(f.submitted_at).slice(0, 7) === month);
      return { id: r.id, code: r.code, name: r.name, div_code: r.div_code,
        ref_crews_per_day: r.ref_crews_per_day, occupants_total: occ,
        source: occ ? 'manual' : null,
        received: mine.length,
        signed_received: mine.filter(f => f.channel === 'checkout_register').length };
    });
  }

  // grading view
  if (s.includes('ROUND(AVG(f.rating_cleanliness),2) AS cleanliness')) {
    const month = String(P[0]).slice(0, 7);
    const avg = (arr, k) => { const v = arr.map(x => x[k]).filter(x => x !== null && x !== undefined);
      return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; };
    return rooms.map(r => {
      const fb = D.FEEDBACK.filter(f => f.running_room_id === r.id && String(f.submitted_at).slice(0, 7) === month);
      return { id: r.id, code: r.code, name: r.name, has_meal_facility: r.has_meal_facility,
        div_code: r.div_code, sample: fb.length,
        cleanliness: avg(fb, 'rating_cleanliness'), food: avg(fb, 'rating_food'),
        linen: avg(fb, 'rating_linen'), behaviour: avg(fb, 'rating_behaviour') };
    });
  }
  if (s.includes('FROM feedback_coverage WHERE period_month')) {
    const month = String(P[0]).slice(0, 7);
    return rooms.map(r => {
      const c = (D.COVERAGE[r.id] || [])[0];
      return c ? { running_room_id: r.id, coverage_pct: c.coverage_pct, meets_floor: c.meets_floor } : null;
    }).filter(Boolean);
  }

  // QR poster list
  if (s.includes("SELECT rr.id, rr.code, rr.name, d.name AS div_name"))
    return rooms.map(r => ({ id: r.id, code: r.code, name: r.name, div_name: r.div_name }));

  // public form
  if (s.includes('WHERE rr.code = ?')) {
    const r = D.RUNNING_ROOMS.find(x => x.code === P[0]);
    return r ? [{ id: r.id, code: r.code, name: r.name, has_meal_facility: r.has_meal_facility, div_name: r.div_name }] : [];
  }
  if (s.includes("st.screening_status = 'approved'") && s.includes('dg.name AS designation'))
    return D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active && x.screening_status === 'approved')
      .map(x => ({ id: x.id, full_name: x.full_name, designation: x.designation }));
  // The signed register writes a different shape from the QR form -- it carries
  // the page, the scan and the officer who keyed it, and its channel is a
  // literal in the SQL rather than a parameter.
  if (s.startsWith('INSERT INTO feedback') && s.includes("'checkout_register'")) {
    const rr = D.RUNNING_ROOMS.find(r => r.id === P[0]) || {};
    D.FEEDBACK.push({ id: 900000 + D.FEEDBACK.length, running_room_id: P[0], rr_id: P[0],
      rr_name: rr.name, div_code: rr.div_code,
      crew_name: P[1], crew_id_entered: P[2], stay_date: P[3], submitted_at: P[4],
      channel: 'checkout_register',
      rating_cleanliness: P[5], rating_food: P[6], rating_linen: P[7],
      rating_behaviour: P[8], rating_overall: P[9], comments: P[10],
      signature_file_id: P[11], register_page_no: P[12],
      named_staff_id: null, named_staff: null,
      severity: P[13], status: 'open', entered_by: P[14],
      entered_by_name: (USERS.find(u => u.id === P[14]) || {}).full_name || null });
    return [];
  }
  if (s.startsWith('INSERT INTO feedback')) {
    const vals = [P[6], P[7], P[8], P[9]].filter(v => v !== null && v !== undefined);
    D.FEEDBACK.push({ id: 900000 + D.FEEDBACK.length, running_room_id: P[0], rr_id: P[0],
      rr_name: (D.RUNNING_ROOMS.find(r => r.id === P[0]) || {}).name,
      div_code: (D.RUNNING_ROOMS.find(r => r.id === P[0]) || {}).div_code,
      crew_name: P[1], crew_id_entered: P[2], submitted_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      channel: P[4], rating_cleanliness: P[5], rating_food: P[6], rating_linen: P[7],
      rating_behaviour: P[8], rating_overall: P[9], comments: P[10], named_staff_id: P[11],
      named_staff: P[11] ? (D.STAFF.find(x => x.id === P[11]) || {}).full_name : null,
      severity: P[12], status: P[13] });
    return [];
  }

  // staff rating rollup
  if (s.includes('WHERE f.named_staff_id = ? ORDER BY f.submitted_at DESC'))
    return D.FEEDBACK.filter(f => f.named_staff_id === P[0])
      .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))).slice(0, 20)
      .map(f => ({ submitted_at: f.submitted_at, rating_overall: f.rating_overall,
        comments: f.comments, severity: f.severity,
        rr_name: (D.RUNNING_ROOMS.find(r => r.id === f.running_room_id) || {}).name }));
  if (s.includes('FROM feedback WHERE named_staff_id = ?')) {
    const v = D.FEEDBACK.filter(f => f.named_staff_id === P[0] && f.rating_overall !== null);
    return [{ n: v.length, avg: v.length ? +(v.reduce((a, f) => a + f.rating_overall, 0) / v.length).toFixed(2) : null }];
  }

  // ---------- inspections ----------
  const allInsp = () => Object.values(D.INSPECTIONS).flat().filter(i => roomIds.has(i.running_room_id));

  if (s.includes('FROM inspections i JOIN running_rooms rr JOIN divisions')
      || (s.includes('FROM inspections i') && s.includes('ORDER BY i.inspection_date DESC'))) {
    let out = allInsp();
    if (s.includes('rr.id = ?')) { const v = P.find(p => typeof p === 'number' && rooms.some(r => r.id === p)); if (v) out = out.filter(i => i.running_room_id === v); }
    if (s.includes('i.inspection_type = ?')) { const v = P.find(p => typeof p === 'string' && ['daily_joint','scheduled','surprise','higher_official'].includes(p)); if (v) out = out.filter(i => i.inspection_type === v); }
    if (s.includes('i.result = ?')) { const v = P.find(p => typeof p === 'string' && String(p).includes('complian') || ['compliant','minor_deficiencies','major_deficiencies'].includes(p)); if (v) out = out.filter(i => i.result === v); }
    return out.sort((a, b) => b.inspection_date.localeCompare(a.inspection_date) || b.id - a.id).slice(0, 200);
  }
  if (s.includes("SUM(i.result = 'compliant') AS compliant")) {
    const all = allInsp();
    return [{ total: all.length, compliant: all.filter(i => i.result === 'compliant').length,
      minor: all.filter(i => i.result === 'minor_deficiencies').length,
      major: all.filter(i => i.result === 'major_deficiencies').length,
      unsigned_reports: all.filter(i => i.railway_sign_file_id === null).length }];
  }
  if (s.includes('SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code'))
    return rooms.map(r => ({ id: r.id, name: r.name, has_meal_facility: r.has_meal_facility, div_code: r.div_code }));
  if (s.includes('FROM deficiency_clauses') && s.includes('in_daily_checklist = 1')) {
    const mealsOff = s.includes('applies_to_meals = 0');
    return D.CLAUSES.filter(c => c.in_daily_checklist && !c.is_formula && (!mealsOff || !c.applies_to_meals))
      .map(c => ({ id: c.id, clause_code: c.clause_code, group_code: c.group_code,
        group_name: c.group_name, description: c.description, unit: c.unit, applies_to_meals: c.applies_to_meals }));
  }
  if (s.includes('FROM inspections WHERE running_room_id = ? AND inspection_date = ?')) {
    const found = (D.INSPECTIONS[P[0]] || []).find(i => i.inspection_date === P[1] && i.inspection_type === P[2]);
    return found ? [{ id: found.id }] : [];
  }
  if (s.startsWith('SELECT i.*, rr.name AS rr_name') || s.includes('FROM inspections i JOIN running_rooms rr ON rr.id = i.running_room_id JOIN divisions d ON d.id = rr.division_id WHERE i.id = ?')) {
    const i = Object.values(D.INSPECTIONS).flat().find(x => x.id === P[0]);
    return i ? [i] : [];
  }
  if (s.includes('FROM inspection_items ii JOIN deficiency_clauses'))
    return D.INSPECTION_ITEMS[P[0]] || [];
  if (s.startsWith('SELECT id, running_room_id, railway_sign_file_id FROM inspections')) {
    const i = Object.values(D.INSPECTIONS).flat().find(x => x.id === P[0]);
    return i ? [{ id: i.id, running_room_id: i.running_room_id, railway_sign_file_id: i.railway_sign_file_id }] : [];
  }
  if (s.startsWith('SELECT running_room_id FROM inspections')) {
    const i = Object.values(D.INSPECTIONS).flat().find(x => x.id === P[0]);
    return i ? [{ running_room_id: i.running_room_id }] : [];
  }
  if (s.startsWith('UPDATE inspections SET railway_sign_file_id')) {
    const i = Object.values(D.INSPECTIONS).flat().find(x => x.id === P[1]);
    if (i) { i.railway_sign_file_id = 0; i.remarks = (i.remarks ? i.remarks + '\n' : '') + P[0]; }
    return [];
  }
  if (s.startsWith('INSERT INTO inspections')) {
    const id = 800000 + Object.values(D.INSPECTIONS).flat().length;
    const rrRow = D.RUNNING_ROOMS.find(r => r.id === P[0]);
    (D.INSPECTIONS[P[0]] ||= []).push({ id, running_room_id: P[0], rr_id: P[0],
      rr_name: rrRow.name, div_code: rrRow.div_code, div_name: rrRow.div_name,
      inspection_date: P[1], inspection_type: P[2], inspector_name: P[4],
      contractor_rep_name: P[5], items_checked: P[6], deficiency_count: P[7], result: P[8],
      railway_sign_file_id: null, submitted_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      remarks: P[9] });
    D.INSPECTION_ITEMS[id] = [];
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('INSERT INTO inspection_items')) {
    const c = D.CLAUSES.find(x => x.id === P[1]) || {};
    (D.INSPECTION_ITEMS[P[0]] ||= []).push({ inspection_id: P[0], clause_id: P[1],
      clause_code: P[1], group_name: c.group_name, description: c.description, unit: c.unit,
      status: P[2], quantity: P[3], observation: P[4], evidence_file_id: P[5] });
    return [];
  }

  // ---------- deficiency register ----------
  const allDef = () => Object.values(D.DEFICIENCIES).flat().filter(x => roomIds.has(x.running_room_id));
  if (s.includes('FROM deficiencies df JOIN deficiency_clauses dc JOIN running_rooms')
      || (s.includes('FROM deficiencies df') && s.includes("ORDER BY (df.status = 'open') DESC"))) {
    let out = allDef();
    if (s.includes('rr.id = ?')) { const v = P.find(p => typeof p === 'number' && rooms.some(r => r.id === p)); if (v) out = out.filter(x => x.running_room_id === v); }
    if (s.includes('df.status = ?')) { const v = P.find(p => ['open','rectified','closed','withdrawn'].includes(p)); if (v) out = out.filter(x => x.status === v); }
    if (s.includes('dc.group_code = ?')) { const v = P.find(p => typeof p === 'string' && /^[A-DGM]$/.test(p)); if (v) out = out.filter(x => x.group_code === v); }
    return out.sort((a, b) => (b.status === 'open') - (a.status === 'open')
      || b.occurred_on.localeCompare(a.occurred_on) || b.id - a.id).slice(0, 300);
  }
  if (s.includes("SUM(df.status = 'open') AS open")) {
    const all = allDef();
    return [{ total: all.length, open: all.filter(x => x.status === 'open').length,
      rectified: all.filter(x => x.status === 'rectified').length,
      sites: new Set(all.map(x => x.running_room_id)).size }];
  }
  if (s.includes('GROUP BY dc.group_code, dc.group_name')) {
    const by = {};
    allDef().forEach(x => { (by[x.group_code] ||= { group_code: x.group_code, group_name: x.group_name, n: 0 }).n++; });
    return Object.values(by).sort((a, b) => b.n - a.n);
  }
  if (s.startsWith('SELECT id, running_room_id, status FROM deficiencies')) {
    const x = Object.values(D.DEFICIENCIES).flat().find(y => y.id === P[0]);
    return x ? [{ id: x.id, running_room_id: x.running_room_id, status: x.status }] : [];
  }
  if (s.startsWith("UPDATE deficiencies SET status = 'rectified'")) {
    const x = Object.values(D.DEFICIENCIES).flat().find(y => y.id === P[1]);
    if (x) { x.status = 'rectified'; x.closure_remarks = P[0]; }
    return [];
  }
  if (s.startsWith('INSERT INTO deficiencies')) {
    /* FOUR shapes reach here now, and reading P by position without noticing
       that is how a screen looks like it saved and did not. Rather than adding
       a fifth boolean, the two literals the statement carries are read out of
       it — `source` and `source_ref_table` are always spelled in the SQL:

         daily checklist   'daily_checklist','inspections'   ref id + photo
         weekly review     'review','deficiency_review'      neither
         wages, clause M5  'review','wage_months'            ref id
         incidents, A3     'review','incidents'              ref id

       Only the weekly review omits the source_ref_id placeholder, which is what
       shifts its description one place to the left. */
    const lits = [...s.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    const source = lits[0] || 'review';
    const refTable = lits[1] || null;
    const hasRefId = refTable !== 'deficiency_review';
    const hasPhoto = source === 'daily_checklist';

    const c = D.CLAUSES.find(x => x.id === P[1]) || {};
    const id = 700000 + Object.values(D.DEFICIENCIES).flat().length;
    const rrRow = D.RUNNING_ROOMS.find(r => r.id === P[0]);
    (D.DEFICIENCIES[P[0]] ||= []).push({ id, running_room_id: P[0], rr_id: P[0],
      rr_name: rrRow.name, div_code: rrRow.div_code, clause_code: c.clause_code,
      group_code: c.group_code, group_name: c.group_name, clause_id: P[1],
      clause_description: c.description,
      description: hasRefId ? P[5] : P[4],
      rate: c.rate, unit: c.unit,
      occurred_on: P[2], quantity: P[3],
      source,
      source_ref_table: refTable,
      source_ref_id: hasRefId ? P[4] : null,
      evidence_file_id: hasPhoto ? P[6] : null,
      status: 'open', rectified_on: null, closure_remarks: null });
    lastInsertId = id;
    return [];
  }

  /* ---------------- the incident register (stage 31) -----------------------
   *
   * Audit item P14, first half. Placed above the evidence-file stubs because
   * one of its queries ends `FROM files`.
   *
   * The register asks for its rooms with `dv` and for its rows with `inc`,
   * rather than the obvious `d` and `i`. That is not style: two stubs already
   * answer `SELECT rr.id, rr.name, d.code AS div_code FROM running_rooms`
   * (a SINGLE room) and `SELECT i.*, rr.name AS rr_name` (an inspection).
   * Written the obvious way, the room list came back as one row — and once it
   * came back empty, the screen refused every role for having no running rooms
   * at all. Ninth and tenth collision of that shape in this file, and this time
   * the cure was to make the statement distinctive at the source.
   */
  if (s.startsWith('SELECT rr.id, rr.name, dv.code AS div_code'))
    return rooms.filter(r => r.status === 'operational')
      .map(r => ({ id: r.id, name: r.name, div_code: r.div_code }))
      .sort((a, b) => a.name.localeCompare(b.name));

  if (s.startsWith('SELECT inc.*, rr.name AS rr_name')) {
    const visible = new Set(rooms.map(r => r.id));
    let out = D.INCIDENTS.filter(i => visible.has(i.running_room_id));
    // The WHERE clause here is built up conditionally, so the parameters shift
    // under it. Read the filters off the statement, not off positions.
    if (s.includes('rr.id = ?')) {
      const v = P.find(x => typeof x === 'number');
      if (v) out = out.filter(i => i.running_room_id === v);
    }
    if (s.includes('inc.status = ?')) {
      const v = P.find(x => typeof x === 'string' && ['open', 'under_enquiry', 'closed'].includes(x));
      if (v) out = out.filter(i => i.status === v);
    }
    if (s.includes('inc.incident_type = ?')) {
      const v = P.find(x => typeof x === 'string'
        && ['fire','theft','miscreant','accident','death','intoxication','security_lapse','other'].includes(x));
      if (v) out = out.filter(i => i.incident_type === v);
    }
    return out.map(i => ({ ...i,
      told: D.INCIDENT_NOTIFICATIONS.filter(n => n.incident_id === i.id && n.informed_on).length }))
      .sort((x, y) => (y.status === 'open') - (x.status === 'open')
        || String(y.occurred_on).localeCompare(String(x.occurred_on)));
  }
  if (s.includes("SUM(inc.status = 'open')")) {
    const visible = new Set(rooms.map(r => r.id));
    const mine = D.INCIDENTS.filter(i => visible.has(i.running_room_id));
    return [{ total: mine.length,
      open: mine.filter(i => i.status === 'open').length,
      enquiry: mine.filter(i => i.status === 'under_enquiry').length,
      unreported: mine.filter(i => !i.reported_on).length }];
  }
  if (s.startsWith('SELECT * FROM incidents WHERE id')) {
    const i = D.INCIDENTS.find(x => x.id === P[0]);
    return i ? [i] : [];
  }
  if (s.startsWith('SELECT running_room_id FROM incidents WHERE evidence_file_id')) {
    const i = D.INCIDENTS.find(x => x.evidence_file_id === P[0]);
    return i ? [{ running_room_id: i.running_room_id }] : [];
  }
  if (s.startsWith('SELECT id FROM deficiencies') && s.includes("source_ref_table = 'incidents'")) {
    const hit = Object.values(D.DEFICIENCIES).flat().find(x =>
      x.source_ref_table === 'incidents' && x.source_ref_id === P[0] && x.status !== 'withdrawn');
    return hit ? [{ id: hit.id }] : [];
  }
  if (s.startsWith('SELECT id FROM deficiency_clauses') && s.includes("clause_code = 'A3'")) {
    const c = D.CLAUSES.find(x => x.clause_code === 'A3');
    return c ? [{ id: c.id }] : [];
  }
  if (s.startsWith('INSERT INTO incidents')) {
    const rr = D.RUNNING_ROOMS.find(x => x.id === P[0]) || {};
    const man = P[9] ? D.STAFF.find(x => x.id === P[9]) : null;
    const id = 500000 + D.INCIDENTS.length;
    D.INCIDENTS.unshift({ id, running_room_id: P[0], occurred_on: P[1], occurred_at: P[2],
      reported_on: P[3], incident_type: P[4], severity: P[5], summary: P[6], detail: P[7],
      involves: P[8], staff_id: P[9], persons_affected: P[10], immediate_action: P[11],
      evidence_file_id: P[12], recorded_by: P[13], status: 'open',
      closed_on: null, closed_by: null, closure_remarks: null,
      rr_name: rr.name, div_code: rr.div_code,
      staff_name: man ? man.full_name : null, closed_name: null });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('INSERT INTO incident_notifications')) {
    D.INCIDENT_NOTIFICATIONS.push({ id: 510000 + D.INCIDENT_NOTIFICATIONS.length,
      incident_id: P[0], authority: P[1], informed_on: P[2], informed_at: P[3],
      reference_no: P[4], remarks: null });
    return [];
  }
  if (s.startsWith('UPDATE incidents SET status')) {
    const i = D.INCIDENTS.find(x => x.id === P[4]);
    if (i) Object.assign(i, { status: P[0], closure_remarks: P[1], closed_on: P[2],
      closed_by: P[3], closed_name: P[3] ? (USERS.find(u => u.id === P[3]) || {}).full_name : null });
    return [];
  }

  /* ------------- the standing obligations (stage 32) -----------------------
   *
   * The remainder of P14. `crm` is the alias in the contract lookup, again
   * deliberately: `crr` is spoken for several times over in this file.
   */
  if (s.startsWith('SELECT ct.id, ct.agreement_no, ct.loa_no, ct.loa_date')) {
    const c = (D.CONTRACTS || []).find(x => x.rooms.some(r => r.id === P[0]));
    return c ? [{ id: c.id, agreement_no: c.agreement_no, loa_no: c.loa_no,
      loa_date: c.loa_date, start_date: c.start_date }] : [];
  }
  if (s.startsWith('SELECT * FROM compliance_items WHERE is_active'))
    return D.COMPLIANCE_ITEMS.slice().sort((a, b) => a.sort_order - b.sort_order);
  if (s.startsWith('SELECT id FROM compliance_items WHERE is_active'))
    return D.COMPLIANCE_ITEMS.map(x => ({ id: x.id }));
  if (s.startsWith('SELECT * FROM compliance_items WHERE id')) {
    const it = D.COMPLIANCE_ITEMS.find(x => x.id === P[0]);
    return it ? [it] : [];
  }
  if (s.startsWith('SELECT * FROM compliance_status WHERE running_room_id = ? AND item_id')) {
    const r = D.COMPLIANCE_STATUS.find(x => x.running_room_id === P[0] && x.item_id === P[1]);
    return r ? [r] : [];
  }
  if (s.startsWith('SELECT * FROM compliance_status WHERE running_room_id'))
    return D.COMPLIANCE_STATUS.filter(x => x.running_room_id === P[0]);
  if (s.startsWith('SELECT running_room_id FROM compliance_status WHERE file_id')) {
    const r = D.COMPLIANCE_STATUS.find(x => x.file_id === P[0]);
    return r ? [{ running_room_id: r.running_room_id }] : [];
  }
  if (s.includes("cdf.source_ref_table = 'compliance_status'")) {
    const hits = Object.values(D.DEFICIENCIES).flat().filter(x =>
      x.running_room_id === P[0] && x.source_ref_table === 'compliance_status'
      && x.status !== 'withdrawn'
      && (!s.includes('cdc.clause_code = ?') || x.clause_code === P[1]));
    return hits.map(x => ({ id: x.id, quantity: x.quantity, status: x.status, clause_code: x.clause_code }));
  }
  if (s.includes('SUM(st.date_of_birth IS NULL)')) {
    const men = D.STAFF.filter(x => x.running_room_id === P[0] && x.is_active);
    const age = dob => {
      const d = new Date(Date.parse(dob + 'T00:00:00Z'));
      return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
    };
    return [{ total: men.length,
      unknown: men.filter(m => !m.date_of_birth).length,
      under_18: men.filter(m => m.date_of_birth && age(m.date_of_birth) < 18).length,
      over_60: men.filter(m => m.date_of_birth && age(m.date_of_birth) > 60).length }];
  }
  if (s.startsWith('SELECT id, rate FROM deficiency_clauses')) {
    const c = D.CLAUSES.find(x => x.clause_code === P[0]);
    return c ? [{ id: c.id, rate: c.rate }] : [];
  }
  if (s.startsWith('INSERT INTO compliance_status')) {
    const found = D.COMPLIANCE_STATUS.find(x => x.running_room_id === P[0] && x.item_id === P[1]);
    const row = { running_room_id: P[0], item_id: P[1], met_on: P[2], not_met: P[3],
      reference_no: P[4], remarks: P[6], recorded_by: P[7] };
    if (found) Object.assign(found, row, { file_id: P[5] === null ? found.file_id : P[5] });
    else D.COMPLIANCE_STATUS.push({ id: 820000 + D.COMPLIANCE_STATUS.length, file_id: P[5], ...row });
    return [];
  }
  if (s.startsWith('DELETE FROM compliance_status')) {
    const i = D.COMPLIANCE_STATUS.findIndex(x => x.running_room_id === P[0] && x.item_id === P[1]);
    lastAffected = i >= 0 ? 1 : 0;
    if (i >= 0) D.COMPLIANCE_STATUS.splice(i, 1);
    return [];
  }

  /* ---------------- occupancy entry on the coverage page (stage 33) --------
   * The count is the denominator of the 50% floor, so the demo has to let it be
   * typed in and has to move the coverage figure when it is.
   */
  /* ---------------- the linen schedule (stage 34) --------------------------
   * The contract's own table: delivery period per item, washing frequency,
   * recovery rate. The laundry register runs its overdue flag off this rather
   * than off a flat 48 hours, so the demo has to serve it or the screen shows
   * nothing at all.
   */
  // Keyed on the table, not on one spelling of the SELECT list — but note that
  // this hands back the WHOLE row whatever was asked for, which is precisely
  // why a route that selected three columns and printed six was green here and
  // showed "Rs NaN" on a real database. A stub cannot check a projection; only
  // tools/write-check.mjs against MySQL can, and did.
  if (s.includes('FROM linen_schedule'))
    return D.LINEN_SCHEDULE.slice().sort((a, b) => a.sort_order - b.sort_order);

  // ---------- evidence files ----------
  if (s.startsWith('INSERT INTO files')) {
    const id = 600000 + D.FILES.size;
    D.FILES.set(id, { id, uuid: P[0], original_name: P[1], stored_path: P[2], mime_type: P[3],
      size_bytes: P[4], sha256: P[5], entity_table: P[6], entity_id: P[7] });
    lastInsertId = id;
    return [];
  }
  if (s.startsWith('SELECT * FROM files WHERE id')) {
    const f = D.FILES.get(P[0]);
    return f ? [f] : [];
  }

  // ---------- facility and material (stage 6) ----------
  if (s.startsWith('SELECT rr.id, rr.name, rr.total_beds, rr.has_meal_facility'))
    return rooms.map(r => ({ id: r.id, name: r.name, total_beds: r.total_beds,
      has_meal_facility: r.has_meal_facility, div_code: r.div_code }));

  if (s.includes('FROM running_room_vendors rv JOIN vendors v')) {
    const link = (D.RR_VENDORS[P[0]] || []).find(x => x.service_type === 'laundry');
    if (!link) return [];
    const v = D.VENDORS.find(x => x.id === link.vendor_id);
    return v ? [v] : [];
  }
  if (s.includes('FROM laundry_dispatch ld LEFT JOIN vendors v'))
    return (D.LAUNDRY[P[0]] || []).slice()
      .sort((a, b) => b.dispatch_date.localeCompare(a.dispatch_date) || b.id - a.id).slice(0, 40);
  if (s.includes("FROM vendors WHERE vendor_type = 'laundry'"))
    return D.VENDORS.filter(v => v.vendor_type === 'laundry' && v.is_active)
      .map(v => ({ id: v.id, name: v.name, is_approved: v.is_approved }));
  if (s.startsWith('INSERT INTO laundry_dispatch')) {
    const v = P[1] ? D.VENDORS.find(x => x.id === P[1]) : null;
    const id = 900000 + Object.values(D.LAUNDRY).flat().length;
    (D.LAUNDRY[P[0]] ||= []).push({ id, running_room_id: P[0], vendor_id: P[1],
      dispatch_date: P[2], item_type: P[3], quantity_sent: P[4], quantity_returned: P[5],
      returned_on: P[6], invoice_no: P[7], invoice_file_id: null, quality_ok: P[8],
      quality_remarks: P[9], recorded_by: P[10],
      vendor_name: v ? v.name : null, is_approved: v ? v.is_approved : null });
    return [];
  }

  if (s.includes('FROM consumable_items WHERE is_active')) return D.CONSUMABLE_ITEMS;
  if (s.includes('FROM consumable_issues ci JOIN consumable_items i'))
    return (D.CONSUMABLE_ISSUES[P[0]] || []).slice(0, 60);
  if (s.startsWith('INSERT INTO consumable_issues')) {
    const it = D.CONSUMABLE_ITEMS.find(x => x.id === P[1]) || {};
    const id = 910000 + Object.values(D.CONSUMABLE_ISSUES).flat().length;
    (D.CONSUMABLE_ISSUES[P[0]] ||= []).unshift({ id, running_room_id: P[0], consumable_item_id: P[1],
      due_date: P[2], supplied_on: P[3], quantity_due: P[4], quantity_supplied: P[5],
      brand_supplied: P[6], acknowledged_by: P[7], shortfall_days: P[8], remarks: P[9],
      name: it.name, unit: it.unit, supply_frequency: it.supply_frequency,
      approved_brands: it.approved_brands, schedule_code: it.schedule_code });
    return [];
  }

  if (s.includes('FROM assets a WHERE a.running_room_id')) return D.ASSETS[P[0]] || [];
  if (s.startsWith('SELECT b.id, a.running_room_id FROM asset_breakdowns')) {
    for (const rrId of Object.keys(D.BREAKDOWNS)) {
      const f = (D.BREAKDOWNS[rrId] || []).find(x => x.id === P[0]);
      if (f) return [{ id: f.id, running_room_id: +rrId }];
    }
    return [];
  }
  if (s.includes('FROM asset_breakdowns b JOIN assets a'))
    return (D.BREAKDOWNS[P[0]] || []).slice()
      .sort((a, b) => (b.status === 'open') - (a.status === 'open')
        || String(b.reported_at).localeCompare(String(a.reported_at))).slice(0, 40);
  if (s.startsWith('SELECT id, running_room_id FROM assets WHERE id')) {
    for (const rrId of Object.keys(D.ASSETS)) {
      const a = (D.ASSETS[rrId] || []).find(x => x.id === P[0]);
      if (a) return [{ id: a.id, running_room_id: +rrId }];
    }
    return [];
  }
  if (s.startsWith('INSERT INTO asset_breakdowns')) {
    let rrId = null, asset = null;
    for (const k of Object.keys(D.ASSETS)) {
      const a = (D.ASSETS[k] || []).find(x => x.id === P[0]);
      if (a) { rrId = +k; asset = a; break; }
    }
    if (!rrId) return [];
    const id = 920000 + Object.values(D.BREAKDOWNS).flat().length;
    (D.BREAKDOWNS[rrId] ||= []).unshift({ id, asset_id: P[0], asset_name: asset.name,
      owned_by: asset.owned_by, reported_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      reported_by: P[1], description: P[2], rectified_at: null, hours_to_rectify: null,
      status: 'open', remarks: null });
    asset.open_faults = (asset.open_faults || 0) + 1;
    return [];
  }
  if (s.startsWith('UPDATE asset_breakdowns SET rectified_at')) {
    for (const k of Object.keys(D.BREAKDOWNS)) {
      const f = (D.BREAKDOWNS[k] || []).find(x => x.id === P[1]);
      if (!f) continue;
      f.rectified_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      f.hours_to_rectify = Math.max(0, Math.round((Date.now() - new Date(f.reported_at + 'Z').getTime()) / 3600000));
      f.status = 'rectified';
      f.remarks = P[0];
      const a = (D.ASSETS[k] || []).find(x => x.id === f.asset_id);
      if (a && a.open_faults) a.open_faults--;
      break;
    }
    return [];
  }

  if (s.includes('FROM kitchen_compliance k')) return D.KITCHEN_COMPLIANCE[P[0]] || [];
  if (s.startsWith('INSERT INTO kitchen_compliance')) {
    const rows = (D.KITCHEN_COMPLIANCE[P[0]] ||= []);
    const found = rows.find(r => r.check_type === P[1] && r.as_on_date === P[2]);
    if (found) { found.status = P[3]; found.detail = P[4]; found.valid_till = P[5]; }
    else rows.push({ id: 930000 + rows.length, running_room_id: P[0], check_type: P[1],
      as_on_date: P[2], status: P[3], detail: P[4], valid_till: P[5],
      evidence_file_id: null, recorded_by: P[6] });
    return [];
  }

  if (s.includes('FROM pest_control_log p LEFT JOIN vendors v'))
    return (D.PEST[P[0]] || []).slice(0, 40);
  if (s.includes("FROM vendors WHERE vendor_type = 'pest_control'"))
    return D.VENDORS.filter(v => v.vendor_type === 'pest_control' && v.is_active)
      .map(v => ({ id: v.id, name: v.name, licence_valid_till: v.licence_valid_till }));
  if (s.startsWith('INSERT INTO pest_control_log')) {
    const v = P[1] ? D.VENDORS.find(x => x.id === P[1]) : null;
    const id = 940000 + Object.values(D.PEST).flat().length;
    (D.PEST[P[0]] ||= []).unshift({ id, running_room_id: P[0], vendor_id: P[1],
      treatment_type: P[2], scheduled_on: P[3], performed_on: P[4], notice_given_on: P[5],
      areas_covered: P[6], chemical_used: P[7], certificate_file_id: null,
      delay_days: P[8], remarks: P[9],
      vendor_name: v ? v.name : null, licence_valid_till: v ? v.licence_valid_till : null });
    return [];
  }

  // masters
  if (s.includes('FROM designations dg WHERE dg.is_active'))
    return D.DESIGNATIONS.map(d => ({ ...d, on_roll: Object.values(D.MANPOWER).flat()
      .filter(m => m.designation_id === d.id).reduce((a,m)=>a+m.on_roll,0) }));
  if (s.includes('FROM manpower_norms n JOIN designations')) {
    const out = [];
    for (const d of D.DESIGNATIONS) for (const band of [50,100,150,200,250])
      out.push({ band_beds: band, name: d.name, sort_order: d.sort_order, sanctioned_count: D.NORMS[band][d.code] });
    return out;
  }
  if (s.includes('FROM deficiency_clauses WHERE is_active')) return D.CLAUSES;

  return [];
}

/* --------------------------------------------------------------------------
 * A stand-in for the scanned certificates on the seeded rows.
 *
 * The seeded FSSAI licences claim to have a Form C attached, because a demo
 * where nothing has ever been uploaded would misrepresent the register. The
 * real scans are not shipped — they carry a contractor's Aadhaar number and
 * personal mobile — so one generated page stands in for all of them. Anything
 * uploaded during the demo is stored and served for real.
 * ----------------------------------------------------------------------- */
function placeholderPdf(lines) {
  const esc = t => t.replace(/([()\\])/g, '\\$1');
  let text = 'BT /F1 15 Tf 56 786 Td 19 TL\n';
  lines.forEach((l, i) => { text += (i ? 'T*' : '') + ` (${esc(l)}) Tj\n`; });
  text += 'ET\n';
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${Buffer.byteLength(text)}>>\nstream\n${text}endstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

{
  const fs = require('fs'), path = require('path');
  const { UPLOAD_DIR } = require('../src/services/uploads');
  const rel = 'demo-placeholder.pdf';
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, rel), placeholderPdf([
    'FSSAI Form C - demonstration placeholder',
    '',
    'In the working system the scanned licence uploaded for this',
    'running room opens here. The demo ships a generated page instead,',
    'because the real certificates carry personal identity numbers.',
    '',
    'Upload a file on the Food Safety screen and it will be stored and',
    'served back exactly as it would be in the deployed application.',
  ]));
  const reg = (id, name) => D.FILES.set(id, { id, uuid: 'demo', original_name: name,
    stored_path: rel, mime_type: 'application/pdf', size_bytes: 0, sha256: '',
    entity_table: null, entity_id: null });
  D.FOOD_LICENCES.forEach(l => { if (l.certificate_file_id) reg(l.certificate_file_id, 'form-c.pdf'); });
  D.FOOD_RETURNS.forEach(r => { if (r.document_file_id) reg(r.document_file_id, 'report.pdf'); });
}

const stubPool = {
  query:   async (sql, params) => [handle(sql, params), []],
  execute: async (sql, params) => { lastAffected = 1; handle(sql, params);
                                    return [{ insertId: lastInsertId, affectedRows: lastAffected }, []]; },
  // A transaction in the demo is a no-op wrapper, but the connection still has
  // to answer queries — src/db.js runs the callback's statements on it.
  getConnection: async () => ({
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query:   async (sql, params) => [handle(sql, params), []],
    execute: async (sql, params) => { lastAffected = 1; handle(sql, params);
                                      return [{ insertId: lastInsertId, affectedRows: lastAffected }, []]; },
  }),
};

// --- serve -------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use('/', require('../src/app')({ pool: stubPool }));

app.listen(PORT, () => {
  const cfgStage = require('../src/config').stage;
  console.log(`
  RR-CMS demo — STAGE ${cfgStage}${PILOT ? '  ·  PILOT DATA' : ''}${TEST_DATA ? '  ·  WITH INVENTED PARTICULARS' : ''}
  no database, nothing installed on your system

     open   http://localhost:${PORT}

${PILOT ? `     PILOT MODE — ${PILOT.sites.join(', ')} with the rosters supplied
                  ${PILOT.staff} staff on record, ${PILOT.parked} other running rooms parked
                  no muster, feedback, inspection or certificate: none has been taken

` : ''}${TEST_DATA ? `     TEST DATA — ${TEST_DATA.filled} people at ${TEST_DATA.site} carry INVENTED
                  particulars, documents and screening, so the muster and the
                  monthly pack can be tested. Every phone begins 90000 and every
                  EPF and ESIC number begins TEST/. None of it is real.

` : ''}     username        password    sees
     ------------    --------    --------------------------------------
     sysadmin        demo        ${PILOT ? 'all four pilot running rooms' : 'all 44 running rooms'}
     div_officer     demo        ${PILOT ? 'Mumbai division — all four' : 'Solapur only (5)'}
     rr_incharge     demo        ${PILOT ? PILOT.boundSite + ' only' : 'Kalyan only (1)'}
     contractor_sup  demo        ${PILOT ? PILOT.boundSite + ' only (' + PILOT.boundContractor + ')' : "one contractor's running rooms only"}
     hq              demo        everything, read-only

  Stop with Ctrl-C.
`);
});
