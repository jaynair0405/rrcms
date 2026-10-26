/**
 * FSSAI compliance for running rooms that serve food.
 *
 * Built against the Form C Central Licence issued for the Bhusawal running
 * room (10025901000005, M/S ISF SERVICES, category "Central License - Indian
 * Railways", issuing authority DO Railways). Three things follow from how
 * that document is written, and they shape every screen here:
 *
 *   - The licence names the RUNNING ROOM as the authorised premises. It is not
 *     a contractor-level licence that covers a fleet of sites. Each room that
 *     serves food needs its own, and a room with no meal facility needs none
 *     at all — so has_meal_facility decides who appears in the count.
 *
 *   - Validity is a range and the renewal window is generous but finite:
 *     application may be filed from 180 days before expiry, and late renewal
 *     is allowed up to 180 days after expiry against penalty. Both are derived
 *     from valid_upto here rather than stored, so a stale flag cannot mislead.
 *
 *   - The Conditions of Licence printed on the certificate create duties that
 *     outlive the paperwork: the annual return by 31 May, and laboratory
 *     testing once in six months. These are what an inspecting officer asks
 *     for after he has looked at the certificate on the wall.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');

const router = express.Router();
router.use(requirePermission('fssai.view'));

const { today } = require('../lib/day');

// Express 5 no longer accepts an inline regex on a path parameter, so the
// numeric check is done here. Anything non-numeric falls through to the next
// route — that is what lets /inspection/:id coexist with /:rrId.
const numeric = (...keys) => (req, res, next) =>
  keys.every(k => /^\d+$/.test(req.params[k] || '')) ? next() : next('route');
const days = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);

/** FSSAI allows the renewal application from 180 days before expiry. */
const RENEWAL_WINDOW = 180;
/** And late renewal for 180 days after, against penalty. After that, fresh licence. */
const GRACE_WINDOW = 180;

/**
 * Where a licence stands today, in the words an officer would use.
 * Returned as a small object rather than a string so the view can colour it
 * without re-deriving the same test.
 */
function licenceState(lic, on = today()) {
  if (!lic) return { key: 'none', label: 'No licence on record', tone: 'err', left: null };
  if (lic.status === 'suspended')  return { key: 'suspended',  label: 'Suspended',  tone: 'err', left: null };
  if (lic.status === 'cancelled')  return { key: 'cancelled',  label: 'Cancelled',  tone: 'err', left: null };
  if (lic.status === 'surrendered')return { key: 'surrendered',label: 'Surrendered',tone: 'err', left: null };
  const left = days(on, lic.valid_upto);
  if (left < -GRACE_WINDOW) return { key: 'lapsed',   label: 'Lapsed beyond renewal', tone: 'err',  left };
  if (left < 0)             return { key: 'expired',  label: 'Expired — late renewal window', tone: 'err', left };
  if (left <= RENEWAL_WINDOW) return { key: 'renewable', label: 'Renewal may be filed', tone: 'warn', left };
  return { key: 'valid', label: 'Valid', tone: 'ok', left };
}

/**
 * The recurring duties that are live right now.
 *
 * Nothing schedules these in the background; they are computed from the date
 * whenever a page is drawn. A cron job that stops running is worse than no
 * cron job, because the screen then says everything is in order.
 */
