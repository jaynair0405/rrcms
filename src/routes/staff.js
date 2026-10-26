const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const { thisMonth, today } = require('../lib/day');

const router = express.Router();
router.use(requirePermission('staff.view'));

/** Documents the tender requires before a person may be deployed. */
const REQUIRED_DOCS = [
  ['photo_id',            'Photo ID with address proof'],
  ['police_verification', 'Police verification'],
  ['medical_fitness',     'Medical fitness (category C-1)'],
  ['bank_proof',          'Bank account particulars'],
  ['epf_proof',           'EPF account'],
  ['esic_proof',          'ESIC account'],
];
const DOC_LABELS = Object.fromEntries(REQUIRED_DOCS.concat([
  ['photograph',    'Passport photograph'],
  ['qualification', 'Qualification certificate'],
  ['address_proof', 'Address proof'],
  ['other',         'Other'],
]));

/* ---------------------------------------------------------------- grading */
/**
 * The monthly grading of each contract staff member.
 *
 * `staff_ratings` has existed since stage 5 with no way in, so the Concept
 * Note's two lists — the staff worth retaining and the staff to be barred from
 * hiring — could not be produced, and General Instruction 28's grading at
 * checkout had nowhere to go.
 *
 * Two of the three numbers are computed and shown, not typed:
 *
 *   - the occupant average, from feedback that actually named this man;
 *   - attendance, from the muster.
 *
 * The third — the joint evaluation on dress, behaviour and work — is the
 * Railway supervisor's, made jointly with the contractor's supervisor, and is
 * typed. The recommendation follows from all three and is a judgement, so it is
 * never filled in automatically. A screen that guessed "replace" from an
 * arithmetic mean would be putting a man out of work by rounding.
 */
router.get('/grading', requirePermission('staff.grade'), async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const rooms = await db.query(
      `SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code FROM running_rooms rr
       JOIN divisions d ON d.id = rr.division_id WHERE ${s.sql} ORDER BY rr.name`, s.params);
    if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
    /* ASKING FOR A ROOM YOU MAY NOT SEE IS NOT THE SAME AS ASKING FOR NONE.
       `|| rooms[0]` fell back silently, so `?rr=19` as Igatpuri's CLI showed
       IGATPURI's grading under an address that said Roha. That is worse than an
       empty page: it is real figures under a wrong label, and a screenshot of it
       would be evidence of something that never happened. No scope was crossed —
       rooms[0] is his own room — but the page must not answer a question it was
       not asked. Falling back is right only when nothing was asked for. */
    const asked = +req.query.rr || 0;
    const rr = asked ? rooms.find(r => r.id === asked) : rooms[0];
    if (!rr) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
    const month = String(req.query.month || thisMonth()).slice(0, 7);
    const first = `${month}-01`;

    const people = await db.query(`
      SELECT st.id, st.staff_code, st.full_name, dg.name AS designation, dg.sort_order,
             st.screening_status, st.date_of_joining,
             r.occupant_avg, r.occupant_count, r.joint_eval_score, r.attendance_pct,
             r.recommendation, r.remarks, r.evaluated_on, u.full_name AS evaluated_by_name
      FROM staff st
      JOIN designations dg ON dg.id = st.designation_id
      LEFT JOIN staff_ratings r ON r.staff_id = st.id AND r.period_month = ?
      LEFT JOIN users u ON u.id = r.evaluated_by
      WHERE st.running_room_id = ? AND st.is_active = 1
      ORDER BY dg.sort_order, st.full_name`, [first, rr.id]);

    // What the occupants said about each man this month, and what the muster
    // says. Recomputed every time the page is opened, so the figures on screen
    // are current until the moment they are saved with the grading.
    const said = await db.query(`
      SELECT f.named_staff_id AS staff_id, COUNT(*) AS n,
             ROUND(AVG(f.rating_overall), 2) AS avg_overall
      FROM feedback f
      WHERE f.running_room_id = ? AND f.named_staff_id IS NOT NULL
        AND f.rating_overall IS NOT NULL
        AND f.submitted_at >= ? AND f.submitted_at < DATE_ADD(?, INTERVAL 1 MONTH)
      GROUP BY f.named_staff_id`, [rr.id, first, first]);
    const byStaff = {};
    said.forEach(x => { byStaff[x.staff_id] = x; });

    const att = await db.query(`
      SELECT a.staff_id, COUNT(*) AS days,
             SUM(a.status IN ('present','reliever')) AS present
      FROM attendance_daily a
      WHERE a.running_room_id = ? AND a.attendance_date >= ?
        AND a.attendance_date < DATE_ADD(?, INTERVAL 1 MONTH)
      GROUP BY a.staff_id`, [rr.id, first, first]);
    const byAtt = {};
    att.forEach(x => { byAtt[x.staff_id] = x.days ? Math.round((x.present / x.days) * 1000) / 10 : null; });

    people.forEach(p => {
      const f = byStaff[p.id];
      p.live_occupant_avg = f ? f.avg_overall : null;
      p.live_occupant_count = f ? f.n : 0;
      p.live_attendance_pct = byAtt[p.id] === undefined ? null : byAtt[p.id];
    });

    res.render('staff/grading', { title: 'Monthly grading', rooms, rr, month, people,
      saved: req.query.saved || null,
      graded: people.filter(p => p.recommendation).length,
      toReplace: people.filter(p => p.recommendation === 'replace') });
  } catch (e) { next(e); }
});

