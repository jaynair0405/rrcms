/**
 * The contractor's bill, and the eleven documents that must come with it.
 *
 * `bills` and `bill_documents` were laid down at stage 6 — the document type
 * list mirrors the tender's bill-passing list exactly — and neither table has
 * ever had a route. No bill could be raised, no submission date captured, and
 * so the two clauses that turn on the date of submission had nothing behind
 * them:
 *
 *   D5 — non-submission within 3 months of the start of the contract, ₹50,000
 *   D6 — non-submission by the end of the next month thereafter, ₹20,000/month
 *
 * WHAT THIS DOES NOT DO. It computes no deduction. The gross figures are typed
 * from the schedules and from the RRMS meal statement, they are added up, and
 * `deduction_amount` stays at zero with the reason printed on the screen: the
 * penalty schedule is still under review. When it is settled, the deficiencies
 * for the period are already recorded against dated clause rates and the
 * arithmetic reads them. Nothing here has to be re-entered.
 *
 * The one thing it does compute is the addition, because a bill whose parts do
 * not add to its total is a clerical error worth catching at the counter rather
 * than at the audit.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');

const router = express.Router();
router.use(requirePermission('rr.view'));

const { today } = require('../lib/day');

/** The tender's list, in the order the bill-passing note gives it. */
const DOCS = [
  ['work_certified',    'Details of work carried out, certified by the consignee and the contractor'],
  ['staff_list_bank',   'List of staff employed in the period, with salary paid through bank and bank details'],
  ['wages_proof',       'Documentary proof of salaries paid as per the applicable minimum wages'],
  ['epf_contribution',  'Proof of EPF contribution submitted to the EPF department'],
  ['esic_contribution', 'Proof of ESI contribution paid to ESIC'],
  ['epf_esic_challans', 'Receipts and challans of EPF and ESIC'],
  ['bonus_proof',       'Documentary proof of bonus paid to the labourers'],
  ['attendance_sheet',  'Attendance sheet for the billing period, jointly signed'],
  ['gst_challan',       'GST challan of the previous month'],
  ['other_records',     'Other necessary documents and records as per the scope of work'],
  ['shramik_kalyan',    'Shramik Kalyan Portal update proof (Annexure D)'],
];

const STATUSES = {
  draft:       ['Being prepared', 'neut'],
  submitted:   ['Submitted', 'neut'],
  under_check: ['Under check', 'warn'],
  passed:      ['Passed', 'good'],
  paid:        ['Paid', 'good'],
  returned:    ['Returned to the contractor', 'crit'],
};

/* --------------------------------------------------------------- the list */
router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const rows = await db.query(`
      SELECT b.*, rr.name AS rr_name, d.code AS div_code, c.name AS contractor_name,
             ct.agreement_no,
             (SELECT COUNT(*) FROM bill_documents bd WHERE bd.bill_id = b.id AND bd.is_received = 1) AS docs_in
      FROM bills b
      JOIN contracts ct ON ct.id = b.contract_id
      JOIN contractors c ON c.id = ct.contractor_id
      LEFT JOIN running_rooms rr ON rr.id = b.running_room_id
      LEFT JOIN divisions d ON d.id = rr.division_id
      WHERE b.running_room_id IS NULL OR (${s.sql})
      ORDER BY b.period_month DESC, b.id DESC LIMIT 200`, s.params);

    const rooms = await db.query(`
      SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id WHERE ${s.sql} ORDER BY rr.name`, s.params);

    // Which contracts these rooms are held under, so raising a bill does not
    // ask anybody to know a contract id.
    const contracts = await db.query(`
      SELECT DISTINCT ct.id, ct.agreement_no, c.name AS contractor_name
      FROM contracts ct
      JOIN contractors c ON c.id = ct.contractor_id
      JOIN contract_running_rooms crr ON crr.contract_id = ct.id
      JOIN running_rooms rr ON rr.id = crr.running_room_id
      WHERE ${s.sql} ORDER BY c.name`, s.params);

    const t = today();
    rows.forEach(b => {
      b.status_label = (STATUSES[b.status] || [b.status, 'neut'])[0];
      b.status_tone  = (STATUSES[b.status] || [b.status, 'neut'])[1];
      b.docs_short = DOCS.length - b.docs_in;
      // The date the tender's two clauses turn on: a bill for a month is due by
      // the end of the month after it.
      b.late_days = !b.submitted_on && b.due_on && b.due_on < t
        ? Math.floor((new Date(t) - new Date(String(b.due_on).slice(0, 10))) / 86400000) : 0;
    });

    res.render('bills/index', { title: 'Bills', rows, rooms, contracts, docs: DOCS,
      statuses: STATUSES,
      outstanding: rows.filter(b => !['paid'].includes(b.status)).length,
      late: rows.filter(b => b.late_days > 0).length });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------ raising one */