function expectedObligations(on = today()) {
  const d = new Date(on), y = d.getFullYear(), m = d.getMonth() + 1;
  const out = [];

  // Annual return: for the year 1 April to 31 March, due by 31 May following.
  const fyEnd = m >= 4 ? y : y - 1;                       // the last 31 March passed
  out.push({ obligation: 'annual_return',
             label: `Annual return ${fyEnd - 1}-${String(fyEnd).slice(2)}`,
             period_label: `${fyEnd - 1}-${String(fyEnd).slice(2)}`,
             due_on: `${fyEnd}-05-31`,
             note: 'Condition 5 — for 1 April to 31 March, due 31 May' });

  // Laboratory test: at least once in six months. Two halves of the financial
  // year, so the period label matches how the year is already spoken about.
  const half = (yy, h) => h === 1
    ? { period_label: `Apr-Sep ${yy}`,            due_on: `${yy}-09-30` }
    : { period_label: `Oct-Mar ${yy}-${yy + 1}`,  due_on: `${yy + 1}-03-31` };
  const cur = m >= 10 ? half(y, 2) : m >= 4 ? half(y, 1) : half(y - 1, 2);
  const prv = m >= 10 ? half(y, 1) : m >= 4 ? half(y - 1, 2) : half(y - 1, 1);
  [prv, cur].forEach(p => out.push({ obligation: 'lab_test',
    label: `Laboratory test ${p.period_label}`, ...p,
    note: 'Condition 12 — once in six months, NABL-accredited or FSSAI-recognised lab' }));

  return out;
}

/** Marries the expected duties to what has actually been lodged. */
function obligationStatus(expected, recorded, on = today()) {
  return expected.map(e => {
    const hit = recorded.find(r => r.obligation === e.obligation && r.period_label === e.period_label);
    const overdue = !hit && days(on, e.due_on) < 0;
    return { ...e, row: hit || null, done: !!hit, overdue,
             dueIn: hit ? null : days(on, e.due_on) };
  });
}

const OBLIGATION_LABELS = {
  annual_return: 'Annual return', lab_test: 'Laboratory test',
  medical_checkup: 'Food handler medical', pest_control: 'Pest control',
  water_test: 'Water test',
};

/* ------------------------------------------------------------ overview */
/**
 * One row per running room that serves food. A room without a meal facility
 * is not a food business under the Act and is deliberately absent — putting
 * it in the list as "not applicable" would only dilute the count that matters.
 */
router.get('/', async (req, res, next) => {
  try {
    // A closed running room is not a food business, whatever its kitchen
    // flag says, so it must not appear in the compliance count.
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const rooms = await db.query(`
      SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code, ct.name AS contractor,
             fl.id AS licence_id, fl.licence_number, fl.licensee_name, fl.valid_from, fl.valid_upto,
             fl.status AS licence_status, fl.certificate_file_id, fl.tech_person_name, fl.tech_person_qual,
             (SELECT MAX(fi.inspection_date) FROM food_inspections fi WHERE fi.running_room_id = rr.id) AS last_inspection,
             (SELECT fi2.result FROM food_inspections fi2 WHERE fi2.running_room_id = rr.id
               ORDER BY fi2.inspection_date DESC LIMIT 1) AS last_result
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      -- A room's contractor is whoever holds the live contract for it; there
      -- is no contractor_id on running_rooms, and there should not be, since
      -- the holder changes while the room does not.
      LEFT JOIN contract_running_rooms crr ON crr.running_room_id = rr.id
           AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
      LEFT JOIN contracts c    ON c.id = crr.contract_id AND c.status = 'active'
      LEFT JOIN contractors ct ON ct.id = c.contractor_id
      LEFT JOIN food_licences fl ON fl.running_room_id = rr.id AND fl.is_current = 1
      WHERE ${s.sql} AND rr.has_meal_facility = 1
      ORDER BY d.code, rr.name`, s.params);

    const returns = await db.query(`
      SELECT flr.running_room_id, flr.obligation, flr.period_label, flr.completed_on
      FROM food_licence_returns flr
      JOIN running_rooms rr ON rr.id = flr.running_room_id
      WHERE ${s.sql} AND flr.completed_on IS NOT NULL`, s.params);

    const expected = expectedObligations();
    const rows = rooms.map(r => {
      // The query aliases the licence status so it cannot collide with the
      // running room's own status column; put it back before testing it.
      const state = licenceState(r.licence_id ? { ...r, status: r.licence_status } : null);
      const obl = obligationStatus(expected, returns.filter(x => x.running_room_id === r.id));
      return { ...r, state, pending: obl.filter(o => !o.done).length,
               overdue: obl.filter(o => o.overdue).length };
    });

    res.render('food-safety/index', {
      title: 'Food safety (FSSAI)', rows, expected,
      counts: {
        total:     rows.length,
        valid:     rows.filter(r => r.state.key === 'valid').length,
        attention: rows.filter(r => ['renewable','expired','lapsed'].includes(r.state.key)).length,
        missing:   rows.filter(r => r.state.key === 'none').length,
        stopped:   rows.filter(r => ['suspended','cancelled','surrendered'].includes(r.state.key)).length,
        overdue:   rows.filter(r => r.overdue > 0).length,
      },
    });
  } catch (e) { next(e); }
});

