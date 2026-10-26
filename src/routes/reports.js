/**
 * Reports — the consolidated views an officer actually asks for.
 *
 * Three pages, each with a CSV twin:
 *   /reports            contractor scorecard — one row per contractor
 *   /reports/sites      running-room league table — one row per running room
 *   /reports/trends     six months of ratings, coverage, inspections, deficiencies
 *
 * Every figure here is a count, an average or a percentage. Nothing on these
 * pages multiplies a rate by a quantity: the penalty arithmetic arrives with
 * the penalty migration, once the schedule under review is finalised.
 *
 * Reading a report needs rr.view. Downloading one needs report.export, which a
 * contractor's own supervisor does not hold.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope } = require('../middleware/scope');
const day = require('../lib/day');

const router = express.Router();
router.use(requirePermission('rr.view'));

/* The contract join, written once. A running room counts towards a contractor
 * only while that contractor actually holds it. */
const CONTRACT_JOIN = `
  JOIN contract_running_rooms crr ON crr.running_room_id = rr.id
       AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
  JOIN contracts c   ON c.id = crr.contract_id AND c.status = 'active'
  JOIN contractors ct ON ct.id = c.contractor_id`;

const lastMonth = () => day.monthStart(1);
const monthsBack = n => day.monthStart(n);
// mysql2 hands DATE columns back as JS Date objects; the demo stub hands back
// strings. Both are normalised to YYYY-MM-DD before anything compares them.
const ymd = v => v instanceof Date
  ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  : String(v).slice(0, 10);
const monthLabel = m => new Date(ymd(m) + 'T00:00:00Z')
  .toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/* ------------------------------------------------- contractor scorecard */