router.post('/', requirePermission('bill.prepare'), async (req, res, next) => {
  try {
    const contractId = +req.body.contract_id;
    const rrId = +req.body.rr || null;
    if (rrId) await assertRunningRoomAccess(db, req.user, rrId);
    const month = String(req.body.period_month || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) { const e = new Error('Which month is the bill for?'); e.status = 400; throw e; }
    const first = `${month}-01`;
    if (first > today()) { const e = new Error('A bill cannot be raised for a month that has not started.'); e.status = 400; throw e; }

    const ct = await db.one('SELECT id FROM contracts WHERE id = ?', [contractId]);
    if (!ct) { const e = new Error('Choose the agreement the bill is under.'); e.status = 400; throw e; }

    const clash = await db.one(
      `SELECT id FROM bills WHERE contract_id = ? AND period_month = ?
        AND ${rrId ? 'running_room_id = ?' : 'running_room_id IS NULL'}`,
      rrId ? [contractId, first, rrId] : [contractId, first]);
    if (clash) return res.redirect(`${cfg.basePath}/bills/${clash.id}`);

    // Due by the end of the following month — clause D6's own reckoning.
    const due = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) + 1, 0))
      .toISOString().slice(0, 10);

    const ins = await db.execute(`
      INSERT INTO bills (contract_id, running_room_id, period_month, due_on, status)
      VALUES (?,?,?,?, 'draft')`, [contractId, rrId, first, due]);

    // The eleven rows are created with the bill, all unreceived. A checklist
    // that has to be built by hand is a checklist somebody shortens.
    for (const [type] of DOCS)
      await db.execute('INSERT INTO bill_documents (bill_id, doc_type, is_received) VALUES (?,?,0)',
        [ins.insertId, type]);

    await audit.record(req, { table: 'bills', id: ins.insertId, action: 'insert',
      after: { contract_id: contractId, running_room_id: rrId, period_month: first, due_on: due } });
    res.redirect(`${cfg.basePath}/bills/${ins.insertId}`);
  } catch (e) { next(e); }
});

/* ---------------------------------------------------------------- one bill */
async function load(req) {
  const id = +req.params.id;
  const b = await db.one(`
    SELECT b.*, rr.name AS rr_name, c.name AS contractor_name, ct.agreement_no,
           uc.full_name AS checked_by_name, up.full_name AS passed_by_name
    FROM bills b
    JOIN contracts ct ON ct.id = b.contract_id
    JOIN contractors c ON c.id = ct.contractor_id
    LEFT JOIN running_rooms rr ON rr.id = b.running_room_id
    LEFT JOIN users uc ON uc.id = b.checked_by
    LEFT JOIN users up ON up.id = b.passed_by
    WHERE b.id = ?`, [id]);
  if (!b) { const e = new Error('No such bill.'); e.status = 404; throw e; }
  if (b.running_room_id) await assertRunningRoomAccess(db, req.user, b.running_room_id);
  return b;
}

router.get('/:id', async (req, res, next) => {
  try {
    const b = await load(req);
    const docs = await db.query(`
      SELECT bd.*, u.full_name AS verified_by_name
      FROM bill_documents bd LEFT JOIN users u ON u.id = bd.verified_by
      WHERE bd.bill_id = ? ORDER BY FIELD(bd.doc_type, ${DOCS.map(() => '?').join(',')})`,
      [b.id, ...DOCS.map(d => d[0])]);

    // The deficiencies the period already carries. No amount is put against
    // them; they are shown so the officer passing the bill knows what is
    // outstanding, and so the penalty engine's future input is visible now.
    const defs = b.running_room_id ? await db.query(`
      SELECT dc.clause_code, dc.description, dc.rate, dc.unit,
             COUNT(*) AS cases, SUM(df.quantity) AS units
      FROM deficiencies df JOIN deficiency_clauses dc ON dc.id = df.clause_id
      WHERE df.running_room_id = ? AND df.occurred_on >= ?
        AND df.occurred_on < DATE_ADD(?, INTERVAL 1 MONTH)
        AND df.status <> 'withdrawn'
      GROUP BY dc.clause_code, dc.description, dc.rate, dc.unit
      ORDER BY dc.clause_code`, [b.running_room_id, b.period_month, b.period_month]) : [];

    const labels = Object.fromEntries(DOCS);
    b.status_label = (STATUSES[b.status] || [b.status])[0];
    res.render('bills/show', { title: `Bill — ${String(b.period_month).slice(0, 7)}`,
      b, docs, defs, labels, statuses: STATUSES,
      missing: docs.filter(d => !d.is_received),
      sumsTo: Math.abs((+b.gross_schedule_a + +b.gross_schedule_b + +b.gross_schedule_c
                        + +b.gross_schedule_d) - +b.gross_total) < 0.005 });
  } catch (e) { next(e); }
});

