const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { shelfBook } = require('../lib/linen-book');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const crewMaster = require('../services/crtms');
const complaintCats = require('../services/complaint-categories');
const terms = require('../services/contract-terms');

const router = express.Router();
router.use(requirePermission('rr.view'));

const { today, shift } = require('../lib/day');

// Express 5 no longer accepts an inline regex on a path parameter, so the
// numeric check is done here. Anything non-numeric falls through to the next
// route.
const numeric = (...keys) => (req, res, next) =>
  keys.every(k => /^\d+$/.test(req.params[k] || '')) ? next() : next('route');

/** Running rooms the user may work on, plus the one currently selected. */
async function context(req) {
  const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
  const rooms = await db.query(
    `SELECT rr.id, rr.name, rr.total_beds, rr.has_meal_facility, rr.call_sheet_default,
            d.code AS div_code
     FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
     WHERE ${s.sql} ORDER BY rr.name`, s.params);
  if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
  const id = +req.query.rr || rooms[0].id;
  const rr = rooms.find(r => r.id === id);
  if (!rr) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
  return { rooms, rr, date: (req.query.date || today()).slice(0, 10) };
}

/* ------------------------------------------------------------------ muster */
// The tender requires attendance to be recorded and jointly signed. Biometric
// replaces the marking step in Phase 2; the counter-signature and the shortfall
// arithmetic stay exactly as they are.
/* THE MUSTER IS KEPT PER SHIFT, and the shift is chosen on the screen.
   `attendance_daily` has carried a shift column and a unique key over
   (staff, date, shift) since it was built, and the screen has been writing
   'general' into it and offering no way to say otherwise. So the evening and
   the night -- the two shifts the day-shift supervisor is NOT there for, and
   the two he marks the next morning -- could not be recorded at all.

   Found by the officer describing his own site: "both supervisor and bearer for
   now... so the supervisor can mark previous days evening and night shifts."

   The four are the contract's own: general for the men who work the day, and
   morning, evening and night for the posts that are manned round the clock. */
const SHIFTS = [
  ['general', 'General'], ['morning', 'Morning'], ['evening', 'Evening'], ['night', 'Night'],
];
const shiftOf = raw => (SHIFTS.find(s => s[0] === String(raw || '')) || SHIFTS[0])[0];

router.get('/muster', async (req, res, next) => {
  try {
    const { rooms, rr } = await context(req);
    /* A DAY THAT HAS NOT HAPPENED IS NOT AN ERROR PAGE -- and until now the
       muster was the one daily register with no future guard at all: a muster
       could be filed for next Tuesday and nothing would object. Same treatment
       as the linen page: the screen lands him on the nearest day he can use and
       says why, and the register refuses outright. */
    const asked = (req.query.date || today()).slice(0, 10);
    const future = asked > today() ? asked : null;
    const date = future ? today() : asked;
    const shiftNow = shiftOf(req.query.shift);

    // Yesterday's mark comes along too. A man who was absent, on leave or
    // simply not marked the day before is the one the supervisor has to look
    // for this morning -- whether he turned up decides both today's muster and
    // whether a replacement has to be called. Showing it beside today's row
    // saves him going back a day to find out.
    const staff = await db.query(`
      SELECT st.id, st.staff_code, st.full_name, st.screening_status,
             dg.id AS designation_id, dg.name AS designation, dg.sort_order,
             a.status, a.shift, a.marked_at, a.countersigned_at, a.relieved_staff_id,
             rel.full_name AS relieved_name,
             y.status AS yesterday_status
      FROM staff st
      JOIN designations dg ON dg.id = st.designation_id
      LEFT JOIN attendance_daily a ON a.staff_id = st.id AND a.attendance_date = ?
           AND a.shift = ?
      -- The same shift the day before, not whichever row happened to be found
      -- first. A night-shift man's yesterday is last night, and comparing it
      -- with somebody's day shift would answer a question nobody asked.
      LEFT JOIN attendance_daily y ON y.staff_id = st.id
           AND y.attendance_date = DATE_SUB(?, INTERVAL 1 DAY) AND y.shift = ?
      LEFT JOIN staff rel ON rel.id = a.relieved_staff_id
      WHERE st.running_room_id = ? AND st.is_active = 1
      ORDER BY dg.sort_order, st.full_name`, [date, shiftNow, date, shiftNow, rr.id]);

    const sanction = await db.query(`
      SELECT dg.id, dg.name, dg.sort_order, m.sanctioned_count
      FROM running_room_manpower m JOIN designations dg ON dg.id = m.designation_id
      WHERE m.running_room_id = ? AND m.effective_to IS NULL AND m.sanctioned_count > 0
      ORDER BY dg.sort_order`, [rr.id]);

    /* THE SHORTFALL IS A DAY'S FIGURE, NOT A SHIFT'S.
       Schedule A sanctions men for the running room -- so many cooks, so many
       bearers -- and says nothing about how the contractor spreads them across
       the clock. Counting only the shift on screen against the whole day's
       sanction would report an enormous shortage every time anybody looked at
       the night, and a penalty figure that is always red is worse than none.
       So the deployment panel counts each man once across every shift of the
       day, while the grid above it marks one shift at a time. */
    const presentRows = await db.query(`
      SELECT st.designation_id, COUNT(DISTINCT a.staff_id) AS n
      FROM attendance_daily a JOIN staff st ON st.id = a.staff_id
      WHERE a.running_room_id = ? AND a.attendance_date = ?
        AND a.status IN ('present','reliever') AND st.is_active = 1
      GROUP BY st.designation_id`, [rr.id, date]);
    const presentBy = {};
    presentRows.forEach(r => { presentBy[r.designation_id] = +r.n; });

    const deployment = sanction.map(d => ({
      name: d.name, sanctioned: d.sanctioned_count,
      present: presentBy[d.id] || 0,
      short: Math.max(0, d.sanctioned_count - (presentBy[d.id] || 0)),
    }));

    const signed = staff.find(s => s.countersigned_at);
    res.render('records/muster', { title: 'Daily muster', section: 'muster',
      rooms, rr, date, staff, deployment,
      shifts: SHIFTS, shiftNow, future, maxDate: today(),
      totals: { sanctioned: deployment.reduce((a, d) => a + d.sanctioned, 0),
                present:    deployment.reduce((a, d) => a + d.present, 0),
                short:      deployment.reduce((a, d) => a + d.short, 0) },
      marked: staff.some(s => s.status), countersigned: !!signed,
      // What the banner needs, and what tells a bearer the muster IS on record
      // without him pressing Save again to find out.
      saved: req.query.saved === undefined ? null : +req.query.saved,
      blocked: +req.query.blocked || 0,
      justSigned: req.query.signed === undefined ? null : +req.query.signed,
      lastMarkedAt: staff.map(s => s.marked_at).filter(Boolean)
        .sort().slice(-1)[0] || null,
      markedCount: staff.filter(s => s.status).length });
  } catch (e) { next(e); }
});

router.post('/muster', requirePermission('muster.mark'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    /* THE MUSTER WAS THE ONE DAILY REGISTER WITH NO FUTURE GUARD. Every other
       one refuses; this one would have taken attendance for next Tuesday. */
    if (date > today()) {
      const e = new Error('The muster cannot be marked for a day that has not happened.');
      e.status = 400; throw e;
    }
    const shiftNow = shiftOf(req.body.shift);

    // A person the Railway has not permitted may not be marked present. This is
    // the whole point of the screening gate in stage 2 — enforced here, not
    // merely displayed.
    //
    // Two statuses permit it, and they mean different things. `approved` is a
    // screening: somebody looked at the man and his documents. `provisional` is
    // an admission: he was already working when RR-CMS arrived, so refusing him
    // would mean no muster could be filed at all on day one. He works, he is
    // flagged as unscreened wherever he appears, and the Railway works the list
    // down. What is NOT permitted is `pending` — a man nobody has decided about.
    const approved = new Set((await db.query(
      `SELECT id FROM staff WHERE running_room_id = ? AND is_active = 1
         AND screening_status IN ('approved','provisional')`,
      [rrId])).map(r => r.id));

    const marks = Object.entries(req.body)
      .filter(([k]) => k.startsWith('s_'))
      .map(([k, v]) => ({ staffId: +k.slice(2), status: String(v) }))
      .filter(m => m.status)                                   // '' means not marked — leave it alone
      .filter(m => approved.has(m.staffId) || m.status !== 'present');

    let blocked = 0;
    for (const [k, v] of Object.entries(req.body))
      if (k.startsWith('s_') && v === 'present' && !approved.has(+k.slice(2))) blocked++;

    // A reliever has to say whose post he covered.
    //
    // Without it the status meant only "he was here doing something", and the
    // shortfall read identically whether an absence had been covered or left
    // open -- which is the one thing the figure is for. The man relieved must
    // be marked absent at this same running room on this same day, and must be
    // on its roster: the Railway's decision is that a substitute from outside
    // the roster may not be marked at all, because an unscreened person working
    // in a railway kitchen is exactly what screening exists to prevent.
    // A man the Railway has not screened is posted as absent by the form
    // because he cannot be marked present. He is NOT an absence anybody may be
    // recorded as covering: his post was never one he was permitted to work,
    // and "covered" would paper over exactly that.
    const absentToday = new Set(Object.entries(req.body)
      .filter(([k, v]) => k.startsWith('s_') && (v === 'absent' || v === 'leave'))
      .map(([k]) => +k.slice(2))
      .filter(id => approved.has(id)));
    const onRoster = new Set((await db.query(
      'SELECT id FROM staff WHERE running_room_id = ? AND is_active = 1', [rrId])).map(r => r.id));

    // One absence can only be covered once. Two men both marked Reliever and
    // both naming the same absentee would count as two present against one
    // vacant post -- the deployment figure would read a surplus where there was
    // none, and the shortfall arithmetic is the whole reason the status exists.
    const claimed = new Map();                    // relieved staff id -> reliever's id

    for (const m of marks) {
      m.relieved = null;
      if (m.status !== 'reliever') continue;
      const who = +req.body[`r_${m.staffId}`] || 0;
      if (who && claimed.has(who)) {
        const e = new Error('The muster has NOT been saved. Two men are shown as relieving the same '
          + 'person, and one absence can only be covered once. Go back with the browser\'s back button '
          + '— your marks are still on the page — and give each reliever the post he actually covered.');
        e.status = 400; throw e;
      }
      if (!who || !onRoster.has(who) || !absentToday.has(who)) {
        const e = new Error('The muster has NOT been saved. A reliever has to say whose post he '
          + 'covered, and that man must be one of this running room\'s own staff marked absent or on '
          + 'leave today. Go back with the browser\'s back button — your marks are still on the page — '
          + 'and choose the man in the box under the reliever. '
          + 'If the contractor sent somebody from outside the roster, he cannot be marked here at all: '
          + 'he has to be screened and taken on first.');
        e.status = 400; throw e;
      }
      m.relieved = who;
      claimed.set(who, m.staffId);
    }

    for (const m of marks)
      await db.execute(`
        INSERT INTO attendance_daily (running_room_id, staff_id, attendance_date, shift, status,
          relieved_staff_id, source, marked_by, marked_at)
        VALUES (?,?,?,?,?,?, 'manual', ?, NOW())
        ON DUPLICATE KEY UPDATE status = VALUES(status),
          relieved_staff_id = VALUES(relieved_staff_id),
          marked_by = VALUES(marked_by), marked_at = NOW()`,
        [rrId, m.staffId, date, shiftNow, m.status, m.relieved, req.user.id]);

    await audit.record(req, { table: 'attendance_daily', id: rrId, action: 'update',
      after: { running_room_id: rrId, date, shift: shiftNow, marked: marks.length,
               blocked_unscreened: blocked,
               relieved: marks.filter(m => m.relieved).length } });

    // Say what happened. Without this the bearer presses Save, the page comes
    // back looking exactly as it did, and he cannot tell whether the muster is
    // on record — so he presses it again, and again.
    res.redirect(`${cfg.basePath}/records/muster?rr=${rrId}&date=${date}&shift=${shiftNow}`
      + `&saved=${marks.length}` + (blocked ? `&blocked=${blocked}` : ''));
  } catch (e) { next(e); }
});

