/**
 * The monthly certification pack.
 *
 * One sheet per running room per month. The RR In-charge generates it, checks
 * it and certifies it; the divisional officer counter-signs or returns it. It
 * travels with the contractor's bill as the Railway's own record of what was
 * actually delivered that month.
 *
 * What it deliberately does NOT contain:
 *   - any rate or amount. Contract rates are commercial data this application
 *     has never held, and the penalty schedule is still under review.
 *   - the Schedule-B meal quantity. RRMS owns meal and subsidy accounting.
 *   - any deduction. Deficiencies are listed and counted, never priced.
 *
 * Figures are frozen into monthly_certificates when the pack is generated, not
 * recomputed on every view. A deficiency closed next week must not silently
 * change a document an officer has already signed.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const day = require('../lib/day');

const router = express.Router();
router.use(requirePermission('rr.view'));

const ymd = v => v instanceof Date
  ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  : String(v).slice(0, 10);
const monthLabel = m => new Date(ymd(m) + 'T00:00:00Z')
  .toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const lastMonth = () => day.monthStart(1);
const monthEnd = m => {
  const d = new Date(ymd(m) + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
const daysIn = m => +monthEnd(m).slice(8, 10);
function monthChoices() {
  const out = [];
  for (let k = 1; k <= 6; k++) {
    const m = day.monthStart(k);
    out.push({ value: m, label: monthLabel(m) });
  }
  return out;
}
const validMonth = q => /^\d{4}-\d{2}-01$/.test(q || '') ? q : lastMonth();

/* --------------------------------------------------------------- index */
router.get('/', async (req, res, next) => {
  try {
    const month = validMonth(req.query.month);
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const rows = await db.query(`
      SELECT rr.id, rr.code, rr.name, rr.total_beds, rr.has_meal_facility,
             d.code AS div_code, ct.name AS contractor,
             mc.id AS cert_id, mc.status, mc.coverage_pct, mc.meets_floor,
             mc.deficiencies_raised, mc.deficiencies_open, mc.man_days_due, mc.man_days_present,
             mc.certified_at, mc.countersigned_at
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN contract_running_rooms crr ON crr.running_room_id = rr.id
           AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
      LEFT JOIN contracts c   ON c.id = crr.contract_id AND c.status = 'active'
      LEFT JOIN contractors ct ON ct.id = c.contractor_id
      LEFT JOIN monthly_certificates mc ON mc.running_room_id = rr.id AND mc.period_month = ?
      WHERE ${s.sql}
      ORDER BY (mc.id IS NULL) DESC, rr.name`, [month, ...s.params]);

    res.render('certificates/index', {
      title: 'Monthly certification', section: 'certificates',
      month, monthLabel: monthLabel(month), months: monthChoices(), rows,
      counts: {
        total: rows.length,
        pending: rows.filter(r => !r.cert_id).length,
        draft: rows.filter(r => r.status === 'draft').length,
        certified: rows.filter(r => r.status === 'certified').length,
        countersigned: rows.filter(r => r.status === 'countersigned').length,
        returned: rows.filter(r => r.status === 'returned').length,
      },
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------ generate */
/** Collect every figure the pack states, from the live tables, for one month. */
async function collect(rrId, month) {
  const from = ymd(month), to = monthEnd(month);

  const rr = await db.one(`
    SELECT rr.*, d.code AS div_code, d.name AS div_name
    FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id WHERE rr.id = ?`, [rrId]);

  const contract = await db.one(`
    SELECT c.id, c.agreement_no, ct.name AS contractor, ct.code AS contractor_code
    FROM contract_running_rooms crr
    JOIN contracts c ON c.id = crr.contract_id AND c.status = 'active'
    JOIN contractors ct ON ct.id = c.contractor_id
    WHERE crr.running_room_id = ? AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
    LIMIT 1`, [rrId]);

  const manpower = await db.query(`
    SELECT dg.id, dg.name, dg.sort_order, m.sanctioned_count,
           (SELECT COUNT(*) FROM staff st
             WHERE st.running_room_id = ? AND st.is_active = 1 AND st.designation_id = dg.id) AS on_roll,
           (SELECT COUNT(*) FROM attendance_daily a
             JOIN staff st2 ON st2.id = a.staff_id
             WHERE a.running_room_id = ? AND a.attendance_date BETWEEN ? AND ?
               AND st2.designation_id = dg.id
               AND a.status IN ('present','reliever')) AS man_days_present
    FROM running_room_manpower m
    JOIN designations dg ON dg.id = m.designation_id
    WHERE m.running_room_id = ? AND m.effective_to IS NULL AND m.sanctioned_count > 0
    ORDER BY dg.sort_order`, [rrId, rrId, from, to, rrId]);

  const att = await db.one(`
    SELECT COUNT(DISTINCT attendance_date) AS days_marked,
           COUNT(DISTINCT CASE WHEN countersigned_at IS NOT NULL THEN attendance_date END) AS days_countersigned
    FROM attendance_daily
    WHERE running_room_id = ? AND attendance_date BETWEEN ? AND ?`, [rrId, from, to]);

  const unscreened = await db.scalar(
    `SELECT COUNT(*) FROM staff WHERE running_room_id = ? AND is_active = 1 AND screening_status <> 'approved'`,
    [rrId]);

  const cov = await db.one(
    `SELECT * FROM feedback_coverage WHERE running_room_id = ? AND period_month = ?`, [rrId, from]);

  const grading = await db.query(
    `SELECT head, avg_rating, r_value, sample_size FROM monthly_grading
     WHERE running_room_id = ? AND period_month = ?`, [rrId, from]);

  const insp = await db.one(`
    SELECT COUNT(*) AS done, SUM(result = 'compliant') AS compliant
    FROM inspections WHERE running_room_id = ? AND inspection_date BETWEEN ? AND ?`, [rrId, from, to]);

  const defs = await db.query(`
    SELECT df.id, df.occurred_on, df.quantity, df.status, df.description,
           dc.clause_code, dc.group_name, dc.unit
    FROM deficiencies df JOIN deficiency_clauses dc ON dc.id = df.clause_id
    WHERE df.running_room_id = ? AND df.occurred_on BETWEEN ? AND ?
    ORDER BY df.occurred_on, dc.clause_code`, [rrId, from, to]);

  const facility = await db.one(`
    SELECT
      (SELECT COUNT(*) FROM laundry_dispatch ld
        WHERE ld.running_room_id = ? AND ld.dispatch_date BETWEEN ? AND ?
          AND (ld.invoice_no IS NULL OR ld.invoice_no = ''))                       AS laundry_no_invoice,
      (SELECT COUNT(*) FROM consumable_issues ci
        WHERE ci.running_room_id = ? AND ci.due_date BETWEEN ? AND ?
          AND ci.quantity_supplied < ci.quantity_due)                              AS consumable_short,
      (SELECT COUNT(*) FROM asset_breakdowns b JOIN assets a ON a.id = b.asset_id
        WHERE a.running_room_id = ? AND DATE(b.reported_at) BETWEEN ? AND ?
          AND (b.hours_to_rectify > 24 OR b.rectified_at IS NULL))                 AS asset_faults_overdue,
      (SELECT COUNT(*) FROM kitchen_compliance k
        WHERE k.running_room_id = ? AND k.as_on_date BETWEEN ? AND ?
          AND k.status = 'shortfall')                                              AS kitchen_shortfalls,
      (SELECT COUNT(*) FROM pest_control_log p
        WHERE p.running_room_id = ? AND p.scheduled_on BETWEEN ? AND ?
          AND (p.performed_on IS NULL OR p.delay_days > 0))                        AS pest_overdue`,
    [rrId, from, to, rrId, from, to, rrId, from, to, rrId, from, to, rrId, from, to]);

  const g = h => grading.find(x => x.head === h);
  const rValues = grading.map(x => x.r_value).filter(x => x !== null && x !== undefined);
  const days = daysIn(month);

  return {
    rr, contract, manpower, deficiencies: defs, grading,
    figures: {
      contract_id: contract ? contract.id : null,
      days_in_month: days,
      days_marked: +att.days_marked || 0,
      days_countersigned: +att.days_countersigned || 0,
      sanctioned_strength: manpower.reduce((a, m) => a + (+m.sanctioned_count || 0), 0),
      on_roll_strength: manpower.reduce((a, m) => a + (+m.on_roll || 0), 0),
      man_days_due: manpower.reduce((a, m) => a + (+m.sanctioned_count || 0), 0) * days,
      man_days_present: manpower.reduce((a, m) => a + (+m.man_days_present || 0), 0),
      unscreened_count: unscreened || 0,
      occupants_total: cov ? +cov.occupants_total : 0,
      feedback_received: cov ? +cov.feedback_received : 0,
      coverage_pct: cov ? +cov.coverage_pct : 0,
      meets_floor: cov && cov.meets_floor ? 1 : 0,
      rating_cleanliness: g('cleanliness') ? +g('cleanliness').avg_rating : null,
      rating_food: g('food') ? +g('food').avg_rating : null,
      rating_linen: g('linen') ? +g('linen').avg_rating : null,
      r_min: rValues.length ? Math.min(...rValues) : null,
      inspections_done: +insp.done || 0,
      inspections_compliant: +insp.compliant || 0,
      deficiencies_raised: defs.length,
      deficiencies_open: defs.filter(d => d.status === 'open').length,
      laundry_no_invoice: +facility.laundry_no_invoice || 0,
      consumable_short: +facility.consumable_short || 0,
      asset_faults_overdue: +facility.asset_faults_overdue || 0,
      kitchen_shortfalls: +facility.kitchen_shortfalls || 0,
      pest_overdue: +facility.pest_overdue || 0,
    },
  };
}

const FIELDS = ['contract_id', 'days_in_month', 'days_marked', 'days_countersigned',
  'sanctioned_strength', 'on_roll_strength', 'man_days_due', 'man_days_present', 'unscreened_count',
  'occupants_total', 'feedback_received', 'coverage_pct', 'meets_floor',
  'rating_cleanliness', 'rating_food', 'rating_linen', 'r_min',
  'inspections_done', 'inspections_compliant', 'deficiencies_raised', 'deficiencies_open',
  'laundry_no_invoice', 'consumable_short', 'asset_faults_overdue', 'kitchen_shortfalls', 'pest_overdue'];

router.post('/generate', requirePermission('bill.prepare'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    const month = validMonth(req.body.month);
    await assertRunningRoomAccess(db, req.user, rrId);

    const existing = await db.one(
      `SELECT id, status FROM monthly_certificates WHERE running_room_id = ? AND period_month = ?`,
      [rrId, month]);
    if (existing && existing.status !== 'draft' && existing.status !== 'returned') {
      const e = new Error('This certificate is already signed. A signed certificate cannot be regenerated.');
      e.status = 400; throw e;
    }

    const { figures, deficiencies } = await collect(rrId, month);
    const cols = FIELDS.join(', ');
    const marks = FIELDS.map(() => '?').join(', ');
    const vals = FIELDS.map(f => figures[f]);

    // One transaction: a certificate whose header saved but whose deficiency
    // list did not would be a signed document missing its evidence.
    await db.transaction(async tx => {
      if (existing) {
        await tx.execute(
          `UPDATE monthly_certificates SET ${FIELDS.map(f => `${f} = ?`).join(', ')},
             status = 'draft', returned_reason = NULL, generated_by = ?, generated_at = NOW()
           WHERE id = ?`, [...vals, req.user.id, existing.id]);
        await tx.execute('DELETE FROM certificate_deficiencies WHERE certificate_id = ?', [existing.id]);
      } else {
        await tx.execute(
          `INSERT INTO monthly_certificates (running_room_id, period_month, ${cols}, status, generated_by, generated_at)
           VALUES (?, ?, ${marks}, 'draft', ?, NOW())`, [rrId, month, ...vals, req.user.id]);
      }
      const id = existing ? existing.id : await tx.scalar(
        `SELECT id FROM monthly_certificates WHERE running_room_id = ? AND period_month = ?`, [rrId, month]);
      for (const d of deficiencies) {
        await tx.execute(
          `INSERT INTO certificate_deficiencies (certificate_id, deficiency_id, clause_code, group_name,
             description, occurred_on, quantity, unit, status_at_signing)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [id, d.id, d.clause_code, d.group_name, d.description || '', ymd(d.occurred_on),
           d.quantity, d.unit, d.status]);
      }
    });

    await audit.record(req, { table: 'monthly_certificates', id: rrId, action: existing ? 'update' : 'insert',
      after: { running_room_id: rrId, period_month: month, status: 'draft' } });
    res.redirect(`${cfg.basePath}/certificates/${rrId}/${month.slice(0, 7)}`);
  } catch (e) { next(e); }
});

/* ---------------------------------------------------------------- view */
router.get('/:rr/:ym', async (req, res, next) => {
  try {
    const rrId = +req.params.rr;
    if (!/^\d{4}-\d{2}$/.test(req.params.ym)) { const e = new Error('Not found'); e.status = 404; throw e; }
    const month = req.params.ym + '-01';
    await assertRunningRoomAccess(db, req.user, rrId);

    const cert = await db.one(`
      SELECT mc.*, gu.full_name AS generated_name, cu.full_name AS certified_name,
             ou.full_name AS countersigned_name
      FROM monthly_certificates mc
      LEFT JOIN users gu ON gu.id = mc.generated_by
      LEFT JOIN users cu ON cu.id = mc.certified_by
      LEFT JOIN users ou ON ou.id = mc.countersigned_by
      WHERE mc.running_room_id = ? AND mc.period_month = ?`, [rrId, month]);

    const { rr, contract, manpower } = await collect(rrId, month);
    const frozen = cert
      ? await db.query(
          `SELECT * FROM certificate_deficiencies WHERE certificate_id = ? ORDER BY occurred_on, clause_code`,
          [cert.id])
      : [];

    const printing = req.query.print === '1';
    res.render(printing ? 'certificates/print' : 'certificates/view', {
      title: 'Monthly certificate', section: 'certificates',
      rr, contract, manpower, cert, deficiencies: frozen,
      month, monthLabel: monthLabel(month), bare: printing,
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------ workflow */
async function load(rrId, month) {
  return db.one(`SELECT * FROM monthly_certificates WHERE running_room_id = ? AND period_month = ?`,
    [rrId, month]);
}

router.post('/:rr/:ym/certify', requirePermission('bill.prepare'), async (req, res, next) => {
  try {
    const rrId = +req.params.rr, month = req.params.ym + '-01';
    await assertRunningRoomAccess(db, req.user, rrId);
    const cert = await load(rrId, month);
    if (!cert) { const e = new Error('Generate the certificate first.'); e.status = 400; throw e; }
    if (cert.status === 'certified' || cert.status === 'countersigned') {
      const e = new Error('This certificate is already certified.'); e.status = 400; throw e;
    }
    await db.execute(
      `UPDATE monthly_certificates SET status = 'certified', certified_by = ?, certified_at = NOW(),
         remarks = ?, returned_reason = NULL WHERE id = ?`,
      [req.user.id, String(req.body.remarks || '').trim().slice(0, 1000) || cert.remarks, cert.id]);
    await audit.record(req, { table: 'monthly_certificates', id: cert.id, action: 'update',
      after: { status: 'certified' } });
    res.redirect(`${cfg.basePath}/certificates/${rrId}/${req.params.ym}`);
  } catch (e) { next(e); }
});

router.post('/:rr/:ym/countersign', requirePermission('bill.pass'), async (req, res, next) => {
  try {
    const rrId = +req.params.rr, month = req.params.ym + '-01';
    await assertRunningRoomAccess(db, req.user, rrId);
    const cert = await load(rrId, month);
    if (!cert) { const e = new Error('Generate the certificate first.'); e.status = 400; throw e; }
    if (cert.status !== 'certified') {
      const e = new Error('The RR In-charge must certify the pack before it can be counter-signed.');
      e.status = 400; throw e;
    }
    await db.execute(
      `UPDATE monthly_certificates SET status = 'countersigned', countersigned_by = ?, countersigned_at = NOW()
       WHERE id = ?`, [req.user.id, cert.id]);
    await audit.record(req, { table: 'monthly_certificates', id: cert.id, action: 'update',
      after: { status: 'countersigned' } });
    res.redirect(`${cfg.basePath}/certificates/${rrId}/${req.params.ym}`);
  } catch (e) { next(e); }
});

router.post('/:rr/:ym/return', requirePermission('bill.pass'), async (req, res, next) => {
  try {
    const rrId = +req.params.rr, month = req.params.ym + '-01';
    await assertRunningRoomAccess(db, req.user, rrId);
    const cert = await load(rrId, month);
    if (!cert) { const e = new Error('Generate the certificate first.'); e.status = 400; throw e; }
    const reason = String(req.body.returned_reason || '').trim();
    // Returning a pack is a decision against the running room; it needs a reason
    // on record, exactly as rejecting a screening does.
    if (!reason) { const e = new Error('A reason is required when returning a certificate.'); e.status = 400; throw e; }
    if (cert.status === 'countersigned') {
      const e = new Error('A counter-signed certificate cannot be returned.'); e.status = 400; throw e;
    }
    await db.execute(
      `UPDATE monthly_certificates SET status = 'returned', returned_reason = ?,
         certified_by = NULL, certified_at = NULL WHERE id = ?`, [reason.slice(0, 400), cert.id]);
    await audit.record(req, { table: 'monthly_certificates', id: cert.id, action: 'update',
      after: { status: 'returned', reason } });
    res.redirect(`${cfg.basePath}/certificates/${rrId}/${req.params.ym}`);
  } catch (e) { next(e); }
});

module.exports = router;
// The demo stub mirrors this column order; exporting it keeps the two in step.
module.exports.FIELDS = FIELDS;