router.post('/grading', requirePermission('staff.grade'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const month = String(req.body.month || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) { const e = new Error('Which month?'); e.status = 400; throw e; }
    const first = `${month}-01`;
    if (first > today()) {
      const e = new Error('A month that has not started cannot be graded.'); e.status = 400; throw e;
    }

    const mine = new Set((await db.query(
      'SELECT id FROM staff WHERE running_room_id = ? AND is_active = 1', [rrId])).map(r => r.id));

    let n = 0;
    for (const id of mine) {
      const reco = String(req.body[`g_${id}`] || '');
      // A man nobody graded is left ungraded. Writing "retain" for everybody who
      // was not looked at would make the retain list worthless, and it is the
      // list the Railway is meant to act on.
      if (!['retain', 'monitor', 'replace'].includes(reco)) continue;
      const joint = String(req.body[`j_${id}`] || '').trim();
      const jointScore = joint === '' ? null : Math.min(5, Math.max(0, parseFloat(joint) || 0));
      await db.execute(`
        INSERT INTO staff_ratings (staff_id, running_room_id, period_month, occupant_avg,
          occupant_count, joint_eval_score, attendance_pct, recommendation, evaluated_by,
          evaluated_on, remarks)
        VALUES (?,?,?,?,?,?,?,?,?,CURDATE(),?)
        ON DUPLICATE KEY UPDATE running_room_id = VALUES(running_room_id),
          occupant_avg = VALUES(occupant_avg), occupant_count = VALUES(occupant_count),
          joint_eval_score = VALUES(joint_eval_score), attendance_pct = VALUES(attendance_pct),
          recommendation = VALUES(recommendation), evaluated_by = VALUES(evaluated_by),
          evaluated_on = CURDATE(), remarks = VALUES(remarks)`,
        [id, rrId, first,
         req.body[`oa_${id}`] === '' ? null : parseFloat(req.body[`oa_${id}`]) || null,
         parseInt(req.body[`oc_${id}`], 10) || 0,
         jointScore,
         req.body[`ap_${id}`] === '' ? null : parseFloat(req.body[`ap_${id}`]) || null,
         reco, req.user.id, String(req.body[`m_${id}`] || '').trim().slice(0, 400) || null]);
      n++;
    }

    await audit.record(req, { table: 'staff_ratings', id: rrId, action: 'update',
      after: { running_room_id: rrId, period_month: first, graded: n } });
    res.redirect(`${cfg.basePath}/staff/grading?rr=${rrId}&month=${month}&saved=${n}`);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
    const { q = '', rr = '', designation = '', screening = '', flag = '' } = req.query;

    // People who have left drop out of the register, but stay findable — the
    // muster, the certificate and every count use is_active, so they must not
    // simply vanish from the screen an officer looks them up on.
    const where = [s.sql, flag === 'left' ? 'st.is_active = 0' : 'st.is_active = 1'];
    const params = [...s.params];
    if (q)           { where.push('(st.full_name LIKE ? OR st.staff_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
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
    if (rr)          { where.push('rr.id = ?');               params.push(+rr); }
    if (designation) { where.push('dg.id = ?');               params.push(+designation); }
    if (screening)   { where.push('st.screening_status = ?'); params.push(screening); }

    // "Needs attention" filters — each maps to a specific contractual obligation.
    // "Unscreened" now means "not verified" — pending AND provisional. A
    // provisionally admitted man is working, but nobody has checked him, and
    // this list is the Railway's worklist for exactly that.
    if (flag === 'unscreened')  where.push(`st.screening_status IN ('pending','provisional')`);
    if (flag === 'provisional') where.push(`st.screening_status = 'provisional'`);
    if (flag === 'no_medical')  where.push(`NOT EXISTS (SELECT 1 FROM staff_documents d
                                    WHERE d.staff_id = st.id AND d.doc_type = 'medical_fitness'
                                      AND (d.valid_till IS NULL OR d.valid_till >= CURDATE()))`);
    if (flag === 'no_qual')     where.push(`dg.requires_qualification = 1 AND NOT EXISTS (
                                    SELECT 1 FROM staff_documents d
                                     WHERE d.staff_id = st.id AND d.doc_type = 'qualification')`);
    if (flag === 'expiring')    where.push(`EXISTS (SELECT 1 FROM staff_documents d
                                    WHERE d.staff_id = st.id AND d.valid_till IS NOT NULL
                                      AND d.valid_till BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY))`);
    if (flag === 'uniform_due') where.push(`NOT EXISTS (SELECT 1 FROM staff_issues i
                                    WHERE i.staff_id = st.id AND i.issue_type = 'uniform'
                                      AND i.issued_on >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH))`);

    const rows = await db.query(`
      SELECT st.id, st.staff_code, st.full_name, st.date_of_joining, st.screening_status,
             dg.name AS designation, dg.skill_category, dg.requires_qualification,
             rr.id AS rr_id, rr.name AS rr_name, d.code AS div_code, ct.name AS contractor,
             (SELECT COUNT(*) FROM staff_documents sd WHERE sd.staff_id = st.id) AS doc_count,
             (SELECT MAX(i.issued_on) FROM staff_issues i WHERE i.staff_id = st.id AND i.issue_type='uniform') AS last_uniform,
             (SELECT MIN(sd.valid_till) FROM staff_documents sd
               WHERE sd.staff_id = st.id AND sd.valid_till IS NOT NULL) AS next_expiry
      FROM staff st
      JOIN designations dg ON dg.id = st.designation_id
      JOIN running_rooms rr ON rr.id = st.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      JOIN contractors ct ON ct.id = st.contractor_id
      WHERE ${where.join(' AND ')}
      ORDER BY rr.name, dg.sort_order, st.full_name
      LIMIT 500`, params);

    // Headline compliance counts, on the same scope.
    const counts = await db.one(`
      SELECT COUNT(*) AS total,
             SUM(st.screening_status = 'approved')    AS approved,
             SUM(st.screening_status = 'pending')     AS pending,
             SUM(st.screening_status = 'provisional') AS provisional,
             SUM(st.screening_status = 'rejected')    AS rejected
      FROM staff st JOIN running_rooms rr ON rr.id = st.running_room_id
      WHERE ${s.sql} AND st.is_active = 1`, s.params);

    const rooms = await db.query(`
      SELECT rr.id, rr.name FROM running_rooms rr WHERE ${s.sql} ORDER BY rr.name`, s.params);
    const designations = await db.query(
      `SELECT id, name FROM designations WHERE is_active = 1 ORDER BY sort_order`);

    // The go-live card acts on ONE running room, so it is offered only when one
    // is chosen. `rr` here is the filter value from the query string, not a
    // room — the room object is looked up separately and is null when the list
    // spans several sites, which is exactly when a bulk admission would be a
    // guess about which roster was meant.
    /* AND WHEN THE MAN CAN ONLY SEE ONE RUNNING ROOM, THAT IS THE ONE.
       An RR In-charge is scoped to his own site: the list already spans exactly
       one roster whether or not he has picked it from the filter. Requiring the
       pick anyway hid the go-live card from the only person who was looking for
       it, directly under a figure saying 31 men were awaiting screening.

       Found by the officer, after being told where the button was: "Admit
       provisionally button. where?" -- which is the right question to ask of a
       screen that shows you the problem and hides the answer. */
    const room = rr ? rooms.find(r => r.id === +rr) || null
             : rooms.length === 1 ? rooms[0] : null;
    res.render('staff/index', { title: 'Contract Staff', rows, counts: counts || {},
      rooms, designations, q, rr, designation, screening, flag, room,
      admitted: +req.query.admitted || 0 });
  } catch (e) { next(e); }
});

/* --------------------------------------------------------- add a person */
/**
 * The front door of the staff lifecycle: the contractor adds a worker, uploads
 * the documents, the Railway screens them, and only then may they be marked
 * present. A new person therefore starts at screening_status = 'pending' and
 * cannot be deployed until an officer approves.
 *
 * Two things are deliberately NOT taken from the form:
 *   - the contractor. It comes from whoever holds the running room, so a
 *     supervisor cannot attach a person to somebody else's contract.
 *   - the staff code. It is derived from the row's own id after insert, so two
 *     people added at the same moment cannot collide on it.
 */
async function newStaffContext(user) {
  const s = runningRoomScope(user, 'rr', { operationalOnly: true });
  const rooms = await db.query(`
    SELECT rr.id, rr.name, rr.has_meal_facility, d.code AS div_code
    FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
    WHERE ${s.sql} ORDER BY rr.name`, s.params);
  const designations = await db.query(
    `SELECT id, code, name, skill_category, requires_qualification FROM designations
     WHERE is_active = 1 ORDER BY sort_order`);
  return { rooms, designations };
}

router.get('/new', requirePermission('staff.edit'), async (req, res, next) => {
  try {
    const { rooms, designations } = await newStaffContext(req.user);
    if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
    const rrId = +req.query.rr || rooms[0].id;
    const rr = rooms.find(r => r.id === rrId) || rooms[0];

    // Sanctioned strength and who is already on roll, so the form can say what
    // the site is actually short of instead of leaving it to be guessed.
    const posts = await db.query(`
      SELECT dg.id, dg.name, m.sanctioned_count,
             (SELECT COUNT(*) FROM staff st WHERE st.running_room_id = ?
               AND st.is_active = 1 AND st.designation_id = dg.id) AS on_roll
      FROM running_room_manpower m JOIN designations dg ON dg.id = m.designation_id
      WHERE m.running_room_id = ? AND m.effective_to IS NULL
      ORDER BY dg.sort_order`, [rr.id, rr.id]);

    res.render('staff/new', { title: 'Add contract staff', rooms, rr, designations, posts,
      form: {}, error: null, today: today() });
  } catch (e) { next(e); }
});

router.post('/', requirePermission('staff.edit'), async (req, res, next) => {
  try {
    const rrId = +req.body.running_room_id;
    await assertRunningRoomAccess(db, req.user, rrId);

    const designationId = +req.body.designation_id;
    const name = String(req.body.full_name || '').trim();
    const joining = String(req.body.date_of_joining || '').slice(0, 10);

    const fail = msg => { const e = new Error(msg); e.status = 400; throw e; };
    if (name.length < 2) fail('A full name is required.');
    if (!designationId) fail('Choose a designation.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joining)) fail('A date of joining is required.');

    // A post that is sanctioned at zero does not exist at this running room —
    // a cook at a site with no meal facility, for instance.
    const post = await db.one(
      `SELECT sanctioned_count FROM running_room_manpower
       WHERE running_room_id = ? AND designation_id = ? AND effective_to IS NULL`,
      [rrId, designationId]);
    const designation = await db.one('SELECT name FROM designations WHERE id = ?', [designationId]);
    if (!post || !post.sanctioned_count)
      fail(`No ${designation ? designation.name : 'post'} is sanctioned at this running room.`);

    // The contractor follows the running room, never the form.
    const holder = await db.one(`
      SELECT c.contractor_id FROM contract_running_rooms crr
      JOIN contracts c ON c.id = crr.contract_id AND c.status = 'active'
      WHERE crr.running_room_id = ? AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
      LIMIT 1`, [rrId]);
    if (!holder) fail('No contractor currently holds this running room, so staff cannot be added to it.');

    const trim = (v, n) => String(v || '').trim().slice(0, n) || null;
    const gender = ['M', 'F', 'O'].includes(req.body.gender) ? req.body.gender : null;

    const ins = await db.execute(`
      INSERT INTO staff (staff_code, full_name, father_name, date_of_birth, gender, phone, address,
        designation_id, running_room_id, contractor_id, date_of_joining,
        bank_account_no, bank_ifsc, epf_no, esic_no, screening_status, is_active)
      VALUES ('', ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, 'pending', 1)`,
      [name.slice(0, 150), trim(req.body.father_name, 150), req.body.date_of_birth || null, gender,
       trim(req.body.phone, 20), trim(req.body.address, 400),
       designationId, rrId, holder.contractor_id, joining,
       trim(req.body.bank_account_no, 30), trim(req.body.bank_ifsc, 15),
       trim(req.body.epf_no, 30), trim(req.body.esic_no, 30)]);
    const id = ins.insertId;
    await db.execute(`UPDATE staff SET staff_code = CONCAT('CS', LPAD(?, 5, '0')) WHERE id = ?`, [id, id]);

    await audit.record(req, { table: 'staff', id, action: 'insert',
      after: { full_name: name, designation_id: designationId, running_room_id: rrId,
               screening_status: 'pending' } });
    res.redirect(`${cfg.basePath}/staff/${id}`);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one(`
      SELECT st.*, dg.name AS designation, dg.skill_category, dg.requires_qualification,
             dg.qualification_note, rr.name AS rr_name, rr.id AS rr_id,
             d.code AS div_code, ct.name AS contractor, ct.code AS contractor_code
      FROM staff st
      JOIN designations dg ON dg.id = st.designation_id
      JOIN running_rooms rr ON rr.id = st.running_room_id
      JOIN divisions d ON d.id = rr.division_id
      JOIN contractors ct ON ct.id = st.contractor_id
      WHERE st.id = ?`, [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.rr_id);

    const documents = await db.query(`
      SELECT * FROM staff_documents WHERE staff_id = ? ORDER BY doc_type, issued_on DESC, id DESC`, [id]);
    const issues = await db.query(`
      SELECT * FROM staff_issues WHERE staff_id = ? ORDER BY issued_on DESC`, [id]);
    const replacements = await db.query(`
      SELECT sr.*, dg.name AS designation,
             so.full_name AS outgoing_name, si.full_name AS incoming_name,
             u.full_name AS permitted_name
      FROM staff_replacements sr
      JOIN designations dg ON dg.id = sr.designation_id
      LEFT JOIN staff so ON so.id = sr.outgoing_staff_id
      LEFT JOIN staff si ON si.id = sr.incoming_staff_id
      LEFT JOIN users u  ON u.id  = sr.permitted_by
      WHERE sr.outgoing_staff_id = ? OR sr.incoming_staff_id = ?
      ORDER BY sr.effective_date DESC`, [id, id]);

    // Who could take this person's place: already on roll, same post, same site.
    const candidates = st.is_active ? await db.query(`
      SELECT id, staff_code, full_name FROM staff
      WHERE running_room_id = ? AND designation_id = ? AND is_active = 1 AND id <> ?
      ORDER BY full_name`, [st.rr_id, st.designation_id, id]) : [];

    // Occupant feedback that names this person. The tender contemplates grading
    // individual staff and retaining or replacing them on that basis.
    const named = await db.query(`
      SELECT f.submitted_at, f.rating_overall, f.comments, f.severity, rr.name AS rr_name
      FROM feedback f JOIN running_rooms rr ON rr.id = f.running_room_id
      WHERE f.named_staff_id = ? ORDER BY f.submitted_at DESC LIMIT 20`, [id]);
    const rating = await db.one(`
      SELECT COUNT(*) AS n, ROUND(AVG(rating_overall),2) AS avg
      FROM feedback WHERE named_staff_id = ? AND rating_overall IS NOT NULL`, [id]);
    const avg = rating && rating.avg !== null ? Number(rating.avg) : null;
    const recommendation = avg === null ? null : avg >= 4.5 ? 'retain' : avg < 3 ? 'replace' : 'monitor';

    // Deployment readiness — the tender's pre-deployment checklist, evaluated.
    // "Held" and "scanned" are separate: a reference number typed into a form
    // proves someone said the document exists; the scan is what proves it does.
    const byType = {};
    documents.forEach(d => { (byType[d.doc_type] ||= []).push(d); });
    const item = ([type, label]) => ({ type, label,
      held: !!byType[type],
      scanned: (byType[type] || []).some(d => d.file_id) });
    const checklist = REQUIRED_DOCS.map(item);
    if (st.requires_qualification) checklist.push(item(['qualification', 'Qualification certificate']));
    // "Ready" means properly screened with every document held. A provisional
    // man is working and is NOT ready, which is the whole point of saying so.
    const ready = st.screening_status === 'approved' && checklist.every(c => c.held);
    const scannedCount = checklist.filter(c => c.scanned).length;

    // How this person's post stands against Schedule A at their running room.
    // Over-strength is allowed — the Railway pays against the schedule, not the
    // register — but it should be visible rather than discovered at bill time.
    const strength = await db.one(`
      SELECT m.sanctioned_count,
             (SELECT COUNT(*) FROM staff s2 WHERE s2.running_room_id = m.running_room_id
                AND s2.designation_id = m.designation_id AND s2.is_active = 1) AS on_roll
      FROM running_room_manpower m
      WHERE m.running_room_id = ? AND m.designation_id = ? AND m.effective_to IS NULL`,
      [st.rr_id, st.designation_id]);

    // This month's attendance, so an officer opening a person can see at a
    // glance whether the muster is being kept — a column of unbroken green
    // across a month including Sundays is itself a finding.
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || ''))
      ? req.query.month : thisMonth();
    const attendance = await db.query(`
      SELECT attendance_date, status, countersigned_at
      FROM attendance_daily
      WHERE staff_id = ? AND attendance_date >= ? AND attendance_date < ?
      ORDER BY attendance_date`,
      [id, month + '-01',
       // First day of the following month, computed without date arithmetic
       // in SQL so the two databases cannot disagree about it.
       (m => `${m[0] + (m[1] === 12 ? 1 : 0)}-${String(m[1] === 12 ? 1 : m[1] + 1).padStart(2, '0')}-01`)
         ([+month.slice(0, 4), +month.slice(5, 7)])]);

    const photo = documents.find(d => d.doc_type === 'photograph' && d.file_id) || null;
    res.render('staff/show', { title: st.full_name, st, documents, issues, replacements,
      checklist, ready, DOC_LABELS, named, avg, mentions: rating ? rating.n : 0, recommendation,
      photo, accepted: uploads.ACCEPTED, scannedCount, candidates, strength,
      attendance, month,
      saved: req.query.saved === '1',
      today: today() });
  } catch (e) { next(e); }
});

// --- screening: the gate the tender puts before deployment -------------------
/* ------------------------------------------------- correcting particulars */
/**
 * A person's particulars change, and are often not known when the record is
 * first made. The 63 people brought onto the pilot came off typed lists that
 * carried a name and a post and nothing else: no phone, no bank account, no
 * EPF or ESIC number, no date of joining. Without a way to fill those in from
 * the screen the register can never become complete, and the officer is left
 * doing it in the database.
 *
 * What CANNOT be changed here is deliberate:
 *   - the running room and the contractor, because moving a man between sites
 *     is a contract event that belongs to the leaving-and-replacement path,
 *     not to a correction form;
 *   - the designation, for the same reason -- it changes the sanctioned
 *     strength at two posts and should be visible as such;
 *   - the screening status, which is the Railway's decision alone.
 *
 * A change to pay particulars after approval does NOT re-open screening. Bank
 * and EPF numbers bear on how a man is paid, not on whether he is fit to be
 * deployed, and sending a working cook back to pending over a corrected
 * account number would stop the site for no gain. Every change is recorded in
 * the audit trail with who made it and when, which is the real protection.
 */
router.post('/:id/particulars', requirePermission('staff.edit'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one(
      `SELECT id, running_room_id, full_name, father_name, date_of_birth, gender, phone, address,
              date_of_joining, bank_account_no, bank_ifsc, epf_no, esic_no
       FROM staff WHERE id = ?`, [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);

    const fail = msg => { const e = new Error(msg); e.status = 400; throw e; };
    const trim = (v, n) => String(v || '').trim().slice(0, n) || null;
    const name = String(req.body.full_name || '').trim();
    if (name.length < 2) fail('A full name is required.');

    // A joining date may still be unknown -- most of the pilot roster has none
    // -- but a date that is given has to be a date, and cannot be in the future.
    const joining = String(req.body.date_of_joining || '').slice(0, 10) || null;
    if (joining && !/^\d{4}-\d{2}-\d{2}$/.test(joining)) fail('Give the date of joining as a date, or leave it blank.');
    if (joining && joining > today())
      fail('The date of joining cannot be in the future.');

    const dob = String(req.body.date_of_birth || '').slice(0, 10) || null;
    if (dob && joining && dob >= joining) fail('The date of birth must be before the date of joining.');

    const after = {
      full_name: name.slice(0, 150),
      father_name: trim(req.body.father_name, 150),
      date_of_birth: dob,
      gender: ['M', 'F', 'O'].includes(req.body.gender) ? req.body.gender : null,
      phone: trim(req.body.phone, 20),
      address: trim(req.body.address, 400),
      date_of_joining: joining,
      bank_account_no: trim(req.body.bank_account_no, 30),
      bank_ifsc: trim(req.body.bank_ifsc, 15) ? trim(req.body.bank_ifsc, 15).toUpperCase() : null,
      epf_no: trim(req.body.epf_no, 30),
      esic_no: trim(req.body.esic_no, 30),
    };

    await db.execute(`
      UPDATE staff SET full_name = ?, father_name = ?, date_of_birth = ?, gender = ?, phone = ?,
        address = ?, date_of_joining = ?, bank_account_no = ?, bank_ifsc = ?, epf_no = ?, esic_no = ?
      WHERE id = ?`, [...Object.values(after), id]);

    // Record only what actually changed, so the trail reads as a list of
    // corrections rather than a re-statement of the whole record.
    const changed = {};
    for (const [k, v] of Object.entries(after)) {
      const was = st[k] instanceof Date ? st[k].toISOString().slice(0, 10) : st[k];
      if (String(was ?? '') !== String(v ?? '')) changed[k] = { from: was ?? null, to: v };
    }
    if (Object.keys(changed).length) {
      await audit.record(req, { table: 'staff', id, action: 'update', after: changed });
    }
    res.redirect(`${cfg.basePath}/staff/${id}?saved=1`);
  } catch (e) { next(e); }
});

/* TWO PERMISSIONS, ONE FORM. The decision this handler is given decides which
   is needed: admitting a man provisionally is `staff.admit` and belongs to the
   RR In-charge as well as the Sr. DEE, because he is the Railway's man standing
   at the site looking at the person. Approving or rejecting is `staff.screen`
   and stays with the divisional officer -- it is the control that keeps an
   unverified man out of a railway kitchen, and moving it to the site would be a
   loosening rather than a convenience.

   The check is INSIDE, not at the door, because one form posts all three: the
   door can only ask for the weaker of the two, and the stronger is asked for
   where the decision is actually known. */
router.post('/:id/screen', requirePermission('staff.admit'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one('SELECT id, running_room_id, screening_status FROM staff WHERE id = ?', [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);

    // Three outcomes, not two. `provisional` says the man is admitted to work
    // because he was already working when this system arrived -- NOT that the
    // Railway has checked him. It is deliberately not recorded as a screening:
    // screened_by and screened_on stay empty, because nobody screened anybody.
    const decision = req.body.decision === 'approve' ? 'approved'
                   : req.body.decision === 'provisional' ? 'provisional' : 'rejected';
    if (decision !== 'provisional' && !req.user.permissions.has('staff.screen')) {
      const e = new Error('Approving or rejecting a man is the divisional officer\'s decision. '
        + 'You can admit him provisionally, which lets the register be kept and says plainly '
        + 'that nobody has screened him.');
      e.status = 403; throw e;
    }
    const reason = (req.body.reason || '').slice(0, 400) || null;
    if (decision === 'rejected' && !reason) {
      const e = new Error('A reason is required when rejecting.'); e.status = 400; throw e;
    }
    if (decision === 'provisional') {
      await db.execute(
        `UPDATE staff SET screening_status = 'provisional', provisional_on = CURDATE(),
                          provisional_note = ?, rejection_reason = NULL
         WHERE id = ?`,
        [(reason || 'already working when RR-CMS was introduced').slice(0, 300), id]);
    } else {
      await db.execute(
        `UPDATE staff SET screening_status = ?, screened_by = ?, screened_on = CURDATE(),
                          rejection_reason = ?, provisional_note = NULL, provisional_on = NULL
         WHERE id = ?`, [decision, req.user.id, decision === 'rejected' ? reason : null, id]);
    }
    await audit.record(req, { table: 'staff', id, action: 'update',
      before: { screening_status: st.screening_status }, after: { screening_status: decision, reason } });
    res.redirect(`${cfg.basePath}/staff/${id}`);
  } catch (e) { next(e); }
});

/**
 * Admit many men provisionally, in one act — the go-live action.
 *
 * On the day a running room is switched on, every man on the roster is
 * `pending` and no muster can be filed. These men are already working; what is
 * missing is not their fitness but this system's knowledge of it. So the
 * Railway admits them as a body, and the record says exactly that.
 *
 * Deliberately NOT a bulk *approval*. There is no way to approve many men at
 * once anywhere in RR-CMS, and there should not be: screening is the control
 * that keeps an unverified man out of a running room, and a control that can be
 * satisfied by one click is not a control. This marks them provisional, which
 * is a different and weaker claim, and every screen says so.
 */
router.post('/admit-provisional', requirePermission('staff.admit'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const note = String(req.body.note || '').trim().slice(0, 300)
              || 'already working when RR-CMS was introduced';

    // Only the men who have not been decided on. An approved man is not
    // demoted, and a rejected man is not quietly let back in.
    const rows = await db.query(
      `SELECT id, full_name FROM staff
       WHERE running_room_id = ? AND is_active = 1 AND screening_status = 'pending'`, [rrId]);
    if (!rows.length) {
      return res.redirect(`${cfg.basePath}/staff?rr=${rrId}&note=none-pending`);
    }

    await db.execute(
      `UPDATE staff SET screening_status = 'provisional', provisional_on = CURDATE(),
                        provisional_note = ?
       WHERE running_room_id = ? AND is_active = 1 AND screening_status = 'pending'`,
      [note, rrId]);

    await audit.record(req, { table: 'staff', id: rrId, action: 'update',
      after: { admitted_provisionally: rows.length, running_room_id: rrId, note,
               names: rows.map(r => r.full_name) } });
    res.redirect(`${cfg.basePath}/staff?rr=${rrId}&flag=provisional&admitted=${rows.length}`);
  } catch (e) { next(e); }
});

