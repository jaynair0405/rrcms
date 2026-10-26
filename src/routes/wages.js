/**
 * Wages, EPF, ESIC, bonus and the Shramik Kalyan Portal. Audit item P7.
 *
 * The muster proves a man was present. Until this register nothing proved he
 * was PAID for being there, which is the question a labour inspector, an
 * accounts office and a review committee all ask first.
 *
 * The shape follows clause M5 — Rs 100 per staff per DAY where wages are not
 * paid by the 10th of the following month. A penalty that multiplies men by
 * days cannot be answered from a monthly total, so the register is per man,
 * and the date wages actually reached him is a recorded fact.
 *
 * As everywhere else in RR-CMS, NO RUPEE FIGURE IS COMPUTED. The screen states
 * that July's wages were paid on the 18th, eight days after the due date, to
 * fourteen men. Turning that into money is the officer's act, through the
 * deficiency register, against the schedule rate.
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
router.use(requirePermission('wages.view'));

/* The four statutory returns, in the tender's own order, with the clause each
   answers so the screen can say why it is asking. */
const RETURNS = [
  ['epf',            'EPF contribution',        'Payment Terms 5(4) — submitted to the EPF department',      true],
  ['esic',           'ESIC contribution',       'Payment Terms 5(5) — paid to ESIC',                          true],
  ['bonus',          'Bonus',                   'Payment Terms 5(7) — bonus paid to the labourers',           true],
  ['shramik_kalyan', 'Shramik Kalyan Portal',   "Payment Terms 5(11) — portal updated, Annexure 'D'",        false],
];
const RETURN_CODES = RETURNS.map(r => r[0]);

const pad = n => String(n).padStart(2, '0');
const { thisMonth, today } = require('../lib/day');
function bad(msg) { const e = new Error(msg); e.status = 400; return e; }

/** The first of the month, as the table stores it. */
const firstOf = ym => `${ym}-01`;

/**
 * Clause M5's due date: the 10th of the month AFTER the wage month. Written out
 * rather than left to a date library, because this single line is what the
 * penalty turns on and it has to be readable by whoever checks it next.
 */
