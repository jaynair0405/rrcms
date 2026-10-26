/**
 * The contractor's standing obligations. The remainder of audit item P14.
 *
 * Not a page of ticks, although several of the rows are ticks and say so. Two
 * of these obligations carry a rate and a clock — D3 at Rs 1,000 a week for no
 * PC and computer-generated records, D4 at Rs 1,000 a week for no biometric
 * after one month — which is the same shape as clause M5 on the wage register:
 * state the weeks, offer the clause, compute no money.
 *
 * WHERE THE CLOCK STARTS, and why it may not have started at all. "Within one
 * month" has to be one month after something, and that something is the Letter
 * of Acceptance — the authority the contractor works under before the agreement
 * is executed. No LOA date is on record at any pilot site, so for those sites
 * the due date is genuinely unknown and the screen says so. It does not default
 * to today and manufacture a breach out of missing paperwork.
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

const { today } = require('../lib/day');
function bad(msg) { const e = new Error(msg); e.status = 400; return e; }
const dateOrNull = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : null;
const dayMs = 86400000;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * dayMs).toISOString().slice(0, 10);
function addMonths(iso, n) {
  const d = new Date(Date.parse(iso + 'T00:00:00Z'));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / dayMs);

async function context(req) {
  const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
  const list = await db.query(`
    SELECT rr.id, rr.name, dv.code AS div_code
    FROM running_rooms rr JOIN divisions dv ON dv.id = rr.division_id
    WHERE ${s.sql} ORDER BY rr.name`, s.params);
  if (!list.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
  // Express 5 leaves req.body undefined on a GET with no body, so this cannot
  // read through it. `/compliance?rr=1` worked and a bare `/compliance` threw a
  // 500 — caught by the crawl, which is exactly what the crawl is for.
  const id = +req.query.rr || +(req.body && req.body.rr) || list[0].id;
  const rr = list.find(r => r.id === id);
  if (!rr) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
  return { rooms: list, rr };
}

/** The agreement in force at this room, for the date the clocks run from. */
async function anchor(rrId) {
  const c = await db.one(`
    SELECT ct.id, ct.agreement_no, ct.loa_no, ct.loa_date, ct.start_date
    FROM contract_running_rooms crm
    JOIN contracts ct ON ct.id = crm.contract_id
    WHERE crm.running_room_id = ?
      AND (crm.effective_to IS NULL OR crm.effective_to >= CURDATE())
    ORDER BY ct.start_date DESC LIMIT 1`, [rrId]);
  if (!c) return { contract: null, from: null, basis: null };
  const loa = c.loa_date ? String(c.loa_date).slice(0, 10) : null;
  const start = c.start_date ? String(c.start_date).slice(0, 10) : null;

  /* The LOA is the authority the contractor works under between acceptance and
     execution, so it is the right anchor. The agreement's start date is a sound
     fallback — for an agreement that actually exists.

     At the pilot it is not. `db/seed-pilot.js` used to invent a period,
     01.04.2025 to 31.03.2027, because until migration 037 the column would not
     take a NULL; the loader no longer does, but the rows written before it are
     still on the database. An agreement whose NUMBER says AGREEMENT-AWAITED
     cannot supply a trustworthy start date by definition — nobody has issued
     the agreement — so its period is not used as an anchor here, whatever is
     sitting in the column.

     Found on the first walk-through: the obligations page showed clocks running
     from 01.04.2025 at three of the four sites, which is a due date computed
     from a date nobody ever gave. Exactly what the dashboard was corrected for
     at stage 29, arriving again through the fallback. The test is on the
     agreement number rather than on the dates, so it self-corrects the moment a
     real agreement number is entered. */
  const awaited = /^AGREEMENT-AWAITED\//i.test(String(c.agreement_no || ''));
  const usable = loa || (awaited ? null : start);
  return { contract: c, from: usable,
    basis: loa ? 'the LOA' : (usable ? 'the agreement' : null),
    awaited };
}

/**
 * What the register can say about one obligation, and nothing more.
 *
 *   met        — done, on a date
 *   not_met    — somebody looked and it is not in place
 *   overdue    — a due date has passed with nothing recorded
 *   due        — a due date is ahead
 *   unknown    — no due date can be worked out, because no LOA date is on record
 *   open       — no due date exists for this obligation at all; it is a standing tick
 */