// --- documents ---------------------------------------------------------------
// The record and the scan are added together: a police verification with no
// certificate behind it is exactly the gap this screen exists to close.
router.post('/:id/documents', requirePermission('staff.edit'),
  uploads.upload.any(), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one('SELECT id, running_room_id FROM staff WHERE id = ?', [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);

    const { doc_type, reference_no = '', issued_on = '', valid_till = '' } = req.body;
    if (!DOC_LABELS[doc_type]) { const e = new Error('Unknown document type.'); e.status = 400; throw e; }

    const scan = (req.files || []).find(f => f.fieldname === 'scan' && f.size);

    // A photograph is not like the other documents. There is one current
    // likeness of a person, not a series of them, and pressing the button
    // twice must not leave two. So a new photograph replaces the one on
    // record rather than being added beside it.
    const isPhoto = doc_type === 'photograph';

    // A row with nothing attached is worth having for a certificate -- the
    // reference number and expiry are useful even before the scan arrives --
    // but a photograph record with no photograph in it is nothing at all.
    if (isPhoto && !scan) {
      const e = new Error('No picture was attached. Choose a file in the '
        + 'Passport photograph box beside the name, or take one with the camera. '
        + 'A file chosen in the Documents section further down belongs to that '
        + 'form, not this one.');
      e.status = 400; throw e;
    }

    const existingPhoto = isPhoto
      ? await db.one(
          `SELECT id FROM staff_documents WHERE staff_id = ? AND doc_type = 'photograph'
           ORDER BY id DESC LIMIT 1`, [id])
      : null;

    let docId;
    if (existingPhoto) {
      await db.execute(
        `UPDATE staff_documents SET reference_no = ?, issued_on = ?, valid_till = ?,
           verified_by = ?, verified_on = CURDATE() WHERE id = ?`,
        [reference_no.slice(0, 80) || null, issued_on || null, valid_till || null,
         req.user.id, existingPhoto.id]);
      docId = existingPhoto.id;
      // Any older photograph rows from before this rule are folded away too.
      await db.execute(
        `DELETE FROM staff_documents WHERE staff_id = ? AND doc_type = 'photograph' AND id <> ?`,
        [id, docId]);
    } else {
      const ins = await db.execute(
        `INSERT INTO staff_documents (staff_id, doc_type, reference_no, issued_on, valid_till, verified_by, verified_on)
         VALUES (?,?,?,?,?,?,CURDATE())`,
        [id, doc_type, reference_no.slice(0, 80) || null, issued_on || null, valid_till || null, req.user.id]);
      docId = ins.insertId;
    }

    if (scan) {
      const fileId = await uploads.store(scan,
        { entityTable: 'staff_documents', entityId: docId, userId: req.user.id });
      // Say so rather than dropping it quietly — someone who thinks they have
      // attached a certificate and has not is worse off than someone told.
      if (!fileId) {
        const e = new Error(`That file was not accepted. Upload ${uploads.ACCEPTED}.`);
        e.status = 400; throw e;
      }
      await db.execute('UPDATE staff_documents SET file_id = ? WHERE id = ?', [fileId, docId]);
    }

    await audit.record(req, { table: 'staff_documents', id: docId,
      action: existingPhoto ? 'update' : 'insert',
      after: { staff_id: id, doc_type, reference_no, valid_till, scanned: !!scan } });
    res.redirect(`${cfg.basePath}/staff/${id}`);
  } catch (e) { next(e); }
});

