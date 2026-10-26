const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const terms = require('../services/contract-terms');

const router = express.Router();
router.use(requirePermission('rr.view'));

const { today } = require('../lib/day');

/* THE BUILDINGS A RUNNING ROOM STANDS IN. Most are one building and this comes
   back empty, which is the answer. Where a room stands in several, a finding
   should say which — an inspector in the BB Guard block writes down what he
   found THERE, and "somewhere in Igatpuri" is not evidence a contractor can
   answer or an officer can verify. */
async function blocksOf(runningRoomId) {
  return db.query(`
    SELECT id, code, name, total_beds FROM running_room_blocks
    WHERE running_room_id = ? AND is_active = 1 ORDER BY sort_order, id`, [runningRoomId]);
}

/* Checked against the running room, never trusted from the form: a posted id
   from another running room would file an Igatpuri finding under a Lonavla
   building. */
async function blockIdFor(runningRoomId, raw) {
  const id = +raw;
  if (!Number.isInteger(id) || id < 1) return null;
  const ok = await db.one(
    'SELECT id FROM running_room_blocks WHERE id = ? AND running_room_id = ? AND is_active = 1',
    [id, runningRoomId]);
  return ok ? id : null;
}
const RESULT = (n) => n === 0 ? 'compliant' : n <= 2 ? 'minor_deficiencies' : 'major_deficiencies';

/* --------------------------------------------------------------- the log */
router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const { rr = '', type = '', result = '' } = req.query;
    const where = [s.sql], params = [...s.params];
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
    if (type)   { where.push('i.inspection_type = ?');params.push(type); }
    if (result) { where.push('i.result = ?');         params.push(result); }

    const rows = await db.query(`
      SELECT i.*, rr.name AS rr_name, rr.id AS rr_id, d.code AS div_code,
             bl.name AS block_name, bl.is_active AS block_live
      FROM inspections i
      JOIN running_rooms rr ON rr.id = i.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN running_room_blocks bl ON bl.id = i.block_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.inspection_date DESC, i.id DESC
      LIMIT 200`, params);

    const counts = await db.one(`
      SELECT COUNT(*) AS total,
             SUM(i.result = 'compliant') AS compliant,
             SUM(i.result = 'minor_deficiencies') AS minor,
             SUM(i.result = 'major_deficiencies') AS major,
             SUM(i.railway_sign_file_id IS NULL AND i.submitted_at IS NOT NULL) AS unsigned_reports
      FROM inspections i JOIN running_rooms rr ON rr.id = i.running_room_id
      WHERE ${s.sql}`, s.params);

    const rooms = await db.query(`SELECT rr.id, rr.name FROM running_rooms rr WHERE ${s.sql} ORDER BY rr.name`, s.params);
    res.render('inspections/index', { title: 'Inspections', tab: 'log',
      rows, counts: counts || {}, rooms, rr, type, result });
  } catch (e) { next(e); }
});

/* ------------------------------------------- the daily joint checklist form */
router.get('/new', requirePermission('inspection.create'), async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const rooms = await db.query(
      `SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code
       FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
       WHERE ${s.sql} ORDER BY rr.name`, s.params);
    if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }

    const id = +req.query.rr || rooms[0].id;
    const rr = rooms.find(r => r.id === id);
    if (!rr) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
    /* NO FUTURE DATES. The form took whatever date it was given, so a
       checklist could be filed for a day nobody had walked yet -- and an
       inspection report dated ahead of itself is the kind of thing noticed in a
       dispute rather than by us. The daily records screen has had this guard
       since the muster was found without one; this screen had not. The asked-for
       date is kept so the page can say what it did rather than silently showing
       a different day. */
    const asked = (req.query.date || today()).slice(0, 10);
    const future = asked > today() ? asked : null;
    const date = future ? today() : asked;
    const type = ['daily_joint','scheduled','surprise','higher_official'].includes(req.query.type)
      ? req.query.type : 'daily_joint';

    const blocks = await blocksOf(rr.id);
    const blockId = blocks.length ? await blockIdFor(rr.id, req.query.block) : null;

    /* ALREADY FILED FOR THIS RUNNING ROOM, DATE, TYPE — AND BUILDING?
       The building had to join this test the moment a running room could stand
       in four. Without it, walking LP Mail in the morning made the form refuse
       LP Ghat in the afternoon and send the inspector to the report he had
       already written — three buildings unwalkable for the rest of the day,
       and the screen showing him a finished report as though that were the
       answer. Found by walking two buildings in a row rather than by reading
       the code. */
    const existing = await db.one(
      `SELECT id FROM inspections
        WHERE running_room_id = ? AND COALESCE(block_id, 0) = ?
          AND inspection_date = ? AND inspection_type = ?`,
      [id, blockId || 0, date, type]);
    /* IT USED TO REDIRECT STRAIGHT TO THE FILED REPORT, and say nothing.
     *
     * Found by the officer on 10.09.2026, testing something else: he had filed
     * the day's report, went back for a second inspection, and was bounced to
     * the finished one with no line saying why. His conclusion was that the
     * form had no date selector -- and it has one; he never reached the page it
     * is on. Anyone else would conclude the same.
     *
     * The redirect was also the only thing standing between a second report and
     * a raw duplicate-key error from the database, because the POST never
     * checked. So the page now renders with the SELECTORS still on it -- running
     * room, date, type, building -- says plainly what is already filed and
     * offers to open it, and leaves the checklist off so nothing can be filled
     * in that is going to be refused. Changing any selector reloads and either
     * opens a blank checklist or says the same thing about that combination. */
    const filed = existing
      ? await db.one(`SELECT id, inspected_by, inspector_name, submitted_at, deficiency_count,
                             items_checked FROM inspections WHERE id = ?`, [existing.id])
      : null;

    // The tender's checklist. Meal clauses do not apply where there is no kitchen.
    const contractId = await terms.contractIdFor(db, rr.id);
    const picked = await terms.scopedRows(db, contractId, (scope, p) => [`
      SELECT id, clause_code, group_code, group_name, description, unit, applies_to_meals
      FROM deficiency_clauses
      WHERE is_active = 1 AND in_daily_checklist = 1 AND is_formula = 0
        AND ${scope}
        ${rr.has_meal_facility ? '' : 'AND applies_to_meals = 0'}
      ORDER BY group_code, LENGTH(clause_code), clause_code`, p]);
    const clauses = picked.rows;
    const clausesFromContract = picked.fromContract;

    res.render('inspections/new', { title: 'Daily joint checklist', tab: 'new',
      rooms, rr, date, type, clauses, clausesFromContract, blocks, blockId,
      filed, future, maxDate: today() });
  } catch (e) { next(e); }
});