function position(item, row, from) {
  const met = row && row.met_on ? String(row.met_on).slice(0, 10) : null;
  let due = null;
  if (item.due_basis === 'loa_plus_days' && from) due = addDays(from, item.due_days || 0);
  if (item.due_basis === 'recurring_months') due = met ? addMonths(met, item.recur_months || 12) : null;

  if (item.due_basis === 'recurring_months') {
    if (!met) return { state: 'open', due: null, weeks: 0 };
    const over = daysBetween(due, today());
    return over > 0
      ? { state: 'overdue', due, weeks: Math.max(1, Math.ceil(over / 7)), met }
      : { state: 'met', due, weeks: 0, met };
  }
  if (met) return { state: 'met', due, weeks: 0, met };
  if (row && row.not_met) {
    const over = due ? daysBetween(due, today()) : 0;
    return { state: 'not_met', due, weeks: over > 0 ? Math.max(1, Math.ceil(over / 7)) : 0 };
  }
  if (item.due_basis === 'none') return { state: 'open', due: null, weeks: 0 };
  if (!due) return { state: 'unknown', due: null, weeks: 0 };
  const over = daysBetween(due, today());
  return over > 0
    ? { state: 'overdue', due, weeks: Math.max(1, Math.ceil(over / 7)) }
    : { state: 'due', due, weeks: 0 };
}

/* ------------------------------------------------------------------ screen */