/* Serves a scan back. The file is reachable only through the staff member it
 * belongs to, and only by someone who may see that running room. */
router.get('/:id/documents/:docId/file', async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one('SELECT id, running_room_id FROM staff WHERE id = ?', [id]);
    if (!st) { const e = new Error('Not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);

    const doc = await db.one(
      'SELECT id, staff_id, file_id FROM staff_documents WHERE id = ? AND staff_id = ?',
      [+req.params.docId, id]);
    if (!doc || !doc.file_id) { const e = new Error('No scan is attached to that document.'); e.status = 404; throw e; }
    const f = await db.one('SELECT * FROM files WHERE id = ?', [doc.file_id]);
    if (!f) { const e = new Error('Not found'); e.status = 404; throw e; }
    uploads.sendFile(res, f);
  } catch (e) { next(e); }
});

/* ------------------------------------------------ leaving and replacement */
/**
 * The tender treats a change of person as a contract event, not a clerical one:
 * the contractor may replace, but a change without the Railway's permission is
 * itself a deficiency. So marking someone as left always writes a replacement
 * record, and permission is a separate act by an officer who holds staff.screen.
 */
router.post('/:id/leave', requirePermission('staff.edit'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one(
      'SELECT id, running_room_id, designation_id, is_active, date_of_joining FROM staff WHERE id = ?', [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);

    const fail = msg => { const e = new Error(msg); e.status = 400; throw e; };
    if (!st.is_active) fail('That person has already been marked as left.');

    const leaving = String(req.body.date_of_leaving || '').slice(0, 10);
    const reason = String(req.body.reason || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leaving)) fail('A date of leaving is required.');
    // Only compare when a joining date is actually held. A person loaded from
    // a typed roster has none, and String(null) is "null" -- which sorts below
    // any date, so every leaving date was being refused as "before joining".
    if (st.date_of_joining) {
      const joined = String(st.date_of_joining instanceof Date
        ? st.date_of_joining.toISOString() : st.date_of_joining).slice(0, 10);
      if (leaving < joined)
        fail(`The date of leaving cannot be before the date of joining (${joined}).`);
    }
    if (!reason) fail('A reason is required — the replacement record is a contract document.');

    // If a successor is named, they must already be on the same post at the
    // same running room; otherwise the record would point anywhere.
    let incoming = null;
    if (req.body.replacement_staff_id) {
      const cand = await db.one(
        `SELECT id FROM staff WHERE id = ? AND running_room_id = ? AND designation_id = ? AND is_active = 1`,
        [+req.body.replacement_staff_id, st.running_room_id, st.designation_id]);
      if (!cand) fail('The replacement must already be on roll in the same post at this running room.');
      if (cand.id === id) fail('A person cannot replace themselves.');
      incoming = cand.id;
    }

    await db.transaction(async tx => {
      await tx.execute(
        'UPDATE staff SET is_active = 0, date_of_leaving = ? WHERE id = ?', [leaving, id]);
      await tx.execute(`
        INSERT INTO staff_replacements (running_room_id, outgoing_staff_id, incoming_staff_id,
          designation_id, reason, railway_permission, effective_date)
        VALUES (?,?,?,?,?,0,?)`,
        [st.running_room_id, id, incoming, st.designation_id, reason.slice(0, 400), leaving]);
    });

    await audit.record(req, { table: 'staff', id, action: 'update',
      before: { is_active: 1 },
      after: { is_active: 0, date_of_leaving: leaving, reason, incoming_staff_id: incoming } });
    res.redirect(`${cfg.basePath}/staff/${id}`);
  } catch (e) { next(e); }
});

