const express = require('express');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope } = require('../middleware/scope');
const audit = require('../services/audit');
const cfg = require('../config');

const router = express.Router();
router.use(requirePermission('contract.view'));

const { today } = require('../lib/day');
const CONTRACT_STATUS = [
  ['draft',      'Draft — not yet in force'],
  ['active',     'Active'],
  ['extended',   'Extended'],
  ['expired',    'Expired'],
  ['terminated', 'Terminated'],
];

function bad(msg) { const e = new Error(msg); e.status = 400; return e; }

/* A rupee figure here is a contract fact copied off a document, never a
   computed one, and blank is not zero. A security deposit recorded as 0 says
   the agreement demanded none; a security deposit left blank says nobody has
   told us yet. Those are different findings, so blank stays NULL. */
function money(v, what) {
  const t = String(v ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) throw bad(`${what} must be a plain amount in rupees, or left blank.`);
  return t;
}
function dateOrNull(v) {
  const t = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/* Which divisions this user may write a contract against, and which rooms he
   may attach to it — both derived from the same running-room scope as every
   other screen, so there is one rule and not two. */
async function divisionsInScope(user) {
  const s = runningRoomScope(user, 'rr');
  // dv.sort_order is selected, not merely ordered by. MySQL 8 refuses
  // SELECT DISTINCT ... ORDER BY <a column not in the select list> outright
  // (ER_FIELD_IN_ORDER_NOT_SELECT), and MariaDB — which the checks here run
  // against — accepts it happily, so the fault would only have appeared on the
  // officer's own machine. It is functionally dependent on dv.id, so carrying
  // it changes no row.
  return db.query(`
    SELECT DISTINCT dv.id, dv.code, dv.name, dv.sort_order
    FROM divisions dv JOIN running_rooms rr ON rr.division_id = dv.id
    WHERE ${s.sql} ORDER BY dv.sort_order, dv.name`, s.params);
}
/* The first cut of this list offered every running room the user could see,
   which at a pilot install is all forty-four -- and forty of those are marked
   not_in_scope: open and working, but not carried on this system yet. So the
   officer was asked to tick CLA and CSMT against an Igatpuri agreement. Found
   by the RR in-charge on the first walk-through of the screen.

   Scope answers "may this user see it"; status answers "is there anything to
   see", and this list needs both. A room the agreement ALREADY holds stays on
   the list whatever its status -- a site can close or go under renovation
   without the contract ending, and a room that cannot be shown cannot be
   unticked either. */
async function roomsInScope(user, contractId = 0) {
  const s = runningRoomScope(user, 'rr');
  return db.query(`
    SELECT rr.id AS rr_id, rr.name AS rr_name, rr.status AS rr_status,
           rr.division_id, dv.code AS dv_code,
           lc.id AS held_contract_id, lc.agreement_no AS held_agreement,
           lco.name AS held_contractor
    FROM running_rooms rr
    JOIN divisions dv ON dv.id = rr.division_id
    LEFT JOIN contract_running_rooms lcrr
           ON lcrr.running_room_id = rr.id
          AND (lcrr.effective_to IS NULL OR lcrr.effective_to >= CURDATE())
    LEFT JOIN contracts  lc  ON lc.id = lcrr.contract_id
    LEFT JOIN contractors lco ON lco.id = lc.contractor_id
    WHERE (${s.sql})
      AND (rr.status = 'operational'
           OR rr.id IN (SELECT crr2.running_room_id FROM contract_running_rooms crr2
                        WHERE crr2.contract_id = ?))
    ORDER BY dv.sort_order, rr.name`, [...s.params, contractId || 0]);
}

/* Read the form once, for both create and update, so the two paths cannot
   drift apart in what they accept. */
function readForm(b, divisions) {
  const agreement_no = String(b.agreement_no || '').trim();
  if (!agreement_no) throw bad('An agreement number is required. Where none has been issued, use the AGREEMENT-AWAITED form the pilot loader writes.');
  if (agreement_no.length > 80) throw bad('The agreement number is longer than 80 characters.');

  const contractor_id = +b.contractor_id || 0;
  if (!contractor_id) throw bad('Choose the contractor this agreement is with.');

  const division_id = +b.division_id || 0;
  if (!divisions.some(d => d.id === division_id)) throw bad('That division is outside your access.');

  const loa_no = String(b.loa_no || '').trim().slice(0, 80) || null;
  const loa_date = dateOrNull(b.loa_date);
  const start_date = dateOrNull(b.start_date);
  const end_date = dateOrNull(b.end_date);
  const extended_to = dateOrNull(b.extended_to);

  // An LOA is a document already issued. A date in the future is a typing slip
  // every time, and it would sit on the officer's dashboard looking like fact.
  if (loa_date && loa_date > today()) throw bad('The LOA date is in the future.');
  if (start_date && end_date && end_date < start_date) throw bad('The agreement ends before it begins.');
  if (extended_to && end_date && extended_to < end_date) throw bad('The extension ends before the agreement does. An extension runs beyond the original end date.');
  if (extended_to && !end_date) throw bad('An extension needs the original period recorded first — there is nothing for it to extend.');

  const status = String(b.status || '').trim();
  if (!CONTRACT_STATUS.some(s => s[0] === status)) throw bad('Choose a status for the agreement.');

  return {
    agreement_no, contractor_id, division_id, loa_no, loa_date,
    start_date, end_date, extended_to, status,
    security_deposit: money(b.security_deposit, 'The security deposit'),
    performance_guarantee: money(b.performance_guarantee, 'The performance guarantee'),
    total_value: money(b.total_value, 'The contract value'),
    remarks: String(b.remarks || '').trim().slice(0, 500) || null,
  };
}

/**
 * Attach and detach running rooms.
 *
 * Three rules, and each of them is there because getting it wrong loses
 * history rather than a checkbox:
 *
 *  - A room the user cannot see is never touched. A CR-wide agreement edited
 *    by a divisional officer must not shed the other division's rooms just
 *    because they were not on his screen to tick.
 *  - Unticking STANDS THE ROOM DOWN — effective_to = today — it does not
 *    delete the link. Who was answerable for a site last March is the question
 *    this table exists to answer, and a delete destroys the answer.
 *  - Ticking a room that another live agreement already holds is a handover,
 *    which is a real event: the previous link is stood down the same way and
 *    the move is reported back on the screen rather than done silently.
 */
async function setRooms(req, contractId, wanted, scoped, effectiveFrom) {
  const allowed = new Set(scoped.map(r => r.rr_id));
  const want = new Set(wanted.filter(id => allowed.has(id)));

  const live = await db.query(`
    SELECT running_room_id FROM contract_running_rooms
    WHERE contract_id = ? AND (effective_to IS NULL OR effective_to >= CURDATE())`, [contractId]);
  const have = new Set(live.map(r => r.running_room_id));

  let added = 0, removed = 0, moved = 0;

  for (const id of want) {
    if (have.has(id)) continue;
    // Whoever holds it now gives it up on the same date, so no site is ever
    // shown as being under two live agreements at once.
    const other = await db.query(`
      SELECT crr.id, crr.contract_id FROM contract_running_rooms crr
      WHERE crr.running_room_id = ? AND crr.contract_id <> ?
        AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())`, [id, contractId]);
    for (const o of other) {
      await db.execute('UPDATE contract_running_rooms SET effective_to = ? WHERE id = ?', [effectiveFrom, o.id]);
      await audit.record(req, { table: 'contract_running_rooms', id: o.id, action: 'update',
        after: { contract_id: o.contract_id, running_room_id: id, effective_to: effectiveFrom, reason: 'handed over' } });
      moved++;
    }
    const r = await db.execute(
      `INSERT INTO contract_running_rooms (contract_id, running_room_id, effective_from) VALUES (?,?,?)`,
      [contractId, id, effectiveFrom]);
    await audit.record(req, { table: 'contract_running_rooms', id: r.insertId || null, action: 'insert',
      after: { contract_id: contractId, running_room_id: id, effective_from: effectiveFrom } });
    added++;
  }

  for (const id of have) {
    if (want.has(id) || !allowed.has(id)) continue;
    await db.execute(`
      UPDATE contract_running_rooms SET effective_to = ?
      WHERE contract_id = ? AND running_room_id = ?
        AND (effective_to IS NULL OR effective_to >= CURDATE())`, [today(), contractId, id]);
    await audit.record(req, { table: 'contract_running_rooms', id: null, action: 'update',
      after: { contract_id: contractId, running_room_id: id, effective_to: today(), reason: 'stood down' } });
    removed++;
  }
  return { added, removed, moved };
}

/* ------------------------------------------------------------- contractors */

router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const rows = await db.query(`
      SELECT ct.id, ct.code, ct.name, ct.is_blacklisted,
             COUNT(DISTINCT rr.id) AS rr_count,
             COALESCE(SUM(DISTINCT rr.total_beds),0) AS beds,
             COUNT(DISTINCT c.id) AS contracts,
             MIN(c.end_date) AS earliest_expiry,
             (SELECT COUNT(*) FROM staff st WHERE st.contractor_id = ct.id AND st.is_active = 1) AS staff
      FROM contractors ct
      JOIN contracts c ON c.contractor_id = ct.id
      JOIN contract_running_rooms crr ON crr.contract_id = c.id
      JOIN running_rooms rr ON rr.id = crr.running_room_id AND (${s.sql})
      GROUP BY ct.id, ct.code, ct.name, ct.is_blacklisted
      ORDER BY ct.name`, s.params);
    res.render('contractors/index', { title: 'Contractors', rows });
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- contracts */
/* Registered before /:id, or "contracts" is read as a contractor id. */

async function contractForm(req, res, contract, note) {
  const [divisions, scoped, firms] = await Promise.all([
    divisionsInScope(req.user),
    roomsInScope(req.user, contract ? contract.id : 0),
    db.query('SELECT id, code, name, is_blacklisted FROM contractors WHERE is_active = 1 ORDER BY name'),
  ]);
  const held = contract ? await db.query(`
    SELECT crr.running_room_id, crr.effective_from, crr.effective_to
    FROM contract_running_rooms crr WHERE crr.contract_id = ?`, [contract.id]) : [];
  const liveIds = held.filter(h => !h.effective_to || String(h.effective_to).slice(0, 10) >= today())
                      .map(h => h.running_room_id);

  /* WHAT THIS CONTRACT ACTUALLY SAYS.
   *
   * Until stage 36 a contract record was a number, a period and a list of
   * rooms, and everything the contract BOUGHT lived only in the PDF. An
   * officer checking a monthly bill had nothing on screen to check it against.
   *
   * The price schedule is read as printed and NOTHING IS MULTIPLIED: schedule
   * quantity and amount are shown side by side, never multiplied together, for
   * the same reason no penalty amount is computed anywhere in this system.
   */
  const lineItems = contract ? await db.query(`
    SELECT li.*, dg.name AS designation_name
    FROM contract_line_items li
    LEFT JOIN designations dg ON dg.code = li.designation_code
    WHERE li.contract_id = ? ORDER BY li.sort_order, li.id`, [contract.id]) : [];

  // A total that does not agree with the figure on the face of the contract is
  // worth saying out loud, not hiding behind a formatted number.
  const lineTotal = lineItems.reduce((a, l) => a + Number(l.amount || 0), 0);
  const stated = contract && contract.total_value !== null ? Number(contract.total_value) : null;

  // The reference tables this contract has replaced for the rooms it covers.
  const terms = contract ? await db.one(`
    SELECT
      (SELECT COUNT(*) FROM deficiency_clauses WHERE contract_id = ? AND is_active = 1) AS penalties,
      (SELECT COUNT(*) FROM cleaning_schedule  WHERE contract_id = ? AND is_active = 1) AS cleaning,
      (SELECT COUNT(*) FROM consumable_items   WHERE contract_id = ? AND is_active = 1) AS consumables,
      (SELECT COUNT(*) FROM linen_schedule     WHERE contract_id = ?)                   AS linen,
      (SELECT COUNT(*) FROM meal_rates         WHERE contract_id = ?)                   AS meals`,
    [contract.id, contract.id, contract.id, contract.id, contract.id]) : null;

  const mealRates = contract ? await db.query(`
    SELECT meal_type, subsidised_rate, is_ceiling, cap_note, effective_from
    FROM meal_rates WHERE contract_id = ? ORDER BY FIELD(meal_type,'breakfast','lunch','dinner')`,
    [contract.id]) : [];

  res.render('contractors/contract', {
    title: contract ? contract.agreement_no : 'Record an agreement',
    contract, divisions, rooms: scoped, firms, liveIds, past: held.length - liveIds.length,
    statuses: CONTRACT_STATUS, note: note || req.query.saved || null, today: today(),
    added: +req.query.a || 0, moved: +req.query.m || 0, stood: +req.query.r || 0,
    lineItems, lineTotal, stated, terms, mealRates,
  });
}

router.get('/contracts/new', requirePermission('contract.edit'), async (req, res, next) => {
  try { await contractForm(req, res, null); } catch (e) { next(e); }
});

router.post('/contracts/new', requirePermission('contract.edit'), async (req, res, next) => {
  try {
    const divisions = await divisionsInScope(req.user);
    const f = readForm(req.body, divisions);
    let r;
    try {
      r = await db.execute(`
        INSERT INTO contracts (agreement_no, contractor_id, division_id, loa_no, loa_date,
                               start_date, end_date, extended_to, status,
                               security_deposit, performance_guarantee, total_value, remarks)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [f.agreement_no, f.contractor_id, f.division_id, f.loa_no, f.loa_date,
         f.start_date, f.end_date, f.extended_to, f.status,
         f.security_deposit, f.performance_guarantee, f.total_value, f.remarks]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw bad(`Agreement ${f.agreement_no} is already on the system. Open it and correct it there rather than entering it twice.`);
      throw e;
    }
    const id = r.insertId;
    await audit.record(req, { table: 'contracts', id, action: 'insert', after: f });
    const scoped = await roomsInScope(req.user, id);
    const wanted = [].concat(req.body.rr || []).map(Number).filter(Boolean);
    const n = await setRooms(req, id, wanted, scoped, f.start_date || today());
    res.redirect(`${cfg.basePath}/contractors/contracts/${id}?saved=created&a=${n.added}&m=${n.moved}&r=${n.removed}`);
  } catch (e) { next(e); }
});

router.get('/contracts/:id', async (req, res, next) => {
  try {
    const id = +req.params.id;
    const contract = await db.one(`
      SELECT c.*, ct.name AS contractor_name, ct.code AS contractor_code
      FROM contracts c JOIN contractors ct ON ct.id = c.contractor_id
      WHERE c.id = ?`, [id]);
    if (!contract) { const e = new Error('No such agreement.'); e.status = 404; throw e; }
    const divisions = await divisionsInScope(req.user);
    if (!divisions.some(d => d.id === contract.division_id)) {
      const e = new Error('That agreement is outside your access.'); e.status = 403; throw e;
    }
    await contractForm(req, res, contract);
  } catch (e) { next(e); }
});

router.post('/contracts/:id', requirePermission('contract.edit'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const before = await db.one('SELECT * FROM contracts WHERE id = ?', [id]);
    if (!before) { const e = new Error('No such agreement.'); e.status = 404; throw e; }
    const divisions = await divisionsInScope(req.user);
    if (!divisions.some(d => d.id === before.division_id)) {
      const e = new Error('That agreement is outside your access.'); e.status = 403; throw e;
    }
    const f = readForm(req.body, divisions);
    try {
      await db.execute(`
        UPDATE contracts SET agreement_no = ?, contractor_id = ?, division_id = ?, loa_no = ?, loa_date = ?,
               start_date = ?, end_date = ?, extended_to = ?, status = ?,
               security_deposit = ?, performance_guarantee = ?, total_value = ?, remarks = ?
        WHERE id = ?`,
        [f.agreement_no, f.contractor_id, f.division_id, f.loa_no, f.loa_date,
         f.start_date, f.end_date, f.extended_to, f.status,
         f.security_deposit, f.performance_guarantee, f.total_value, f.remarks, id]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw bad(`Agreement ${f.agreement_no} belongs to another record on the system.`);
      throw e;
    }
    await audit.record(req, { table: 'contracts', id, action: 'update', before, after: f });
    const scoped = await roomsInScope(req.user, id);
    const wanted = [].concat(req.body.rr || []).map(Number).filter(Boolean);
    const n = await setRooms(req, id, wanted, scoped, f.start_date || today());
    res.redirect(`${cfg.basePath}/contractors/contracts/${id}?saved=updated&a=${n.added}&m=${n.moved}&r=${n.removed}`);
  } catch (e) { next(e); }
});

/* -------------------------------------------------------- one contractor */

router.get('/:id', async (req, res, next) => {
  try {
    const id = +req.params.id;
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const contractor = await db.one('SELECT * FROM contractors WHERE id = ?', [id]);
    if (!contractor) { const e = new Error('Contractor not found'); e.status = 404; throw e; }

    const contracts = await db.query(`
      SELECT c.id, c.agreement_no, c.loa_no, c.loa_date, c.start_date, c.end_date, c.extended_to,
             c.status, c.security_deposit, c.performance_guarantee, d.name AS division,
             COUNT(crr.running_room_id) AS rr_count
      FROM contracts c
      JOIN divisions d ON d.id = c.division_id
      LEFT JOIN contract_running_rooms crr ON crr.contract_id = c.id
      WHERE c.contractor_id = ?
      GROUP BY c.id, c.agreement_no, c.loa_no, c.loa_date, c.start_date, c.end_date, c.extended_to,
               c.status, c.security_deposit, c.performance_guarantee, d.name
      ORDER BY c.start_date DESC`, [id]);
    contracts.forEach(c => {
      c.gaps = [!c.loa_no && 'LOA number', !c.loa_date && 'LOA date', !c.start_date && 'period',
                !c.security_deposit && 'security deposit',
                !c.performance_guarantee && 'performance guarantee'].filter(Boolean);
    });

    /* ONE ROW PER RUNNING ROOM PER AGREEMENT, WITH THE DATES IT WAS HELD.
     *
     * This used to select the running room alone, with no filter on the link's
     * effective dates at all -- so a room that had been handed over appeared
     * once for the old agreement and once for the new, with nothing on the
     * screen to say which was which or that either had ended. IGP showed twice.
     *
     * A contractor holding four rooms under one expiry date and one staff total
     * tells an officer nothing he can act on. He needs to know WHICH room is
     * short, on WHICH date, under WHICH agreement -- so the link's own dates,
     * the agreement it belongs to, and that room's roll against its sanctioned
     * strength are all carried here.
     *
     * Closed links are kept and shown below the live ones rather than filtered
     * away: who was answerable for a site last March is precisely what this
     * table exists to answer. */
    const rooms = await db.query(`
      SELECT rr.id, rr.code AS rr_code, rr.name, rr.category, rr.total_beds,
             rr.physical_rooms, rr.has_meal_facility, rr.status AS rr_status,
             d.code AS div_code,
             crr.id AS link_id, crr.effective_from, crr.effective_to,
             c.id AS contract_id, c.agreement_no, c.end_date,
             (crr.effective_to IS NULL OR crr.effective_to >= CURDATE()) AS is_live,
             (SELECT COUNT(*) FROM staff st
               WHERE st.running_room_id = rr.id AND st.contractor_id = ?
                 AND st.is_active = 1) AS on_roll,
             (SELECT COALESCE(SUM(m.sanctioned_count), 0) FROM running_room_manpower m
               WHERE m.running_room_id = rr.id AND m.effective_to IS NULL) AS sanctioned
      FROM contract_running_rooms crr
      JOIN contracts c ON c.id = crr.contract_id
      JOIN running_rooms rr ON rr.id = crr.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      WHERE c.contractor_id = ? AND (${s.sql})
      ORDER BY (crr.effective_to IS NOT NULL AND crr.effective_to < CURDATE()),
               d.sort_order, rr.name, crr.effective_from DESC`, [id, id, ...s.params]);

    // Beds and rooms are counted over the DISTINCT rooms held today. Counting
    // the rows would have double-counted IGP's beds the moment it appeared
    // twice, and the header figure is the one an officer reads first.
    const liveRooms = rooms.filter(r => r.is_live);
    const held = [...new Map(liveRooms.map(r => [r.id, r])).values()];
    const heldTotals = {
      rooms: held.length,
      beds: held.reduce((a, r) => a + r.total_beds, 0),
      sanctioned: held.reduce((a, r) => a + Number(r.sanctioned || 0), 0),
      onRoll: held.reduce((a, r) => a + Number(r.on_roll || 0), 0),
      past: rooms.length - liveRooms.length,
    };

    const staff = await db.one(`
      SELECT COUNT(*) AS total, SUM(screening_status='approved') AS approved,
             SUM(screening_status='pending') AS pending
      FROM staff WHERE contractor_id = ? AND is_active = 1`, [id]);

    res.render('contractors/show', { title: contractor.name, contractor, contracts, rooms,
      heldTotals, staff: staff || {} });
  } catch (e) { next(e); }
});

module.exports = router;