async function scorecardData(user, month) {
  const s = runningRoomScope(user, 'rr', { operationalOnly: true });
  const p = s.params;

  const base = await db.query(`
    SELECT ct.id, ct.code, ct.name, ct.is_blacklisted,
           COUNT(DISTINCT rr.id) AS rr_count,
           COALESCE(SUM(rr.total_beds),0) AS beds,
           SUM(rr.has_meal_facility) AS meal_sites
    FROM running_rooms rr ${CONTRACT_JOIN}
    WHERE ${s.sql}
    GROUP BY ct.id, ct.code, ct.name, ct.is_blacklisted
    ORDER BY ct.name`, p);

  const grading = await db.query(`
    SELECT ct.id, ROUND(AVG(g.avg_rating),2) AS rating, MIN(g.r_value) AS worst_r
    FROM monthly_grading g
    JOIN running_rooms rr ON rr.id = g.running_room_id ${CONTRACT_JOIN}
    WHERE g.period_month = ? AND (${s.sql})
    GROUP BY ct.id`, [month, ...p]);

  const coverage = await db.query(`
    SELECT ct.id, ROUND(AVG(fc.coverage_pct),1) AS coverage_pct,
           SUM(fc.meets_floor) AS meeting, COUNT(*) AS periods
    FROM feedback_coverage fc
    JOIN running_rooms rr ON rr.id = fc.running_room_id ${CONTRACT_JOIN}
    WHERE fc.period_month = ? AND (${s.sql})
    GROUP BY ct.id`, [month, ...p]);

  const defs = await db.query(`
    SELECT ct.id, COUNT(*) AS total, SUM(df.status = 'open') AS open
    FROM deficiencies df
    JOIN running_rooms rr ON rr.id = df.running_room_id ${CONTRACT_JOIN}
    WHERE df.occurred_on >= ? AND (${s.sql})
    GROUP BY ct.id`, [monthsBack(6), ...p]);

  const insp = await db.query(`
    SELECT ct.id, COUNT(*) AS total, SUM(i.result = 'compliant') AS compliant
    FROM inspections i
    JOIN running_rooms rr ON rr.id = i.running_room_id ${CONTRACT_JOIN}
    WHERE i.inspection_date >= ? AND (${s.sql})
    GROUP BY ct.id`, [monthsBack(6), ...p]);

  const staff = await db.query(`
    SELECT ct.id, COUNT(*) AS on_roll, SUM(st.screening_status <> 'approved') AS unscreened
    FROM staff st
    JOIN running_rooms rr ON rr.id = st.running_room_id ${CONTRACT_JOIN}
    WHERE st.is_active = 1 AND (${s.sql})
    GROUP BY ct.id`, p);

  const sanctioned = await db.query(`
    SELECT ct.id, COALESCE(SUM(m.sanctioned_count),0) AS sanctioned
    FROM running_room_manpower m
    JOIN running_rooms rr ON rr.id = m.running_room_id ${CONTRACT_JOIN}
    WHERE m.effective_to IS NULL AND (${s.sql})
    GROUP BY ct.id`, p);

  const by = arr => Object.fromEntries(arr.map(r => [r.id, r]));
  const G = by(grading), C = by(coverage), D = by(defs), I = by(insp), S = by(staff), N = by(sanctioned);

  return base.map(b => {
    const g = G[b.id] || {}, c = C[b.id] || {}, d = D[b.id] || {},
          i = I[b.id] || {}, st = S[b.id] || {}, n = N[b.id] || {};
    const onRoll = +st.on_roll || 0, sanc = +n.sanctioned || 0;
    return {
      ...b,
      rating: g.rating === undefined || g.rating === null ? null : Number(g.rating),
      worst_r: g.worst_r === undefined ? null : g.worst_r,
      coverage_pct: c.coverage_pct === undefined || c.coverage_pct === null ? null : Number(c.coverage_pct),
      meeting: +c.meeting || 0, periods: +c.periods || 0,
      def_total: +d.total || 0, def_open: +d.open || 0,
      insp_total: +i.total || 0, insp_compliant: +i.compliant || 0,
      compliant_pct: i.total ? Math.round((i.compliant / i.total) * 100) : null,
      on_roll: onRoll, unscreened: +st.unscreened || 0, sanctioned: sanc,
      gap: sanc - onRoll,
    };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}-01$/.test(req.query.month || '') ? req.query.month : lastMonth();
    const rows = await scorecardData(req.user, month);
    res.render('reports/scorecard', {
      title: 'Contractor scorecard', section: 'scorecard',
      month, monthLabel: monthLabel(month), rows, months: monthChoices(),
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------ running-room league table */
const SITE_SORTS = {
  name:     'rr.name',
  rating:   'rating IS NULL, rating ASC',
  coverage: 'coverage_pct IS NULL, coverage_pct ASC',
  open:     'def_open DESC',
  beds:     'rr.total_beds DESC',
};

async function sitesData(user, month, sort) {
  const s = runningRoomScope(user, 'rr', { operationalOnly: true });
  const order = SITE_SORTS[sort] || SITE_SORTS.rating;
  return db.query(`
    SELECT rr.id, rr.code, rr.name, rr.total_beds, rr.has_meal_facility,
           d.code AS div_code, ct.name AS contractor,
           (SELECT ROUND(AVG(g.avg_rating),2) FROM monthly_grading g
             WHERE g.running_room_id = rr.id AND g.period_month = ?)            AS rating,
           (SELECT fc.coverage_pct FROM feedback_coverage fc
             WHERE fc.running_room_id = rr.id AND fc.period_month = ?)          AS coverage_pct,
           (SELECT COUNT(*) FROM deficiencies df
             WHERE df.running_room_id = rr.id AND df.status = 'open')           AS def_open,
           (SELECT COUNT(*) FROM deficiencies df
             WHERE df.running_room_id = rr.id AND df.occurred_on >= ?)          AS def_total,
           (SELECT COUNT(*) FROM inspections i
             WHERE i.running_room_id = rr.id AND i.inspection_date >= ?)        AS insp_total,
           (SELECT COUNT(*) FROM staff st
             WHERE st.running_room_id = rr.id AND st.is_active = 1)             AS on_roll,
           (SELECT COALESCE(SUM(m.sanctioned_count),0) FROM running_room_manpower m
             WHERE m.running_room_id = rr.id AND m.effective_to IS NULL)        AS sanctioned
    FROM running_rooms rr
    JOIN divisions d ON d.id = rr.division_id
    LEFT JOIN contract_running_rooms crr ON crr.running_room_id = rr.id
         AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
    LEFT JOIN contracts c   ON c.id = crr.contract_id AND c.status = 'active'
    LEFT JOIN contractors ct ON ct.id = c.contractor_id
    WHERE ${s.sql}
    ORDER BY ${order}`,
    [month, month, monthsBack(6), monthsBack(6), ...s.params]);
}

router.get('/sites', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}-01$/.test(req.query.month || '') ? req.query.month : lastMonth();
    const sort = SITE_SORTS[req.query.sort] ? req.query.sort : 'rating';
    const rows = await sitesData(req.user, month, sort);
    res.render('reports/sites', {
      title: 'Running-room league table', section: 'sites',
      month, monthLabel: monthLabel(month), months: monthChoices(), sort, rows,
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------- trends */
async function trendsData(user) {
  const s = runningRoomScope(user, 'rr', { operationalOnly: true });
  const from = monthsBack(6);

  const rating = await db.query(`
    SELECT g.period_month, g.head, ROUND(AVG(g.avg_rating),2) AS avg_rating, SUM(g.sample_size) AS sample
    FROM monthly_grading g JOIN running_rooms rr ON rr.id = g.running_room_id
    WHERE g.period_month >= ? AND (${s.sql})
    GROUP BY g.period_month, g.head
    ORDER BY g.period_month`, [from, ...s.params]);

  const coverage = await db.query(`
    SELECT fc.period_month, ROUND(AVG(fc.coverage_pct),1) AS avg_pct,
           SUM(fc.meets_floor) AS meeting, COUNT(*) AS sites
    FROM feedback_coverage fc JOIN running_rooms rr ON rr.id = fc.running_room_id
    WHERE fc.period_month >= ? AND (${s.sql})
    GROUP BY fc.period_month ORDER BY fc.period_month`, [from, ...s.params]);

  const inspections = await db.query(`
    SELECT DATE_FORMAT(i.inspection_date, '%Y-%m-01') AS period_month,
           COUNT(*) AS total,
           SUM(i.result = 'compliant')          AS compliant,
           SUM(i.result = 'minor_deficiencies') AS minor,
           SUM(i.result = 'major_deficiencies') AS major
    FROM inspections i JOIN running_rooms rr ON rr.id = i.running_room_id
    WHERE i.inspection_date >= ? AND i.inspection_date < ? AND (${s.sql})
    GROUP BY period_month ORDER BY period_month`, [from, monthsBack(0), ...s.params]);

  const byHead = await db.query(`
    SELECT dc.group_code, dc.group_name, COUNT(*) AS n, SUM(df.status = 'open') AS open
    FROM deficiencies df
    JOIN deficiency_clauses dc ON dc.id = df.clause_id
    JOIN running_rooms rr ON rr.id = df.running_room_id
    WHERE df.occurred_on >= ? AND (${s.sql})
    GROUP BY dc.group_code, dc.group_name ORDER BY n DESC`, [from, ...s.params]);

  const byDivision = await db.query(`
    SELECT d.code, d.name, ROUND(AVG(fc.coverage_pct),1) AS avg_pct,
           SUM(fc.meets_floor) AS meeting, COUNT(*) AS sites
    FROM feedback_coverage fc
    JOIN running_rooms rr ON rr.id = fc.running_room_id
    JOIN divisions d ON d.id = rr.division_id
    WHERE fc.period_month = ? AND (${s.sql})
    GROUP BY d.id, d.code, d.name ORDER BY d.sort_order`, [lastMonth(), ...s.params]);

  const stamp = r => ({ ...r, period_month: ymd(r.period_month), month_label: monthLabel(r.period_month) });
  return {
    rating: rating.map(stamp), coverage: coverage.map(stamp),
    inspections: inspections.map(stamp), byHead, byDivision,
  };
}

router.get('/trends', async (req, res, next) => {
  try {
    const t = await trendsData(req.user);
    res.render('reports/trends', {
      title: 'Trends', section: 'trends', monthLabel, lastMonthLabel: monthLabel(lastMonth()), ...t,
    });
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- CSV */
// CSV rather than a binary workbook: it opens in Excel, it has no dependency,
// and it cannot carry a formula that a spreadsheet would then execute.
const cell = v => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // A leading =, +, - or @ is a formula to Excel; prefix it so it stays text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
function sendCsv(res, filename, headers, rows) {
  const body = '﻿' + [headers.join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

router.get('/scorecard.csv', requirePermission('report.export'), async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}-01$/.test(req.query.month || '') ? req.query.month : lastMonth();
    const rows = await scorecardData(req.user, month);
    sendCsv(res, `contractor-scorecard-${month.slice(0, 7)}.csv`,
      ['Contractor code', 'Contractor', 'Running rooms', 'Beds', 'Meal sites',
       'Avg occupant rating', 'Lowest R value', 'Feedback coverage %', 'Sites meeting 50% floor',
       'Sites rated', 'Deficiencies (6 months)', 'Open deficiencies', 'Inspections (6 months)',
       'Compliant %', 'Staff on roll', 'Sanctioned', 'Gap', 'Unscreened'],
      rows.map(r => [r.code, r.name, r.rr_count, r.beds, r.meal_sites, r.rating, r.worst_r,
        r.coverage_pct, r.meeting, r.periods, r.def_total, r.def_open, r.insp_total,
        r.compliant_pct, r.on_roll, r.sanctioned, r.gap, r.unscreened]));
  } catch (e) { next(e); }
});

router.get('/sites.csv', requirePermission('report.export'), async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}-01$/.test(req.query.month || '') ? req.query.month : lastMonth();
    const sort = SITE_SORTS[req.query.sort] ? req.query.sort : 'rating';
    const rows = await sitesData(req.user, month, sort);
    sendCsv(res, `running-rooms-${month.slice(0, 7)}.csv`,
      ['RR code', 'Running room', 'Division', 'Contractor', 'Beds', 'Meals',
       'Avg occupant rating', 'Feedback coverage %', 'Meets 50% floor', 'Open deficiencies',
       'Deficiencies (6 months)', 'Inspections (6 months)', 'Staff on roll', 'Sanctioned', 'Gap'],
      rows.map(r => [r.code, r.name, r.div_code, r.contractor, r.total_beds,
        r.has_meal_facility ? 'Yes' : 'No', r.rating, r.coverage_pct,
        r.coverage_pct === null ? '' : (r.coverage_pct >= 50 ? 'Yes' : 'No'),
        r.def_open, r.def_total, r.insp_total, r.on_roll, r.sanctioned,
        (r.sanctioned || 0) - (r.on_roll || 0)]));
  } catch (e) { next(e); }
});

router.get('/trends.csv', requirePermission('report.export'), async (req, res, next) => {
  try {
    const t = await trendsData(req.user);
    const months = [...new Set(t.coverage.map(c => c.period_month))];
    const g = (m, head) => {
      const x = t.rating.find(r => r.period_month === m && r.head === head);
      return x ? x.avg_rating : '';
    };
    sendCsv(res, 'trends.csv',
      ['Month', 'Cleanliness', 'Food', 'Linen', 'Feedback coverage %', 'Sites meeting floor',
       'Sites', 'Inspections', 'Compliant', 'Minor', 'Major'],
      months.map(m => {
        const c = t.coverage.find(x => x.period_month === m) || {};
        const i = t.inspections.find(x => x.period_month === m) || {};
        return [monthLabel(m), g(m, 'cleanliness'), g(m, 'food'), g(m, 'linen'),
          c.avg_pct, c.meeting, c.sites, i.total, i.compliant, i.minor, i.major];
      }));
  } catch (e) { next(e); }
});

function monthChoices() {
  const out = [];
  const d = new Date();
  for (let k = 1; k <= 6; k++) {
    const m = day.monthStart(k);
    out.push({ value: m, label: monthLabel(m) });
  }
  return out;
}

module.exports = router;
module.exports.basePath = cfg.basePath;