router.post('/new', requirePermission('inspection.create'),
  uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const date = String(req.body.date || today()).slice(0, 10);
    if (date > today()) {
      const e = new Error('That date has not happened yet. An inspection is filed for the day it '
        + 'was walked, and no later than today.');
      e.status = 400; throw e;
    }
    const type = ['daily_joint','scheduled','surprise','higher_official'].includes(req.body.type)
      ? req.body.type : 'daily_joint';
    /* AN INSPECTION IS NOT ALWAYS A JOINT ONE, and the form used to insist it
       was. The officer's own site: "cli can inspect any time and supervisor
       available only on day shift." A required name made a night inspection
       impossible to file, and an inspection that cannot be filed is one that
       never happened as far as any record goes.

       Nobody present is a FACT, and a different fact from a blank box, so it
       has to be stated rather than inferred from silence: either a name, or a
       tick saying there was nobody. NULL in the column means the second, which
       needs no migration -- until today the column could not be null, so every
       row already on record carries a real name. */
    const contractorRep = String(req.body.contractor_rep_name || '').trim().slice(0, 150);
    const unaccompanied = req.body.unaccompanied === '1';
    if (!contractorRep && !unaccompanied) {
      const e = new Error("Name the contractor's representative, or tick to say nobody from the "
        + 'contractor was present. A blank box does not tell the difference between the two, and '
        + 'the difference is worth having.');
      e.status = 400; throw e;
    }

    const items = Object.keys(req.body)
      .filter(k => k.startsWith('c_'))
      .map(k => ({ clauseId: +k.slice(2), status: String(req.body[k]) }))
      .filter(i => ['complied','not_complied','not_applicable'].includes(i.status));
    if (!items.length) { const e = new Error('Nothing was checked.'); e.status = 400; throw e; }

    const fails = items.filter(i => i.status === 'not_complied');

    /* The building is optional. An inspection may genuinely cover the whole of
       Igatpuri; requiring one would make the inspector pick a building falsely
       to get past the form, and a false place on a finding is worse than none.
       Until migration 056 it could not be recorded at all: the unique key held
       one daily joint inspection per running room per day, so inspecting LP
       Mail and then LP Ghat on the same morning kept only the second. */
    const blockId = await blockIdFor(rrId, req.body.block);
    /* The unique key on (running room, building, date, type) is what actually
       prevents two reports for the same walk. Until now nothing caught it being
       hit, so a second submit -- two people filing at once, or a back button and
       a re-send -- surfaced as a raw duplicate-key error. The record is right
       either way; what was wrong was the sentence the officer got. */
    let ins;
    try {
      ins = await db.execute(`
        INSERT INTO inspections (running_room_id, block_id, inspection_date, inspection_type,
          inspected_by, inspector_name, contractor_rep_name, items_checked, deficiency_count,
          result, submitted_at, remarks)
        VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
        [rrId, blockId, date, type, req.user.id, req.user.full_name, contractorRep || null,
         items.length, fails.length, RESULT(fails.length),
         String(req.body.remarks || '').trim().slice(0, 2000) || null]);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        const e = new Error('A report of this type for this running room, this building and this '
          + 'date is already filed. Open it from the inspection log, or change the building, the '
          + 'type or the date to file another.');
        e.status = 400; throw e;
      }
      throw err;
    }
    const inspectionId = ins.insertId;

    const byField = {};
    (req.files || []).forEach(f => { (byField[f.fieldname] ||= []).push(f); });

    for (const it of items) {
      const qty = Math.max(0, parseInt(req.body[`q_${it.clauseId}`], 10) || 0);
      const obs = String(req.body[`o_${it.clauseId}`] || '').trim().slice(0, 500) || null;

      let fileId = null;
      const photo = (byField[`p_${it.clauseId}`] || [])[0];
      if (photo) fileId = await uploads.store(photo,
        { entityTable: 'inspection_items', entityId: inspectionId, userId: req.user.id });

      await db.execute(`
        INSERT INTO inspection_items (inspection_id, clause_id, status, quantity, observation, evidence_file_id)
        VALUES (?,?,?,?,?,?)`,
        [inspectionId, it.clauseId, it.status, it.status === 'not_complied' ? Math.max(1, qty) : 0, obs, fileId]);

      // A "not complied" tick becomes a deficiency in its own right, against the
      // clause. This is the row the penalty engine will read once it is enabled.
      if (it.status === 'not_complied')
        await db.execute(`
          INSERT INTO deficiencies (running_room_id, clause_id, occurred_on, quantity, source,
            source_ref_table, source_ref_id, description, evidence_file_id, recorded_by, status)
          VALUES (?,?,?,?, 'daily_checklist', 'inspections', ?, ?, ?, ?, 'open')`,
          [rrId, it.clauseId, date, Math.max(1, qty), inspectionId,
           obs || 'Recorded on the daily joint compliance report', fileId, req.user.id]);
    }

    await audit.record(req, { table: 'inspections', id: inspectionId, action: 'insert',
      after: { running_room_id: rrId, block_id: blockId, date, type,
               items: items.length, deficiencies: fails.length } });
    res.redirect(`${cfg.basePath}/inspections/${inspectionId}`);
  } catch (e) { next(e); }
});

/* ------------------------------------------------------- a single report */
router.get('/:id', async (req, res, next) => {
  try {
    const id = +req.params.id;
    const insp = await db.one(`
      SELECT i.*, rr.name AS rr_name, rr.id AS rr_id, d.code AS div_code, d.name AS div_name,
             bl.name AS block_name, bl.is_active AS block_live
      FROM inspections i
      JOIN running_rooms rr ON rr.id = i.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN running_room_blocks bl ON bl.id = i.block_id
      WHERE i.id = ?`, [id]);
    if (!insp) { const e = new Error('Inspection not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, insp.rr_id);

    const items = await db.query(`
      SELECT ii.*, dc.clause_code, dc.group_name, dc.description, dc.unit
      FROM inspection_items ii
      JOIN deficiency_clauses dc ON dc.id = ii.clause_id
      WHERE ii.inspection_id = ?
      ORDER BY dc.group_code, LENGTH(dc.clause_code), dc.clause_code`, [id]);

    res.render('inspections/show', { title: 'Joint inspection report', tab: 'log', insp, items,
      fails: items.filter(i => i.status === 'not_complied') });
  } catch (e) { next(e); }
});

router.post('/:id/sign', requirePermission('inspection.sign'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const insp = await db.one('SELECT id, running_room_id, railway_sign_file_id FROM inspections WHERE id = ?', [id]);
    if (!insp) { const e = new Error('Inspection not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, insp.running_room_id);
    await db.execute(`UPDATE inspections SET railway_sign_file_id = 0, remarks = CONCAT(COALESCE(remarks,''),
      IF(remarks IS NULL OR remarks = '', '', '\\n'), ?) WHERE id = ?`,
      [`Signed by ${req.user.full_name} on ${today()}.`, id]);
    await audit.record(req, { table: 'inspections', id, action: 'sign', after: { signed_by: req.user.full_name } });
    res.redirect(`${cfg.basePath}/inspections/${id}`);
  } catch (e) { next(e); }
});

/* ------------------------------------------------------- evidence photos
 *
 * THIS ROUTE USED TO SERVE ANY FILE IN THE SYSTEM. It fetched the row and
 * checked access only `if (f.entity_table === 'inspection_items')`; everything
 * else -- staff documents, bill documents, food licences, wage sheets -- fell
 * through to being served, because they all live in the one `files` table. Any
 * signed-in user of any role could walk ids and read the lot. Proved on
 * 10.09.2026 by planting a row marked `staff_documents` and fetching it as the
 * RR In-charge and again as the contractor's supervisor: 200 both times.
 *
 * It is kept only as a redirect. Old links live in bookmarks and in the pages
 * an officer already has open, and a dead link would look like the evidence had
 * gone missing. It now decides nothing: /photo/:id applies the owning record's
 * running room and the owning record's permission. */
router.get('/photo/:fileId', (req, res) =>
  res.redirect(302, `${cfg.basePath}/photo/${encodeURIComponent(req.params.fileId)}`));

module.exports = router;
