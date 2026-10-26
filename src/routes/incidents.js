/**
 * The security and incident register. The first half of audit item P14.
 *
 * Fire, theft, miscreant activity, accident, death, intoxication. Nothing in
 * RR-CMS recorded any of them, and this is the one gap where having no record
 * is itself the danger: an officer asked what happened at a site six months ago
 * had nowhere to look, and the contractor had nothing to show either.
 *
 * MOST OF WHAT IS HERE CARRIES NO PENALTY, and the screen says so. A fire or a
 * theft is an event the Railway must know about, not a deficiency. The single
 * exception is clause A3 — Rs 1,000 per labour per case where CONTRACTOR labour
 * is found intoxicated. Intoxication of RUNNING STAFF is the same word and a
 * completely different matter: a crew discipline question for the lobby and the
 * controller, with no contractor penalty whatever. The register keeps the two
 * apart by construction rather than by wording, because conflating them would
 * put a penalty on a contractor for something a driver did.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const terms = require('../services/contract-terms');

const router = express.Router();

/* The tender's own list, with the words an officer would use. */
const TYPES = [
  ['fire',           'Fire'],
  ['theft',          'Theft'],
  ['miscreant',      'Miscreant activity'],
  ['accident',       'Accident or injury'],
  ['death',          'Death'],
  ['intoxication',   'Intoxication'],
  ['security_lapse', 'Security lapse'],
  ['other',          'Something else'],
];
const INVOLVES = [
  ['contractor_staff', "The contractor's man"],
  ['running_staff',    'Running staff (crew)'],
  ['occupant',         'An occupant, not on duty'],
  ['outsider',         'An outsider'],
  ['nobody',           'Nobody in particular'],
];
const AUTHORITIES = [
  ['police',           'Police',            'FIR or station diary number'],
  ['rpf',              'RPF',               'post and entry number'],
  ['fire_service',     'Fire service',      'call number'],
  ['medical',          'Medical / hospital', 'where the injured were taken'],
  ['division_control', 'Divisional control', 'message number'],
  ['railway_officer',  'Railway officer',   'who was told'],
];
const SEVERITY = [['minor', 'Minor'], ['serious', 'Serious'], ['grave', 'Grave']];
const STATUSES = [['open', 'Open'], ['under_enquiry', 'Under enquiry'], ['closed', 'Closed']];

const { today } = require('../lib/day');
function bad(msg) { const e = new Error(msg); e.status = 400; return e; }
const dateOrNull = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : null;
const timeOrNull = v => /^\d{2}:\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : null;