/* --------------------------------------------------------- room detail */
router.get('/:rrId', numeric('rrId'), async (req, res, next) => {
  try {
    const rrId = +req.params.rrId;
    await assertRunningRoomAccess(db, req.user, rrId);
    const rr = await db.one(`
      SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code,
             ct.id AS contractor_id, ct.name AS contractor
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN contract_running_rooms crr ON crr.running_room_id = rr.id
           AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
      LEFT JOIN contracts c    ON c.id = crr.contract_id AND c.status = 'active'
      LEFT JOIN contractors ct ON ct.id = c.contractor_id
      WHERE rr.id = ?`, [rrId]);
    if (!rr) { const e = new Error('Running room not found'); e.status = 404; throw e; }

    const licences = await db.query(`
      SELECT fl.*, ct.name AS contractor_name
      FROM food_licences fl LEFT JOIN contractors ct ON ct.id = fl.contractor_id
      WHERE fl.running_room_id = ? ORDER BY fl.is_current DESC, fl.valid_upto DESC`, [rrId]);
    const current = licences.find(l => l.is_current) || null;

    const recorded = await db.query(`
      SELECT * FROM food_licence_returns WHERE running_room_id = ?
      ORDER BY due_on DESC, id DESC LIMIT 40`, [rrId]);
    const inspections = await db.query(`
      SELECT fi.*, u.full_name AS inspector
      FROM food_inspections fi LEFT JOIN users u ON u.id = fi.inspected_by
      WHERE fi.running_room_id = ? ORDER BY fi.inspection_date DESC LIMIT 12`, [rrId]);

    const contractors = await db.query(
      `SELECT id, name FROM contractors WHERE is_active = 1 ORDER BY name`);

    res.render('food-safety/room', {
      title: `Food safety · ${rr.name}`, rr, licences, current,
      state: licenceState(current),
      obligations: obligationStatus(expectedObligations(), recorded.filter(r => r.completed_on)),
      recorded, inspections, contractors, labels: OBLIGATION_LABELS,
      accepted: uploads.ACCEPTED, today: today(),
      renewalWindow: RENEWAL_WINDOW, graceWindow: GRACE_WINDOW,
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------- record or renew a licence */
/**
 * A renewal does not overwrite the licence it replaces. FSSAI keeps the same
 * number across renewals and issues a fresh validity range, and a bill or an
 * inspection from last year has to be readable against the licence that was
 * live at the time. So the old row is stood down and a new one inserted.
 */
router.post('/:rrId/licence', numeric('rrId'), requirePermission('fssai.edit'),
  uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.params.rrId;
    await assertRunningRoomAccess(db, req.user, rrId);

    const number = String(req.body.licence_number || '').replace(/\s+/g, '');
    const validFrom = req.body.valid_from || '';
    const validUpto = req.body.valid_upto || '';
    if (!/^\d{14}$/.test(number)) {
      const e = new Error('An FSSAI licence number is 14 digits. Check the number printed on the Form C.');
      e.status = 400; throw e;
    }
    if (!validFrom || !validUpto || validUpto <= validFrom) {
      const e = new Error('Give the validity period, with the expiry after the start date.');
      e.status = 400; throw e;
    }
    if (!String(req.body.licensee_name || '').trim()) {
      const e = new Error('The licensee is the firm named on the licence. It cannot be left blank.');
      e.status = 400; throw e;
    }

    const cert = (req.files || []).find(f => f.fieldname === 'certificate' && f.size);
    const str = (k, n) => String(req.body[k] || '').trim().slice(0, n) || null;

    // Stand the previous licence down first, so the unique key on
    // (running_room_id, is_current) never sees two live rows.
    await db.execute(
      'UPDATE food_licences SET is_current = NULL WHERE running_room_id = ? AND is_current = 1', [rrId]);

    const ins = await db.execute(`
      INSERT INTO food_licences
        (running_room_id, contractor_id, licence_number, licensee_name, premises_address,
         kind_of_business, licence_category, issuing_authority, issued_on, valid_from, valid_upto,
         status, tech_person_name, tech_person_qual, tech_person_mobile,
         form_ix_name, form_ix_mobile, remarks, is_current, recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
      [rrId, +req.body.contractor_id || null, number, str('licensee_name', 200), str('premises_address', 400),
       str('kind_of_business', 120) || 'Food Services - Restaurants',
       str('licence_category', 120) || 'Central License - Indian Railways',
       str('issuing_authority', 120), req.body.issued_on || null, validFrom, validUpto,
       ['issued','suspended','cancelled','surrendered','expired'].includes(req.body.status)
         ? req.body.status : 'issued',
       str('tech_person_name', 150), str('tech_person_qual', 150), str('tech_person_mobile', 15),
       str('form_ix_name', 150), str('form_ix_mobile', 15), str('remarks', 500), req.user.id]);
    const licId = ins.insertId;

    if (cert) {
      const fileId = await uploads.store(cert,
        { entityTable: 'food_licences', entityId: licId, userId: req.user.id });
      if (!fileId) {
        const e = new Error(`That file was not accepted. Upload ${uploads.ACCEPTED}.`);
        e.status = 400; throw e;
      }
      await db.execute('UPDATE food_licences SET certificate_file_id = ? WHERE id = ?', [fileId, licId]);
    }

    await audit.record(req, { table: 'food_licences', id: licId, action: 'insert',
      after: { running_room_id: rrId, licence_number: number, valid_upto: validUpto, scanned: !!cert } });
    res.redirect(`${cfg.basePath}/food-safety/${rrId}`);
  } catch (e) { next(e); }
});

/** The certificate itself, reachable only through a room the user may see. */
router.get('/:rrId/licence/:id/file', numeric('rrId','id'), async (req, res, next) => {
  try {
    const rrId = +req.params.rrId;
    await assertRunningRoomAccess(db, req.user, rrId);
    const lic = await db.one(
      'SELECT id, certificate_file_id FROM food_licences WHERE id = ? AND running_room_id = ?',
      [+req.params.id, rrId]);
    if (!lic || !lic.certificate_file_id) {
      const e = new Error('No certificate is attached to that licence.'); e.status = 404; throw e;
    }
    const f = await db.one('SELECT * FROM files WHERE id = ?', [lic.certificate_file_id]);
    if (!f) { const e = new Error('Not found'); e.status = 404; throw e; }
    uploads.sendFile(res, f);
  } catch (e) { next(e); }
});

/* ------------------------------------------------ periodic obligations */
router.post('/:rrId/returns', numeric('rrId'), requirePermission('fssai.edit'),
  uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.params.rrId;
    await assertRunningRoomAccess(db, req.user, rrId);

    const obligation = req.body.obligation;
    if (!OBLIGATION_LABELS[obligation]) {
      const e = new Error('Unknown obligation.'); e.status = 400; throw e;
    }
    const period = String(req.body.period_label || '').trim().slice(0, 30);
    if (!period) { const e = new Error('Say which period this covers.'); e.status = 400; throw e; }

    const cur = await db.one(
      'SELECT id FROM food_licences WHERE running_room_id = ? AND is_current = 1', [rrId]);
    const doc = (req.files || []).find(f => f.fieldname === 'document' && f.size);
    const str = (k, n) => String(req.body[k] || '').trim().slice(0, n) || null;

    const ins = await db.execute(`
      INSERT INTO food_licence_returns
        (running_room_id, licence_id, obligation, period_label, due_on, completed_on,
         reference_no, agency_name, result_summary, recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        completed_on = VALUES(completed_on), reference_no = VALUES(reference_no),
        agency_name  = VALUES(agency_name),  result_summary = VALUES(result_summary)`,
      [rrId, cur ? cur.id : null, obligation, period,
       req.body.due_on || today(), req.body.completed_on || today(),
       str('reference_no', 80), str('agency_name', 200), str('result_summary', 400), req.user.id]);

    // ON DUPLICATE KEY leaves insertId at 0 when it updated rather than inserted.
    const rowId = ins.insertId || (await db.one(
      `SELECT id FROM food_licence_returns
        WHERE running_room_id = ? AND obligation = ? AND period_label = ?`,
      [rrId, obligation, period]) || {}).id;

    if (doc && rowId) {
      const fileId = await uploads.store(doc,
        { entityTable: 'food_licence_returns', entityId: rowId, userId: req.user.id });
      if (!fileId) {
        const e = new Error(`That file was not accepted. Upload ${uploads.ACCEPTED}.`);
        e.status = 400; throw e;
      }
      await db.execute('UPDATE food_licence_returns SET document_file_id = ? WHERE id = ?', [fileId, rowId]);
    }

    await audit.record(req, { table: 'food_licence_returns', id: rowId || rrId, action: 'insert',
      after: { running_room_id: rrId, obligation, period_label: period, scanned: !!doc } });
    res.redirect(`${cfg.basePath}/food-safety/${rrId}`);
  } catch (e) { next(e); }
});

router.get('/:rrId/returns/:id/file', numeric('rrId','id'), async (req, res, next) => {
  try {
    const rrId = +req.params.rrId;
    await assertRunningRoomAccess(db, req.user, rrId);
    const row = await db.one(
      'SELECT id, document_file_id FROM food_licence_returns WHERE id = ? AND running_room_id = ?',
      [+req.params.id, rrId]);
    if (!row || !row.document_file_id) {
      const e = new Error('No document is attached to that entry.'); e.status = 404; throw e;
    }
    const f = await db.one('SELECT * FROM files WHERE id = ?', [row.document_file_id]);
    if (!f) { const e = new Error('Not found'); e.status = 404; throw e; }
    uploads.sendFile(res, f);
  } catch (e) { next(e); }
});

/* ------------------------------------------------------- the inspection */
router.get('/:rrId/inspect', numeric('rrId'), requirePermission('fssai.inspect'), async (req, res, next) => {
  try {
    const rrId = +req.params.rrId;
    await assertRunningRoomAccess(db, req.user, rrId);
    const rr = await db.one(`
      SELECT rr.id, rr.name, d.code AS div_code FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id WHERE rr.id = ?`, [rrId]);
    if (!rr) { const e = new Error('Running room not found'); e.status = 404; throw e; }

    const items = await db.query(
      `SELECT * FROM food_check_items WHERE is_active = 1 ORDER BY sort_order, id`);
    const current = await db.one(
      'SELECT * FROM food_licences WHERE running_room_id = ? AND is_current = 1', [rrId]);

    res.render('food-safety/inspect', { title: `Food safety inspection · ${rr.name}`,
      rr, items, current, state: licenceState(current), today: today() });
  } catch (e) { next(e); }
});

router.post('/:rrId/inspect', numeric('rrId'), requirePermission('fssai.inspect'), async (req, res, next) => {
  try {
    const rrId = +req.params.rrId;
    await assertRunningRoomAccess(db, req.user, rrId);

    const items = await db.query(
      `SELECT id, is_critical FROM food_check_items WHERE is_active = 1`);
    const answers = items.map(it => {
      const v = req.body[`item_${it.id}`];
      return { id: it.id, is_critical: it.is_critical,
               status: ['complied','not_complied','not_applicable'].includes(v) ? v : 'complied',
               observation: String(req.body[`obs_${it.id}`] || '').trim().slice(0, 500) || null };
    });

    const checked  = answers.filter(a => a.status !== 'not_applicable').length;
    const failed   = answers.filter(a => a.status === 'not_complied').length;
    const critical = answers.filter(a => a.status === 'not_complied' && a.is_critical).length;

    // One critical failure decides the visit. A kitchen with an unlicensed
    // water source does not become satisfactory by scoring well elsewhere.
    const result = critical > 0 ? 'unsatisfactory'
                 : failed > 0   ? 'needs_improvement'
                 : 'satisfactory';

    const cur = await db.one(
      'SELECT id FROM food_licences WHERE running_room_id = ? AND is_current = 1', [rrId]);

    const ins = await db.execute(`
      INSERT INTO food_inspections
        (running_room_id, licence_id, inspection_date, inspected_by, inspector_name,
         contractor_rep_name, items_checked, items_failed, critical_failed, result, remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        items_checked = VALUES(items_checked), items_failed = VALUES(items_failed),
        critical_failed = VALUES(critical_failed), result = VALUES(result),
        remarks = VALUES(remarks)`,
      [rrId, cur ? cur.id : null, req.body.inspection_date || today(), req.user.id,
       String(req.body.inspector_name || req.user.full_name || '').slice(0, 150) || null,
       String(req.body.contractor_rep_name || '').trim().slice(0, 150) || null,
       checked, failed, critical, result,
       String(req.body.remarks || '').trim().slice(0, 2000) || null]);

    const inspId = ins.insertId || (await db.one(
      'SELECT id FROM food_inspections WHERE running_room_id = ? AND inspection_date = ?',
      [rrId, req.body.inspection_date || today()]) || {}).id;

    for (const a of answers) {
      await db.execute(`
        INSERT INTO food_inspection_items (inspection_id, item_id, status, observation)
        VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), observation = VALUES(observation)`,
        [inspId, a.id, a.status, a.observation]);
    }

    await audit.record(req, { table: 'food_inspections', id: inspId, action: 'insert',
      after: { running_room_id: rrId, result, items_failed: failed, critical_failed: critical } });
    res.redirect(`${cfg.basePath}/food-safety/inspection/${inspId}`);
  } catch (e) { next(e); }
});

router.get('/inspection/:id', numeric('id'), async (req, res, next) => {
  try {
    const insp = await db.one(`
      SELECT fi.*, rr.name AS rr_name, rr.id AS rr_id, d.code AS div_code, u.full_name AS inspector
      FROM food_inspections fi
      JOIN running_rooms rr ON rr.id = fi.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN users u ON u.id = fi.inspected_by
      WHERE fi.id = ?`, [+req.params.id]);
    if (!insp) { const e = new Error('Inspection not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, insp.running_room_id);

    const rows = await db.query(`
      SELECT fii.*, ci.item_code, ci.description, ci.section, ci.section_name,
             ci.source_ref, ci.is_critical, ci.sort_order
      FROM food_inspection_items fii JOIN food_check_items ci ON ci.id = fii.item_id
      WHERE fii.inspection_id = ? ORDER BY ci.sort_order, ci.id`, [+req.params.id]);

    res.render('food-safety/inspection', { title: `Inspection · ${insp.rr_name}`, insp, rows });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.licenceState = licenceState;
module.exports.expectedObligations = expectedObligations;
