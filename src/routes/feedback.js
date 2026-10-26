const express = require('express');
const db = require('../db');
const cfg = require('../config');
const qr = require('../lib/qr');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const coverage = require('../services/coverage');
const { thisMonth, today } = require('../lib/day');

const router = express.Router();
router.use(requirePermission('feedback.view'));

const monthOf = v => (v && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : thisMonth()) + '-01';

/* ------------------------------------------------------------------ inbox */
router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const { status = '', severity = '', rr = '', sort = 'open' } = req.query;
    const where = [s.sql], params = [...s.params];
    if (status)   { where.push('f.status = ?');   params.push(status); }
    if (severity) { where.push('f.severity = ?'); params.push(severity); }
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
    if (rr)       { where.push('rr.id = ?');      params.push(+rr); }

    const rows = await db.query(`
      SELECT f.*, rr.name AS rr_name, rr.id AS rr_id, d.code AS div_code, st.full_name AS named_staff
      FROM feedback f
      JOIN running_rooms rr ON rr.id = f.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN staff st ON st.id = f.named_staff_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sort === 'new' ? '' : "(f.status = 'open') DESC,"} f.submitted_at DESC
      LIMIT 200`, params);

    /* WHAT THE CREW PHOTOGRAPHED, fetched for the rows on the page rather than
     * joined -- a feedback row may carry more than one picture, and joining
     * would duplicate the feedback line once per photograph. */
    if (rows.length) {
      const shots = await db.query(
        `SELECT feedback_id, file_id FROM feedback_photos WHERE feedback_id IN (?)
         ORDER BY id`, [rows.map(r => r.id)]);
      const by = {};
      shots.forEach(p => { (by[p.feedback_id] ||= []).push(p.file_id); });
      rows.forEach(r => { r.photos = by[r.id] || []; });
    }

    const counts = await db.one(`
      SELECT COUNT(*) AS total,
             SUM(f.status = 'open') AS open,
             SUM(f.severity = 'critical') AS critical,
             ROUND(AVG(f.rating_overall),2) AS avg_overall
      FROM feedback f JOIN running_rooms rr ON rr.id = f.running_room_id
      WHERE ${s.sql}`, s.params);

    const rooms = await db.query(`SELECT rr.id, rr.name FROM running_rooms rr WHERE ${s.sql} ORDER BY rr.name`, s.params);
    const todayStr = today();
    res.render('feedback/index', { title: 'Crew feedback', tab: 'inbox',
      rows, counts: counts || {}, rooms, status, severity, rr, sort, todayStr,
      todayCount: rows.filter(f => String(f.submitted_at).slice(0, 10) === todayStr).length });
  } catch (e) { next(e); }
});

