const express = require('express');
const db = require('../db');
const { runningRoomScope } = require('../middleware/scope');
const { today } = require('../lib/day');
const day = require('../lib/day');

const monthsBack = n => day.monthStart(n);
// mysql2 returns DATE columns as Date objects; the demo stub returns strings.
const ymd = v => v instanceof Date
  ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  : String(v).slice(0, 10);
const monthLabel = m => new Date(ymd(m) + 'T00:00:00Z')
  .toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });

    const totals = await db.one(`
      SELECT COUNT(*) AS rr_count,
             COALESCE(SUM(rr.total_beds),0)         AS beds,
             COALESCE(SUM(rr.physical_rooms),0)     AS rooms,
             COALESCE(SUM(rr.ref_crews_per_day),0)  AS crews_day,
             COALESCE(SUM(rr.ref_peak_occupancy),0) AS peak,
             SUM(rr.has_meal_facility)              AS meal_sites,
             SUM(rr.female_rooms > 0)               AS female_sites,
             COALESCE(SUM(rr.female_rooms),0)       AS female_rooms
      FROM running_rooms rr WHERE ${s.sql}`, s.params);

    const byDivision = await db.query(`
      SELECT d.code, d.name,
             COUNT(rr.id) AS rr_count,
             COALESCE(SUM(rr.total_beds),0) AS beds,
             COALESCE(SUM(rr.ref_crews_per_day),0) AS crews_day,
             COALESCE(SUM(rr.ref_peak_occupancy),0) AS peak,
             SUM(rr.female_rooms > 0) AS female_sites
      FROM divisions d
      JOIN running_rooms rr ON rr.division_id = d.id AND (${s.sql})
      GROUP BY d.id, d.code, d.name
      ORDER BY d.sort_order`, s.params);

    const byCategory = await db.query(`
      SELECT rr.category, COUNT(*) AS n, COALESCE(SUM(rr.total_beds),0) AS beds
      FROM running_rooms rr WHERE ${s.sql} GROUP BY rr.category ORDER BY rr.category`, s.params);

    const staff = await db.one(`
      SELECT COUNT(*) AS on_roll,
             SUM(st.screening_status = 'approved') AS approved,
             SUM(st.screening_status = 'pending')  AS pending
      FROM staff st JOIN running_rooms rr ON rr.id = st.running_room_id
      WHERE st.is_active = 1 AND (${s.sql})`, s.params);

    const sanctioned = await db.scalar(`
      SELECT COALESCE(SUM(m.sanctioned_count),0)
      FROM running_room_manpower m JOIN running_rooms rr ON rr.id = m.running_room_id
      WHERE m.effective_to IS NULL AND (${s.sql})`, s.params);

    const contractors = await db.scalar(`
      SELECT COUNT(DISTINCT c.contractor_id)
      FROM contracts c
      JOIN contract_running_rooms crr ON crr.contract_id = c.id
      JOIN running_rooms rr ON rr.id = crr.running_room_id
      WHERE c.status = 'active' AND (${s.sql})`, s.params);

    // Coverage against the tender's minimum-50%-of-occupants floor.
    const coverage = await db.one(`
      SELECT COUNT(*) AS periods,
             SUM(fc.meets_floor) AS meeting,
             ROUND(AVG(fc.coverage_pct),1) AS avg_pct
      FROM feedback_coverage fc JOIN running_rooms rr ON rr.id = fc.running_room_id
      WHERE ${s.sql}`, s.params);

    const grading = await db.query(`
      SELECT g.head, ROUND(AVG(g.avg_rating),2) AS avg_rating, COUNT(*) AS sites
      FROM monthly_grading g JOIN running_rooms rr ON rr.id = g.running_room_id
      WHERE ${s.sql} GROUP BY g.head`, s.params);

    const deficiencies = await db.one(`
      SELECT COUNT(*) AS total, SUM(df.status = 'open') AS open
      FROM deficiencies df JOIN running_rooms rr ON rr.id = df.running_room_id
      WHERE ${s.sql}`, s.params);

    // Six months of history for the charts. Charts are rendered to SVG on the
    // server, so the dashboard prints and needs no client-side library.
    const from = monthsBack(6), last = monthsBack(1);

    const ratingTrend = await db.query(`
      SELECT g.period_month, ROUND(AVG(g.avg_rating),2) AS avg_rating
      FROM monthly_grading g JOIN running_rooms rr ON rr.id = g.running_room_id
      WHERE g.period_month >= ? AND (${s.sql})
      GROUP BY g.period_month ORDER BY g.period_month`, [from, ...s.params]);

    const coverageByDivision = await db.query(`
      SELECT d.code, d.name, ROUND(AVG(fc.coverage_pct),1) AS avg_pct,
             SUM(fc.meets_floor) AS meeting, COUNT(*) AS sites
      FROM feedback_coverage fc
      JOIN running_rooms rr ON rr.id = fc.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      WHERE fc.period_month = ? AND (${s.sql})
      GROUP BY d.id, d.code, d.name ORDER BY d.sort_order`, [last, ...s.params]);

    const defByHead = await db.query(`
      SELECT dc.group_code, dc.group_name, COUNT(*) AS n, SUM(df.status = 'open') AS open
      FROM deficiencies df
      JOIN deficiency_clauses dc ON dc.id = df.clause_id
      JOIN running_rooms rr ON rr.id = df.running_room_id
      WHERE df.occurred_on >= ? AND (${s.sql})
      GROUP BY dc.group_code, dc.group_name ORDER BY n DESC`, [from, ...s.params]);

    /* ---------------------------------------------------- the agreements
     *
     * Asked for by a divisional officer: the Letter of Acceptance on the
     * dashboard. What he is actually after is the answer to two questions he
     * cannot get anywhere on one screen — which agreement covers each of my
     * running rooms, and when does it run out.
     *
     * So the panel is the agreements themselves, one row each, carrying the
     * LOA reference and date beside the agreement number, the contractor, the
     * rooms covered, and how long is left to run. A contract extended under
     * `extended_to` runs to the later of the two dates, which is the date that
     * actually matters.
     *
     * Scoped like everything else: a running room in-charge sees the one
     * agreement that covers him, the contractor's supervisor sees his own.
     */
    const agreements = await db.query(`
      SELECT c.id, c.agreement_no, c.loa_no, c.loa_date, c.start_date, c.end_date,
             c.extended_to, c.status, c.security_deposit, c.performance_guarantee,
             co.name AS contractor_name, co.code AS contractor_code,
             d.code AS div_code,
             COUNT(DISTINCT crr.running_room_id) AS rooms,
             GROUP_CONCAT(DISTINCT rr.name ORDER BY rr.name SEPARATOR ', ') AS room_names
      FROM contracts c
      JOIN contractors co ON co.id = c.contractor_id
      JOIN divisions d ON d.id = c.division_id
      JOIN contract_running_rooms crr ON crr.contract_id = c.id
        AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
      JOIN running_rooms rr ON rr.id = crr.running_room_id AND (${s.sql})
      WHERE c.status IN ('active','extended','draft')
      GROUP BY c.id, c.agreement_no, c.loa_no, c.loa_date, c.start_date, c.end_date,
               c.extended_to, c.status, c.security_deposit, c.performance_guarantee,
               co.name, co.code, d.code
      ORDER BY COALESCE(c.extended_to, c.end_date)`, s.params);

    const todayIso = today();
    const dayMs = 86400000;
    for (const a of agreements) {
      // A contract may be on the system before its period is known — at the
      // pilot sites in August 2026 not one of the four had an agreement
      // supplied at all. So an absent end date is a real state, not a bug, and
      // it must not become NaN on the officer's screen.
      const end = a.extended_to || a.end_date;
      a.runs_to = end ? ymd(end) : null;
      a.days_left = a.runs_to
        ? Math.round((Date.parse(a.runs_to + 'T00:00:00Z') - Date.parse(todayIso + 'T00:00:00Z')) / dayMs)
        : null;
      // What is missing from the record, said plainly. Every one of these is
      // data the Railway owes rather than a fault in the application, and an
      // officer looking at his own dashboard is the person who can chase it.
      a.gaps = [
        !a.loa_no       && 'LOA number',
        !a.loa_date     && 'LOA date',
        !a.start_date   && 'the period',
        !a.security_deposit && 'security deposit',
        !a.performance_guarantee && 'performance guarantee',
      ].filter(Boolean);
    }

    // A running room with no agreement against it at all. Not a warning about
    // paperwork: it means nothing on this system can say who is answerable for
    // that site today.
    const uncovered = await db.query(`
      SELECT rr.id, rr.name, d.code AS div_code
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      WHERE (${s.sql}) AND rr.status = 'operational' AND NOT EXISTS (
        SELECT 1 FROM contract_running_rooms crr
        JOIN contracts c ON c.id = crr.contract_id
        WHERE crr.running_room_id = rr.id
          AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
          AND c.status IN ('active','extended','draft'))
      ORDER BY d.code, rr.name`, s.params);

    res.render('dashboard', {
      title: 'Dashboard', totals, byDivision, byCategory, staff,
      agreements, uncovered,
      sanctioned: sanctioned || 0, contractors: contractors || 0,
      coverage: coverage || {}, grading, deficiencies: deficiencies || {},
      ratingTrend: ratingTrend.map(r => ({ ...r, month_label: monthLabel(r.period_month) })),
      coverageByDivision, defByHead, lastMonthLabel: monthLabel(last),
    });
  } catch (e) { next(e); }
});

module.exports = router;
