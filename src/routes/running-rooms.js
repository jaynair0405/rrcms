const express = require('express');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');

const router = express.Router();
router.use(requirePermission('rr.view'));

router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr');
    const q = (req.query.q || '').trim();
    const div = req.query.division || '';
    const cat = req.query.category || '';

    const where = [s.sql];
    const params = [...s.params];
    if (q)   { where.push('rr.name LIKE ?'); params.push(`%${q}%`); }
    if (div) { where.push('d.code = ?');     params.push(div); }
    if (cat) { where.push('rr.category = ?');params.push(cat); }

    const rows = await db.query(`
      SELECT rr.id, rr.code, rr.name, rr.category, rr.physical_rooms, rr.total_beds,
             rr.female_rooms, rr.has_meal_facility, rr.ac_status, rr.status,
             rr.ref_crews_per_day, rr.ref_peak_occupancy,
             d.code AS div_code, d.name AS div_name, cd.name AS control_dept,
             (SELECT COALESCE(SUM(m.sanctioned_count),0) FROM running_room_manpower m
               WHERE m.running_room_id = rr.id AND m.effective_to IS NULL) AS sanctioned,
             (SELECT COUNT(*) FROM staff st WHERE st.running_room_id = rr.id AND st.is_active = 1) AS on_roll,
             (SELECT ct.name FROM contract_running_rooms crr
                JOIN contracts c ON c.id = crr.contract_id
                JOIN contractors ct ON ct.id = c.contractor_id
               WHERE crr.running_room_id = rr.id
                 AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
               ORDER BY crr.effective_from DESC LIMIT 1) AS contractor
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      JOIN control_departments cd ON cd.id = rr.control_dept_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.sort_order, rr.name`, params);

    const divisions = await db.query('SELECT code, name FROM divisions ORDER BY sort_order');
    res.render('running-rooms/index', {
      title: 'Running Rooms', rows, divisions, q, div, cat,
      totals: {
        beds: rows.reduce((a, r) => a + r.total_beds, 0),
        crews: rows.reduce((a, r) => a + (r.ref_crews_per_day || 0), 0),
      },
    });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = +req.params.id;
    await assertRunningRoomAccess(db, req.user, id);

    const rr = await db.one(`
      SELECT rr.*, d.code AS div_code, d.name AS div_name, cd.name AS control_dept
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      JOIN control_departments cd ON cd.id = rr.control_dept_id
      WHERE rr.id = ?`, [id]);
    if (!rr) { const e = new Error('Running room not found'); e.status = 404; throw e; }

    const manpower = await db.query(`
      SELECT dg.id AS designation_id, dg.name, dg.skill_category, dg.is_kitchen_role,
             m.norm_count, m.sanctioned_count, m.is_scaled, m.band_beds, m.is_overridden, m.override_reason,
             (SELECT COUNT(*) FROM staff st WHERE st.running_room_id = m.running_room_id
                AND st.designation_id = m.designation_id AND st.is_active = 1) AS on_roll
      FROM running_room_manpower m
      JOIN designations dg ON dg.id = m.designation_id
      WHERE m.running_room_id = ? AND m.effective_to IS NULL
      ORDER BY dg.sort_order`, [id]);

    const contract = await db.one(`
      SELECT c.agreement_no, c.start_date, c.end_date, c.status, ct.name AS contractor, ct.code AS contractor_code
      FROM contract_running_rooms crr
      JOIN contracts c ON c.id = crr.contract_id
      JOIN contractors ct ON ct.id = c.contractor_id
      WHERE crr.running_room_id = ?
        AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
      ORDER BY crr.effective_from DESC LIMIT 1`, [id]);

    const coverage = await db.query(`
      SELECT period_month, occupants_total, feedback_received, coverage_pct, meets_floor
      FROM feedback_coverage WHERE running_room_id = ? ORDER BY period_month DESC LIMIT 6`, [id]);

    const grading = await db.query(`
      SELECT period_month, head, avg_rating, sample_size, r_value, coverage_met
      FROM monthly_grading WHERE running_room_id = ? ORDER BY period_month DESC, head`, [id]);

    const deficiencies = await db.query(`
      SELECT df.occurred_on, df.quantity, df.status, df.source, dc.clause_code, dc.description
      FROM deficiencies df JOIN deficiency_clauses dc ON dc.id = df.clause_id
      WHERE df.running_room_id = ? ORDER BY df.occurred_on DESC LIMIT 20`, [id]);

    res.render('running-rooms/show', {
      title: rr.name, rr, manpower, contract, coverage, grading, deficiencies,
      sanctioned: manpower.reduce((a, m) => a + m.sanctioned_count, 0),
      onRoll: manpower.reduce((a, m) => a + m.on_roll, 0),
      /* THE ESTABLISHMENT IS WHAT THE CONTRACT BOUGHT. NOTHING IS ADDED TO IT.
       *
       * There was a period when this screen totalled 128 at IGP: the contract's
       * 107 plus 21 posts the tender's bed-band table wants and this contract
       * does not buy. Two subtotals and a paragraph were added to explain the
       * difference, and none of it helped -- a running room in-charge reading
       * 128 is reading a number the Railway is not paying for, whatever is
       * written underneath it.
       *
       * The contract is now the whole answer, which is the rule every other
       * reference table in this system already follows. Posts outside Part-A
       * are stood down to nil by db/seed-igp-establishment.js, so the total IS
       * the contract's total.
       *
       * They are not deleted. norm_count keeps what the bed-band table would
       * have given, so "the norm wants six Call Boys and the contract bought
       * none" is still answerable -- as a note, not as a figure in the
       * establishment. */
      notBought: manpower
        .filter(m => m.sanctioned_count === 0 && m.norm_count > 0 && m.is_overridden)
        .map(m => ({ name: m.name, norm: m.norm_count })),
    });
  } catch (e) { next(e); }
});

// Editing the occupancy figure is the one write in stage 1 — it is the
// denominator for the 50% feedback floor and there is no RRMS feed for it.
//
// Gated on `occupancy.record` rather than `rr.edit` since stage 33. `rr.edit`
// also governs bed counts, category and sanctioned strength, so gating the
// occupant count behind it kept the figure away from the RR In-charge — the one
// man who actually has the register. The narrow permission lets him type the
// number without also letting him change the running room's establishment.
router.post('/:id/occupancy', requirePermission('occupancy.record'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    await assertRunningRoomAccess(db, req.user, id);
    const month = String(req.body.period_month || '').slice(0, 7) + '-01';
    const total = Math.max(0, parseInt(req.body.occupants_total, 10) || 0);

    const before = await db.one(
      `SELECT * FROM occupancy_monthly WHERE running_room_id = ? AND period_month = ?`, [id, month]);
    await db.execute(`
      INSERT INTO occupancy_monthly (running_room_id, period_month, occupants_total, source, entered_by)
      VALUES (?,?,?, 'manual', ?)
      ON DUPLICATE KEY UPDATE occupants_total = VALUES(occupants_total),
                              source = 'manual', entered_by = VALUES(entered_by)`,
      [id, month, total, req.user.id]);
    // The occupancy figure IS the denominator of the coverage percentage, so
    // entering it has to move that percentage. Before this, coverage was read in
    // seven places and written in none.
    await require('../services/coverage').refresh(id, month);
    await audit.record(req, { table: 'occupancy_monthly', id, action: before ? 'update' : 'insert',
      before, after: { running_room_id: id, period_month: month, occupants_total: total } });

    res.redirect(`${require('../config').basePath}/running-rooms/${id}`);
  } catch (e) { next(e); }
});

module.exports = router;