router.post('/:id/close', requirePermission('feedback.close'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const f = await db.one('SELECT id, running_room_id, status FROM feedback WHERE id = ?', [id]);
    if (!f) { const e = new Error('Feedback not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, f.running_room_id);
    await db.execute(`UPDATE feedback SET status='closed', closed_by=?, closed_at=NOW() WHERE id=?`, [req.user.id, id]);
    await audit.record(req, { table: 'feedback', id, action: 'update',
      before: { status: f.status }, after: { status: 'closed' } });
    res.redirect(req.get('referer') || `${cfg.basePath}/feedback`);
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- coverage */
// The tender's minimum-50%-of-occupants floor. Below it the grading penalty is
// not leviable at all, so weak collection quietly protects a poor contractor.
router.get('/coverage', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const month = monthOf(req.query.month);

    const rows = await db.query(`
      SELECT rr.id, rr.code, rr.name, d.code AS div_code, rr.ref_crews_per_day,
             o.occupants_total, o.source,
             (SELECT COUNT(*) FROM feedback f
               WHERE f.running_room_id = rr.id
                 AND f.submitted_at >= ? AND f.submitted_at < DATE_ADD(?, INTERVAL 1 MONTH)) AS received,
             -- Counted separately, because the 50% floor the penalty clause
             -- names is a floor of SIGNED occupant feedback on the physical
             -- register, not of everything that happened to arrive.
             (SELECT COUNT(*) FROM feedback f
               WHERE f.running_room_id = rr.id AND f.channel = 'checkout_register'
                 AND f.submitted_at >= ? AND f.submitted_at < DATE_ADD(?, INTERVAL 1 MONTH)) AS signed_received
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN occupancy_monthly o ON o.running_room_id = rr.id AND o.period_month = ?
      WHERE ${s.sql}
      ORDER BY d.sort_order, rr.name`, [month, month, month, month, month, ...s.params]);

    rows.forEach(r => {
      r.coverage = r.occupants_total ? +(r.received / r.occupants_total * 100).toFixed(1) : null;
      r.meets = r.coverage !== null && r.coverage >= 50;
      r.signed_coverage = r.occupants_total
        ? +(r.signed_received / r.occupants_total * 100).toFixed(1) : null;
      r.meets_signed = r.signed_coverage !== null && r.signed_coverage >= 50;
    });
    const withFigure = rows.filter(r => r.occupants_total);
    res.render('feedback/coverage', { title: 'Feedback coverage', tab: 'coverage', rows, month,
      recomputed: req.query.recomputed || null, entered: req.query.entered || null,
      summary: { sites: rows.length, withFigure: withFigure.length,
        meeting: withFigure.filter(r => r.meets).length,
        meetingSigned: withFigure.filter(r => r.meets_signed).length,
        missing: rows.length - withFigure.length } });
  } catch (e) { next(e); }
});

/**
 * Entering the month's occupant count, for several running rooms at once.
 *
 * The figure lived only on each running room's own page, behind `rr.edit` —
 * which the RR In-charge does not hold and should not, because it also governs
 * bed counts and sanctioned strength. So the one man who actually has the
 * register in front of him could not type the number in, and the number is not
 * decoration: IT IS THE DENOMINATOR OF THE 50% FLOOR. With no figure, coverage
 * computes as zero, the floor is not met, and clauses GC, GF and GL cannot be
 * levied at all. A contractor with genuinely poor grading escapes the penalty
 * because nobody typed a number — and on screen that is indistinguishable from
 * coverage honestly falling short.
 *
 * So entry belongs here, on the page that already prints the consequence, and
 * behind its own narrow permission.
 *
 * A BLANK BOX IS NOT A ZERO. Left empty, a room is untouched — the officer is
 * saying nothing about it this visit. A typed 0 is a statement, and is stored.
 */
router.post('/coverage/occupancy', requirePermission('occupancy.record'), async (req, res, next) => {
  try {
    const month = monthOf(req.body.month);
    const ref = String(req.body.source_reference || '').trim().slice(0, 120) || null;

    // Only rooms the user may see, and only rooms this form actually offered.
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const allowed = new Set((await db.query(
      `SELECT rr.id FROM running_rooms rr WHERE ${s.sql}`, s.params)).map(r => r.id));

    let saved = 0;
    for (const [k, v] of Object.entries(req.body)) {
      const m = /^occ_(\d+)$/.exec(k);
      if (!m) continue;
      const rrId = +m[1];
      const raw = String(v ?? '').trim();
      if (raw === '') continue;                       // silence, not a zero
      if (!allowed.has(rrId)) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
      if (!/^\d{1,5}$/.test(raw)) { const e = new Error('An occupant count must be a whole number.'); e.status = 400; throw e; }
      const total = Math.min(65535, parseInt(raw, 10));

      const before = await db.one(
        'SELECT * FROM occupancy_monthly WHERE running_room_id = ? AND period_month = ?', [rrId, month]);
      await db.execute(`
        INSERT INTO occupancy_monthly (running_room_id, period_month, occupants_total, source, source_reference, entered_by)
        VALUES (?,?,?, 'manual', ?, ?)
        ON DUPLICATE KEY UPDATE occupants_total = VALUES(occupants_total), source = 'manual',
          source_reference = COALESCE(VALUES(source_reference), source_reference),
          entered_by = VALUES(entered_by)`,
        [rrId, month, total, ref, req.user.id]);

      // The figure IS the denominator, so entering it has to move the
      // percentage in the same breath. Recomputed here rather than left for a
      // nightly job nobody would notice had stopped.
      await coverage.refresh(rrId, month);
      await audit.record(req, { table: 'occupancy_monthly', id: rrId,
        action: before ? 'update' : 'insert', before,
        after: { running_room_id: rrId, period_month: month, occupants_total: total, source_reference: ref } });
      saved++;
    }
    res.redirect(`${cfg.basePath}/feedback/coverage?month=${month.slice(0, 7)}&entered=${saved}`);
  } catch (e) { next(e); }
});

router.post('/coverage/recompute', requirePermission('feedback.view'), async (req, res, next) => {
  try {
    const s2 = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const month = monthOf(req.body.month);
    const ids = (await db.query(
      `SELECT rr.id FROM running_rooms rr WHERE ${s2.sql}`, s2.params)).map(r => r.id);
    const n = await coverage.recomputeMonth(ids, month);
    await audit.record(req, { table: 'feedback_coverage', id: 0, action: 'update',
      after: { period_month: month, sites: n } });
    res.redirect(`${cfg.basePath}/feedback/coverage?month=${month.slice(0, 7)}&recomputed=${n}`);
  } catch (e) { next(e); }
});

/* ------------------------------------------------- the signed register */
/**
 * Keying in the physical feedback register.
 *
 * The tender does not ask for feedback in general; it asks for feedback taken
 * "from EACH occupant EVERY MONTH on a physical feedback register duly signed
 * by the occupant and kept on record", and it hangs the grading penalty on the
 * average from a minimum of 50% of occupants. Everything RR-CMS held before
 * this was a QR submission — anonymous by default, unsigned, keyed by nobody.
 *
 * A page of the register carries several occupants, so the scan is attached
 * once and every entry keyed from it points at the same file. That is what the
 * register physically is: a sheet with ten signatures on it.
 *
 * The contractor's supervisor cannot do this. He is the party the grading is
 * against, and a rating he typed from a page he holds is not an occupant's
 * signature.
 */
const HEADS = [['cleanliness', 'Cleanliness'], ['food', 'Food quality'],
               ['linen', 'Linen washing'], ['behaviour', 'Staff behaviour']];
const ROWS_PER_PAGE = 12;

async function registerContext(req) {
  const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
  const rooms = await db.query(
    `SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code
     FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
     WHERE ${s.sql} ORDER BY rr.name`, s.params);
  if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
  const rr = rooms.find(r => r.id === (+req.query.rr || +(req.body && req.body.rr))) || rooms[0];
  const month = monthOf(req.query.month || (req.body && req.body.month));
  return { rooms, rr, month };
}

// Reading the register is a feedback.view matter -- HQ and the division have to
// be able to see whether the signed register is being kept at all, which is the
// finding that decides whether any grading penalty is available. Keying it is
// narrower: the form itself is behind can('feedback.enter') in the view, and the
// POST below is behind requirePermission('feedback.enter').
router.get('/register', requirePermission('feedback.view'), async (req, res, next) => {
  try {
    const { rooms, rr, month } = await registerContext(req);
    const entries = await db.query(`
      SELECT f.*, u.full_name AS entered_by_name
      FROM feedback f LEFT JOIN users u ON u.id = f.entered_by
      WHERE f.running_room_id = ? AND f.channel = 'checkout_register'
        AND f.submitted_at >= ? AND f.submitted_at < DATE_ADD(?, INTERVAL 1 MONTH)
      ORDER BY f.register_page_no, f.id`, [rr.id, month, month]);

    const occ = await db.one(
      'SELECT occupants_total FROM occupancy_monthly WHERE running_room_id = ? AND period_month = ?',
      [rr.id, month]);
    const occupants = occ ? occ.occupants_total : 0;

    res.render('feedback/register', { title: 'Signed feedback register', tab: 'register',
      rooms, rr, month, entries, heads: HEADS, rowsPerPage: ROWS_PER_PAGE,
      occupants,
      signedPct: occupants ? +(entries.length / occupants * 100).toFixed(1) : null,
      saved: req.query.saved || null });
  } catch (e) { next(e); }
});

router.post('/register', requirePermission('feedback.enter'), uploads.upload.any(),
  async (req, res, next) => {
    try {
      const { rr, month } = await registerContext(req);
      await assertRunningRoomAccess(db, req.user, rr.id);
      const page = String(req.body.register_page_no || '').trim().slice(0, 20) || null;

      // The scan of the page, stored once and shared by every entry on it.
      let fileId = null;
      const scan = (req.files || []).find(f => f.fieldname === 'page_scan');
      if (scan) fileId = await uploads.store(scan,
        { entityTable: 'feedback', entityId: null, userId: req.user.id });

      const num = v => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n >= 0 && n <= 5 ? Math.round(n * 100) / 100 : null;
      };

      // Read and check EVERY line before a single one is written.
      //
      // The first version inserted as it went, so a page with one bad line
      // saved the good lines and then threw — and pressing save again after
      // fixing the line duplicated everything above it. A page of the register
      // is one act: it goes in whole or not at all.
      const lines = [];
      for (let i = 0; i < ROWS_PER_PAGE; i++) {
        const name = String(req.body[`n_${i}`] || '').trim().replace(/\s+/g, ' ').slice(0, 150);
        const marks = {};
        HEADS.forEach(([h]) => { marks[h] = num(req.body[`${h}_${i}`]); });
        const given = Object.values(marks).filter(v => v !== null);
        // A row with no name and no rating is an unused line on the form, not an
        // occupant who said nothing. Skipped rather than saved as zeroes.
        if (!name && !given.length) continue;
        if (!given.length) {
          const e = new Error(`Nothing has been saved. Line ${i + 1} names ${name} but carries no `
            + 'rating — give at least one, or clear the name, and save the page again.');
          e.status = 400; throw e;
        }
        // Food is not rated where there is no kitchen, and a room with no meal
        // facility must not have a food figure invented for it.
        if (!rr.has_meal_facility) marks.food = null;

        const typedOverall = num(req.body[`overall_${i}`]);
        const overall = typedOverall === null
          ? Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 100) / 100
          : typedOverall;
        const stay = String(req.body[`d_${i}`] || '').slice(0, 10) || null;
        lines.push({ name, marks, overall, stay,
          cms: String(req.body[`c_${i}`] || '').trim().slice(0, 20) || null,
          remarks: String(req.body[`r_${i}`] || '').trim().slice(0, 1000) || null });
      }
      if (!lines.length) {
        const e = new Error('No line on the page carries a rating, so there is nothing to save.');
        e.status = 400; throw e;
      }

      await db.transaction(async tx => {
        for (const l of lines) {
          await tx.execute(`
            INSERT INTO feedback (running_room_id, crew_name, crew_id_entered, stay_date, submitted_at,
              channel, rating_cleanliness, rating_food, rating_linen, rating_behaviour, rating_overall,
              comments, signature_file_id, register_page_no, is_anonymous, severity, status,
              entered_by, entered_at)
            VALUES (?,?,?,?,?, 'checkout_register', ?,?,?,?,?, ?,?,?, 0, ?, 'open', ?, NOW())`,
            [rr.id, l.name || null, l.cms, l.stay,
             l.stay ? `${l.stay} 12:00:00` : `${month.slice(0, 8)}15 12:00:00`,
             l.marks.cleanliness, l.marks.food, l.marks.linen, l.marks.behaviour, l.overall,
             l.remarks, fileId, page,
             l.overall <= 2 ? 'critical' : l.overall <= 3 ? 'major' : 'normal',
             req.user.id]);
        }
      });
      const added = lines.length;

      await coverage.refresh(rr.id, month);
      await audit.record(req, { table: 'feedback', id: rr.id, action: 'insert',
        after: { running_room_id: rr.id, period: month.slice(0, 7), page,
                 entries: added, channel: 'checkout_register' } });
      res.redirect(`${cfg.basePath}/feedback/register?rr=${rr.id}&month=${month.slice(0, 7)}&saved=${added}`);
    } catch (e) { next(e); }
  });