async function rooms(req) {
  const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
  // `dv` rather than `d`, and `inc` rather than `i` below, because two stubs in
  // demo/server.js already answer `SELECT rr.id, rr.name, d.code AS div_code
  // FROM running_rooms` and `SELECT i.*, rr.name AS rr_name` — one for a single
  // room, one for inspections. Written the obvious way, this register's queries
  // came back as somebody else's rows. That is the ninth and tenth collision of
  // the shape in that file, and the cure is to make the statement distinctive
  // here rather than to keep reordering stubs there.
  const rows = await db.query(`
    SELECT rr.id, rr.name, dv.code AS div_code
    FROM running_rooms rr JOIN divisions dv ON dv.id = rr.division_id
    WHERE ${s.sql} ORDER BY rr.name`, s.params);
  if (!rows.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
  return rows;
}

/** Clause A3 applies to the contractor's own man, and to nobody else. */
const a3Applies = i => i.incident_type === 'intoxication' && i.involves === 'contractor_staff';

/* ------------------------------------------------------------------- list */

router.get('/', async (req, res, next) => {
  try {
    const list = await rooms(req);
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const where = [s.sql], params = [...s.params];
    const { rr = '', status = '', type = '' } = req.query;
    /* A RUNNING ROOM YOU MAY NOT SEE IS REFUSED, NOT QUIETLY EMPTIED.
       The scope is in the SQL, so an out-of-scope `rr` was already safe — the
       clause became `rr.id = mine AND rr.id = yours` and matched nothing. But
       the page then opened with an empty register, which SAYS "there is nothing
       here" when the truth is "this is not yours". Found on the live server by
       the officer walking the scope himself: "staff?rr=19 not refusing. opens
       Contract Staff page."

       An empty page is the wrong answer twice over: it states something false
       about another running room, and it teaches whoever reads it that blank
       means nothing-there rather than not-permitted — so the day a screen IS
       written without a scope clause, nobody will notice. */
    if (rr) await assertRunningRoomAccess(db, req.user, +rr);
    if (rr)     { where.push('rr.id = ?');            params.push(+rr); }
    if (status) { where.push('inc.status = ?');       params.push(status); }
    if (type)   { where.push('inc.incident_type = ?'); params.push(type); }

    const rowsOut = await db.query(`
      SELECT inc.*, rr.name AS rr_name, dv.code AS div_code,
             st.full_name AS staff_name, u.full_name AS closed_name,
             (SELECT COUNT(*) FROM incident_notifications n
               WHERE n.incident_id = inc.id AND n.informed_on IS NOT NULL) AS told
      FROM incidents inc
      JOIN running_rooms rr ON rr.id = inc.running_room_id
      JOIN divisions dv ON dv.id = rr.division_id
      LEFT JOIN staff st ON st.id = inc.staff_id
      LEFT JOIN users u ON u.id = inc.closed_by
      WHERE ${where.join(' AND ')}
      ORDER BY (inc.status = 'open') DESC, inc.occurred_on DESC, inc.id DESC
      LIMIT 300`, params);

    rowsOut.forEach(i => {
      i.a3 = a3Applies(i);
      // The gap between the event and the Railway hearing of it. This is the
      // first thing asked at an enquiry, so it is worked out and shown rather
      // than left for somebody to count on their fingers.
      i.told_after = i.reported_on
        ? Math.round((Date.parse(String(i.reported_on).slice(0, 10) + 'T00:00:00Z')
                    - Date.parse(String(i.occurred_on).slice(0, 10) + 'T00:00:00Z')) / 86400000)
        : null;
    });

    const counts = await db.one(`
      SELECT COUNT(*) AS total,
             SUM(inc.status = 'open') AS open,
             SUM(inc.status = 'under_enquiry') AS enquiry,
             SUM(inc.reported_on IS NULL) AS unreported
      FROM incidents inc JOIN running_rooms rr ON rr.id = inc.running_room_id
      WHERE ${s.sql}`, s.params);

    res.render('incidents/index', { title: 'Security and incident register',
      rows: rowsOut, rooms: list, counts: counts || {}, rr, status, type,
      types: TYPES, statuses: STATUSES, involves: INVOLVES, severity: SEVERITY,
      authorities: AUTHORITIES, accepted: uploads.ACCEPTED,
      note: req.query.note || null, today: today() });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ record */

router.post('/', requirePermission('incident.record'), uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);

    const on = dateOrNull(req.body.occurred_on);
    if (!on) throw bad('An incident needs the date it happened.');
    if (on > today()) throw bad('An incident cannot be dated in the future.');
    const reported = dateOrNull(req.body.reported_on);
    if (reported && reported < on) throw bad('The Railway cannot have been told before it happened.');
    if (reported && reported > today()) throw bad('The date the Railway was told is in the future.');

    const type = TYPES.some(t => t[0] === req.body.incident_type) ? req.body.incident_type : null;
    if (!type) throw bad('Choose what kind of incident it was.');
    const involves = INVOLVES.some(t => t[0] === req.body.involves) ? req.body.involves : 'nobody';
    const summary = String(req.body.summary || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!summary) throw bad('Say in one line what happened. A register entry nobody can read is not a record.');

    const sev = SEVERITY.some(x => x[0] === req.body.severity) ? req.body.severity : null;
    const staffId = involves === 'contractor_staff' ? (+req.body.staff_id || null) : null;

    let fileId = null;
    const f = (req.files || []).find(x => x.fieldname === 'evidence' && x.buffer && x.buffer.length);
    if (f) fileId = await uploads.store(f, { entityTable: 'incidents', entityId: null, userId: req.user.id });

    const ins = await db.execute(`
      INSERT INTO incidents (running_room_id, occurred_on, occurred_at, reported_on,
        incident_type, severity, summary, detail, involves, staff_id, persons_affected,
        immediate_action, evidence_file_id, recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [rrId, on, timeOrNull(req.body.occurred_at), reported, type, sev, summary,
       String(req.body.detail || '').trim().slice(0, 4000) || null, involves, staffId,
       String(req.body.persons_affected || '').trim().slice(0, 400) || null,
       String(req.body.immediate_action || '').trim().slice(0, 600) || null,
       fileId, req.user.id]);
    const id = ins.insertId;

    for (const [code] of AUTHORITIES) {
      const when = dateOrNull(req.body[`n_${code}_on`]);
      const ref = String(req.body[`n_${code}_ref`] || '').trim().slice(0, 80) || null;
      if (!when && !ref) continue;
      if (when && when < on) throw bad('An authority cannot have been told before the incident happened.');
      await db.execute(`
        INSERT INTO incident_notifications (incident_id, authority, informed_on, informed_at, reference_no)
        VALUES (?,?,?,?,?)`,
        [id, code, when, timeOrNull(req.body[`n_${code}_at`]), ref]);
    }

    await audit.record(req, { table: 'incidents', id, action: 'insert',
      after: { running_room_id: rrId, occurred_on: on, incident_type: type, involves, summary } });
    res.redirect(`${cfg.basePath}/incidents?rr=${rrId}&note=recorded`);
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------- close */

router.post('/:id/status', requirePermission('incident.close'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const inc = await db.one('SELECT * FROM incidents WHERE id = ?', [id]);
    if (!inc) { const e = new Error('No such incident.'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, inc.running_room_id);

    const status = STATUSES.some(x => x[0] === req.body.status) ? req.body.status : null;
    if (!status) throw bad('Choose a state for the incident.');
    const remarks = String(req.body.closure_remarks || '').trim().slice(0, 600) || null;
    // Closing without saying what was found is how a register stops being
    // evidence: "closed" on its own answers nothing at an enquiry.
    if (status === 'closed' && !remarks) throw bad('Say what was found or done before closing it. A bare "closed" answers nothing at an enquiry.');

    await db.execute(`
      UPDATE incidents SET status = ?, closure_remarks = ?,
             closed_on = ?, closed_by = ?
      WHERE id = ?`,
      [status, remarks, status === 'closed' ? today() : null,
       status === 'closed' ? req.user.id : null, id]);
    await audit.record(req, { table: 'incidents', id, action: 'update',
      before: { status: inc.status }, after: { status, closure_remarks: remarks } });
    res.redirect(`${cfg.basePath}/incidents?rr=${inc.running_room_id}&note=${status}`);
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- clause A3 */

router.post('/:id/a3', requirePermission('deficiency.record'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const inc = await db.one('SELECT * FROM incidents WHERE id = ?', [id]);
    if (!inc) { const e = new Error('No such incident.'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, inc.running_room_id);

    // The guard that matters. A3 is about the CONTRACTOR's labour; a driver
    // found intoxicated is a crew discipline matter and no penalty follows.
    if (!a3Applies(inc)) throw bad('Clause A3 applies to the contractor\'s own labour found intoxicated. Intoxication of running staff is a crew discipline matter and carries no contractor penalty.');

    const already = await db.one(`
      SELECT id FROM deficiencies
      WHERE source_ref_table = 'incidents' AND source_ref_id = ? AND status <> 'withdrawn'`, [id]);
    if (already) throw bad('Clause A3 has already been raised for this incident. Correct it on the deficiency register rather than raising it twice.');

    const on = String(inc.occurred_on).slice(0, 10);
    // "The clause that governs intoxication HERE", not "clause A3". At a
    // running room whose contract carries its own penalty schedule, A3 is the
    // wrong clause and the wrong rate. See services/contract-terms.
    const clause = await terms.clauseFor(db, inc.running_room_id, 'A3', on);
    if (!clause) throw bad('No clause covering intoxication is on the schedule in force on that date.');

    // One case, one labour. The clause reads "per labour per case", and the
    // register records one man per entry, so the quantity is 1 and is not
    // guessed at from the narrative.
    // The quantity is bound rather than written into the statement as a literal
    // 1, so this INSERT has the same placeholder layout as the other three that
    // write to this table. A statement that looks alike but binds differently is
    // how a demo stub reads the description out of the wrong position, and how
    // a duplicate guard silently stops guarding.
    const ins = await db.execute(`
      INSERT INTO deficiencies (running_room_id, clause_id, occurred_on, quantity, source,
        source_ref_table, source_ref_id, description, recorded_by, status)
      VALUES (?,?,?,?, 'review', 'incidents', ?, ?, ?, 'open')`,
      [inc.running_room_id, clause.id, on, 1, id,
       `Contractor labour found intoxicated on ${on}. ${inc.summary}`, req.user.id]);
    await audit.record(req, { table: 'deficiencies', id: ins.insertId, action: 'insert',
      after: { running_room_id: inc.running_room_id, clause: 'A3', source_ref_id: id } });
    res.redirect(`${cfg.basePath}/incidents?rr=${inc.running_room_id}&note=a3`);
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- evidence */

/* This one was written correctly -- it found the owning incident first and
 * refused a file no incident claimed, which is the pattern /photo/:id now
 * applies to all twenty-three tables. Kept as a redirect so existing links
 * still resolve. */
router.get('/photo/:fileId', (req, res) =>
  res.redirect(302, `${cfg.basePath}/photo/${encodeURIComponent(req.params.fileId)}`));

module.exports = router;