router.post('/muster/countersign', requirePermission('muster.countersign'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    /* SIGNED SHIFT BY SHIFT. The Railway's man puts his name to a muster he has
       seen; the night shift is marked the following morning, so signing the
       whole day at four in the afternoon would put his signature under rows
       that did not exist when he looked. */
    const shiftNow = shiftOf(req.body.shift);
    const r = await db.execute(
      `UPDATE attendance_daily SET countersigned_by = ?, countersigned_at = NOW()
       WHERE running_room_id = ? AND attendance_date = ? AND shift = ?
         AND countersigned_at IS NULL`,
      [req.user.id, rrId, date, shiftNow]);
    await audit.record(req, { table: 'attendance_daily', id: rrId, action: 'sign',
      after: { running_room_id: rrId, date, shift: shiftNow, rows: r.affectedRows } });
    res.redirect(`${cfg.basePath}/records/muster?rr=${rrId}&date=${date}&shift=${shiftNow}`
      + `&signed=${r.affectedRows}`);
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- call book */
// Clause C5 turns on the timing, so served_at and the acknowledgement are the
// whole record. RRMS does not hold this.
/* -------------------------------------------------------------- call book */
/**
 * The call sheet, worked the way the control office's LPC sheet is worked.
 *
 * The running：
 *
 *   The Jr Crew Controller telephones the running room with ONE train, the
 *   sign-on time and the men booked for it. The bearer writes it on one line,
 *   goes to the beds, wakes them, takes their acknowledgement, and repeats the
 *   acknowledgement back to the lobby.
 *
 * Stage 20 built that as a form: take a call, fill in a train, fill in the men.
 * It was faithful and it was slow, because the bearer already knows which
 * trains are coming — they are the same trains every day. So stage 21 turns it
 * into a SHEET, on the model the Railway already uses:
 *
 *   call_sheet_trains   the room's static list — one row per train, with run
 *                       days, a sign-on time and a validity window. Nothing is
 *                       stored per day until somebody types.
 *   call_book_calls     the daily fact, upserted on (room, date, sheet row).
 *
 * The day's rows are materialised at read time from the list, ordered by
 * sign-on time, with whatever has been keyed joined onto them. A train not on
 * the list — a goods working, a special, something running a day late — is
 * added as an ad-hoc row and carries no sheet row at all.
 *
 * What the tender actually says, and what follows from it:
 *
 *   Schedule C item 6 — "If contractor fails to serve call book to running
 *   staff in time, RESULTING LATE ON DUTY of running staff — Rs.500 per case."
 *
 * There is no lead time in minutes anywhere in the document. A case needs both
 * limbs: served late AND the man late on duty.
 *
 *   Schedule A — "The acknowledgement of serving of call by respective crew
 *   shall be repeated to crew lobby. For any discrepancy regarding non
 *   acknowledgement of call by staff or such staff is not available in the
 *   running room at the time of call serving, crew booking lobby shall be
 *   advised immediately for suitable action with time."
 */

// LP, ALP and guard are what Schedule A names ("CLI, LPs ALPs and Guards
// etc."). "Other" is deliberate: a call the lobby makes for somebody the list
// does not cover must still be recordable.
const CREW_ROLES = [['LP', 'Loco Pilot'], ['ALP', 'Asst. Loco Pilot'],
                    ['GUARD', 'Guard / Train Manager'], ['OTHER', 'Other']];
const SHEET_ROLES = ['LP', 'ALP', 'GUARD'];

/**
 * Does a sheet row run on this date?
 *
 * 'DAILY', or a comma list where 1 = Monday .. 7 = Sunday — the loco link
 * master's own convention, so somebody reading both sees one thing.
 */
function runsOn(runDays, dateStr) {
  const s = String(runDays || 'DAILY').trim().toUpperCase();
  if (!s || s === 'DAILY') return true;
  const js = new Date(dateStr + 'T00:00:00Z').getUTCDay();   // 0 = Sunday
  const ir = js === 0 ? 7 : js;
  return s.split(/[,\s]+/).filter(Boolean).includes(String(ir));
}

/** The men on a set of calls, in one query. */
async function linesFor(callIds) {
  if (!callIds.length) return [];
  return db.query(`
    SELECT cb.*, c.source AS crew_source, c.crew_id_no, c.designation AS crew_designation
    FROM call_book cb
    LEFT JOIN crew c ON c.id = cb.crew_id
    WHERE cb.call_id IN (${callIds.map(() => '?').join(',')})
    ORDER BY cb.id`, callIds);
}

/** A call the user is allowed to work on, with its men. */
async function callFor(req, id) {
  const call = await db.one('SELECT * FROM call_book_calls WHERE id = ?', [+id]);
  if (!call) { const e = new Error('That call is not on record.'); e.status = 404; throw e; }
  await assertRunningRoomAccess(db, req.user, call.running_room_id);
  call.lines = await linesFor([call.id]);
  return call;
}

/** How a call reads at a glance, computed once so the view never re-derives it. */
function summarise(call) {
  const l = call.lines || [];
  call.open = l.filter(x => x.ack_outcome === 'pending').length;
  call.bad = l.filter(x => x.ack_outcome === 'refused' || x.ack_outcome === 'not_present');
  call.unadvised = call.bad.filter(x => !x.lobby_advised_at).length;
  call.late = l.filter(x => x.crew_reported_late).length;
  // Greyed out on the sheet: everybody settled and the lobby told. Not merely
  // "acknowledged" -- a call with a man missing is not finished business.
  call.done = !!(l.length && !call.open && call.repeated_to_lobby_at) || !!call.cancelled_at;
  return call;
}

/**
 * The day's sheet: the room's train list for this date, with what has been
 * keyed against each row, plus every ad-hoc call.
 */
async function sheetFor(rrId, date, service) {
  const trains = await db.query(`
    SELECT * FROM call_sheet_trains
    WHERE running_room_id = ? AND is_active = 1 AND service = ?
      AND (effective_from IS NULL OR effective_from <= ?)
      AND (effective_until IS NULL OR effective_until >= ?)
    ORDER BY sign_on_time IS NULL, sign_on_time, train_no`, [rrId, service, date, date]);

  const calls = await db.query(`
    SELECT * FROM call_book_calls
    WHERE running_room_id = ? AND working_date = ? AND service = ?
    ORDER BY call_received_at IS NULL, call_received_at, id`, [rrId, date, service]);
  const lines = await linesFor(calls.map(c => c.id));
  calls.forEach(c => { c.lines = lines.filter(l => l.call_id === c.id); summarise(c); });

  const byTrain = new Map(calls.filter(c => c.sheet_train_id).map(c => [c.sheet_train_id, c]));

  // A scheduled row appears if it runs today OR if somebody has already keyed
  // something against it. The second half matters: a train that does not run on
  // Tuesdays but ran this Tuesday is a fact, and hiding the row would hide the
  // call with it.
  const rows = trains
    .filter(t => runsOn(t.run_days, date) || byTrain.has(t.id))
    .map(t => ({ train: t, call: byTrain.get(t.id) || null, adhoc: false,
                 at: t.sign_on_time || '99:99' }));

  const extra = calls.filter(c => !c.sheet_train_id)
    .map(c => ({ train: null, call: c, adhoc: true,
                 at: c.sign_on_at ? String(c.sign_on_at).slice(11, 16)
                   : (c.call_received_at ? String(c.call_received_at).slice(11, 16) : '99:99') }));

  return [...rows, ...extra].sort((a, b) => a.at.localeCompare(b.at));
}

// Mail and goods are two different sheets. A goods working is on no timetable
// at all, so its sheet is blank rows by nature -- and showing a goods room the
// mail links is a screen full of rows nobody will ever tick, which is how a
// register stops being read.
const SERVICES = ['mail', 'goods'];
const GOODS_BLANKS = 10;

router.get('/call-book', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const service = SERVICES.includes(req.query.service) ? req.query.service
                  : (SERVICES.includes(rr.call_sheet_default) ? rr.call_sheet_default : 'mail');
    const rows = await sheetFor(rr.id, date, service);

    // The month, counted honestly. Every one of these is a fact somebody can
    // point at — no norm, no threshold, no invented minutes.
    const month = await db.one(`
      SELECT COUNT(*) AS men,
             SUM(cb.ack_outcome = 'acknowledged') AS acknowledged,
             SUM(cb.ack_outcome = 'refused')      AS refused,
             SUM(cb.ack_outcome = 'not_present')  AS absent,
             SUM(cb.ack_outcome = 'pending')      AS pending,
             SUM(cb.crew_reported_late = 1)       AS late_on_duty,
             SUM(cb.crew_reported_late = 1 AND cb.served_at IS NOT NULL
                 AND c.sign_on_at IS NOT NULL AND cb.served_at > c.sign_on_at) AS cases,
             SUM(cb.ack_outcome IN ('refused','not_present')
                 AND cb.lobby_advised_at IS NULL) AS unadvised
      FROM call_book cb JOIN call_book_calls c ON c.id = cb.call_id
      WHERE c.running_room_id = ? AND c.working_date >= DATE_FORMAT(?, '%Y-%m-01')
        AND c.working_date < DATE_ADD(DATE_FORMAT(?, '%Y-%m-01'), INTERVAL 1 MONTH)`,
      [rr.id, date, date]);
    const callsThisMonth = await db.one(`
      SELECT COUNT(*) AS total,
             SUM(repeated_to_lobby_at IS NULL AND cancelled_at IS NULL) AS unrepeated
      FROM call_book_calls
      WHERE running_room_id = ? AND working_date >= DATE_FORMAT(?, '%Y-%m-01')
        AND working_date < DATE_ADD(DATE_FORMAT(?, '%Y-%m-01'), INTERVAL 1 MONTH)`,
      [rr.id, date, date]);

    // Crew called at this room lately, offered first in every name box. The
    // register builds itself from use, which is what stops the same driver
    // becoming "R. Kumar", "Ramesh Kumar" and "ramesh k" over three weeks --
    // and without matching names a Schedule C item 6 case cannot be attributed
    // to a crew, a shift or a pattern at all.
    const crew = await db.query(`
      SELECT c.id, c.full_name, c.crew_id_no, c.source, c.designation,
             MAX(cb.call_received_at) AS last_seen
      FROM crew c JOIN call_book cb ON cb.crew_id = c.id
      WHERE cb.running_room_id = ? AND c.is_active = 1
      GROUP BY c.id, c.full_name, c.crew_id_no, c.source, c.designation
      ORDER BY last_seen DESC LIMIT 300`, [rr.id]);

    // Whether this division's staff master is wired up at all decides what the
    // form says. Where it is not -- a division not yet on CRTMS -- the page
    // must not imply a lookup exists and is failing.
    const masterSchema = await crewMaster.schemaForRunningRoom(rr.id);
    const listed = await db.one(
      `SELECT COUNT(*) AS n FROM call_sheet_trains
       WHERE running_room_id = ? AND is_active = 1 AND service = ?`, [rr.id, service]);

    res.render('records/call-book', { title: 'Call book', section: 'call-book', tab: 'sheet',
      rooms, rr, date, rows, crew, hasMaster: !!masterSchema, ROLES: CREW_ROLES,
      service, blanks: service === 'goods' ? GOODS_BLANKS : 0,
      listedTrains: listed ? listed.n : 0,
      month: Object.assign({}, month || {}, callsThisMonth || {}),
      saved: req.query.saved || null, note: req.query.note || null });
  } catch (e) { next(e); }
});

/**
 * The crew lookup behind every name box.
 *
 * Answers with what the running room needs to identify a man and nothing else:
 * no Aadhaar, no PAN, no caste, no date of birth. Those columns are not merely
 * omitted here -- RR-CMS is not granted them at all. See db/crtms/README.md.
 *
 * The telephone number is attached only for a user holding `crew.contact`,
 * which the contractor's supervisor does not have. He records the call; he is
 * not handed a directory of the division's running staff.
 */
router.get('/crew-search', async (req, res, next) => {
  try {
    const rrId = +req.query.rr;
    if (!rrId) return res.json([]);
    await assertRunningRoomAccess(db, req.user, rrId);
    const schema = await crewMaster.schemaForRunningRoom(rrId);
    // Which box is being filled decides who may be offered into it. The Loco
    // Pilot box offers drivers, the Assistant box assistants; anything else
    // offers every designation that may be booked as crew at all.
    const found = await crewMaster.search(schema, req.query.q, 20, req.query.role || null);

    const mayCall = req.can('crew.contact');
    const out = [];
    for (const m of found) {
      out.push({
        hrms_id: m.hrms_id, cms_id: m.cms_id, full_name: m.full_name,
        designation: m.designation_name || m.designation_code || null,
        designation_id: m.designation_id === undefined ? null : m.designation_id,
        hq: m.hq_station || m.office_code || null,
        contact: mayCall ? await crewMaster.contactFor(schema, m.hrms_id) : null,
      });
    }
    res.json(out);
  } catch (e) { next(e); }
});

/**
 * One row of the sheet, saving itself.
 *
 * An upsert on (running room, working date, sheet row) — the same natural key
 * the loco link log uses, and the reason a row can be saved over and over
 * without ever doubling. An ad-hoc row carries no sheet row and is therefore
 * exempt, which is what lets a goods working with no number be entered as many
 * times as it actually happened.
 *
 * Crew already settled are NOT touched. Once a man has acknowledged, changing
 * who was booked is a change with a reason, and it goes through the changes
 * tab — an edit that quietly replaces an acknowledged man erases the evidence
 * of what the running room was originally asked to do.
 */
router.post('/call-book/row', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const b = req.body;
    const rrId = +b.rr, date = String(b.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);

    const service = SERVICES.includes(b.service) ? b.service : 'mail';
    const sheetId = +b.sheet_train_id || null;
    let sheet = null;
    if (sheetId) {
      sheet = await db.one('SELECT * FROM call_sheet_trains WHERE id = ? AND running_room_id = ?',
        [sheetId, rrId]);
      if (!sheet) { const e = new Error('That train is not on this running room\'s list.'); e.status = 400; throw e; }
    }

    const received = /^\d{2}:\d{2}$/.test(String(b.received || '')) ? String(b.received) : null;
    const signOn = /^\d{2}:\d{2}$/.test(String(b.sign_on || '')) ? String(b.sign_on)
                 : (sheet && sheet.sign_on_time) || null;
    const trainNo = String(b.train_no || (sheet ? sheet.train_no : '')).slice(0, 12) || null;
    const trainName = String(b.train_name || (sheet ? sheet.train_name || '' : '')).slice(0, 120) || null;

    // A hand-added row has to be identifiable later. On a goods sheet the
    // bearer may genuinely have no number -- the working is identified by its
    // crew and its time -- so a named man is enough there.
    const named = SHEET_ROLES.some(r => String(b['n_' + r] || '').trim());
    if (!sheet && !trainNo && !String(b.remarks || '').trim() && !(service === 'goods' && named)) {
      const e = new Error(service === 'goods'
        ? 'Nothing has been saved. A goods row needs at least a crew name, or a number, or a remark saying what the working is.'
        : 'Nothing has been saved. A row added by hand needs a train number, or a remark saying what it is — a goods working with no number still has to be identifiable later.');
      e.status = 400; throw e;
    }

    // Resolve every man before anything is written. A bad second name must not
    // leave the first one saved.
    const rrRow = await db.one('SELECT division_id FROM running_rooms WHERE id = ?', [rrId]);
    const schema = await crewMaster.schemaForRunningRoom(rrId);
    const wanted = [];
    for (const role of SHEET_ROLES) {
      const typedRaw = String(b['n_' + role] || '').trim();
      if (!typedRaw) continue;
      // Where the name was picked from the division staff master the hidden
      // hrms_id comes with it and the identification is exact. Where it was
      // typed -- a train manager, a man from another division, anyone the
      // master does not carry -- the CMS number is used if given, then the
      // name. A typed name is not a failure to be designed out.
      const typed = typedRaw.replace(/\s+/g, ' ').slice(0, 150);
      const bracketed = /\(([A-Za-z0-9/-]{3,20})\)\s*$/.exec(typed);
      const cleanName = typed.replace(/\s*\([^)]*\)\s*$/, '').trim() || typed;
      const crewRow = await crewMaster.resolve({
        hrmsId: String(b['h_' + role] || '').trim() || null, schema, name: cleanName,
        cmsNo: bracketed ? bracketed[1] : null,
        divisionId: rrRow ? rrRow.division_id : null,
      });
      if (!crewRow) {
        const e = new Error(`Nothing has been saved. The ${role} name could not be recorded.`);
        e.status = 400; throw e;
      }
      wanted.push({ role, crewRow, bed: String(b['b_' + role] || '').slice(0, 12) || null });
    }

    const recvAt = received ? `${date} ${received}:00` : null;
    const signAt = signOn ? `${date} ${signOn}:00` : null;

    let callId = null;
    await db.transaction(async tx => {
      const existing = sheetId
        ? await tx.one('SELECT * FROM call_book_calls WHERE running_room_id = ? AND working_date = ? AND sheet_train_id = ?',
            [rrId, date, sheetId])
        : (+b.call_id ? await tx.one('SELECT * FROM call_book_calls WHERE id = ? AND running_room_id = ?',
            [+b.call_id, rrId]) : null);

      if (existing) {
        callId = existing.id;
        await tx.execute(`
          UPDATE call_book_calls
             SET train_no = ?, train_name = ?, sign_on_at = ?, received_from = ?, lobby = ?,
                 call_received_at = COALESCE(?, call_received_at), remarks = ?
           WHERE id = ?`,
          [trainNo, trainName, signAt, String(b.received_from || '').slice(0, 120) || null,
           String(b.lobby || '').slice(0, 60) || null, recvAt,
           String(b.remarks || '').slice(0, 300) || null, callId]);
      } else {
        const r = await tx.execute(`
          INSERT INTO call_book_calls (running_room_id, sheet_train_id, working_date, service,
            train_no, train_name, sign_on_at, received_from, lobby, call_received_at, remarks,
            recorded_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [rrId, sheetId, date, service, trainNo, trainName, signAt,
           String(b.received_from || '').slice(0, 120) || null,
           String(b.lobby || '').slice(0, 60) || null, recvAt,
           String(b.remarks || '').slice(0, 300) || null, req.user.id]);
        callId = r.insertId;
      }

      const have = await tx.query('SELECT * FROM call_book WHERE call_id = ?', [callId]);
      for (const w of wanted) {
        const line = have.find(l => l.crew_role === w.role);
        if (!line) {
          await tx.execute(`
            INSERT INTO call_book (running_room_id, call_id, crew_id, crew_name, crew_role,
              bed_no, call_for_train, call_received_at, booked_on_duty_at, recorded_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [rrId, callId, w.crewRow.id, w.crewRow.full_name, w.role, w.bed, trainNo,
             recvAt, signAt, req.user.id]);
        } else if (line.ack_outcome === 'pending') {
          await tx.execute(
            'UPDATE call_book SET crew_id = ?, crew_name = ?, bed_no = ?, call_for_train = ?, booked_on_duty_at = ? WHERE id = ?',
            [w.crewRow.id, w.crewRow.full_name, w.bed, trainNo, signAt, line.id]);
        }
        // else: settled. Changing him is a change with a reason — see the
        // changes tab. Silently overwriting an acknowledged man here would
        // erase what the running room was originally asked to do.
      }
    });

    await audit.record(req, { table: 'call_book_calls', id: callId, action: sheetId ? 'update' : 'insert',
      after: { running_room_id: rrId, working_date: date, train: trainNo, received,
               men: wanted.map(w => ({ role: w.role, name: w.crewRow.full_name, identified: w.crewRow.source })) } });

    if (b.then === 'serve') return res.redirect(`${cfg.basePath}/records/call-book/${callId}`);
    res.redirect(`${cfg.basePath}/records/call-book?rr=${rrId}&date=${date}`
               + `&service=${service}&saved=${callId}`);
  } catch (e) { next(e); }
});

/**
 * The screen the bearer opens standing at the bed.
 *
 * One big button per man, and the man taps his own name. The time is stamped
 * by the SERVER at that moment — the bearer cannot type it and cannot write it
 * up later at the end of his shift, which is the one thing a paper book can
 * never give you. That is why the tap is worth having even though it carries
 * no signature: Schedule C item 6 turns on a time, not on a squiggle.
 *
 * It is not proof of who tapped — a determined bearer can tap it himself. It
 * is proof of WHEN, and the man taps his own name rather than a single button
 * for the call, so "the LP was woken and the ALP was not" is recordable.
 */
