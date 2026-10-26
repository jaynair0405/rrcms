/**
 * The crew feedback form — the only part of RR-CMS that is public.
 *
 * A crew member scans the QR at the bedside or in the dining hall and submits
 * without logging in. The tender takes this feedback "at the time of checkout"
 * on a physical register; this replaces that register. Identification is
 * optional, because a form that demands a login will not be filled in by
 * someone who has just come off a night run.
 */
const express = require('express');
const db = require('../db');
const coverage = require('../services/coverage');
const uploads = require('../services/uploads');
const cfg = require('../config');
const { thisMonth } = require('../lib/day');

const router = express.Router();

// A crude per-IP throttle. The form is public, so it needs some floor.
const hits = new Map();
function throttle(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < 60_000);
  if (list.length >= 12) { const e = new Error('Too many submissions. Please try again in a minute.'); e.status = 429; return next(e); }
  list.push(now); hits.set(key, list);
  next();
}

/* A SECOND, SLOWER COUNTER, FOR PHOTOGRAPHS ONLY.
 *
 * A rating is a few bytes. A photograph is a file on a disk that has 25 GB
 * free, sent by somebody who never had to log in. The two do not deserve the
 * same allowance, so they do not share a counter.
 *
 * Twenty an hour from one address: a crew member sends one, a running room
 * behind a single station connection could send several in an evening, and a
 * script filling the disk is stopped at the twenty-first. Going over does NOT
 * lose the feedback -- the ratings save, the photograph is dropped, and the
 * thank-you page says so. Silently discarding evidence somebody meant to
 * report would be the worse failure by far.
 */
const shots = new Map();
const PHOTOS_PER_HOUR = 20;
function photoAllowed(req) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const list = (shots.get(key) || []).filter(t => now - t < 3_600_000);
  if (list.length >= PHOTOS_PER_HOUR) { shots.set(key, list); return false; }
  list.push(now); shots.set(key, list);
  return true;
}

/* ONE file, on ONE named field. The general uploader accepts 64 parts because
 * the daily checklist has a box per clause; a form that needs no login has no
 * business accepting sixty-four of anything. */
const photo = uploads.bounded({ mb: uploads.MAX_MB, files: 1 }).single('photo');

/* Multer aborts the whole request when a file exceeds the ceiling, which would
 * throw away the ratings along with the picture. Caught here so the man is told
 * what happened instead of meeting an error page. */
function takePhoto(req, res, next) {
  photo(req, res, err => {
    if (!err) return next();
    req.photoRejected = err.code === 'LIMIT_FILE_SIZE'
      ? `That photograph is larger than ${uploads.MAX_MB} MB.`
      : 'That photograph could not be read.';
    next();
  });
}

async function roomByCode(code) {
  return db.one(`
    SELECT rr.id, rr.code, rr.name, rr.has_meal_facility, d.name AS div_name
    FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
    WHERE rr.code = ? AND rr.status = 'operational'`, [String(code || '').slice(0, 16)]);
}

router.get('/f/:code', async (req, res, next) => {
  try {
    const rr = await roomByCode(req.params.code);
    if (!rr) { const e = new Error('That running room code is not recognised.'); e.status = 404; throw e; }
    const staff = await db.query(`
      SELECT st.id, st.full_name, dg.name AS designation
      FROM staff st JOIN designations dg ON dg.id = st.designation_id
      WHERE st.running_room_id = ? AND st.is_active = 1 AND st.screening_status = 'approved'
      ORDER BY dg.sort_order, st.full_name`, [rr.id]);
    res.render('public/feedback', { title: `Feedback · ${rr.name}`, bare: true, rr, staff, error: null });
  } catch (e) { next(e); }
});