router.get('/', async (req, res, next) => {
  try {
    const { rooms, rr } = await context(req);
    const a = await anchor(rr.id);

    const items = await db.query(
      'SELECT * FROM compliance_items WHERE is_active = 1 ORDER BY sort_order, id');
    const saved = await db.query(
      'SELECT * FROM compliance_status WHERE running_room_id = ?', [rr.id]);
    const byItem = {}; saved.forEach(x => { byItem[x.item_id] = x; });

    // `cdf`/`cdc` rather than the obvious `df`/`dc`: the deficiency register's
    // own list query is stubbed on that pair in demo/server.js, and written the
    // obvious way this came back as EVERY deficiency at the room — so every
    // clause here reported itself as already raised and no button appeared.
    // Eleventh collision of the shape; distinctive at the source, as before.
    const raised = await db.query(`
      SELECT cdf.id, cdf.quantity, cdf.status, cdc.clause_code
      FROM deficiencies cdf JOIN deficiency_clauses cdc ON cdc.id = cdf.clause_id
      WHERE cdf.running_room_id = ? AND cdf.source_ref_table = 'compliance_status'
        AND cdf.status <> 'withdrawn'`, [rr.id]);
    const raisedBy = {}; raised.forEach(x => { raisedBy[x.clause_code] = x; });

    const rows = items.map(it => {
      const row = byItem[it.id] || null;
      const pos = position(it, row, a.from);
      return { it, row, pos, raised: it.clause_code ? raisedBy[it.clause_code] || null : null };
    });

    /* The 18-to-60 age band. DERIVED, not ticked: the staff register already
       holds a date of birth, and a checkbox somebody ticks is worth less than
       an arithmetic answer. Where the date of birth is absent — which at the
       pilot is everybody — the screen says how many are unknown rather than
       reporting them as compliant. */
    const ages = await db.one(`
      SELECT COUNT(*) AS total,
             SUM(st.date_of_birth IS NULL) AS unknown,
             -- OVER and UNDER are reserved words since window functions
             -- arrived; MySQL and MariaDB both refuse them unquoted as column
             -- aliases, and the stub had no opinion either way. Named in full,
             -- which reads better anyway.
             SUM(st.date_of_birth IS NOT NULL
                 AND TIMESTAMPDIFF(YEAR, st.date_of_birth, CURDATE()) < 18) AS under_18,
             SUM(st.date_of_birth IS NOT NULL
                 AND TIMESTAMPDIFF(YEAR, st.date_of_birth, CURDATE()) > 60) AS over_60
      FROM staff st WHERE st.running_room_id = ? AND st.is_active = 1`, [rr.id]);

    res.render('compliance/index', { title: 'Standing obligations', rooms, rr,
      rows, anchor: a, ages: ages || {}, accepted: uploads.ACCEPTED,
      note: req.query.note || null, saved: req.query.saved || null, today: today() });
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------- save */

router.post('/', requirePermission('compliance.record'), uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const items = await db.query('SELECT id FROM compliance_items WHERE is_active = 1');
    const files = {};
    (req.files || []).forEach(f => { if (f.buffer && f.buffer.length) files[f.fieldname] = f; });

    let written = 0, cleared = 0;
    for (const it of items) {
      const met = dateOrNull(req.body[`met_${it.id}`]);
      if (met && met > today()) throw bad('An obligation cannot be recorded as met on a future date.');
      const notMet = req.body[`no_${it.id}`] === '1' ? 1 : 0;
      const ref = String(req.body[`ref_${it.id}`] || '').trim().slice(0, 120) || null;
      const rem = String(req.body[`rem_${it.id}`] || '').trim().slice(0, 400) || null;
      const f = files[`file_${it.id}`];
      const fileId = f ? await uploads.store(f, { entityTable: 'compliance_status', entityId: null, userId: req.user.id }) : null;

      // Nothing said at all — no row. "Nobody has looked" and "somebody looked
      // and it is not there" are different findings, and only the second is a
      // statement the contractor can be held to.
      if (!met && !notMet && !ref && !rem && !fileId) {
        const r = await db.execute(
          'DELETE FROM compliance_status WHERE running_room_id = ? AND item_id = ?', [rrId, it.id]);
        if (r.affectedRows) cleared++;
        continue;
      }
      if (met && notMet) throw bad('An obligation cannot be both met on a date and recorded as not in place.');
      await db.execute(`
        INSERT INTO compliance_status (running_room_id, item_id, met_on, not_met, reference_no, file_id, remarks, recorded_by)
        VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE met_on = VALUES(met_on), not_met = VALUES(not_met),
          reference_no = VALUES(reference_no), file_id = COALESCE(VALUES(file_id), file_id),
          remarks = VALUES(remarks), recorded_by = VALUES(recorded_by)`,
        [rrId, it.id, met, notMet, ref, fileId, rem, req.user.id]);
      written++;
    }

    await audit.record(req, { table: 'compliance_status', id: rrId, action: 'update',
      after: { running_room_id: rrId, recorded: written, cleared } });
    res.redirect(`${cfg.basePath}/compliance?rr=${rrId}&saved=${written}`);
  } catch (e) { next(e); }
});

/* ---------------------------------------------------- clauses D3, D4 and M12 */

router.post('/clause', requirePermission('deficiency.record'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const item = await db.one('SELECT * FROM compliance_items WHERE id = ? AND is_active = 1', [+req.body.item]);
    if (!item || !item.clause_code) throw bad('That obligation carries no deficiency clause. Most of them do not — an unlit name board is a thing to put right, not a penalty.');

    const a = await anchor(rrId);
    const row = await db.one('SELECT * FROM compliance_status WHERE running_room_id = ? AND item_id = ?', [rrId, item.id]);
    const pos = position(item, row, a.from);
    if (pos.state === 'met' || pos.state === 'due' || pos.state === 'open') throw bad('Nothing is overdue on this obligation, so there is nothing to raise.');
    if (pos.state === 'unknown') throw bad('No due date can be worked out for this obligation, because no LOA date is on record for this running room. Record the LOA on the agreement first — a penalty cannot run from a date nobody has given.');

    const already = await db.one(`
      SELECT cdf.id FROM deficiencies cdf JOIN deficiency_clauses cdc ON cdc.id = cdf.clause_id
      WHERE cdf.running_room_id = ? AND cdf.source_ref_table = 'compliance_status'
        AND cdc.clause_code = ? AND cdf.status <> 'withdrawn'`, [rrId, item.clause_code]);
    if (already) throw bad(`Clause ${item.clause_code} has already been raised for this running room. Correct it on the deficiency register rather than raising it twice.`);

    const clause = await terms.clauseFor(db, rrId, item.clause_code, pos.due);
    if (!clause) throw bad(`No clause covering ${item.name} is on the schedule in force on that date.`);

    const desc = `${item.name} — due ${pos.due}, still not on record. ${pos.weeks} week(s) overdue.`;
    const ins = await db.execute(`
      INSERT INTO deficiencies (running_room_id, clause_id, occurred_on, quantity, source,
        source_ref_table, source_ref_id, description, recorded_by, status)
      VALUES (?,?,?,?, 'review', 'compliance_status', ?, ?, ?, 'open')`,
      [rrId, clause.id, pos.due, Math.max(1, Math.min(65535, pos.weeks)),
       row ? row.id : null, desc, req.user.id]);
    await audit.record(req, { table: 'deficiencies', id: ins.insertId, action: 'insert',
      after: { running_room_id: rrId, clause: item.clause_code, quantity: pos.weeks } });
    res.redirect(`${cfg.basePath}/compliance?rr=${rrId}&note=${item.clause_code}`);
  } catch (e) { next(e); }
});

router.get('/file/:fileId', async (req, res, next) => {
  try {
    const id = +req.params.fileId;
    const owner = await db.one('SELECT running_room_id FROM compliance_status WHERE file_id = ?', [id]);
    if (!owner) { const e = new Error('Not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, owner.running_room_id);
    const f = await db.one('SELECT * FROM files WHERE id = ?', [id]);
    if (!f) { const e = new Error('Not found'); e.status = 404; throw e; }
    uploads.sendFile(res, f);
  } catch (e) { next(e); }
});

module.exports = router;