router.get('/call-book/changes', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const calls = await db.query(`
      SELECT * FROM call_book_calls
      WHERE running_room_id = ? AND working_date = ?
      ORDER BY call_received_at IS NULL, call_received_at, id`, [rr.id, date]);
    const lines = await linesFor(calls.map(c => c.id));
    calls.forEach(c => { c.lines = lines.filter(l => l.call_id === c.id); summarise(c); });

    const history = calls.length ? await db.query(`
      SELECT ch.*, u.username AS by_name
      FROM call_book_changes ch LEFT JOIN users u ON u.id = ch.changed_by
      WHERE ch.call_id IN (${calls.map(() => '?').join(',')})
      ORDER BY ch.changed_at DESC`, calls.map(c => c.id)) : [];

    const masterSchema = await crewMaster.schemaForRunningRoom(rr.id);
    res.render('records/call-changes', { title: 'Changes and withdrawals', section: 'call-book',
      tab: 'changes', rooms, rr, date, calls, history, ROLES: CREW_ROLES,
      hasMaster: !!masterSchema, note: req.query.note || null });
  } catch (e) { next(e); }
});

router.get('/call-book/:id', numeric('id'), async (req, res, next) => {
  try {
    const call = await callFor(req, req.params.id);
    // Deliberately the same query shape the certificate pack uses for a running
    // room. Every new shape is another stub the demo has to learn and another
    // chance for an older one to answer it first — which has already produced
    // four wrong-data bugs in this codebase.
    const rr = await db.one(`
      SELECT rr.*, d.code AS div_code, d.name AS div_name
      FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id WHERE rr.id = ?`,
      [call.running_room_id]);
    res.render('records/call-serve', { title: 'Serving a call', section: 'call-book', tab: 'sheet',
      call: summarise(call), rr, ROLES: CREW_ROLES, note: req.query.note || null });
  } catch (e) { next(e); }
});

/** A man taps his own name. Server time, nothing typed. */
router.post('/call-book/:id/ack', numeric('id'), requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const call = await callFor(req, req.params.id);
    const line = call.lines.find(l => l.id === +req.body.line);
    if (!line) { const e = new Error('That crew member is not on this call.'); e.status = 400; throw e; }
    if (call.cancelled_at) { const e = new Error('This call was withdrawn by the lobby and cannot be acknowledged.'); e.status = 400; throw e; }
    await db.execute(`
      UPDATE call_book
         SET ack_outcome = 'acknowledged', ack_method = 'tap', acknowledged = 1,
             ack_recorded_at = NOW(), acknowledged_at = NOW(),
             served_at = COALESCE(served_at, NOW())
       WHERE id = ?`, [line.id]);
    await audit.record(req, { table: 'call_book', id: line.id, action: 'update',
      after: { outcome: 'acknowledged', method: 'tap', crew_name: line.crew_name } });
    res.redirect(`${cfg.basePath}/records/call-book/${call.id}?note=ack`);
  } catch (e) { next(e); }
});

/**
 * A man who refused, or who was not in the running room at all.
 *
 * Schedule A obliges the contractor to advise the lobby immediately, with the
 * time. So the outcome and the advice are taken together — recording that a
 * man was absent without recording that the lobby was told is only half of
 * what the contract asks for, and it is the half that does not help him.
 */
router.post('/call-book/:id/outcome', numeric('id'), requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const call = await callFor(req, req.params.id);
    const line = call.lines.find(l => l.id === +req.body.line);
    if (!line) { const e = new Error('That crew member is not on this call.'); e.status = 400; throw e; }
    const outcome = ['refused', 'not_present', 'pending'].includes(req.body.outcome) ? req.body.outcome : null;
    if (!outcome) { const e = new Error('An outcome has to be one of: acknowledged, refused, not in the running room.'); e.status = 400; throw e; }
    const advisedTo = String(req.body.advised_to || '').slice(0, 120) || null;
    const advise = req.body.advised ? 1 : 0;
    await db.execute(`
      UPDATE call_book
         SET ack_outcome = ?, acknowledged = 0, ack_method = NULL,
             acknowledged_at = NULL, ack_recorded_at = NULL,
             served_at = CASE WHEN ? = 'pending' THEN served_at ELSE COALESCE(served_at, NOW()) END,
             lobby_advised_at = CASE WHEN ? = 1 THEN COALESCE(lobby_advised_at, NOW()) ELSE lobby_advised_at END,
             lobby_advised_to = CASE WHEN ? = 1 THEN ? ELSE lobby_advised_to END
       WHERE id = ?`, [outcome, outcome, advise, advise, advisedTo, line.id]);
    await audit.record(req, { table: 'call_book', id: line.id, action: 'update',
      after: { outcome, crew_name: line.crew_name, lobby_advised: !!advise, advised_to: advisedTo } });
    res.redirect(`${cfg.basePath}/records/call-book/${call.id}?note=outcome`);
  } catch (e) { next(e); }
});

/**
 * "The acknowledgement of serving of call by respective crew shall be repeated
 * to crew lobby." Recorded, not sent: the bearer telephones the lobby exactly
 * as he does now, and says here that he did and when. RR-CMS is the evidence,
 * not a messaging system to the lobby.
 */
router.post('/call-book/:id/repeat', numeric('id'), requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const call = await callFor(req, req.params.id);
    if (!call.lines.length || call.lines.some(l => l.ack_outcome === 'pending')) {
      const e = new Error('Not recorded. There is still a man on this call whose outcome has not been settled — the lobby cannot be told the call is complete until it is.');
      e.status = 400; throw e;
    }
    await db.execute(`
      UPDATE call_book_calls
         SET repeated_to_lobby_at = COALESCE(repeated_to_lobby_at, NOW()),
             repeated_to = ?, repeated_by = ?
       WHERE id = ?`, [String(req.body.repeated_to || '').slice(0, 120) || null, req.user.id, call.id]);
    await audit.record(req, { table: 'call_book_calls', id: call.id, action: 'update',
      after: { repeated_to_lobby: true, repeated_to: req.body.repeated_to || null } });
    res.redirect(`${cfg.basePath}/records/call-book/${call.id}?note=repeated`);
  } catch (e) { next(e); }
});

/**
 * The second limb of Schedule C item 6 — the man actually went late on duty.
 *
 * The running room does not learn this at the bed; the lobby tells them
 * afterwards. So it is a separate act, recorded against the man, and only when
 * it is present alongside a late serving is there a case to raise at all.
 */
router.post('/call-book/:id/late', numeric('id'), requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const call = await callFor(req, req.params.id);
    const line = call.lines.find(l => l.id === +req.body.line);
    if (!line) { const e = new Error('That crew member is not on this call.'); e.status = 400; throw e; }
    const late = req.body.late ? 1 : 0;
    await db.execute('UPDATE call_book SET crew_reported_late = ?, remarks = ? WHERE id = ?',
      [late, String(req.body.remarks || '').slice(0, 300) || null, line.id]);
    await audit.record(req, { table: 'call_book', id: line.id, action: 'update',
      after: { crew_reported_late: !!late, crew_name: line.crew_name } });
    res.redirect(`${cfg.basePath}/records/call-book/${call.id}?note=late`);
  } catch (e) { next(e); }
});

/**
 * A call the lobby withdraws — train cancelled, crew changed, called in error.
 * Closed with a reason rather than deleted: a call that vanishes takes with it
 * the only evidence of what the running room was asked to do.
 */
router.post('/call-book/:id/withdraw', numeric('id'), requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const call = await callFor(req, req.params.id);
    const reason = String(req.body.reason || '').trim().slice(0, 200);
    if (!reason) { const e = new Error('Not withdrawn. A call withdrawn by the lobby needs the reason recorded against it.'); e.status = 400; throw e; }
    await db.transaction(async tx => {
      await tx.execute('UPDATE call_book_calls SET cancelled_at = NOW(), cancelled_reason = ? WHERE id = ?',
        [reason, call.id]);
      await tx.execute(`
        INSERT INTO call_book_changes (call_id, change_type, reason, advised_by, changed_by)
        VALUES (?, 'withdrawn', ?, ?, ?)`,
        [call.id, reason, String(req.body.advised_by || '').slice(0, 120) || null, req.user.id]);
    });
    await audit.record(req, { table: 'call_book_calls', id: call.id, action: 'update',
      after: { cancelled: true, reason } });
    res.redirect(`${cfg.basePath}/records/call-book/changes?rr=${call.running_room_id}&date=${String(call.working_date).slice(0, 10)}&note=withdrawn`);
  } catch (e) { next(e); }
});

/**
 * The lobby substitutes a man.
 *
 * The row must show who is booked NOW, and the register must still show who
 * was booked first. A substitution that silently overwrites the name erases
 * the only evidence of what the running room was originally asked to do —
 * which is the same failure as deleting a withdrawn call, and it is why this
 * is a separate act with a reason rather than an edit on the sheet.
 */
router.post('/call-book/:id/change-crew', numeric('id'), requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const call = await callFor(req, req.params.id);
    const line = call.lines.find(l => l.id === +req.body.line);
    if (!line) { const e = new Error('That crew member is not on this call.'); e.status = 400; throw e; }
    const reason = String(req.body.reason || '').trim().slice(0, 200);
    if (!reason) { const e = new Error('Nothing has been changed. A crew change needs the reason the lobby gave.'); e.status = 400; throw e; }

    const typedRaw = String(req.body.crew_name || '').trim();
    if (!typedRaw) { const e = new Error('Nothing has been changed. Name the man who is booked now.'); e.status = 400; throw e; }
    const typed = typedRaw.replace(/\s+/g, ' ').slice(0, 150);
    const bracketed = /\(([A-Za-z0-9/-]{3,20})\)\s*$/.exec(typed);
    const cleanName = typed.replace(/\s*\([^)]*\)\s*$/, '').trim() || typed;
    const rrRow = await db.one('SELECT division_id FROM running_rooms WHERE id = ?', [call.running_room_id]);
    const schema = await crewMaster.schemaForRunningRoom(call.running_room_id);
    const crewRow = await crewMaster.resolve({
      hrmsId: String(req.body.crew_hrms || '').trim() || null, schema, name: cleanName,
      cmsNo: bracketed ? bracketed[1] : null, divisionId: rrRow ? rrRow.division_id : null,
    });
    if (!crewRow) { const e = new Error('Nothing has been changed. That name could not be recorded.'); e.status = 400; throw e; }

    await db.transaction(async tx => {
      await tx.execute(`
        INSERT INTO call_book_changes (call_id, line_id, change_type, was_crew_name, now_crew_name,
          reason, advised_by, changed_by)
        VALUES (?,?, 'crew_changed', ?, ?, ?, ?, ?)`,
        [call.id, line.id, line.crew_name, crewRow.full_name, reason,
         String(req.body.advised_by || '').slice(0, 120) || null, req.user.id]);
      // The new man has not acknowledged anything. Putting him in with the old
      // man's acknowledgement still attached would be a false record.
      await tx.execute(`
        UPDATE call_book
           SET crew_id = ?, crew_name = ?, ack_outcome = 'pending', acknowledged = 0,
               ack_method = NULL, acknowledged_at = NULL, ack_recorded_at = NULL, served_at = NULL
         WHERE id = ?`, [crewRow.id, crewRow.full_name, line.id]);
      // The call is no longer complete, so it cannot stay reported to the lobby.
      await tx.execute('UPDATE call_book_calls SET repeated_to_lobby_at = NULL, repeated_to = NULL WHERE id = ?',
        [call.id]);
    });
    await audit.record(req, { table: 'call_book', id: line.id, action: 'update',
      after: { crew_changed: true, was: line.crew_name, now: crewRow.full_name, reason } });
    res.redirect(`${cfg.basePath}/records/call-book/${call.id}?note=changed`);
  } catch (e) { next(e); }
});

/* ------------------------------------------- the room's own list of trains */
/**
 * The list the sheet is built from — the mirror of `div_loco_link_master`.
 *
 * Kept by the Railway, not by the contractor: a contractor who can edit which
 * trains are expected can edit away the evidence that one was never called.
 */
router.get('/call-sheet-trains', requirePermission('callsheet.manage'), async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const trains = await db.query(`
      SELECT * FROM call_sheet_trains WHERE running_room_id = ?
      ORDER BY service, is_active DESC, sign_on_time IS NULL, sign_on_time, train_no`, [rr.id]);
    res.render('records/call-sheet-trains', { title: 'Trains on the call sheet', section: 'call-book',
      tab: 'trains', rooms, rr, date, trains, SERVICES, note: req.query.note || null });
  } catch (e) { next(e); }
});

router.post('/call-sheet-trains', requirePermission('callsheet.manage'), async (req, res, next) => {
  try {
    const b = req.body;
    const rrId = +b.rr;
    await assertRunningRoomAccess(db, req.user, rrId);

    // Which tab this room opens on. A goods-only room is marked once and its
    // bearer never clicks again; the other tab stays reachable, because the day
    // something unusual happens must not be the day the register cannot hold it.
    if (b.set_default !== undefined) {
      const def = SERVICES.includes(b.set_default) ? b.set_default : null;
      await db.execute('UPDATE running_rooms SET call_sheet_default = ? WHERE id = ?', [def, rrId]);
      await audit.record(req, { table: 'running_rooms', id: rrId, action: 'update',
        after: { call_sheet_default: def } });
      return res.redirect(`${cfg.basePath}/records/call-sheet-trains?rr=${rrId}&note=default`);
    }

    if (b.remove) {
      // Taken off the sheet, not deleted: calls already keyed against it must
      // keep pointing at something.
      await db.execute('UPDATE call_sheet_trains SET is_active = 0 WHERE id = ? AND running_room_id = ?',
        [+b.remove, rrId]);
      await audit.record(req, { table: 'call_sheet_trains', id: +b.remove, action: 'update',
        after: { is_active: 0 } });
      return res.redirect(`${cfg.basePath}/records/call-sheet-trains?rr=${rrId}&note=removed`);
    }

    const trainNo = String(b.train_no || '').trim().slice(0, 12);
    if (!trainNo) { const e = new Error('Nothing has been saved. A train number is needed.'); e.status = 400; throw e; }
    const dir = ['UP', 'DN', 'BYPASS', 'OTHER'].includes(b.direction) ? b.direction : 'OTHER';
    const signOn = /^\d{2}:\d{2}$/.test(String(b.sign_on_time || '')) ? String(b.sign_on_time) : null;
    const runDays = String(b.run_days || 'DAILY').trim().toUpperCase().slice(0, 20) || 'DAILY';
    if (runDays !== 'DAILY' && !/^[1-7](,[1-7])*$/.test(runDays)) {
      const e = new Error('Nothing has been saved. Run days must be DAILY, or days as numbers separated by commas — 1 is Monday, 7 is Sunday. That is the same convention the control office sheet uses.');
      e.status = 400; throw e;
    }

    const svc = SERVICES.includes(b.service) ? b.service : 'mail';
    await db.execute(`
      INSERT INTO call_sheet_trains (running_room_id, train_no, train_name, direction, service,
        sign_on_time, run_days, notes, source, is_active, created_by)
      VALUES (?,?,?,?,?,?,?,?, 'manual', 1, ?)
      ON DUPLICATE KEY UPDATE train_name = VALUES(train_name), sign_on_time = VALUES(sign_on_time),
        service = VALUES(service), run_days = VALUES(run_days), notes = VALUES(notes),
        source = 'manual', is_active = 1`,
      [rrId, trainNo, String(b.train_name || '').slice(0, 120) || null, dir, svc, signOn, runDays,
       String(b.notes || '').slice(0, 200) || null, req.user.id]);
    await audit.record(req, { table: 'call_sheet_trains', id: 0, action: 'insert',
      after: { running_room_id: rrId, train_no: trainNo, direction: dir, sign_on_time: signOn, run_days: runDays } });
    res.redirect(`${cfg.basePath}/records/call-sheet-trains?rr=${rrId}&note=saved`);
  } catch (e) { next(e); }
});

/**
 * The train the crew was called for, offered from the division's train master.
 *
 * The same reasoning as the crew lookup and the same boundary: a narrow view
 * over `div_trains`, granted separately, carrying a number, a name and where
 * the train runs between. Nothing about loco links or the working timetable
 * crosses, and a division with no grant simply types the number as it does now.
 */