router.post('/f/:code', throttle, takePhoto, async (req, res, next) => {
  try {
    const rr = await roomByCode(req.params.code);
    if (!rr) { const e = new Error('That running room code is not recognised.'); e.status = 404; throw e; }

    const r = k => { const v = parseFloat(req.body[k]); return Number.isFinite(v) && v >= 1 && v <= 5 ? v : null; };
    const cleanliness = r('cleanliness'), linen = r('linen'), behaviour = r('behaviour');
    const food = rr.has_meal_facility ? r('food') : null;

    if (cleanliness === null && linen === null && behaviour === null && food === null) {
      const staff = await db.query(`
        SELECT st.id, st.full_name, dg.name AS designation
        FROM staff st JOIN designations dg ON dg.id = st.designation_id
        WHERE st.running_room_id = ? AND st.is_active = 1 AND st.screening_status = 'approved'
        ORDER BY dg.sort_order, st.full_name`, [rr.id]);
      return res.render('public/feedback', { title: `Feedback · ${rr.name}`, bare: true, rr, staff,
        error: 'Please give at least one rating.' });
    }

    const vals = [cleanliness, food, linen, behaviour].filter(v => v !== null);
    const overall = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
    const comments = String(req.body.comments || '').trim().slice(0, 2000) || null;

    // Anything at or below 2 out of 5, or a complaint in the text, is worth an
    // officer seeing rather than disappearing into an average.
    const severity = overall <= 2 ? 'critical' : overall <= 3 ? 'major' : 'normal';

    /* THE PHOTOGRAPH IS TAKEN FIRST, AND IT DECIDES THE STATUS.
     *
     * A submission that scores well is closed on arrival, so it does not sit in
     * an officer's inbox saying nothing. But nobody photographs a running room
     * to report that it was fine. If a man went to the trouble of taking a
     * picture, somebody is going to look at it -- so a photograph holds the
     * record OPEN whatever the stars say. Closing it afterwards is one click;
     * a photograph auto-closed into an average is never seen again.
     *
     * Only images, never PDF: this endpoint needs no login, and the narrowest
     * thing that does the job is the right thing to accept. */
    let photoId = null, photoNote = '';
    if (req.file) {
      if (!photoAllowed(req)) {
        photoNote = 'busy';
      } else {
        photoId = await uploads.store(req.file,
          { entityTable: 'feedback_photos', entityId: null, userId: null,
            accept: uploads.PHOTO_TYPES });
        if (!photoId) photoNote = 'unreadable';
      }
    } else if (req.photoRejected) {
      photoNote = 'toobig';
    }

    const status = photoId ? 'open' : (severity === 'normal' ? 'closed' : 'open');

    const ins = await db.execute(`
      INSERT INTO feedback (running_room_id, crew_name, crew_id_entered, stay_date, submitted_at, channel,
        rating_cleanliness, rating_food, rating_linen, rating_behaviour, rating_overall,
        comments, named_staff_id, severity, status)
      VALUES (?,?,?,?,NOW(),?,?,?,?,?,?,?,?,?,?)`,
      [rr.id,
       String(req.body.crew_name || '').trim().slice(0, 150) || null,
       String(req.body.crew_id || '').trim().slice(0, 20) || null,
       req.body.stay_date || null,
       ['qr_room','qr_dining','checkout_register','mobile_app'].includes(req.body.channel) ? req.body.channel : 'qr_room',
       cleanliness, food, linen, behaviour, overall, comments,
       +req.body.named_staff_id || null,
       severity, status]);

    if (photoId) {
      await db.execute(
        `INSERT INTO feedback_photos (feedback_id, file_id, caption) VALUES (?,?,?)`,
        [ins.insertId, photoId, null]);
      /* files.entity_id is filled in now that the feedback row exists, so the
       * photograph can be traced back to what it was sent about. */
      await db.execute(`UPDATE files SET entity_id = ? WHERE id = ?`, [ins.insertId, photoId]);
    }

    // Keep the coverage figure current. Best-effort: a crew member's feedback
    // must never fail to save because a derived number could not be updated.
    await coverage.refresh(rr.id, thisMonth());

    res.redirect(`${cfg.basePath}/f/${rr.code}/thanks`
      + (photoId ? '?photo=1' : photoNote ? `?photo=${photoNote}` : ''));
  } catch (e) { next(e); }
});

router.get('/f/:code/thanks', async (req, res, next) => {
  try {
    const rr = await roomByCode(req.params.code);
    if (!rr) { const e = new Error('Not found'); e.status = 404; throw e; }
    const PHOTO = {
      '1':          { ok: true,  text: 'Your photograph was received with it.' },
      'busy':       { ok: false, text: 'Your ratings were saved, but the photograph could not be '
                                     + 'accepted just now. Please show it to the running room in-charge.' },
      'unreadable': { ok: false, text: 'Your ratings were saved. The photograph could not be read — '
                                     + 'please send a JPEG or PNG picture.' },
      'toobig':     { ok: false, text: 'Your ratings were saved, but the photograph was too large to '
                                     + 'accept. A picture taken with the camera app is normally fine.' },
    };
    res.render('public/thanks', { title: 'Thank you', bare: true, rr,
      photo: PHOTO[String(req.query.photo || '')] || null });
  } catch (e) { next(e); }
});

module.exports = router;