function dueDate(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-10` : `${y}-${pad(m + 1)}-10`;
}
const daysBetween = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * What the register can say about clause M5 for one month, and nothing more.
 *
 *   paid on or before the 10th  — nothing to answer
 *   paid after the 10th         — late by N days, for the men on the sheet
 *   not paid, 10th has passed   — outstanding, N days and counting
 *   not paid, 10th still ahead  — not yet due; silence is not a breach
 *
 * `men` is the number of men actually written down as paid, not the strength on
 * roll. Accusing a contractor over men nobody entered would be the register
 * inventing the case rather than recording it.
 */
function m5Position(ym, paidOn, men) {
  const due = dueDate(ym);
  const now = today();
  if (paidOn) {
    const late = daysBetween(due, paidOn);
    return late > 0
      ? { state: 'late', due, days: late, men, quantity: men * late }
      : { state: 'ontime', due, days: 0, men, quantity: 0 };
  }
  const over = daysBetween(due, now);
  if (over > 0) return { state: 'outstanding', due, days: over, men, quantity: men * over };
  return { state: 'notyet', due, days: 0, men, quantity: 0 };
}

async function context(req) {
  const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
  const rooms = await db.query(`
    SELECT rr.id, rr.name, rr.total_beds, d.code AS div_code
    FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
    WHERE ${s.sql} ORDER BY rr.name`, s.params);
  if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
  const id = +req.query.rr || rooms[0].id;
  const rr = rooms.find(r => r.id === id);
  if (!rr) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
  let month = String(req.query.month || '').slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) month = thisMonth();
  return { rooms, rr, month };
}

/* ------------------------------------------------------------------- screen */

router.get('/', async (req, res, next) => {
  try {
    const { rooms, rr, month } = await context(req);
    const first = firstOf(month);
    const last = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);

    const wm = await db.one(`
      SELECT w.*, u.full_name AS verified_name, r.full_name AS recorded_name
      FROM wage_months w
      LEFT JOIN users u ON u.id = w.verified_by
      LEFT JOIN users r ON r.id = w.recorded_by
      WHERE w.running_room_id = ? AND w.wage_month = ?`, [rr.id, first]);

    /* The men to list: everyone on the roll at any point in the month. A man
       who left on the 12th was still owed twelve days, and a register that
       drops him the moment he leaves is the register a dispute is about.

       Two filters were here on the first cut and both were wrong, in the same
       way. `date_of_joining <= ?` dropped every man whose joining date is not
       on record — which, at all four pilot rooms, is every man on the roster,
       because the Railway has supplied no joining dates. And a screening filter
       dropped every man still `pending`, which is again every man on the
       roster. Between them the payment sheet came back empty at every pilot
       site, and the register was unusable on the day it shipped.

       The principle is the one the rest of this system runs on: MISSING DATA IS
       NOT A REASON TO HIDE A MAN. He is on the roll, he was paid or he was not,
       and both the absent joining date and the unfinished screening are shown
       on his line as the findings they are. A man paid while unscreened is
       something an officer needs to SEE, not something the register should
       quietly decline to record. */
    const men = await db.query(`
      SELECT s.id, s.staff_code, s.full_name, s.date_of_joining, s.date_of_leaving,
             s.bank_account_no, s.epf_no, s.esic_no, s.screening_status,
             dg.name AS designation, dg.sort_order,
             (SELECT COUNT(*) FROM attendance_daily a
               WHERE a.staff_id = s.id AND a.attendance_date BETWEEN ? AND ?
                 AND a.status IN ('present','reliever')) AS days_present,
             -- Marks of ANY kind, so the screen can tell "present on no day"
             -- from "the muster was never marked". A column of zeros against an
             -- unmarked month invites a supervisor to write 0 days paid, and
             -- that is this register manufacturing a finding out of silence.
             (SELECT COUNT(*) FROM attendance_daily a2
               WHERE a2.staff_id = s.id AND a2.attendance_date BETWEEN ? AND ?) AS days_marked
      FROM staff s
      LEFT JOIN designations dg ON dg.id = s.designation_id
      WHERE s.running_room_id = ?
        AND s.is_active = 1
        AND (s.date_of_joining IS NULL OR s.date_of_joining <= ?)
        AND (s.date_of_leaving IS NULL OR s.date_of_leaving >= ?)
      ORDER BY dg.sort_order, s.full_name`, [first, last, first, last, rr.id, last, first]);

    const paid = wm ? await db.query(
      'SELECT * FROM wage_payments WHERE wage_month_id = ?', [wm.id]) : [];
    const byStaff = {}; paid.forEach(p => { byStaff[p.staff_id] = p; });

    const returnRows = wm ? await db.query(
      'SELECT * FROM wage_returns WHERE wage_month_id = ?', [wm.id]) : [];
    const byType = {}; returnRows.forEach(r => { byType[r.return_type] = r; });

    const rows = men.map(m => ({ m, p: byStaff[m.id] || null }));
    // Was the muster kept at all this month? One unmarked man is his own
    // absence from the register; a whole room unmarked is a different fact, and
    // the officer should be told which of the two he is looking at.
    const musterKept = rows.some(r => r.m.days_marked > 0);
    const unscreened = rows.filter(r => !['approved', 'provisional'].includes(r.m.screening_status)).length;
    const written = rows.filter(r => r.p).length;
    const stated = rows.filter(r => r.p && r.p.amount_paid !== null).length;
    const m5 = m5Position(month, wm && wm.paid_on ? String(wm.paid_on).slice(0, 10) : null, written);

    // Has this month's M5 already been raised? A register that offers to raise
    // the same deficiency twice is a register that produces double penalties.
    const raised = wm ? await db.one(`
      SELECT d.id, d.quantity, d.status, d.occurred_on FROM deficiencies d
      WHERE d.source_ref_table = 'wage_months' AND d.source_ref_id = ?
        AND d.status <> 'withdrawn' LIMIT 1`, [wm.id]) : null;

    // Twelve months at a glance. The column that matters is not the total but
    // the date: a contractor who pays every month on the 15th is a standing M5
    // case, and that only shows up in a row of dates.
    const history = await db.query(`
      SELECT w.wage_month, w.paid_on, w.verified_at,
             (SELECT COUNT(*) FROM wage_payments p WHERE p.wage_month_id = w.id) AS men,
             (SELECT COUNT(*) FROM wage_returns  r WHERE r.wage_month_id = w.id
                AND r.paid_on IS NOT NULL) AS returns_filed
      FROM wage_months w
      WHERE w.running_room_id = ?
        AND w.wage_month BETWEEN DATE_SUB(?, INTERVAL 11 MONTH) AND ?
      ORDER BY w.wage_month DESC`, [rr.id, first, first]);
    const seen = new Set(history.map(h => String(h.wage_month).slice(0, 7)));
    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 - i, 1));
      const ym = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
      const h = history.find(x => String(x.wage_month).slice(0, 7) === ym);
      const p = h && h.paid_on ? String(h.paid_on).slice(0, 10) : null;
      months.push({ ym, recorded: !!h, paid_on: p, men: h ? h.men : 0,
        returns_filed: h ? h.returns_filed : 0, verified: !!(h && h.verified_at),
        m5: m5Position(ym, p, h ? h.men : 0) });
    }
    void seen;

    res.render('wages/index', {
      title: 'Wages and labour compliance', rooms, rr, month, wm, rows, returns: RETURNS,
      byType, m5, raised, months, written, stated, musterKept, unscreened,
      accepted: uploads.ACCEPTED,
      saved: req.query.saved || null, note: req.query.note || null,
    });
  } catch (e) { next(e); }
});

/* The payment sheet and the challans. Ownership is resolved through the wage
   month rather than through files.entity_id, because a sheet is stored before
   the month row exists on a first save and would otherwise carry no owner at
   all — and a document nobody owns is a document nobody can be refused. */
router.get('/file/:fileId', async (req, res, next) => {
  try {
    const id = +req.params.fileId;
    const owner = await db.one(`
      SELECT w.running_room_id FROM wage_months w WHERE w.sheet_file_id = ?
      UNION
      SELECT w2.running_room_id FROM wage_returns r
        JOIN wage_months w2 ON w2.id = r.wage_month_id WHERE r.file_id = ?`, [id, id]);
    if (!owner) { const e = new Error('Not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, owner.running_room_id);
    const f = await db.one('SELECT * FROM files WHERE id = ?', [id]);
    if (!f) { const e = new Error('Not found'); e.status = 404; throw e; }
    uploads.sendFile(res, f);
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------------- save */

/** An amount is a recorded fact; blank is silence and 0 is a finding. */
function amount(v, what) {
  const t = String(v ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) throw bad(`${what} must be a plain amount in rupees, or left blank.`);
  return t;
}
function dateOrNull(v) {
  const t = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

router.post('/', requirePermission('wages.record'), uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const month = String(req.body.month || '').slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('Choose a month.');
    if (month > thisMonth()) throw bad('Wages cannot be recorded for a month that has not happened.');
    const first = firstOf(month);

    const paidOn = dateOrNull(req.body.paid_on);
    if (paidOn && paidOn > today()) throw bad('Wages cannot be recorded as paid on a future date.');
    if (paidOn && paidOn < first) throw bad('Wages for a month cannot be paid before the month begins.');

    let wm = await db.one('SELECT * FROM wage_months WHERE running_room_id = ? AND wage_month = ?', [rrId, first]);
    if (wm && wm.verified_at) throw bad('This month has been verified by the Railway and is closed to editing. Reopen it first.');

    const mode = ['bank', 'cash', 'mixed'].includes(req.body.payment_mode) ? req.body.payment_mode : null;
    const remarks = String(req.body.remarks || '').trim().slice(0, 500) || null;

    const files = {};
    (req.files || []).forEach(f => { (files[f.fieldname] ||= []).push(f); });
    const storeOne = async (field, table) => {
      const f = (files[field] || [])[0];
      if (!f || !f.buffer || !f.buffer.length) return null;
      return uploads.store(f, { entityTable: table, entityId: null, userId: req.user.id });
    };

    const sheetId = await storeOne('sheet', 'wage_months');
    if (!wm) {
      const ins = await db.execute(`
        INSERT INTO wage_months (running_room_id, wage_month, paid_on, payment_mode,
                                 sheet_file_id, remarks, recorded_by)
        VALUES (?,?,?,?,?,?,?)`, [rrId, first, paidOn, mode, sheetId, remarks, req.user.id]);
      wm = { id: ins.insertId };
      await audit.record(req, { table: 'wage_months', id: wm.id, action: 'insert',
        after: { running_room_id: rrId, wage_month: first, paid_on: paidOn, payment_mode: mode } });
    } else {
      const before = { paid_on: wm.paid_on, payment_mode: wm.payment_mode, remarks: wm.remarks };
      await db.execute(`
        UPDATE wage_months SET paid_on = ?, payment_mode = ?, remarks = ?,
               sheet_file_id = COALESCE(?, sheet_file_id)
        WHERE id = ?`, [paidOn, mode, remarks, sheetId, wm.id]);
      await audit.record(req, { table: 'wage_months', id: wm.id, action: 'update',
        before, after: { paid_on: paidOn, payment_mode: mode, remarks } });
    }

    /* One row per man WRITTEN DOWN. A man whose amount and days are both blank
       leaves no row at all: the register must be able to show that nobody said
       anything about him, which is not the same as saying he got nothing. */
    let written = 0, cleared = 0;
    const ids = [].concat(req.body.staff || []).map(Number).filter(Boolean);
    for (const sid of ids) {
      const days = String(req.body[`d_${sid}`] ?? '').trim();
      const amt = amount(req.body[`a_${sid}`], `The amount for staff ${sid}`);
      const through = ['bank', 'cash'].includes(req.body[`t_${sid}`]) ? req.body[`t_${sid}`] : null;
      const ref = String(req.body[`r_${sid}`] || '').trim().slice(0, 60) || null;
      const on = dateOrNull(req.body[`p_${sid}`]);
      if (on && on > today()) throw bad('A man cannot be recorded as paid on a future date.');
      const nothingSaid = days === '' && amt === null && !through && !ref && !on;
      if (nothingSaid) {
        const r = await db.execute('DELETE FROM wage_payments WHERE wage_month_id = ? AND staff_id = ?', [wm.id, sid]);
        if (r.affectedRows) cleared++;
        continue;
      }
      const d = days === '' ? null : Math.max(0, Math.min(31, parseInt(days, 10) || 0));
      await db.execute(`
        INSERT INTO wage_payments (wage_month_id, staff_id, days_paid, amount_paid, paid_through, bank_ref, paid_on)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE days_paid = VALUES(days_paid), amount_paid = VALUES(amount_paid),
          paid_through = VALUES(paid_through), bank_ref = VALUES(bank_ref), paid_on = VALUES(paid_on)`,
        [wm.id, sid, d, amt, through, ref, on]);
      written++;
    }

    /* The four statutory returns. */
    for (const [code, label] of RETURNS) {
      const on = dateOrNull(req.body[`rt_${code}_on`]);
      const ref = String(req.body[`rt_${code}_ref`] || '').trim().slice(0, 80) || null;
      const amt = amount(req.body[`rt_${code}_amt`], `The ${label} amount`);
      const rem = String(req.body[`rt_${code}_rem`] || '').trim().slice(0, 300) || null;
      const fid = await storeOne(`rt_${code}_file`, 'wage_returns');
      if (on && on > today()) throw bad(`The ${label} date is in the future.`);
      if (!on && !ref && amt === null && !rem && !fid) {
        await db.execute('DELETE FROM wage_returns WHERE wage_month_id = ? AND return_type = ?', [wm.id, code]);
        continue;
      }
      await db.execute(`
        INSERT INTO wage_returns (wage_month_id, return_type, paid_on, reference_no, amount, file_id, remarks, recorded_by)
        VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE paid_on = VALUES(paid_on), reference_no = VALUES(reference_no),
          amount = VALUES(amount), file_id = COALESCE(VALUES(file_id), file_id),
          remarks = VALUES(remarks), recorded_by = VALUES(recorded_by)`,
        [wm.id, code, on, ref, amt, fid, rem, req.user.id]);
    }

    await audit.record(req, { table: 'wage_payments', id: wm.id, action: 'update',
      after: { wage_month_id: wm.id, men_written: written, men_cleared: cleared } });
    res.redirect(`${cfg.basePath}/wages?rr=${rrId}&month=${month}&saved=${written}`);
  } catch (e) { next(e); }
});

/* ----------------------------------------------------------------- verify */

router.post('/verify', requirePermission('wages.verify'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const month = String(req.body.month || '').slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('Choose a month.');
    const wm = await db.one('SELECT * FROM wage_months WHERE running_room_id = ? AND wage_month = ?',
      [rrId, firstOf(month)]);
    if (!wm) throw bad('There is nothing recorded for this month to verify.');

    // Verification closes the month, so correcting it means WITHDRAWING the
    // confirmation first — the same rule as the cleaning record, and for the
    // same reason: what was confirmed was a particular set of figures.
    if (req.body.action === 'reopen') {
      await db.execute('UPDATE wage_months SET verified_by = NULL, verified_at = NULL WHERE id = ?', [wm.id]);
      await audit.record(req, { table: 'wage_months', id: wm.id, action: 'update',
        after: { verification: 'withdrawn', wage_month: firstOf(month) } });
      return res.redirect(`${cfg.basePath}/wages?rr=${rrId}&month=${month}&note=reopened`);
    }
    const rem = String(req.body.verify_remarks || '').trim().slice(0, 400) || null;
    await db.execute('UPDATE wage_months SET verified_by = ?, verified_at = NOW(), verify_remarks = ? WHERE id = ?',
      [req.user.id, rem, wm.id]);
    await audit.record(req, { table: 'wage_months', id: wm.id, action: 'update',
      after: { verified_by: req.user.id, verify_remarks: rem } });
    res.redirect(`${cfg.basePath}/wages?rr=${rrId}&month=${month}&note=verified`);
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------- clause M5 */

/**
 * Hand the officer a prefilled M5 deficiency. He confirms it; the register
 * does not raise it by itself, because a penalty is an accusation and an
 * accusation is a human act. The quantity is men x days late, which is what
 * the clause says and what the officer would otherwise work out on paper.
 */
router.post('/m5', requirePermission('deficiency.record'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const month = String(req.body.month || '').slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('Choose a month.');
    const wm = await db.one('SELECT * FROM wage_months WHERE running_room_id = ? AND wage_month = ?',
      [rrId, firstOf(month)]);
    if (!wm) throw bad('There is nothing recorded for this month.');

    const already = await db.one(`
      SELECT id FROM deficiencies
      WHERE source_ref_table = 'wage_months' AND source_ref_id = ? AND status <> 'withdrawn'`, [wm.id]);
    if (already) throw bad('Clause M5 has already been raised for this month. Correct it on the deficiency register rather than raising it twice.');

    const men = (await db.one('SELECT COUNT(*) AS n FROM wage_payments WHERE wage_month_id = ?', [wm.id])).n;
    const pos = m5Position(month, wm.paid_on ? String(wm.paid_on).slice(0, 10) : null, men);
    if (pos.state === 'ontime' || pos.state === 'notyet') throw bad('Wages for this month are not late. There is nothing to raise.');
    if (!men) throw bad('No man has been written down as paid for this month, so there is no head-count to raise M5 against. Enter the payment sheet first.');

    /* The column is `clause_code`, not `code` — and the schedule is versioned by
       `effective_from`, so the row wanted is the one IN FORCE ON THE DAY the
       default occurred, not whichever happens to be newest. A penalty is
       charged at the rate that stood when it happened.

       The first cut asked for `code` and threw Unknown column in front of the
       officer as a 500. The demo did not catch it because the stub had been
       written to match the query rather than the schema, so it answered the
       typo perfectly. A stub keyed on the statement can only ever confirm what
       the statement says. */
    const on = pos.state === 'late' ? String(wm.paid_on).slice(0, 10) : today();

    // IGP's contract says nothing about late wages, so this resolves to the
    // generic M5 there -- which is right. A site penalty list is not the whole
    // of the contract conditions, and refusing to record late payment because
    // the site list omits it would lose a real finding.
    const clause = await terms.clauseFor(db, rrId, 'M5', on);
    if (!clause) throw bad('No clause covering late payment of wages is on the schedule in force on that date.');
    const desc = pos.state === 'late'
      ? `Wages for ${month} paid on ${on}, ${pos.days} day(s) after the due date of ${pos.due}, to ${men} staff.`
      : `Wages for ${month} not paid as at ${on}; the due date of ${pos.due} passed ${pos.days} day(s) ago. ${men} staff on the payment sheet.`;

    const ins = await db.execute(`
      INSERT INTO deficiencies (running_room_id, clause_id, occurred_on, quantity, source,
        source_ref_table, source_ref_id, description, recorded_by, status)
      VALUES (?,?,?,?, 'review', 'wage_months', ?, ?, ?, 'open')`,
      [rrId, clause.id, on, Math.max(1, Math.min(65535, pos.quantity)), wm.id, desc, req.user.id]);
    await audit.record(req, { table: 'deficiencies', id: ins.insertId, action: 'insert',
      after: { running_room_id: rrId, clause: 'M5', quantity: pos.quantity, source_ref_id: wm.id } });
    res.redirect(`${cfg.basePath}/wages?rr=${rrId}&month=${month}&note=m5`);
  } catch (e) { next(e); }
});

module.exports = router;