router.get('/train-search', async (req, res, next) => {
  try {
    const rrId = +req.query.rr;
    if (!rrId) return res.json([]);
    await assertRunningRoomAccess(db, req.user, rrId);
    const schema = await crewMaster.schemaForRunningRoom(rrId);
    const found = await crewMaster.searchTrains(schema, req.query.q);
    res.json(found.map(t => ({
      train_no: t.train_no, train_name: t.train_name || null,
      between: [t.from_station, t.to_station].filter(Boolean).join(' – ') || null,
      run_days: t.run_days || null, direction: t.direction || null,
    })));
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------- meals */
/**
 * Meals actually served, one tick per crew per service.
 *
 * This is not meal accounting -- RRMS owns the money. It is the primary record
 * underneath it, which the Railway has never had: which crew ate, at which
 * service, on which day, at which room. Without it a monthly meal count is a
 * figure the contractor supplies and nobody can check.
 *
 * The list of people offered is built from the call book for that date, because
 * a man who was called was in the room. Anyone else -- a crew resting who was
 * not called, a train manager -- is added by name through the same lookup the
 * call book uses, so one man stays one record across both registers.
 */
/* The fourth type is the packed meal the crew carries en route. The Railway
   Board letter the tender quotes puts it OUTSIDE the three-meal ceiling — "the
   parcel meal for consumption en-route will be additional to the ceiling" — so
   it is a type of its own and never a lunch booked under another name. The
   unique key on meal_services then gives exactly what the letter describes:
   one breakfast, one lunch and one dinner in a day, plus a parcel that does not
   count against them. Added at stage 25; see migration 033. */
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'],
               ['parcel', 'Parcel']];
const SUBSIDISED = ['breakfast', 'lunch', 'dinner'];

router.get('/meals', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);

    // Everyone in the room today, as far as the registers know: crew called
    // here on this date, plus anyone already ticked for a meal.
    const people = await db.query(`
      SELECT c.id, c.full_name, c.crew_id_no, c.source, c.designation,
             MIN(cb.call_received_at) AS called_at
      FROM crew c
      LEFT JOIN call_book cb ON cb.crew_id = c.id AND cb.running_room_id = ?
           AND DATE(cb.call_received_at) = ?
      LEFT JOIN meal_services ms ON ms.crew_id = c.id AND ms.running_room_id = ?
           AND ms.service_date = ?
      LEFT JOIN meal_roll mr ON mr.crew_id = c.id AND mr.running_room_id = ?
           AND mr.service_date = ?
      WHERE c.is_active = 1 AND (cb.id IS NOT NULL OR ms.id IS NOT NULL OR mr.crew_id IS NOT NULL)
      GROUP BY c.id, c.full_name, c.crew_id_no, c.source, c.designation
      ORDER BY c.full_name`, [rr.id, date, rr.id, date, rr.id, date]);

    const taken = await db.query(
      `SELECT crew_id, meal_type FROM meal_services WHERE running_room_id = ? AND service_date = ?`,
      [rr.id, date]);
    const takenBy = {};
    taken.forEach(t => { (takenBy[t.crew_id] ||= {})[t.meal_type] = true; });

    const counts = {};
    MEALS.forEach(([code]) => { counts[code] = taken.filter(t => t.meal_type === code).length; });

    const month = await db.query(`
      SELECT meal_type, COUNT(*) AS n FROM meal_services
      WHERE running_room_id = ? AND service_date >= DATE_FORMAT(?, '%Y-%m-01')
        AND service_date < DATE_ADD(DATE_FORMAT(?, '%Y-%m-01'), INTERVAL 1 MONTH)
      GROUP BY meal_type`, [rr.id, date, date]);

    // Printed beside the counts, multiplied by nothing. See db/seeds/06.
    //
    // Scoped to the running room's contract since stage 36: IGP's executed
    // contract caps the Railway share at Rs 64.74 and Rs 58.26, where the
    // divisional control board this table was seeded from says 62.37 and 37.80.
    const rates = (await terms.scopedRows(db,
      await terms.contractIdFor(db, rr.id), (scope, p) => [`
      SELECT meal_type, subsidised_rate, full_rate, is_ceiling, cap_note,
             source_ref, effective_from, contract_id
      FROM meal_rates WHERE effective_from <= ? AND ${scope}
      ORDER BY effective_from DESC`, [date, ...p]])).rows;
    const rateFor = {};
    rates.forEach(r => { if (!rateFor[r.meal_type]) rateFor[r.meal_type] = r; });

    const hasMaster = await crewMaster.schemaForRunningRoom(rr.id);
    res.render('records/meals', { title: 'Meals served', section: 'meals',
      rooms, rr, date, people, takenBy, counts, meals: MEALS,
      month: Object.fromEntries(month.map(m => [m.meal_type, m.n])),
      rateFor, hasMaster: !!hasMaster,
      // Say who was just added. The button used to do nothing at all and say
      // nothing about it; doing something and saying nothing is only better by
      // a little.
      added: req.query.added || null });
  } catch (e) { next(e); }
});

router.post('/meals', requirePermission('meal.record'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    if (date > today()) { const e = new Error('A meal cannot be recorded for a future date.'); e.status = 400; throw e; }

    /* Adding somebody who was not called: same resolution as the call book, so
     * a man picked from the staff master is the same crew row in both.
     *
     * THE FIELD NAMES ARE THE FORM'S. This read `add_name`, `add_hrms` and
     * `add_no`; the form sends `crew_name`, `crew_hrms` and `crew_no`, because
     * that is what the shared crew autocomplete in public/app.js binds to. So
     * this branch never fired. The request fell through to the tick-saving path
     * below, found no `listed` field, saved nothing, and redirected -- and the
     * screen came back looking exactly as before. Nothing failed loudly enough
     * to notice. */
    const typedName = String(req.body.crew_name || '').trim();
    if (typedName) {
      const rrRow = await db.one('SELECT division_id FROM running_rooms WHERE id = ?', [rrId]);
      const schema = await crewMaster.schemaForRunningRoom(rrId);
      const who = await crewMaster.resolve({
        hrmsId: String(req.body.crew_hrms || '').trim() || null, schema,
        name: typedName.replace(/\s+/g, ' ').slice(0, 150),
        cmsNo: String(req.body.crew_no || '').trim() || null,
        divisionId: rrRow ? rrRow.division_id : null,
      });
      if (!who) { const e = new Error('That name could not be read. Type it again.'); e.status = 400; throw e; }

      /* Put him ON THE LIST for the day and tick nothing. The list was built
       * from the call book and from meals already recorded, so a man who was
       * neither called nor fed had nowhere to appear -- which is what made this
       * button look dead even once the field names were right. See migration
       * 048. */
      await db.execute(`
        INSERT INTO meal_roll (running_room_id, service_date, crew_id, added_by)
        VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE added_by = VALUES(added_by)`,
        [rrId, date, who.id, req.user.id]);
      await audit.record(req, { table: 'meal_roll', id: rrId, action: 'insert',
        after: { running_room_id: rrId, service_date: date, crew_id: who.id, name: who.full_name } });

      return res.redirect(`${cfg.basePath}/records/meals?rr=${rrId}&date=${date}&added=`
        + encodeURIComponent(who.full_name));
    }

    /* A submit that is neither an addition nor a set of ticks is a form this
     * route does not understand. Saying so is better than redirecting as though
     * something had been saved -- which is precisely how the fault above hid. */
    if (req.body.listed === undefined) {
      const e = new Error('Nothing to save. Type a name to add a man, or tick the meals and save.');
      e.status = 400; throw e;
    }

    // The ticks. Everyone on the form is accounted for: a box that was ticked
    // and is now clear means the meal was NOT taken, and the row goes. Silently
    // leaving it behind would make a correction impossible.
    const onForm = new Set(String(req.body.listed || '').split(',')
      .map(x => +x).filter(Boolean));
    const wanted = new Set();
    for (const [k, v] of Object.entries(req.body)) {
      const m = /^m_(breakfast|lunch|dinner|parcel)_(\d+)$/.exec(k);
      if (m && v) wanted.add(`${m[1]}|${+m[2]}`);
    }

    const names = new Map((await db.query(
      `SELECT id, full_name FROM crew WHERE id IN (${[...onForm].map(() => '?').join(',') || '0'})`,
      [...onForm])).map(r => [r.id, r.full_name]));

    let added = 0, removed = 0;
    for (const crewId of onForm) {
      for (const [code] of MEALS) {
        const want = wanted.has(`${code}|${crewId}`);
        if (want) {
          const r = await db.execute(`
            INSERT INTO meal_services (running_room_id, service_date, meal_type, crew_id,
              crew_name, taken_at, recorded_by)
            VALUES (?,?,?,?,?,NOW(),?)
            ON DUPLICATE KEY UPDATE crew_name = VALUES(crew_name)`,
            [rrId, date, code, crewId, names.get(crewId) || null, req.user.id]);
          if (r.affectedRows === 1) added++;
        } else {
          const r = await db.execute(
            `DELETE FROM meal_services WHERE running_room_id = ? AND service_date = ?
             AND meal_type = ? AND crew_id = ?`, [rrId, date, code, crewId]);
          if (r.affectedRows) removed++;
        }
      }
    }

    await audit.record(req, { table: 'meal_services', id: rrId, action: 'update',
      after: { running_room_id: rrId, service_date: date, added, removed } });
    res.redirect(`${cfg.basePath}/records/meals?rr=${rrId}&date=${date}`);
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------- linen stock */
/**
 * How much linen the running room actually holds, by item.
 *
 * The daily register counts flows -- issued today, sent to wash today. This
 * counts the stock behind them, which is what the tender's minimum-stock
 * condition is about and what a shortage looks like before anybody is short.
 *
 * The table has existed since stage 6 and never had a screen, so no figure has
 * ever been entered. A count is dated: entering today's does not overwrite last
 * month's, so a stock that has been quietly falling can be seen falling.
 */
/* THE ITEMS ARE THE CONTRACT'S ITEMS, NOT A LIST KEPT BY HAND HERE.
   This screen carried its own array of six, written at stage 6 from the
   earlier tender paper. When IGP's executed contract was read in at stage 36
   it named SEVEN — a mattress cover and a blanket cover among them — and the
   daily register and the laundry register both picked them up, because both
   build their item list from `linen_schedule`. This one did not, so linen the
   contract prices could be sent to the wash and never counted in stock.

   Found by the officer: "in linen we have items as per new pdf. that one not
   done in linen stock."

   A hand-kept copy of a contract's list is a second place for it to be wrong,
   and this is the second time that has cost something on this very screen.
   The list now comes from the room's own contract where it has one, and from
   the generic rows where it has not — the same rule every other governed table
   follows. `other` is dropped: it is a bucket for the wash register, not a
   thing the Railway issues and counts. */
async function linenItemsFor(runningRoomId) {
  const rows = (await terms.scopedRows(db, await terms.contractIdFor(db, runningRoomId),
    (scope, p) => [`
    SELECT item_type, name FROM linen_schedule
    WHERE ${scope} AND is_active = 1 ORDER BY sort_order, id`, p])).rows;
  const kept = rows.filter(r => r.item_type !== 'other');
  return kept.length ? kept.map(r => [r.item_type, r.name]) : [['bedsheet', 'Bed sheet']];
}

router.get('/linen-stock', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    /* Each building keeps its own linen, so what the Railway issued and what
       has been written off are the building's facts too. */
    const blocks = await blocksOf(rr.id);
    const blockId = blocks.length ? await blockIdFor(rr.id, req.query.block) : null;
    /* RECORDS MADE BEFORE THE RUNNING ROOM HAD BUILDINGS.
       Igatpuri gained four buildings on 4 September. Everything recorded
       before that carries no building — and once these screens began
       REQUIRING one before they would show anything, those rows became
       unreachable: not viewable, not correctable, not closable. A bed sheet
       sent to the wash on 3 September was still out, and no screen in the
       system could reach it, because it belongs to no building anybody can
       select.

       Found in the officer's own data, by his instinct to check the register
       before changing the arithmetic: "we did some test other day also. do we
       deleted those or showing in this? have a check."

       At IGP that was test data. The mechanism is not: LNL already stands in
       two buildings, and any running room that gains them later would lose
       sight of its whole history in the same way, silently.

       So "no building" is a place you can LOOK. It is not a place you can
       WRITE: recording still demands a building, because a round is done in
       one and linen sits on one shelf. Read to close it out, not to carry on
       using it. */
    const viewNone = blocks.length > 0 && req.query.block === 'none';
    const orphans = blocks.length
      ? await db.scalar(`SELECT COUNT(*) FROM linen_stock WHERE running_room_id = ? AND block_id IS NULL`, [rr.id])
      : 0;
    const needBlock = blocks.length > 0 && !blockId && !viewNone;
    const block = blocks.find(b => b.id === blockId) || null;
    const bk = blockId || 0;

    const all = await db.query(`
      SELECT s.*, u.full_name AS counted_by_name
      FROM linen_stock s LEFT JOIN users u ON u.id = s.counted_by
      WHERE s.running_room_id = ? AND COALESCE(s.block_id,0) = ?
      ORDER BY s.as_on_date DESC, s.item_type`, [rr.id, bk]);

    // The latest issue figure for each item. What the Railway gave a running
    // room is not re-counted weekly; it changes when a consignment arrives.
    const latest = {}, previous = {};
    for (const row of all) {
      if (!latest[row.item_type]) latest[row.item_type] = row;
      else if (!previous[row.item_type]) previous[row.item_type] = row;
    }

    /* THE THREE POOLS THAT ARE NOT TYPED HERE.
       Each comes from the register that owns the event. Typing them a second
       time on this screen is what made a mismatch possible, and a mismatch
       between two records of one fact is unresolvable — there is nothing to
       say which is right on the day they differ. */

    // AT THE WASH — open consignments on the laundry register.
    const outRows = await db.query(`
      SELECT item_type, SUM(quantity_sent - quantity_returned) AS qty
      FROM laundry_dispatch
      WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND quantity_returned < quantity_sent
      GROUP BY item_type`, [rr.id, bk]);
    const atLaundry = {}; outRows.forEach(r => { atLaundry[r.item_type] = +r.qty; });

    /* FRESH ON THE SHELF — the book figure, from the one module that works it
       out. This screen used to read the daily register's most recent
       fresh_in_hand, which is how it could show a shelf figure days old and
       call the difference unaccounted. It now asks the same question the daily
       screen asks, of the same code, and gets the same answer by construction. */
    const LINEN_ITEMS = await linenItemsFor(rr.id);
    const bookBy = await shelfBook(db, rr.id, bk, LINEN_ITEMS.map(x => x[0]), today());

    /* IN USE — issued and not yet sent to be washed.
       Counted over a window, not over all time: linen issued three months ago
       and never sent to the wash was not "in use" for three months, it was
       lost track of, and adding it here would hide that inside a legitimate
       pool. The window is the same one the daily screen uses for soiled linen,
       so the two screens cannot say different things. */
    const inUseRows = await db.query(`
      SELECT item_type, SUM(issued) AS qty FROM linen_daily_item
      WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND issued IS NOT NULL
        AND record_date >= DATE_SUB(?, INTERVAL ? DAY)
      GROUP BY item_type`, [rr.id, bk, today(), SOILED_WINDOW]);
    /* ONLY A DISPATCH OF USED LINEN TAKES LINEN OUT OF USE.
       A dispatch from the shelf never was on a bed, so subtracting it here
       counts it against the wrong pool and empties `in use` -- which showed up
       the first time a shelf dispatch was made: 600 issued, 40 on beds, 100 at
       the wash, and the screen reported 40 unaccounted while all 592 were
       exactly where the register said they were. Every pool must be counted
       out of the pool the movement actually left. */
    const sentWindow = await db.query(`
      SELECT item_type, SUM(quantity_sent) AS qty FROM laundry_dispatch
      WHERE running_room_id = ? AND COALESCE(block_id,0) = ?
        AND dispatch_date >= DATE_SUB(?, INTERVAL ? DAY) AND from_pool = 'used'
      GROUP BY item_type`, [rr.id, bk, today(), SOILED_WINDOW]);
    const issuedW = {}, sentW = {};
    inUseRows.forEach(r => { issuedW[r.item_type] = +r.qty; });
    sentWindow.forEach(r => { sentW[r.item_type] = +r.qty; });

    // WRITTEN OFF — one event apiece, with a date and a reason.
    const woRows = await db.query(`
      SELECT item_type, reason, from_pool, SUM(quantity) AS qty
      FROM linen_written_off WHERE running_room_id = ? AND COALESCE(block_id,0) = ?
      GROUP BY item_type, reason, from_pool`, [rr.id, bk]);
    const written = {};
    woRows.forEach(r => {
      const w = written[r.item_type] || (written[r.item_type] = { total: 0, condemned: 0, lost: 0, damaged: 0 });
      w.total += +r.qty; w[r.reason] += +r.qty;
    });
    const recentWriteOffs = await db.query(`
      SELECT w.*, u.full_name AS by_name FROM linen_written_off w
      LEFT JOIN users u ON u.id = w.recorded_by
      WHERE w.running_room_id = ? AND COALESCE(w.block_id,0) = ?
      ORDER BY w.written_off_on DESC, w.id DESC LIMIT 25`, [rr.id, bk]);

    const items = LINEN_ITEMS.map(([code, label]) => {
      const l = latest[code] || null;
      const w = written[code] || { total: 0, condemned: 0, lost: 0, damaged: 0 };
      const issued = l ? +l.issued_by_railway : null;
      const b = bookBy[code] || {};
      const shelf = b.book === undefined ? null : b.book;
      const wash = atLaundry[code] || 0;
      const inUse = Math.max(0, (issuedW[code] || 0) - (sentW[code] || 0));
      // Accounted for only where the shelf figure exists. Without it the sum
      // is not "less than it should be", it is UNKNOWN, and saying 131 are
      // missing because nobody has counted the shelf yet would be a false
      // accusation printed by a machine.
      const held = shelf === null ? null : shelf + inUse + wash;
      const usable = issued === null ? null : issued - w.total;
      return {
        code, label, latest: l, previous: previous[code] || null,
        issued, writtenOff: w, shelf,
        // What the shelf figure rests on: the position last accepted, and when.
        shelfOn: b.baseline ? b.baseline.on : null,
        shelfSource: b.baseline ? b.baseline.source : null,
        // Whether that position is an accepted count or the nought the shelf
        // held before the Railway issued anything. The screen says which.
        shelfImplicit: !!(b.baseline && b.baseline.implicit),
        count: b.count || null, discrepancy: b.discrepancy === undefined ? null : b.discrepancy,
        inUse, wash, held, usable,
        unaccounted: (usable === null || held === null) ? null : usable - held,
      };
    });

    const dates = [...new Set(all.map(r => String(r.as_on_date).slice(0, 10)))].slice(0, 12);
    res.render('records/linen-stock', { title: 'Linen stock', section: 'linen-stock',
      rooms, rr, date, items, dates, all, recentWriteOffs,
      blocks, block, blockId, needBlock, viewNone, orphans,
      soiledWindow: SOILED_WINDOW, maxDate: today(),
      issued: req.query.issued ? +req.query.issued : null,
      wroff: req.query.wroff ? +req.query.wroff : null });
  } catch (e) { next(e); }
});

