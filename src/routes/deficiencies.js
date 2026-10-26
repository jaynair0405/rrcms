/**
 * The consolidated deficiency register.
 *
 * Every recorded deficiency, whatever surfaced it — the daily checklist, an
 * inspection, a complaint. NO MONETARY COLUMN EXISTS. The clause rate is shown
 * as reference only, and the page says so, because these are the rows the
 * penalty engine will read once the schedule under review is settled.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const terms = require('../services/contract-terms');
const { today } = require('../lib/day');

const router = express.Router();
router.use(requirePermission('rr.view'));

/**
 * The periodic review — the weekly and monthly clauses.
 *
 * The daily joint compliance report covers the clauses the tender marks daily,
 * and until now that was the ONLY way a deficiency could be recorded. The
 * twelve monthly `M` clauses and the two weekly `D` clauses were seeded in full
 * and reachable from nowhere: garden upkeep, replacement of staff without the
 * Railway's permission, uniform and shoes not supplied, wages not paid by the
 * 10th, misuse of water and electricity, the complaint book, the pest schedule,
 * loss of Railway material, fire extinguishers — none of it could be recorded
 * against the contractor at all.
 *
 * M10 is the tender's own catch-all ("irregularity noticed during inspection or
 * poor performance"), so an irregularity the schedule does not name has a home
 * without inventing a clause.
 *
 * The grading clauses (group G) are deliberately absent: they are computed from
 * occupant feedback against the 50% coverage floor, not ticked by anybody.
 */
const PERIODS = {
  weekly:  { label: 'Weekly',  frequency: 'weekly' },
  monthly: { label: 'Monthly', frequency: 'monthly' },
};