/* ---------------------------------------------------------------- grading */
// Monthly average per head, with the tender's banded R value. The amount is
// deliberately NOT computed — that arrives with the penalty module.
const R_OF = a => a > 4 ? 5 : a > 3 ? 4 : a > 2 ? 3 : a > 1 ? 2 : 0;

router.get('/grading', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const month = monthOf(req.query.month);

    const rows = await db.query(`
      SELECT rr.id, rr.code, rr.name, rr.has_meal_facility, d.code AS div_code,
             ROUND(AVG(f.rating_cleanliness),2) AS cleanliness,
             ROUND(AVG(f.rating_food),2)        AS food,
             ROUND(AVG(f.rating_linen),2)       AS linen,
             ROUND(AVG(f.rating_behaviour),2)   AS behaviour,
             COUNT(f.id) AS sample,
             -- The penalty is worked on the SIGNED register, so its averages are
             -- computed separately. Everything received is still shown beside
             -- them, because it is the useful operational picture.
             ROUND(AVG(CASE WHEN f.channel = 'checkout_register' THEN f.rating_cleanliness END),2) AS s_cleanliness,
             ROUND(AVG(CASE WHEN f.channel = 'checkout_register' THEN f.rating_food END),2)        AS s_food,
             ROUND(AVG(CASE WHEN f.channel = 'checkout_register' THEN f.rating_linen END),2)       AS s_linen,
             SUM(f.channel = 'checkout_register') AS signed_sample
      FROM running_rooms rr
      JOIN divisions d ON d.id = rr.division_id
      LEFT JOIN feedback f ON f.running_room_id = rr.id
        AND f.submitted_at >= ? AND f.submitted_at < DATE_ADD(?, INTERVAL 1 MONTH)
      WHERE ${s.sql}
      GROUP BY rr.id, rr.code, rr.name, rr.has_meal_facility, d.code, d.sort_order
      ORDER BY d.sort_order, rr.name`, [month, month, ...s.params]);

    const cov = await db.query(`
      SELECT running_room_id, coverage_pct, signed_pct, meets_floor, meets_signed_floor,
             occupants_total, signed_received
      FROM feedback_coverage WHERE period_month = ?`, [month]);
    const covBy = Object.fromEntries(cov.map(c => [c.running_room_id, c]));

    rows.forEach(r => {
      const c = covBy[r.id];
      // What the penalty is worked on: the signed register only.
      r.heads = [['cleanliness', r.s_cleanliness], ['food', r.s_food], ['linen', r.s_linen]]
        .filter(h => h[1] !== null)
        .map(([head, avg]) => ({ head, avg: Number(avg), r: R_OF(Number(avg)) }));
      // What everything received says, for the officer's own picture.
      r.allHeads = [['cleanliness', r.cleanliness], ['food', r.food], ['linen', r.linen]]
        .filter(h => h[1] !== null)
        .map(([head, avg]) => ({ head, avg: Number(avg), r: R_OF(Number(avg)) }));
      r.occupants = c ? c.occupants_total : null;
      r.signedPct = c ? Number(c.signed_pct) : null;
      // The tender's condition, applied: no signed 50%, no grading penalty.
      r.meets = c ? !!c.meets_signed_floor : null;
      r.coverageKnown = !!c;
    });
    res.render('feedback/grading', { title: 'Occupant grading', tab: 'grading', rows, month });
  } catch (e) { next(e); }
});

/* --------------------------------------------------------- QR for printing */
router.get('/qr', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const rooms = await db.query(
      `SELECT rr.id, rr.code, rr.name, d.name AS div_name FROM running_rooms rr
       JOIN divisions d ON d.id = rr.division_id WHERE ${s.sql} ORDER BY d.sort_order, rr.name`, s.params);

    // The printed URL must be reachable from a crew member's phone, so it is
    // configurable rather than guessed from the request.
    const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}${cfg.basePath}`).replace(/\/$/, '');
    const only = req.query.rr ? rooms.filter(r => r.id === +req.query.rr) : rooms;

    res.render('feedback/qr', { title: 'Feedback QR codes', tab: 'qr',
      rooms, only, base, qr, selected: req.query.rr || '' });
  } catch (e) { next(e); }
});

module.exports = router;