/* WHAT THE RAILWAY ISSUED. Not a periodic re-count of everything — a
   consignment arriving from stores, dated. The other three pools are read
   from the registers that own them and cannot be typed here at all. */
router.post('/linen-stock', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const asOn = String(req.body.as_on_date || today()).slice(0, 10);
    if (asOn > today()) { const e = new Error('A stock count cannot be dated in the future.'); e.status = 400; throw e; }

    const postBlocks = await blocksOf(rrId);
    const postBlockId = postBlocks.length ? await blockIdFor(rrId, req.body.block) : null;
    if (postBlocks.length && !postBlockId) {
      const e = new Error('Which building? Each keeps its own linen.'); e.status = 400; throw e;
    }

    const n = k => Math.max(0, parseInt(req.body[k], 10) || 0);
    let saved = 0;
    for (const [code] of await linenItemsFor(rrId)) {
      // An item nobody entered is left alone rather than written as zero. Zero
      // is a statement -- "there are none" -- and it is not the same as silence.
      if (String(req.body[`${code}_issued`] || '').trim() === '') continue;
      await db.execute(`
        INSERT INTO linen_stock (running_room_id, block_id, item_type, issued_by_railway,
          as_on_date, counted_by, remarks)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE issued_by_railway=VALUES(issued_by_railway),
          counted_by=VALUES(counted_by), remarks=VALUES(remarks)`,
        [rrId, postBlockId, code, n(`${code}_issued`), asOn, req.user.id,
         String(req.body.remarks || '').trim().slice(0, 300) || null]);
      saved++;
    }
    await audit.record(req, { table: 'linen_stock', id: rrId, action: 'update',
      after: { running_room_id: rrId, as_on_date: asOn, items: saved } });
    const blk = postBlockId ? `&block=${postBlockId}` : '';
    res.redirect(`${cfg.basePath}/records/linen-stock?rr=${rrId}${blk}&issued=${saved}`);
  } catch (e) { next(e); }
});

/* A WRITE-OFF IS AN EVENT, with a date, a reason and the pool it left.
   The old screen carried a cumulative "condemned" figure that was re-typed at
   each count: it could not say when eleven sheets went, or why, and correcting
   it meant rewriting history. */