/** Monday of the week a date falls in, so a weekly review has one identity. */
function weekStart(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;              // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

async function reviewContext(req) {
  const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
  const rooms = await db.query(
    `SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code
     FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
     WHERE ${s.sql} ORDER BY rr.name`, s.params);
  if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
  const rr = rooms.find(r => r.id === (+req.query.rr || +req.body?.rr)) || rooms[0];
  const period = PERIODS[req.query.period || req.body?.period] ? (req.query.period || req.body?.period) : 'monthly';
  const todayStr = today();
  // A monthly review is dated the first of the month; a weekly one, its Monday.
  // Both give the period a single identity, so saving it twice corrects rather
  // than duplicates.
  const on = period === 'monthly'
    ? String(req.query.month || req.body?.month || todayStr).slice(0, 7) + '-01'
    : weekStart(String(req.query.week || req.body?.week || todayStr).slice(0, 10));
  return { rooms, rr, period, on };
}

router.get('/review', requirePermission('deficiency.record'), async (req, res, next) => {
  try {
    const { rooms, rr, period, on } = await reviewContext(req);
    // The contract's own penalty schedule where this room has one, and the
    // generic tender clauses only where it does not. See services/contract-terms.
    const contractId = await terms.contractIdFor(db, rr.id);
    const picked = await terms.scopedRows(db, contractId, (scope, p) => [`
      SELECT id, clause_code, group_code, group_name, description, rate, unit,
             frequency, applies_to_meals, source_ref
      FROM deficiency_clauses
      WHERE is_active = 1 AND is_formula = 0 AND frequency = ?
        AND ${scope}
        AND (effective_to IS NULL OR effective_to >= CURDATE())
        ${rr.has_meal_facility ? '' : 'AND applies_to_meals = 0'}
      ORDER BY group_code, LENGTH(clause_code), clause_code`,
      [PERIODS[period].frequency, ...p]]);
    const clauses = picked.rows;
    const clausesFromContract = picked.fromContract;

    // What this review already recorded, so a second visit shows the first.
    const already = await db.query(`
      SELECT clause_id, quantity, description, status, evidence_file_id FROM deficiencies
      WHERE running_room_id = ? AND occurred_on = ? AND source = 'review'`, [rr.id, on]);
    const found = {};
    already.forEach(d => { found[d.clause_id] = d; });

    res.render('deficiencies/review', { title: `${PERIODS[period].label} review`,
      rooms, rr, period, on, clauses, clausesFromContract, found, saved: req.query.saved || null,
      locked: already.some(d => d.status !== 'open'),
      periods: PERIODS });
  } catch (e) { next(e); }
});

router.post('/review', requirePermission('deficiency.record'),
  uploads.upload.any(), async (req, res, next) => {
  try {
    const { rr, period, on } = await reviewContext(req);
    await assertRunningRoomAccess(db, req.user, rr.id);

    const marks = Object.entries(req.body)
      .map(([k, v]) => { const m = /^c_(\d+)$/.exec(k); return m ? { clauseId: +m[1], status: String(v) } : null; })
      .filter(Boolean);

    /* THE PHOTOGRAPHS ALREADY ATTACHED, BEFORE ANYTHING IS DELETED.
     *
     * Saving the review again deletes the open rows and writes them afresh. That
     * is right for a correction -- but it would take the evidence with it. An
     * officer who reopens the review to fix a quantity would silently destroy
     * the photograph he attached ten minutes earlier, and nothing on the screen
     * would say so. The same trap the cleaning register has, solved there with
     * COALESCE; here the row is destroyed rather than updated, so the file id
     * has to be carried across by hand. */
    const kept = {};
    (await db.query(
      `SELECT clause_id, evidence_file_id FROM deficiencies
        WHERE running_room_id = ? AND occurred_on = ? AND source = 'review'
          AND status = 'open' AND evidence_file_id IS NOT NULL`, [rr.id, on]))
      .forEach(r => { kept[r.clause_id] = r.evidence_file_id; });

    // Saving the review again corrects it. Only rows this review raised, on this
    // date, that nobody has acted on yet are cleared -- a deficiency already
    // rectified or closed is a piece of history and is left exactly alone.
    await db.execute(
      `DELETE FROM deficiencies WHERE running_room_id = ? AND occurred_on = ?
       AND source = 'review' AND status = 'open'`, [rr.id, on]);

    const byField = {};
    (req.files || []).forEach(f => { (byField[f.fieldname] ||= []).push(f); });

    let raised = 0;
    for (const m of marks) {
      if (m.status !== 'not_complied') continue;
      const qty = Math.max(1, parseInt(req.body[`q_${m.clauseId}`], 10) || 1);
      const obs = String(req.body[`o_${m.clauseId}`] || '').trim().slice(0, 500);
      /* A photograph sent against a clause marked Complied is DISCARDED. A
       * hidden file input still posts its file, so an officer who attached one
       * and then changed his mind would otherwise leave a picture of a fault
       * against a finding the register says was met. */
      const sent = (byField[`p_${m.clauseId}`] || [])[0];
      const fileId = sent
        ? await uploads.store(sent, { entityTable: 'deficiencies', entityId: null, userId: req.user.id })
        : (kept[m.clauseId] || null);

      await db.execute(`
        INSERT INTO deficiencies (running_room_id, clause_id, occurred_on, quantity, source,
          source_ref_table, source_ref_id, description, evidence_file_id, recorded_by, status)
        VALUES (?,?,?,?, 'review', 'deficiency_review', NULL, ?, ?, ?, 'open')`,
        [rr.id, m.clauseId, on, qty,
         obs || `Recorded on the ${PERIODS[period].label.toLowerCase()} review`,
         fileId, req.user.id]);
      raised++;
    }

    await audit.record(req, { table: 'deficiencies', id: rr.id, action: 'update',
      after: { running_room_id: rr.id, occurred_on: on, period, checked: marks.length, raised } });
    const back = period === 'monthly' ? `month=${on.slice(0, 7)}` : `week=${on}`;
    res.redirect(`${cfg.basePath}/deficiencies/review?rr=${rr.id}&period=${period}&${back}&saved=${raised}`);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const { rr = '', status = '', group = '', from = '', to = '' } = req.query;
    // `highlight` names one row to scroll to and tint. The register is a list,
    // not a set of detail pages — there is nothing on a page-per-deficiency that
    // the row does not already carry — so a screen that has just raised one
    // sends the officer here pointing at it rather than to a page of its own.
    const highlight = +req.query.highlight || 0;
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
    if (rr)     { where.push('rr.id = ?');           params.push(+rr); }
    if (status) { where.push('df.status = ?');       params.push(status); }
    if (group)  { where.push('dc.group_code = ?');   params.push(group); }
    if (from)   { where.push('df.occurred_on >= ?'); params.push(from); }
    if (to)     { where.push('df.occurred_on <= ?'); params.push(to); }

    const rows = await db.query(`
      SELECT df.*, dc.clause_code, dc.group_code, dc.group_name,
             dc.description AS clause_description, dc.rate, dc.unit,
             rr.name AS rr_name, rr.id AS rr_id, d.code AS div_code
      FROM deficiencies df
      JOIN deficiency_clauses dc ON dc.id = df.clause_id
      JOIN running_rooms rr ON rr.id = df.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      WHERE ${where.join(' AND ')}
      ORDER BY (df.status = 'open') DESC, df.occurred_on DESC, df.id DESC
      LIMIT 300`, params);

    const counts = await db.one(`
      SELECT COUNT(*) AS total,
             SUM(df.status = 'open') AS open,
             SUM(df.status = 'rectified') AS rectified,
             COUNT(DISTINCT df.running_room_id) AS sites
      FROM deficiencies df JOIN running_rooms rr ON rr.id = df.running_room_id
      WHERE ${s.sql}`, s.params);

    const byGroup = await db.query(`
      SELECT dc.group_code, dc.group_name, COUNT(*) AS n
      FROM deficiencies df
      JOIN deficiency_clauses dc ON dc.id = df.clause_id
      JOIN running_rooms rr ON rr.id = df.running_room_id
      WHERE ${s.sql}
      GROUP BY dc.group_code, dc.group_name ORDER BY n DESC`, s.params);

    const rooms = await db.query(`SELECT rr.id, rr.name FROM running_rooms rr WHERE ${s.sql} ORDER BY rr.name`, s.params);
    res.render('deficiencies/index', { title: 'Deficiency register',
      rows, counts: counts || {}, byGroup, rooms, rr, status, group, from, to, highlight });
  } catch (e) { next(e); }
});

router.post('/:id/close', requirePermission('deficiency.close'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const df = await db.one('SELECT id, running_room_id, status FROM deficiencies WHERE id = ?', [id]);
    if (!df) { const e = new Error('Deficiency not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, df.running_room_id);
    const remarks = String(req.body.closure_remarks || '').trim().slice(0, 500);
    if (!remarks) { const e = new Error('Say what was done before closing a deficiency.'); e.status = 400; throw e; }
    await db.execute(
      `UPDATE deficiencies SET status = 'rectified', rectified_on = CURDATE(), closure_remarks = ? WHERE id = ?`,
      [remarks, id]);
    await audit.record(req, { table: 'deficiencies', id, action: 'update',
      before: { status: df.status }, after: { status: 'rectified', closure_remarks: remarks } });
    res.redirect(req.get('referer') || `${cfg.basePath}/deficiencies`);
  } catch (e) { next(e); }
});

module.exports = router;