/** The figures. Typed from the schedules; only the addition is checked. */
router.post('/:id/figures', requirePermission('bill.prepare'), async (req, res, next) => {
  try {
    const b = await load(req);
    if (['passed', 'paid'].includes(b.status)) {
      const e = new Error('A bill that has been passed cannot be re-figured. Return it first.');
      e.status = 400; throw e;
    }
    const n = k => Math.max(0, Math.round((parseFloat(req.body[k]) || 0) * 100) / 100);
    const a = n('gross_schedule_a'), sb = n('gross_schedule_b'),
          c = n('gross_schedule_c'), d = n('gross_schedule_d');
    const total = Math.round((a + sb + c + d) * 100) / 100;

    await db.execute(`
      UPDATE bills SET bill_no = ?, submitted_on = ?, gross_schedule_a = ?, gross_schedule_b = ?,
        schedule_b_source_ref = ?, gross_schedule_c = ?, gross_schedule_d = ?, gross_total = ?,
        net_payable = ?, remarks = ? WHERE id = ?`,
      [String(req.body.bill_no || '').trim().slice(0, 60) || null,
       req.body.submitted_on || null, a, sb,
       String(req.body.schedule_b_source_ref || '').trim().slice(0, 120) || null,
       c, d, total,
       // net = gross while the deduction stays at zero. Stated, not implied.
       total, String(req.body.remarks || '').trim().slice(0, 500) || null, b.id]);
    await audit.record(req, { table: 'bills', id: b.id, action: 'update',
      after: { gross_total: total, submitted_on: req.body.submitted_on || null } });
    res.redirect(`${cfg.basePath}/bills/${b.id}`);
  } catch (e) { next(e); }
});

/** A document arriving, with its scan. */
router.post('/:id/document', requirePermission('bill.prepare'), uploads.upload.any(),
  async (req, res, next) => {
    try {
      const b = await load(req);
      const type = String(req.body.doc_type || '');
      if (!DOCS.some(d => d[0] === type)) { const e = new Error('Unknown document.'); e.status = 400; throw e; }
      const received = req.body.is_received === '1';
      let fileId = null;
      if (req.files && req.files.length) fileId = await uploads.store(req.files[0],
        { entityTable: 'bill_documents', entityId: b.id, userId: req.user.id });

      await db.execute(`
        INSERT INTO bill_documents (bill_id, doc_type, is_received, received_on, file_id,
          verified_by, remarks)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE is_received = VALUES(is_received),
          received_on = VALUES(received_on),
          file_id = COALESCE(VALUES(file_id), file_id),
          verified_by = VALUES(verified_by), remarks = VALUES(remarks)`,
        [b.id, type, received ? 1 : 0, received ? (req.body.received_on || today()) : null,
         fileId, req.user.id, String(req.body.remarks || '').trim().slice(0, 300) || null]);
      await audit.record(req, { table: 'bill_documents', id: b.id, action: 'update',
        after: { bill_id: b.id, doc_type: type, is_received: received ? 1 : 0 } });
      res.redirect(`${cfg.basePath}/bills/${b.id}`);
    } catch (e) { next(e); }
  });

/** Moving it along. Passing is the divisional officer's, and it is gated. */
router.post('/:id/status', requirePermission('bill.prepare'), async (req, res, next) => {
  try {
    const b = await load(req);
    const to = String(req.body.status || '');
    if (!STATUSES[to]) { const e = new Error('Unknown status.'); e.status = 400; throw e; }

    if ((to === 'passed' || to === 'paid') && !req.user.permissions.has('bill.pass')) {
      const e = new Error('Passing a bill is the divisional officer\'s. Your role may prepare and check it.');
      e.status = 403; throw e;
    }

    if (to === 'passed') {
      // The eleven documents are not a formality: the tender makes the bill
      // passable only with them. A bill passed without the EPF challan is a
      // bill the Railway cannot defend, so the block is real.
      const missing = await db.query(
        `SELECT doc_type FROM bill_documents WHERE bill_id = ? AND is_received = 0`,
        [b.id]);
      if (missing.length) {
        const names = missing.map(m => (DOCS.find(d => d[0] === m.doc_type) || [, m.doc_type])[1]);
        const e = new Error(`The bill cannot be passed while ${missing.length} required document`
          + `${missing.length === 1 ? ' is' : 's are'} still awaited: ${names.join('; ')}.`);
        e.status = 400; throw e;
      }
      if (!b.submitted_on) {
        const e = new Error('Record the date the contractor submitted the bill before passing it — '
          + 'clauses D5 and D6 turn on that date.');
        e.status = 400; throw e;
      }
    }
    if (to === 'returned' && !String(req.body.remarks || '').trim()) {
      const e = new Error('Say why the bill is going back.'); e.status = 400; throw e;
    }

    const sets = ['status = ?'], params = [to];
    if (to === 'under_check') { sets.push('checked_by = ?'); params.push(req.user.id); }
    if (to === 'passed')      { sets.push('passed_by = ?', 'passed_on = CURDATE()'); params.push(req.user.id); }
    if (to === 'paid')        { sets.push('paid_on = ?'); params.push(req.body.paid_on || today()); }
    if (req.body.remarks)     { sets.push('remarks = ?'); params.push(String(req.body.remarks).trim().slice(0, 500)); }
    params.push(b.id);

    await db.execute(`UPDATE bills SET ${sets.join(', ')} WHERE id = ?`, params);
    await audit.record(req, { table: 'bills', id: b.id, action: 'update',
      before: { status: b.status }, after: { status: to } });
    res.redirect(`${cfg.basePath}/bills/${b.id}`);
  } catch (e) { next(e); }
});

module.exports = router;