router.post('/linen-stock/write-off', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const on = String(req.body.written_off_on || today()).slice(0, 10);
    if (on > today()) { const e = new Error('A write-off cannot be dated in the future.'); e.status = 400; throw e; }

    const postBlocks = await blocksOf(rrId);
    const postBlockId = postBlocks.length ? await blockIdFor(rrId, req.body.block) : null;
    if (postBlocks.length && !postBlockId) {
      const e = new Error('Which building? Each keeps its own linen.'); e.status = 400; throw e;
    }

    const qty = Math.max(0, parseInt(req.body.quantity, 10) || 0);
    if (!qty) { const e = new Error('Nothing was entered. A write-off needs a quantity.'); e.status = 400; throw e; }

    const allowed = (await linenItemsFor(rrId)).map(x => x[0]);
    const item = allowed.includes(req.body.item_type) ? req.body.item_type : null;
    if (!item) { const e = new Error('That item is not on this running room\'s contract.'); e.status = 400; throw e; }
    const reason = ['condemned', 'lost', 'damaged'].includes(req.body.reason) ? req.body.reason : 'condemned';
    const pool = ['shelf', 'in_use', 'at_laundry', 'unknown'].includes(req.body.from_pool)
      ? req.body.from_pool : 'unknown';

    const r = await db.execute(`
      INSERT INTO linen_written_off (running_room_id, block_id, item_type, written_off_on,
        quantity, reason, from_pool, authority, remarks, recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [rrId, postBlockId, item, on, qty, reason, pool,
       String(req.body.authority || '').trim().slice(0, 160) || null,
       String(req.body.remarks || '').trim().slice(0, 300) || null, req.user.id]);

    await audit.record(req, { table: 'linen_written_off', id: r.insertId || rrId, action: 'insert',
      after: { running_room_id: rrId, item_type: item, quantity: qty, reason, from_pool: pool, on } });
    const blk2 = postBlockId ? `&block=${postBlockId}` : '';
    res.redirect(`${cfg.basePath}/records/linen-stock?rr=${rrId}${blk2}&wroff=${qty}`);
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------- linen */
/**
 * The running room supervisor's daily linen page.
 *
 * The day's linen is three different kinds of fact and they are kept apart:
 *
 *   what he handled and holds   issued today, fresh in hand now — per item,
 *                               written here. This is the thing he can see by
 *                               looking at his shelf and his day.
 *   what the wash cycle did     sent out and come back — per item, per vendor,
 *                               with the invoice. Shown here, but written by
 *                               the laundry record, because a dispatch is an
 *                               event with a challan behind it and it does not
 *                               happen every day.
 *   what the room owns          the periodic full count, on the linen stock
 *                               page. Linked, not repeated.
 *
 * One fact, one writer. The supervisor still does his whole day on this page:
 * the laundry entry is here too, it just saves to the laundry record.
 *
 * See migration 032 for why this is not one flat row of numbers any more.
 */
// Seven items, in the executed contract's own order. This list carried five:
// the mattress cover and the blanket cover had nowhere to be counted, and
// 'Blankets' was doing duty for the woollen blanket and its cover at once —
// two separately priced, separately washed, separately recovered items.
// See db/seeds/11_linen_schedule.sql for the contract's own table.
/* The daily register's items come from the same place the stock page's do:
   the running room's own contract. It happened to match IGP's seven because it
   was rewritten by hand when that contract was read in — which is precisely
   the arrangement that let the stock page fall a contract behind and nobody
   notice. Two hand-kept copies of one list is one too many; three was what we
   had. `other` is kept here, because a supervisor does hand out something the
   schedule does not name and the register should be able to say so. */
async function dailyLinenItemsFor(runningRoomId) {
  const rows = (await terms.scopedRows(db, await terms.contractIdFor(db, runningRoomId),
    (scope, p) => [`
    SELECT item_type, name FROM linen_schedule
    WHERE ${scope} AND is_active = 1 ORDER BY sort_order, id`, p])).rows;
  return rows.length ? rows.map(r => [r.item_type, r.name]) : [['bedsheet', 'Bed sheet']];
}

// Schedule C: a minimum of two sets of washed linen — bedsheets and pillow
// covers, named in the clause — readily available at all times. Read here as
// two per sanctioned bed. The screen prints this arithmetic beside the result
// rather than showing a bare flag, so a wrong reading of the clause argues with
// the supervisor instead of hiding behind him.
const MIN_SETS = 2;
const MIN_STOCK_ITEMS = ['bedsheet', 'pillow_cover'];
/* HOW OFTEN THE SHELF MUST BE COUNTED against the ledger. Seven days, the
   officer's decision: often enough to catch drift while it is still a few
   pieces, light enough that it actually happens. Nothing in the contract sets
   this -- it is the Railway's own control over its own register, and it is one
   number here rather than a habit at 44 running rooms. */
/* THE BUILDINGS A RUNNING ROOM STANDS IN, and the one being worked in now.
   Forty-three of the forty-five are a single building and this returns empty,
   which is the answer: no screen should ask a question that has one answer. */
async function blocksOf(runningRoomId) {
  return db.query(`
    SELECT id, code, name, total_beds, bathrooms, toilets, kitchens
    FROM running_room_blocks
    WHERE running_room_id = ? AND is_active = 1 ORDER BY sort_order, id`, [runningRoomId]);
}

/* A building id that arrives in a query string or a form field is checked
   against the running room before it is used. Without this, a posted block_id
   could file Igatpuri's morning round under a Lonavla building and every
   per-building figure after it would be quietly wrong. */
async function blockIdFor(runningRoomId, raw) {
  const id = +raw;
  if (!Number.isInteger(id) || id < 1) return null;
  const ok = await db.one(
    'SELECT id FROM running_room_blocks WHERE id = ? AND running_room_id = ? AND is_active = 1',
    [id, runningRoomId]);
  return ok ? id : null;
}

const COUNT_EVERY_DAYS = 7;
/* HOW LONG LINEN IS TREATED AS "IN USE" after it is issued and before it goes
   to the wash. Seven days. Both the daily register and the stock page read
   this one number: if they used different windows they would print different
   figures for the same pool, on the same day, from the same rows. Linen issued
   longer ago than this and never sent to the wash has not been in use for a
   month — it has been lost track of, and the stock page shows it as
   unaccounted rather than hiding it inside a legitimate pool. */
const SOILED_WINDOW = 7;

/* STRUCK AGAINST THE BOOK FIGURE, not against the last count. The officer's
   ruling, and the reason is the direction of the error: the book is always
   current, so a shortfall is seen the day it happens. Testing the last count
   instead would be right whenever it fired and a week late in firing, and a
   two-days'-stock condition that reports a shortage next Tuesday has not
   reported it. Where nothing has ever been accepted the book has no start, and
   the condition is UNTESTED -- which is neither a pass nor a failure, and the
   screen says so rather than printing a green tick over an unknown. */
function minStockCheck(beds, bookByItem) {
  const need = MIN_SETS * (beds || 0);
  const parts = MIN_STOCK_ITEMS.map(code => {
    const b = bookByItem[code];
    const have = b && b.book !== null ? b.book : null;
    return { code, need, have,
             ok: have === null ? null : have >= need };
  });
  const known = parts.filter(p => p.ok !== null);
  return { need, beds: beds || 0, sets: MIN_SETS, parts,
           met: known.length ? known.every(p => p.ok) : null };
}

router.get('/linen', async (req, res, next) => {
  try {
    /* THE LINEN PAGE OPENS ON YESTERDAY, and it is the only record screen that
       does. The supervisor is on the day shift; linen goes out to crews around
       the clock, and he writes the whole of a day up the following morning
       because that is the first moment the day is finished. Opening on today
       would put him on a day that has barely started, with the day he is
       actually holding a pen for reachable only by hand-editing the address.

       Every other record screen -- the muster, the cleaning rounds -- is filled
       as the thing happens and rightly opens on today. This is not a system
       default; it is one screen matching one man's shift. */
    const { rooms, rr } = await context(req);
    /* A DAY THAT HAS NOT HAPPENED IS NOT AN ERROR PAGE.
       The date box stops the picker offering a future day, but a date can still
       be typed, and typing one used to render the page for it happily and then
       throw a 400 with a full error screen the moment he pressed Save. The
       register was right to refuse -- it is the SCREEN that was wrong. A day
       that has not finished cannot be recorded against, and saying so on the
       page, on the nearest day he can actually use, is the whole of what was
       needed. The POST still refuses a future date: a guard on the screen is a
       courtesy, and the one on the register is the rule. */
    const asked = (req.query.date || shift(today(), -1)).slice(0, 10);
    const future = asked > today() ? asked : null;
    const date = future ? today() : asked;
    /* WHICH BUILDING'S LINEN. Each of Igatpuri's four keeps its own store, so
       the shelf, the day's issues and the two-days'-stock rule are all facts
       about a building — 2 x 44 beds at LP Mail is not 2 x 131. Where a
       running room is one building this is null throughout and the screen
       never mentions buildings. */
    const blocks = await blocksOf(rr.id);
    const blockId = blocks.length ? await blockIdFor(rr.id, req.query.block) : null;
    /* RECORDS MADE BEFORE THE RUNNING ROOM HAD BUILDINGS.
       Igatpuri gained four buildings on 4 September. Everything recorded
       before that carries no building — and once these screens began
       REQUIRING one before they would show anything, those rows became
       unreachable: not viewable, not correctable, not closable. A bed sheet
       sent to the wash on 3 September was still out, and no screen in the
       system could reach it, because it belongs to no building anybody can
       select.

       Found in the officer's own data, by his instinct to check the register
       before changing the arithmetic: "we did some test other day also. do we
       deleted those or showing in this? have a check."

       At IGP that was test data. The mechanism is not: LNL already stands in
       two buildings, and any running room that gains them later would lose
       sight of its whole history in the same way, silently.

       So "no building" is a place you can LOOK. It is not a place you can
       WRITE: recording still demands a building, because a round is done in
       one and linen sits on one shelf. Read to close it out, not to carry on
       using it. */
    const viewNone = blocks.length > 0 && req.query.block === 'none';
    const orphans = blocks.length
      ? await db.scalar(`SELECT COUNT(*) FROM linen_daily_item WHERE running_room_id = ? AND block_id IS NULL`, [rr.id])
      : 0;
    const needBlock = blocks.length > 0 && !blockId && !viewNone;
    const block = blocks.find(b => b.id === blockId) || null;
    const bk = blockId || 0;
    // The bed count the minimum-stock rule is struck against: the building's
    // where there is one, the running room's where there is not.
    const bedsHere = block ? block.total_beds : rr.total_beds;

    const days = await db.query(`
      SELECT * FROM linen_daily WHERE running_room_id = ? AND COALESCE(block_id,0) = ?
      ORDER BY record_date DESC LIMIT 14`, [rr.id, bk]);
    const dayOf = d => days.find(r => String(r.record_date).slice(0, 10) === d) || null;
    const todayRow = dayOf(date);
    const prevDay = days.find(r => String(r.record_date).slice(0, 10) < date) || null;

    // Item rows for the fortnight in one read, so the history table can show
    // per-item figures without a query per day.
    const itemRows = await db.query(`
      SELECT * FROM linen_daily_item
      WHERE running_room_id = ? AND COALESCE(block_id,0) = ?
        AND record_date >= DATE_SUB(?, INTERVAL 20 DAY)`, [rr.id, bk, date]);
    const byDate = {};
    for (const r of itemRows) {
      const d = String(r.record_date).slice(0, 10);
      (byDate[d] || (byDate[d] = {}))[r.item_type] = r;
    }
    const todayItems = byDate[date] || {};
    // prevItems is gone: the ledger no longer chains one day to the next.

    // The wash cycle for this date, from the record that owns it. Sent is dated
    // by dispatch; back is dated by return, and the two are rarely the same day
    // — which is exactly why one "fresh received" number could never be tied to
    // the dispatch it belonged to.
    const sentToday = await db.query(`
      SELECT ld.item_type, SUM(ld.quantity_sent) AS qty, COUNT(*) AS n
      FROM laundry_dispatch ld
      WHERE ld.running_room_id = ? AND COALESCE(ld.block_id,0) = ? AND ld.dispatch_date = ?
      GROUP BY ld.item_type`, [rr.id, bk, date]);
    const backToday = await db.query(`
      SELECT ld.item_type, SUM(ld.quantity_returned) AS qty
      FROM laundry_dispatch ld
      WHERE ld.running_room_id = ? AND COALESCE(ld.block_id,0) = ? AND ld.returned_on = ?
      GROUP BY ld.item_type`, [rr.id, bk, date]);
    const sentBy = {}; sentToday.forEach(r => { sentBy[r.item_type] = +r.qty; });

    /* WHAT HAS ALREADY GONE TO THE WASH TODAY, whatever day this page is on.
       The officer saw the risk before the page did: "if supervisor sends 20
       bedsheets from daily records, later on he comes to facility page and
       forgot the earlier entry and again makes those 20 bedsheets for send to
       wash. possible right? because no record shows today's sent items."

       It became likelier the day this screen started opening on YESTERDAY: the
       column beside each item shows the page's day, so a challan raised this
       morning is nowhere on the screen where the send box is. The send card now
       says what has already gone today, next to the box that would send it
       again. */
    const sentOnToday = date === today() ? sentToday : await db.query(`
      SELECT ld.item_type, SUM(ld.quantity_sent) AS qty, COUNT(*) AS n
      FROM laundry_dispatch ld
      WHERE ld.running_room_id = ? AND COALESCE(ld.block_id,0) = ? AND ld.dispatch_date = ?
      GROUP BY ld.item_type`, [rr.id, bk, today()]);
    const backBy = {}; backToday.forEach(r => { backBy[r.item_type] = +r.qty; });

    // Everything still out at the wash, oldest first — the return form works
    // off this, so a return is always recorded against the dispatch it came
    // from rather than as a loose number.
    const outstanding = await db.query(`
      SELECT ld.*, v.name AS vendor_name, v.is_approved,
             DATEDIFF(?, ld.dispatch_date) AS days_out
      FROM laundry_dispatch ld LEFT JOIN vendors v ON v.id = ld.vendor_id
      WHERE ld.running_room_id = ? AND COALESCE(ld.block_id,0) = ?
        AND ld.quantity_returned < ld.quantity_sent
      /* HOW LONG A CONSIGNMENT HAS BEEN OUT IS MEASURED TO TODAY, always, and
         never to the day being written up. Clause C6 runs on the wall clock: a
         bundle sent on Monday and still out on Thursday is three days out
         whatever page anybody is looking at. Measuring it to the page's date
         would understate the age by exactly as many days as the supervisor is
         behind -- which is the unsafe direction, and would arrive the day this
         screen started opening on yesterday. */
      ORDER BY ld.dispatch_date, ld.id`, [today(), rr.id, bk]);

    /* CLAUSE C6 — failure to supply linen after washing beyond 48 hours.
     *
     * Until now the page printed the age of a consignment as a grey aside past
     * two days and said nothing about what that means. It is a named breach in
     * Schedule C with a rate against it, and the running room is the only place
     * it can be seen: nobody reviewing the month can know a bundle sat at the
     * laundry unless the day it went out is on record with the day it came back.
     *
     * DATEDIFF counts whole dates, not hours, so a consignment sent yesterday
     * morning and still out this evening reads as 1. Flagging at strictly more
     * than two days means the flag is raised only when the 48 hours have
     * certainly passed, never merely arguably. The application does not raise
     * the deficiency itself and computes no money — it puts the fact in front
     * of the officer who does. */
    const C6_DAYS = 2;
    outstanding.forEach(d => { d.overdue = d.days_out > C6_DAYS; });
    const overdue = outstanding.filter(d => d.overdue);

    const vendors = await db.query(
      `SELECT id, name, is_approved FROM vendors WHERE vendor_type = 'laundry' AND is_active = 1 ORDER BY name`);
    const vendor = await db.one(`
      SELECT v.* FROM running_room_vendors rv JOIN vendors v ON v.id = rv.vendor_id
      WHERE rv.running_room_id = ? AND rv.service_type = 'laundry'
        AND (rv.effective_to IS NULL OR rv.effective_to >= CURDATE())
      ORDER BY rv.effective_from DESC LIMIT 1`, [rr.id]);

    /* WHAT GOES TO THE WASH IS NOT WHAT IS ON THE SHELF.
     *
     * The shelf holds washed linen waiting to be issued. What the laundry man
     * takes away is the soiled pile stripped off the beds — a different heap
     * entirely, and one no register counts directly. Showing the fresh stock
     * beside the dispatch box, as this page did when the grid was first built,
     * invites the wrong comparison and would have questioned a perfectly
     * ordinary dispatch.
     *
     * The honest figure to put beside the box is how much has been issued and
     * not yet sent to be washed: what came off the beds this week and has not
     * gone anywhere. It is approximate — linen is stripped a day or two after
     * it is issued, and a room that has just started keeping the register has
     * no history behind it — so it is shown as context and nothing hangs on it.
     */
    const from = new Date(Date.parse(date + 'T00:00:00Z') - (SOILED_WINDOW - 1) * 86400000)
      .toISOString().slice(0, 10);
    const issuedWeek = {};
    for (const r of itemRows) {
      const d = String(r.record_date).slice(0, 10);
      if (d < from || d > date || r.issued === null) continue;
      issuedWeek[r.item_type] = (issuedWeek[r.item_type] || 0) + r.issued;
    }
    // Used linen only, for the reason given on the stock screen: a dispatch
    // from the shelf was never on a bed and cannot reduce what is on the beds.
    const sentWeekRows = await db.query(`
      SELECT item_type, SUM(quantity_sent) AS qty FROM laundry_dispatch
      WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND dispatch_date BETWEEN ? AND ?
        AND from_pool = 'used'
      GROUP BY item_type`, [rr.id, bk, from, date]);
    const sentWeek = {}; sentWeekRows.forEach(r => { sentWeek[r.item_type] = +r.qty; });

    /* The one hard ceiling worth having: the room cannot send more pieces than
     * the Railway ever gave it. That is not a judgement about how much linen
     * ought to go out, it is arithmetic — and it catches 400 typed for 40. */
    const stockRows = await db.query(`
      SELECT s.item_type, s.issued_by_railway
      FROM linen_stock s
      JOIN (SELECT item_type, MAX(as_on_date) AS d FROM linen_stock
             WHERE running_room_id = ? AND COALESCE(block_id,0) = ? GROUP BY item_type) l
        ON l.item_type = s.item_type AND l.d = s.as_on_date
      WHERE s.running_room_id = ? AND COALESCE(s.block_id,0) = ?`, [rr.id, bk, rr.id, bk]);
    const holding = {}; stockRows.forEach(r => { holding[r.item_type] = r.issued_by_railway; });

    /* THE BOOK FIGURE, from the one place that works it out.
       Nothing on this screen computes a shelf figure any more. The daily
       register, the stock reconciliation and the two-days'-stock test all ask
       src/lib/linen-book.js, so they cannot say different things about the
       same shelf on the same day -- which they could, and once did. */
    const DAILY_LINEN_ITEMS = await dailyLinenItemsFor(rr.id);
    const codes = DAILY_LINEN_ITEMS.map(x => x[0]);
    const bookBy = await shelfBook(db, rr.id, bk, codes, date);

    const dayMs = 86400000, atMs = Date.parse(date + 'T00:00:00Z');
    const items = DAILY_LINEN_ITEMS.map(([code, label]) => {
      const row = todayItems[code] || null;
      const b = bookBy[code];
      const issued = row && row.issued !== null ? +row.issued : 0;
      /* HOW LONG THE ROOM HAS BEEN RUNNING ON ARITHMETIC ALONE.
         Measured from the last count, not from the last accepted one: a count
         taken and not yet accepted still means somebody looked at the shelf. */
      const countDue = b.count === null || b.countAge > COUNT_EVERY_DAYS;
      return {
        code, label, row,
        book: b.book, baseline: b.baseline, since: b.since, moves: b.moves,
        count: b.count, countBook: b.countBook, discrepancy: b.discrepancy,
        countAge: b.countAge, countDue, disturbed: b.disturbed,
        /* A COUNT NOBODY HAS ACCEPTED is the one thing on this screen that
           needs an officer. Until it is accepted the book carries on from the
           older position and the difference stands unexplained. */
        pending: b.count && !b.count.acceptedOn ? b.count : null,
        sent: sentBy[code] || 0, back: backBy[code] || 0,
        issuedToday: issued,
        // Issued this week and not yet sent to be washed.
        soiled: Math.max(0, (issuedWeek[code] || 0) - (sentWeek[code] || 0)),
        holding: holding[code] === undefined ? null : holding[code],
      };
    });
    const countOverdue = items.filter(i => i.countDue);

    res.render('records/linen', { title: 'Linen record', section: 'linen',
      rooms, rr, date, days, byDate, todayRow, prevDay, items,
      itemDefs: DAILY_LINEN_ITEMS,
      check: minStockCheck(bedsHere, bookBy),
      pendingCounts: items.filter(i => i.pending),
      blocks, block, blockId, needBlock, viewNone, orphans, bedsHere,
      outstanding, overdue, c6Days: C6_DAYS,
      overduePieces: overdue.reduce((a, d) => a + (d.quantity_sent - d.quantity_returned), 0),
      vendors, vendor,
      soiledWindow: SOILED_WINDOW, soiledFrom: from, maxDate: today(),
      yesterday: shift(today(), -1), future,
      sentOnToday, sentOnTodayTotal: sentOnToday.reduce((a, r) => a + +r.qty, 0),
      countEvery: COUNT_EVERY_DAYS, countOverdue,
      saved: req.query.saved ? +req.query.saved : null,
      counted: req.query.counted ? +req.query.counted : null,
      accepted: req.query.accepted || null,
      sent: req.query.sent ? +req.query.sent : null });
  } catch (e) { next(e); }
});

router.post('/linen', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    if (date > today()) { const e = new Error('The linen register cannot be filled for a future date.'); e.status = 400; throw e; }

    /* THE BUILDING IS RE-CHECKED HERE, not trusted from the form. Without it a
       posted block_id could file Igatpuri's bed sheets under a Lonavla
       building, and the ledger would then be worked out from an opening figure
       belonging to somewhere else. */
    const postBlocks = await blocksOf(rrId);
    const postBlockId = postBlocks.length ? await blockIdFor(rrId, req.body.block) : null;
    if (postBlocks.length && !postBlockId) {
      const e = new Error('Which building? Each keeps its own linen, so the register cannot '
        + 'take a count without one.');
      e.status = 400; throw e;
    }
    const bk = postBlockId || 0;

    // An empty box is silence, not zero. Only what he actually wrote is saved.
    const num = k => {
      const raw = String(req.body[k] === undefined ? '' : req.body[k]).trim();
      if (raw === '') return null;
      const v = parseInt(raw, 10);
      return Number.isFinite(v) && v >= 0 ? v : null;
    };

    /* WHAT THIS FORM SAVES NOW: the day's issues, and nothing about the shelf.
       It used to save a shelf figure too, and that was the fault -- a number
       written down at one moment and then asked to stand for a balance that
       goes on moving all day. The shelf figure is worked out on the way out
       (src/lib/linen-book.js) and cannot be typed here at any price. Counting
       the shelf is a different act on a different form, because it is a
       different kind of fact. */

    let saved = 0;
    const DAILY_LINEN_ITEMS = await dailyLinenItemsFor(rrId);
    for (const [code] of DAILY_LINEN_ITEMS) {
      const issued = num(`issued_${code}`);
      // An empty box is silence. Leave whatever was there alone rather than
      // blanking it -- a supervisor correcting the bedsheet figure at noon must
      // not silently erase the morning's blanket figure.
      if (issued === null) continue;
      await db.execute(`
        INSERT INTO linen_daily_item (running_room_id, block_id, record_date, item_type, issued)
        VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE issued=VALUES(issued)`,
        [rrId, postBlockId, date, code, issued]);
      saved++;
    }

    // Re-read rather than trust the form, so the flag reflects the register.
    // It is read from the book, after the save, by the one module that works
    // the book out -- so the flag stored on the day cannot disagree with the
    // figure the screen prints beside it.
    const bookAfter = await shelfBook(db, rrId, bk, DAILY_LINEN_ITEMS.map(x => x[0]), date);
    /* The rule is struck against THIS BUILDING's beds. 2 x 44 at LP Mail is
       not 2 x 131, and holding Igatpuri's whole requirement in one building
       would pass a test the contract never set. */
    const rrRow = await db.one(`SELECT total_beds FROM running_rooms WHERE id = ?`, [rrId]);
    const bedsHere = postBlockId
      ? (postBlocks.find(b => b.id === postBlockId) || {}).total_beds || 0
      : (rrRow ? rrRow.total_beds : 0);
    const check = minStockCheck(bedsHere, bookAfter);

    await db.execute(`
      INSERT INTO linen_daily (running_room_id, block_id, record_date, min_stock_met,
        used_linen_reported, remarks, recorded_by)
      VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE min_stock_met=VALUES(min_stock_met),
        used_linen_reported=VALUES(used_linen_reported), remarks=VALUES(remarks),
        recorded_by=VALUES(recorded_by)`,
      [rrId, postBlockId, date, check.met === null ? null : (check.met ? 1 : 0),
       Math.max(0, parseInt(req.body.used_linen_reported, 10) || 0),
       String(req.body.remarks || '').trim().slice(0, 300) || null, req.user.id]);

    await audit.record(req, { table: 'linen_daily', id: rrId, action: 'update',
      after: { running_room_id: rrId, date, items: saved, min_stock_met: check.met } });
    const blk = postBlockId ? `&block=${postBlockId}` : '';
    res.redirect(`${cfg.basePath}/records/linen?rr=${rrId}&date=${date}${blk}&saved=${saved}`);
  } catch (e) { next(e); }
});

/* --------------------------------------------------- counting the shelf */
/**
 * A COUNT IS A SEPARATE ACT, ON A SEPARATE FORM, AND IT CHANGES NO FIGURE.
 *
 * Somebody stands at the shelf and says what is on it. That is recorded
 * against his name and the date, compared with the book, and the difference is
 * kept. Nothing about the book moves until an officer ACCEPTS the count --
 * which is the next handler, and belongs to the Railway.
 *
 * Why this is not a checkbox on the daily form any more: it was, and the
 * consequence was that a count and a day's work were saved by one press, so a
 * supervisor correcting his issues figure at four o'clock re-saved a count he
 * had taken at nine. The two facts have different lifetimes and must have
 * different buttons.
 */
router.post('/linen/count', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    if (date > today()) { const e = new Error('The shelf cannot be counted on a future date.'); e.status = 400; throw e; }
    const postBlocks = await blocksOf(rrId);
    const postBlockId = postBlocks.length ? await blockIdFor(rrId, req.body.block) : null;
    if (postBlocks.length && !postBlockId) {
      const e = new Error('Which building? Each keeps its own shelf, so a count cannot be '
        + 'recorded without one.'); e.status = 400; throw e;
    }
    const note = String(req.body.note || '').trim().slice(0, 300) || null;
    let counted = 0;
    for (const [code] of await dailyLinenItemsFor(rrId)) {
      const raw = String(req.body[`count_${code}`] === undefined ? '' : req.body[`count_${code}`]).trim();
      // Silence is not zero here either. An item he did not count is an item
      // with no count -- writing 0 would be a statement that the shelf is bare.
      if (raw === '') continue;
      const qty = parseInt(raw, 10);
      if (!Number.isFinite(qty) || qty < 0) continue;
      await db.execute(`
        INSERT INTO linen_count (running_room_id, block_id, item_type, counted_on,
          quantity, note, counted_by)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE quantity=VALUES(quantity), note=VALUES(note),
          counted_by=VALUES(counted_by), counted_at=CURRENT_TIMESTAMP,
          -- Correcting a count un-accepts it. The figure an officer agreed to
          -- is not the figure now on the row, and letting the acceptance stand
          -- would put his name to a number he never saw.
          accepted_on=NULL, accepted_by=NULL, accepted_at=NULL`,
        [rrId, postBlockId, code, date, qty, note, req.user.id]);
      counted++;
    }
    await audit.record(req, { table: 'linen_count', id: rrId, action: 'insert',
      after: { running_room_id: rrId, block_id: postBlockId, date, items: counted } });
    const blk = postBlockId ? `&block=${postBlockId}` : '';
    res.redirect(`${cfg.basePath}/records/linen?rr=${rrId}&date=${date}${blk}&counted=${counted}`);
  } catch (e) { next(e); }
});

/**
 * ACCEPTING A COUNT — the Railway agreeing that the shelf is what was counted.
 *
 * This is the only act in the whole linen story that moves the book, and it is
 * deliberately the hardest one to do by accident: a named permission, one
 * count at a time, and the discrepancy printed beside the button. Accepting
 * does not make the discrepancy go away -- the count and the book it differed
 * from both stay on the record. It says: from the close of that day, this is
 * the position the register carries forward.
 */
router.post('/linen/accept', requirePermission('linen.accept'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    const c = await db.one('SELECT * FROM linen_count WHERE id = ?', [+req.body.count]);
    if (!c || c.running_room_id !== rrId) {
      const e = new Error('That count does not belong to this running room.'); e.status = 404; throw e;
    }
    const on = String(c.counted_on).slice(0, 10);
    /* A DAY CANNOT BE SETTLED WHILE IT IS STILL RUNNING.
       The register knows a day's issues as one figure for the whole day, so a
       count can only ever mean the shelf at the CLOSE of its date. Accept
       today's count at nine in the morning and the forty sheets issued at noon
       would fall on the wrong side of the line -- which is precisely the fault
       that started this rebuild, reappearing one level up. There is no
       arithmetic that resolves it, because the register has no clock on an
       issue; so the day is left to finish. */
    if (on >= today()) {
      const e = new Error("A count can only be accepted once its day is over. The register "
        + "knows a day's issues as one figure for the whole day, so today's count cannot yet "
        + "be read as the closing position — accept it tomorrow.");
      e.status = 400; throw e;
    }
    await db.execute(`
      INSERT INTO linen_shelf_baseline (running_room_id, block_id, item_type, as_on_date,
        quantity, source, from_count_id, note, set_by)
      VALUES (?,?,?,?,?, 'count', ?,?,?)
      ON DUPLICATE KEY UPDATE quantity=VALUES(quantity), from_count_id=VALUES(from_count_id),
        source=VALUES(source), note=VALUES(note), set_by=VALUES(set_by), set_at=CURRENT_TIMESTAMP`,
      [rrId, c.block_id, c.item_type, on, c.quantity, c.id,
       String(req.body.note || '').trim().slice(0, 300) || null, req.user.id]);
    await db.execute(
      'UPDATE linen_count SET accepted_on = ?, accepted_by = ?, accepted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [today(), req.user.id, c.id]);
    await audit.record(req, { table: 'linen_shelf_baseline', id: c.id, action: 'update',
      after: { running_room_id: rrId, item_type: c.item_type, as_on_date: on,
               quantity: c.quantity, accepted_by: req.user.id } });
    const blk = c.block_id ? `&block=${c.block_id}` : '';
    res.redirect(`${cfg.basePath}/records/linen?rr=${rrId}&date=${date}${blk}&accepted=${c.item_type}`);
  } catch (e) { next(e); }
});

/* ----------------------------------------------------------------- cleaning */
/**
 * The daily cleaning record — Schedule C's own schedule, kept round by round.
 *
 * Clause A6, poor cleaning against schedule, is Rs 1000 a day and is the
 * largest recurring penalty in Schedule A. Until stage 26 nothing in RR-CMS
 * recorded whether a single round had happened, so an officer raising A6 had
 * only his recollection and a contractor who HAD kept the schedule had no way
 * to show it. Both halves of that matter.
 *
 * The unit is the ROUND, not the day, because that is what the tender buys:
 * the kitchen block three times, the bed rooms twice, each in a stated window.
 * A day carrying three rounds where five were due says so by arithmetic.
 *
 * A round done outside its window is recorded as done AND as late. Neither is
 * hidden and neither is judged here.
 */
// The contract's own words wherever it gives any. "Continuous" and "on need
// basis" are the contract's phrases, not a softening of a firmer rule.
const CLEAN_FREQ_LABEL = {
  twice_daily: 'twice a day', thrice_daily: 'three times a day',
  weekly_sunday: 'every Sunday', sunday_2_4: 'second and fourth Sunday',
  monthly: 'monthly',
  once_daily: 'once a day', continuous: 'continuous', weekly: 'once a week (Monday)',
  on_need: 'on need basis', per_meal: 'before and after every meal',
  morning_evening: 'morning and evening',
};

// Which of the schedule's rows fall due on a given date.
const WEEKLY_DEFAULT = 1;                 // Monday, where the room has not said
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dueOn(rows, dateStr, weekdays = {}) {
  const d = new Date(Date.parse(dateStr + 'T00:00:00Z'));
  const isSunday = d.getUTCDay() === 0;
  // Which Sunday of the month this is: the 1st..5th. The tender says the second
  // and the fourth, counting Sundays and not weeks, which is the ordinary
  // reading and the one a running room will use.
  const nthSunday = Math.floor((d.getUTCDate() - 1) / 7) + 1;
  return rows.filter(r => {
    switch (r.frequency) {
      // Every day, one row per round.
      case 'twice_daily': case 'thrice_daily': case 'once_daily':
      case 'morning_evening': case 'continuous': case 'per_meal': case 'on_need':
        return true;
      case 'weekly_sunday': return isSunday;
      case 'sunday_2_4':    return isSunday && (nthSunday === 2 || nthSunday === 4);
      /* The contract says "Once in Week" and names no day, so the day belongs
       * to the running room: sites hundreds of kilometres apart have their own
       * crew rosters and their own quiet days. `weekdays` carries what the
       * Railway has set for this room, item by item; Monday stands where nobody
       * has said. A hard-coded Monday would have called Wednesday's work late. */
      case 'weekly':        return d.getUTCDay() === (weekdays[r.id] ?? WEEKLY_DEFAULT);
      default:              return false;   // monthly — pest control keeps its own register
    }
  });
}

/**
 * A row that can never be OVERDUE, however long it goes unrecorded.
 *
 * The contract has three of these. "Continuous" floor mopping and "before and
 * generally after every meal" are obligations without a count, so a day with no
 * entry is a day nobody wrote anything down -- not a day the floor went unmopped
 * a specific number of times. "On need basis" is stronger still: a dining table
 * nobody needed cleaned was not a failure to clean it.
 *
 * They stay ON the register, because the contract bought them and the register
 * is the list of what was bought. They are simply never counted as outstanding,
 * which is the same rule the rest of RR-CMS follows: silence is not a finding.
 */
const NOT_COUNTED = new Set(['continuous', 'per_meal', 'on_need']);
const countsAsDue = r => !NOT_COUNTED.has(r.frequency);

// 'HH:MM' -> minutes, for comparing a finish time against its window.
const hhmm = t => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? (+m[1]) * 60 + (+m[2]) : null;
};

router.get('/cleaning', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    // The contract's own cleaning table where this room has one. IGP's runs to
    // 17 rows against the generic paper's 9, and names frequencies the generic
    // paper never had -- continuous mopping, "before and after every meal".
    const picked = await terms.scopedRows(db, await terms.contractIdFor(db, rr.id),
      (scope, p) => [`SELECT * FROM cleaning_schedule
                       WHERE is_active = 1 AND ${scope} ORDER BY sort_order`, p]);
    const schedule = picked.rows;
    const scheduleFromContract = picked.fromContract;
    /* WHICH BUILDING'S ROUND THIS IS.
       The rounds at Igatpuri are done in four buildings some distance apart by
       men who move between them. A register that pools all four says a round
       was done without saying where, and a round that was missed cannot be
       traced to a place — which is the only form in which it can be put right.
       Where a running room is one building this is null throughout and nothing
       on the screen mentions buildings at all. */
    const blocks = await blocksOf(rr.id);
    const blockId = blocks.length ? await blockIdFor(rr.id, req.query.block) : null;
    // With buildings on record, one must be chosen before the register can be
    // filled: "somewhere in Igatpuri" is not a place a round was done.
    /* RECORDS MADE BEFORE THE RUNNING ROOM HAD BUILDINGS.
       Igatpuri gained four buildings on 4 September. Everything recorded
       before that carries no building — and once these screens began
       REQUIRING one before they would show anything, those rows became
       unreachable: not viewable, not correctable, not closable. A bed sheet
       sent to the wash on 3 September was still out, and no screen in the
       system could reach it, because it belongs to no building anybody can
       select.

       Found in the officer's own data, by his instinct to check the register
       before changing the arithmetic: "we did some test other day also. do we
       deleted those or showing in this? have a check."

       At IGP that was test data. The mechanism is not: LNL already stands in
       two buildings, and any running room that gains them later would lose
       sight of its whole history in the same way, silently.

       So "no building" is a place you can LOOK. It is not a place you can
       WRITE: recording still demands a building, because a round is done in
       one and linen sits on one shelf. Read to close it out, not to carry on
       using it. */
    const viewNone = blocks.length > 0 && req.query.block === 'none';
    const orphans = blocks.length
      ? await db.scalar(`SELECT COUNT(*) FROM cleaning_log WHERE running_room_id = ? AND block_id IS NULL`, [rr.id])
      : 0;
    const needBlock = blocks.length > 0 && !blockId && !viewNone;
    const block = blocks.find(b => b.id === blockId) || null;

    const weekdayRows = await db.query(
      `SELECT schedule_id, weekday FROM cleaning_weekly_day
        WHERE running_room_id = ? AND COALESCE(block_id, 0) = ?`, [rr.id, blockId || 0]);
    const weekdays = {};
    weekdayRows.forEach(w => { weekdays[w.schedule_id] = w.weekday; });

    const dueAll = dueOn(schedule, date, weekdays);

    /* ONE ROUND AT A TIME.
     *
     * IGP's contract has 17 cleaning items and five of them are done more than
     * once a day, which made 25 rows: sweeping appeared three times before the
     * eye reached the second item, and filling the evening round meant scrolling
     * past the morning one. The register is filled three times a day by the man
     * who did that round, so it shows the round he is on.
     *
     * Round 1 is the default rather than the round matching the clock -- the
     * morning round is often written up later in the day, and a page that had
     * silently moved on would have him filling round 2 believing it was round 1.
     */
    const ROUNDS = [1, 2, 3];
    const roundOf = r => Number(r.round_no) || 1;
    const wanted = ['1', '2', '3', 'all'].includes(String(req.query.round))
      ? String(req.query.round) : '1';
    const due = wanted === 'all' ? dueAll : dueAll.filter(s => roundOf(s) === +wanted);

    const logged = await db.query(
      /* The photograph's time comes from `files`, and it is the time it was
       * ATTACHED, not the time it was taken. Those differ by most of a day at a
       * running room: the supervisor works the day shift and fills the register
       * in the evening for rounds he walked at nine. The screen says "attached"
       * for that reason. The true capture time is in the photograph's own EXIF
       * data and is not read yet -- see PENDING.md. */
      `SELECT cl.*, f.created_at AS photo_at
         FROM cleaning_log cl
         LEFT JOIN files f ON f.id = cl.photo_file_id
        WHERE cl.running_room_id = ? AND cl.work_date = ? AND COALESCE(cl.block_id, 0) = ?`,
      [rr.id, date, blockId || 0]);
    const byId = {}; logged.forEach(l => { byId[l.schedule_id] = l; });

    /* HOW EACH BUILDING STANDS TODAY, so the officer sees at a glance which of
       the four is behind rather than having to open each in turn. Counted over
       everything due today, not just the round on screen. */
    const perBlock = blocks.length ? await db.query(`
      SELECT COALESCE(block_id, 0) AS bk,
             SUM(status = 'done')     AS done,
             SUM(status = 'not_done') AS not_done
      FROM cleaning_log WHERE running_room_id = ? AND work_date = ?
      GROUP BY COALESCE(block_id, 0)`, [rr.id, date]) : [];
    const blockState = {}; perBlock.forEach(r => { blockState[r.bk] = r; });
    blocks.forEach(b => {
      const st = blockState[b.id] || { done: 0, not_done: 0 };
      b.done = +st.done || 0; b.not_done = +st.not_done || 0;
      b.due = dueAll.length;
      b.pending = Math.max(0, b.due - b.done - b.not_done);
    });

    const day = await db.one(`
      SELECT d.*, u.full_name AS verified_name FROM cleaning_day d
      LEFT JOIN users u ON u.id = d.verified_by
      WHERE d.running_room_id = ? AND d.work_date = ?`, [rr.id, date]);

    // The contractor's own men, offered by name so a round can carry who did it.
    const men = await db.query(`
      SELECT s.id, s.full_name, d.name AS designation
      FROM staff s LEFT JOIN designations d ON d.id = s.designation_id
      WHERE s.running_room_id = ? AND s.is_active = 1
        AND s.screening_status IN ('approved','provisional')
      ORDER BY s.full_name`, [rr.id]);

    // How many rounds this item has in a day, so a repeated row can say
    // "round 2 of 3" instead of printing the whole item name again.
    const perDay = {};
    dueAll.forEach(s => { perDay[s.area_name] = (perDay[s.area_name] || 0) + 1; });

    const rounds = due.map(s => {
      const l = byId[s.id] || null;
      const fin = l && l.done_at ? hhmm(l.done_at) : null;
      const close = hhmm(s.window_to);
      return { s, log: l,
        roundsInDay: perDay[s.area_name] || 1,
        freqLabel: CLEAN_FREQ_LABEL[s.frequency] || s.frequency,
        // Late only where the tender gives an hour to be late against, and only
        // where a finishing time was actually recorded.
        late: (l && l.status === 'done' && fin !== null && close !== null && fin > close),
      };
    });

    /* Each tab says how many of ITS rounds are recorded. A tab that only
     * numbered itself would let a round be forgotten -- the whole risk of
     * showing one round at a time. */
    const roundTabs = ROUNDS
      .map(n => ({ key: String(n), label: `Round ${n}`,
                   rows: dueAll.filter(s => roundOf(s) === n) }))
      .filter(t => t.rows.length)
      .map(t => ({ ...t, total: t.rows.length,
                   recorded: t.rows.filter(s => byId[s.id]).length }));
    if (roundTabs.length > 1) {
      roundTabs.push({ key: 'all', label: 'All rounds', total: dueAll.length,
                       recorded: dueAll.filter(s => byId[s.id]).length });
    }

    const done = rounds.filter(r => r.log && r.log.status === 'done').length;
    const notDone = rounds.filter(r => r.log && r.log.status === 'not_done').length;
    // Rows the contract states without a count -- continuous mopping, cleaning
    // "before and after every meal", dining tables "on need basis" -- are shown
    // and can be recorded, but an empty one is not a gap. See countsAsDue.
    const unrecorded = rounds.filter(r => !r.log && countsAsDue(r.s)).length;
    const openEnded = rounds.filter(r => !countsAsDue(r.s)).length;

    // A fortnight at a glance: how many rounds were due, kept, and never
    // written down. This is the shape of an A6 case, or of its refutation.
    const hist = await db.query(`
      SELECT work_date, schedule_id, status FROM cleaning_log
      WHERE running_room_id = ? AND work_date BETWEEN DATE_SUB(?, INTERVAL 13 DAY) AND ?`,
      [rr.id, date, date]);
    const histBy = {};
    hist.forEach(h => { (histBy[String(h.work_date).slice(0, 10)] ||= []).push(h); });
    const history = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.parse(date + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10);
      const dueThat = dueOn(schedule, d, weekdays).filter(countsAsDue).length;
      const rows = histBy[d] || [];
      history.push({ date: d, due: dueThat,
        done: rows.filter(r => r.status === 'done').length,
        notDone: rows.filter(r => r.status === 'not_done').length,
        missing: Math.max(0, dueThat - rows.length) });
    }

    res.render('records/cleaning', { title: 'Cleaning record', section: 'cleaning',
      rooms, rr, date, rounds, day, men, history, scheduleFromContract,
      roundTabs, round: wanted,
      blocks, block, blockId, needBlock, viewNone, orphans,
      // The items whose day the running room may set, and the day it has set.
      weeklyItems: schedule.filter(x => x.frequency === 'weekly')
        .map(x => ({ id: x.id, name: x.area_name,
                     weekday: weekdays[x.id] ?? WEEKLY_DEFAULT,
                     isDefault: weekdays[x.id] === undefined })),
      dayNames: DAY_NAME,
      counts: { due: rounds.length, done, notDone, unrecorded, openEnded },
      saved: req.query.saved || null });
  } catch (e) { next(e); }
});

router.post('/cleaning', requirePermission('stay.manage'),
  uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    if (date > today()) { const e = new Error('Cleaning cannot be recorded for a future date.'); e.status = 400; throw e; }

    // Same scoping as the GET. If the two disagreed, a round shown on screen
    // could have no row to save into.
    const schedule = (await terms.scopedRows(db, await terms.contractIdFor(db, rrId),
      (scope, p) => [`SELECT * FROM cleaning_schedule
                       WHERE is_active = 1 AND ${scope} ORDER BY sort_order`, p])).rows;
    /* ONLY THE ROWS THAT WERE ON THE SCREEN.
     *
     * A blank box means "unrecorded" and this route acts on that by DELETING
     * the row. Once the screen shows one round at a time, a form carrying only
     * round 1 would have wiped rounds 2 and 3 on every save -- the evening man
     * saving his round would have erased the morning's, and the register would
     * simply have gone quiet with nothing reporting it.
     *
     * So the form declares which schedule rows it was showing, and nothing
     * outside that list is touched. A form without the list is an older page:
     * fall back to every round, which is what it meant. */
    const shown = String(req.body.ids || '').split(',').map(Number).filter(Boolean);
    const onScreen = shown.length ? new Set(shown) : null;
    /* THE BUILDING IS RE-CHECKED HERE, not trusted from the form. It arrives as
       a posted field like any other, and a block id belonging to another
       running room would file Igatpuri's round under a Lonavla building. */
    const postBlocks = await blocksOf(rrId);
    const postBlockId = postBlocks.length ? await blockIdFor(rrId, req.body.block) : null;
    if (postBlocks.length && !postBlockId) {
      const e = new Error(
        'Which building was this round done in? The register cannot record a round '
        + 'without one — "somewhere in the running room" is not a place.');
      e.status = 400; throw e;
    }
    const bkey = postBlockId || 0;

    const wk = {};
    (await db.query(`SELECT schedule_id, weekday FROM cleaning_weekly_day
                      WHERE running_room_id = ? AND COALESCE(block_id, 0) = ?`,
      [rrId, bkey])).forEach(w => { wk[w.schedule_id] = w.weekday; });
    const due = dueOn(schedule, date, wk).filter(s => !onScreen || onScreen.has(s.id));

    /* multer gives a flat list; the register needs them by field, because each
     * round has its own box and they arrive together. */
    const byField = {};
    (req.files || []).forEach(f => { (byField[f.fieldname] ||= []).push(f); });

    let recorded = 0, cleared = 0;
    for (const s of due) {
      const status = String(req.body[`st_${s.id}`] || '');
      if (status !== 'done' && status !== 'not_done') {
        // Left blank. The round goes back to being unrecorded rather than
        // being written as not done — silence and a statement are different
        // things and the register has to be able to say which it holds.
        const r = await db.execute(
          `DELETE FROM cleaning_log WHERE running_room_id = ? AND work_date = ? AND schedule_id = ?
             AND COALESCE(block_id, 0) = ?`,
          [rrId, date, s.id, bkey]);
        if (r.affectedRows) cleared++;
        continue;
      }
      const at = String(req.body[`at_${s.id}`] || '').trim();
      const staffId = +req.body[`by_${s.id}`] || null;
      const fresh = req.body[`fr_${s.id}`] === '1' ? 1 : (status === 'done' ? 0 : null);

      /* THE PHOTOGRAPH, ON A ROUND THAT WAS NOT DONE.
       *
       * Only on not_done, and only ever offered. See migration 067 for why
       * proof-of-done was refused: 100 rounds a day at IGP alone, and a picture
       * of a clean floor proves a floor was clean at some moment rather than
       * that the round happened.
       *
       * A photograph sent against a round now marked `done` is DISCARDED rather
       * than stored -- somebody ticked done and attached a picture, and the two
       * disagree. Storing it would put a photograph of a mess against a round
       * the register says was fine.
       *
       * An existing photograph is NOT overwritten by an absent one. The form
       * posts every row on the screen on every save, so a supervisor correcting
       * the time on one round would otherwise wipe the evidence attached to
       * another. COALESCE keeps what is there unless a new file arrives. */
      let photoId = null;
      const sent = (byField[`ph_${s.id}`] || [])[0];
      if (sent && status === 'not_done')
        photoId = await uploads.store(sent,
          { entityTable: 'cleaning_log', entityId: null, userId: req.user.id });

      await db.execute(`
        INSERT INTO cleaning_log (running_room_id, block_id, work_date, schedule_id, status,
          done_at, done_by_staff_id, freshener, remarks, photo_file_id, recorded_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), done_at = VALUES(done_at),
          done_by_staff_id = VALUES(done_by_staff_id), freshener = VALUES(freshener),
          remarks = VALUES(remarks), recorded_by = VALUES(recorded_by),
          photo_file_id = COALESCE(VALUES(photo_file_id), photo_file_id)`,
        [rrId, postBlockId, date, s.id, status,
         status === 'done' && /^\d{1,2}:\d{2}$/.test(at) ? at : null,
         status === 'done' ? staffId : null, fresh,
         String(req.body[`rm_${s.id}`] || '').trim().slice(0, 300) || null, photoId, req.user.id]);
      recorded++;
    }

    // Any correction to the rounds withdraws the Railway's verification of the
    // day: what was verified was a particular set of rounds.
    await db.execute(
      `DELETE FROM cleaning_day WHERE running_room_id = ? AND work_date = ?`, [rrId, date]);

    await audit.record(req, { table: 'cleaning_log', id: rrId, action: 'update',
      after: { running_room_id: rrId, work_date: date, rounds: recorded, cleared } });
    const back = ['1', '2', '3', 'all'].includes(String(req.body.round))
      ? `&round=${req.body.round}` : '';
    const blk = postBlockId ? `&block=${postBlockId}` : '';
    res.redirect(`${cfg.basePath}/records/cleaning?rr=${rrId}&date=${date}${blk}${back}&saved=${recorded}`);
  } catch (e) { next(e); }
});

/**
 * Which day of the week a weekly cleaning item falls on at this running room.
 *
 * WHO SETS IT. The Railway, not the contractor -- `cleaning.verify`, the same
 * hands that confirm the day's rounds. The day the work happens is agreed at the
 * site, but a contractor who could move his own due date could never be late.
 *
 * WHAT MAY BE SET. Only rows the contract left open -- the ones it calls "Once
 * in Week" without naming a day. `weekly_sunday` and `sunday_2_4` name their day
 * in the tender and are not the running room's to move; the route checks the
 * frequency rather than trusting the form.
 */
router.post('/cleaning/weekly-day', requirePermission('cleaning.verify'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const date = String(req.body.date || today()).slice(0, 10);
    const round = ['1', '2', '3', 'all'].includes(String(req.body.round)) ? req.body.round : '1';

    const settable = (await terms.scopedRows(db, await terms.contractIdFor(db, rrId),
      (scope, p) => [`SELECT id, area_name FROM cleaning_schedule
                       WHERE is_active = 1 AND frequency = 'weekly' AND ${scope}`, p])).rows;

    /* THE DAY IS SET FOR ONE BUILDING. Igatpuri's four are twenty minutes
       apart and worked by men who move between them; they are no more likely
       to share a day for washing the curtains than two running rooms are.
       Until migration 054 the primary key held one row per running room per
       item, so setting LP Ghat's day would silently have moved TM-BB's too. */
    const wdBlocks = await blocksOf(rrId);
    const wdBlockId = wdBlocks.length ? await blockIdFor(rrId, req.body.block) : null;
    if (wdBlocks.length && !wdBlockId) {
      const e = new Error('Choose the building first — a weekly day is set for one building.');
      e.status = 400; throw e;
    }

    let changed = 0;
    for (const s of settable) {
      const raw = req.body[`wd_${s.id}`];
      if (raw === undefined || raw === '') continue;
      const day = Number(raw);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const before = await db.one(
        `SELECT weekday FROM cleaning_weekly_day
          WHERE running_room_id = ? AND schedule_id = ? AND COALESCE(block_id, 0) = ?`,
        [rrId, s.id, wdBlockId || 0]);
      if (before && before.weekday === day) continue;
      await db.execute(`
        INSERT INTO cleaning_weekly_day (running_room_id, block_id, schedule_id, weekday, set_by)
        VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE weekday = VALUES(weekday), set_by = VALUES(set_by)`,
        [rrId, wdBlockId, s.id, day, req.user.id]);
      await audit.record(req, { table: 'cleaning_weekly_day', id: rrId,
        action: before ? 'update' : 'insert',
        before: before || null,
        after: { running_room_id: rrId, block_id: wdBlockId, schedule_id: s.id,
                 item: s.area_name, weekday: day } });
      changed++;
    }
    const wblk = wdBlockId ? `&block=${wdBlockId}` : '';
    res.redirect(`${cfg.basePath}/records/cleaning?rr=${rrId}&date=${date}${wblk}&round=${round}&wd=${changed}`);
  } catch (e) { next(e); }
});

/**
 * The Railway verifies a day, or reopens one it has verified.
 *
 * WHY REOPEN EXISTS. Verification closes the rounds to editing, which is right:
 * what was verified was a particular set of rounds, and letting the contractor
 * revise them afterwards would make the confirmation worthless. But the first
 * cut of this screen removed the save button on verification and offered
 * nothing in its place, so a day verified by mistake -- or verified before the
 * evening round was entered -- could never be corrected by anybody. The route
 * withdrew the verification on any save; the screen gave no way to reach it.
 * Found by the RR in-charge on the first real walk-through, asking the obvious
 * question: how do I change the round now?
 *
 * So reopening is its own deliberate act, by the same hands that verified, and
 * it is audited. The same shape as the weekly menu, where the Railway agrees a
 * week and can reopen it. A counter-signed muster is the deliberate exception:
 * that one really is final.
 */
router.post('/cleaning/verify', requirePermission('cleaning.verify'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);

    if (req.body.action === 'reopen') {
      await db.execute(
        `DELETE FROM cleaning_day WHERE running_room_id = ? AND work_date = ?`, [rrId, date]);
      await audit.record(req, { table: 'cleaning_day', id: rrId, action: 'update',
        after: { running_room_id: rrId, work_date: date, verification: 'withdrawn' } });
      return res.redirect(`${cfg.basePath}/records/cleaning?rr=${rrId}&date=${date}&saved=reopened`);
    }

    const n = (await db.query(
      `SELECT COUNT(*) AS n FROM cleaning_log WHERE running_room_id = ? AND work_date = ?`,
      [rrId, date]))[0].n;
    if (!n) {
      const e = new Error('There is nothing recorded for this day to verify.'); e.status = 400; throw e;
    }
    await db.execute(`
      INSERT INTO cleaning_day (running_room_id, work_date, verified_by, verified_at, verify_remarks)
      VALUES (?,?,?,NOW(),?)
      ON DUPLICATE KEY UPDATE verified_by = VALUES(verified_by), verified_at = NOW(),
        verify_remarks = VALUES(verify_remarks)`,
      [rrId, date, req.user.id, String(req.body.verify_remarks || '').trim().slice(0, 300) || null]);
    await audit.record(req, { table: 'cleaning_day', id: rrId, action: 'update',
      after: { running_room_id: rrId, work_date: date, verified_by: req.user.id } });
    res.redirect(`${cfg.basePath}/records/cleaning?rr=${rrId}&date=${date}&saved=verified`);
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- complaints */
router.get('/complaints', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    /* THE BUILDING IS OPTIONAL HERE, unlike the cleaning and linen registers.
       A round is done in one building and linen sits on one shelf, so those
       cannot be recorded without saying which. A complaint may genuinely be
       about the kitchen that serves all four, or about the running room as a
       whole — and forcing a building would make somebody pick one falsely,
       which is worse than leaving it open. */
    const blocks = await blocksOf(rr.id);
    const wantBlock = /^\d+$/.test(String(req.query.block || '')) ? +req.query.block
      : (req.query.block === 'none' ? 'none' : null);
    const blockWhere = wantBlock === 'none' ? ' AND c.block_id IS NULL'
      : (wantBlock ? ' AND c.block_id = ' + wantBlock : '');
    const rows = await db.query(`
      SELECT c.*, bl.name AS block_name, bl.is_active AS block_live
      FROM complaints c LEFT JOIN running_room_blocks bl ON bl.id = c.block_id
      WHERE c.running_room_id = ?${blockWhere}
      ORDER BY (c.status = 'open') DESC, c.raised_at DESC LIMIT 60`, [rr.id]);
    // Open complaints per building, over the whole running room rather than
    // the current filter — a count that vanishes when you filter looks like
    // nothing left to do.
    const openBy = blocks.length ? await db.query(`
      SELECT COALESCE(block_id, 0) AS bk, COUNT(*) AS n
      FROM complaints WHERE running_room_id = ? AND status = 'open'
      GROUP BY COALESCE(block_id, 0)`, [rr.id]) : [];
    const openMap = {}; openBy.forEach(r => { openMap[r.bk] = +r.n; });
    blocks.forEach(b => { b.open = openMap[b.id] || 0; });
    const openNoBlock = openMap[0] || 0;

    res.render('records/complaints', { title: 'Complaint book', section: 'complaints',
      rooms, rr, date, rows, blocks, wantBlock, openNoBlock,
      categories: complaintCats.CATEGORIES,
      catLabel: complaintCats.label, isContractors: complaintCats.isContractors });
  } catch (e) { next(e); }
});

router.post('/complaints', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr, date = String(req.body.date || today()).slice(0, 10);
    await assertRunningRoomAccess(db, req.user, rrId);
    const { raised_by_name = '', description = '', severity = 'normal', category = '' } = req.body;
    if (!description.trim()) { const e = new Error('A description is required.'); e.status = 400; throw e; }
    // A category outside the list is refused rather than stored. Silently
    // accepting it would put the figure back beyond counting, which is the
    // fault this list exists to correct.
    if (!complaintCats.isValid(category)) {
      const e = new Error('Choose what the complaint is about from the list.'); e.status = 400; throw e;
    }
    const blockId = await blockIdFor(rrId, req.body.block);
    await db.execute(`
      INSERT INTO complaints (running_room_id, block_id, source, raised_by_name, raised_at, category,
        description, severity, status)
      VALUES (?, ?, 'complaint_book', ?, NOW(), ?, ?, ?, 'open')`,
      [rrId, blockId, raised_by_name.trim().slice(0, 150) || null, category.slice(0, 60) || null,
       description.trim(), ['normal','major','critical'].includes(severity) ? severity : 'normal']);
    await audit.record(req, { table: 'complaints', id: rrId, action: 'insert',
      after: { running_room_id: rrId, block_id: blockId, severity,
               description: description.slice(0, 120) } });
    const blk = blockId ? `&block=${blockId}` : '';
    res.redirect(`${cfg.basePath}/records/complaints?rr=${rrId}&date=${date}${blk}`);
  } catch (e) { next(e); }
});

router.post('/complaints/:id/close', requirePermission('feedback.close'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const c = await db.one('SELECT id, running_room_id, status FROM complaints WHERE id = ?', [id]);
    if (!c) { const e = new Error('Complaint not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, c.running_room_id);
    const remarks = (req.body.closure_remarks || '').trim().slice(0, 500);
    if (!remarks) { const e = new Error('Closure remarks are required.'); e.status = 400; throw e; }
    await db.execute(
      `UPDATE complaints SET status='closed', closed_at=NOW(), closed_by=?, closure_remarks=? WHERE id=?`,
      [req.user.id, remarks, id]);
    await audit.record(req, { table: 'complaints', id, action: 'update',
      before: { status: c.status }, after: { status: 'closed', closure_remarks: remarks } });
    res.redirect(`${cfg.basePath}/records/complaints?rr=${c.running_room_id}`);
  } catch (e) { next(e); }
});

module.exports = router;