router.post('/:id/replacements/:repId/permit', requirePermission('staff.screen'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one('SELECT id, running_room_id FROM staff WHERE id = ?', [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);

    const rep = await db.one(
      'SELECT id, running_room_id, railway_permission FROM staff_replacements WHERE id = ?', [+req.params.repId]);
    if (!rep || rep.running_room_id !== st.running_room_id) {
      const e = new Error('Replacement record not found.'); e.status = 404; throw e;
    }
    if (rep.railway_permission) { const e = new Error('Permission is already on record.'); e.status = 400; throw e; }

    await db.execute(
      `UPDATE staff_replacements SET railway_permission = 1, permitted_by = ?, permitted_on = CURDATE()
       WHERE id = ?`, [req.user.id, rep.id]);
    await audit.record(req, { table: 'staff_replacements', id: rep.id, action: 'update',
      after: { railway_permission: 1 } });
    res.redirect(`${cfg.basePath}/staff/${id}`);
  } catch (e) { next(e); }
});

// --- uniform and shoe issue --------------------------------------------------
// 2 uniform sets every 6 months, 1 pair of shoes per year, per the tender.
router.post('/:id/issues', requirePermission('staff.edit'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one('SELECT id, running_room_id FROM staff WHERE id = ?', [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);

    const type = req.body.issue_type === 'shoes' ? 'shoes' : 'uniform';
    const qty = Math.max(1, Math.min(10, parseInt(req.body.quantity, 10) || (type === 'uniform' ? 2 : 1)));
    const on = req.body.issued_on || today();
    const interval = type === 'uniform' ? 'INTERVAL 6 MONTH' : 'INTERVAL 1 YEAR';

    await db.execute(
      `INSERT INTO staff_issues (staff_id, issue_type, quantity, issued_on, due_next_on, issued_by)
       VALUES (?,?,?,?, DATE_ADD(?, ${interval}), ?)`, [id, type, qty, on, on, req.user.id]);
    await audit.record(req, { table: 'staff_issues', id, action: 'insert',
      after: { staff_id: id, issue_type: type, quantity: qty, issued_on: on } });
    res.redirect(`${cfg.basePath}/staff/${id}`);
  } catch (e) { next(e); }
});

// --- identity card, in the tender's proforma ---------------------------------
router.get('/:id/id-card', async (req, res, next) => {
  try {
    const id = +req.params.id;
    const st = await db.one(`
      SELECT st.*, dg.name AS designation, rr.name AS rr_name, ct.name AS contractor,
             ct.address AS contractor_address,
             (SELECT c.agreement_no FROM contract_running_rooms crr
                JOIN contracts c ON c.id = crr.contract_id
               WHERE crr.running_room_id = st.running_room_id
               ORDER BY crr.effective_from DESC LIMIT 1) AS agreement_no
      FROM staff st
      JOIN designations dg ON dg.id = st.designation_id
      JOIN running_rooms rr ON rr.id = st.running_room_id
      JOIN contractors ct ON ct.id = st.contractor_id
      WHERE st.id = ?`, [id]);
    if (!st) { const e = new Error('Staff member not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, st.running_room_id);
    const photo = await db.one(
      `SELECT id FROM staff_documents WHERE staff_id = ? AND doc_type = 'photograph' AND file_id IS NOT NULL
       ORDER BY id DESC LIMIT 1`, [id]);
    res.render('staff/id-card', { title: 'Identity card', st, photo, bare: true });
  } catch (e) { next(e); }
});

module.exports = router;
