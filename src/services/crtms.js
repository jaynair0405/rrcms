/**
 * What RR-CMS reads out of CRTMS, at arm's length.
 *
 * Two masters, in the same schema — `bbtro` for Mumbai division:
 *
 *   - `div_staff_master`, for the crew a call book names;
 *   - `div_trains`, for the train he was called for.
 *
 * RR-CMS reads three narrow views over them and nothing else; see
 * db/crtms/README.md for the views, the grants and the reasoning.
 *
 * Everything here is written to fail soft. A division with no master, a grant
 * that was never given, a CRTMS server that is down for maintenance — none of
 * those may stop a running room recording a call at four in the morning. The
 * lookup simply returns nothing and the name is typed, which is what happens
 * today anyway.
 */
const db = require('../db');
const cfg = require('../config');

/** Schema names are interpolated, never parameterised, so they are policed. */
const SAFE_SCHEMA = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Divisions whose master turned out to be unreachable, so we stop hammering it. */
const broken = new Map();          // schema -> timestamp we gave up at
const RETRY_AFTER_MS = 5 * 60 * 1000;

function usable(schema) {
  if (!schema || !SAFE_SCHEMA.test(schema)) return false;
  const failedAt = broken.get(schema);
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return false;
  return true;
}

/**
 * Which schema holds this running room's division master, if any.
 * NULL is the ordinary case for a division not yet on CRTMS, not an error.
 */
async function schemaForRunningRoom(rrId) {
  const row = await db.one(
    `SELECT d.crtms_schema FROM running_rooms rr
     JOIN divisions d ON d.id = rr.division_id WHERE rr.id = ?`, [rrId]);
  return row && row.crtms_schema ? row.crtms_schema : null;
}

/**
 * Search the master for a crew member.
 *
 * Deliberately requires three characters and returns at most twenty. A running
 * room clerk knows who he is looking for; nobody there has any business
 * browsing the division's staff list, and a box that answers a single letter
 * with three thousand names is a directory, not a lookup.
 */
/**
 * Which designation ids a given box may offer.
 *
 * `role` is 'LP' or 'ALP' where the caller knows; anything else falls back to
 * every designation that may be booked as crew at all. The narrowing is done
 * HERE and not only in the view, because the view cannot know which box on the
 * screen is being filled.
 */
function designationsFor(role) {
  const byRole = cfg.crewRoleDesignations || {};
  const list = byRole[String(role || '').toUpperCase()];
  const all = cfg.crewDesignationIds || [];
  const use = (list && list.length ? list : all).filter(n => all.includes(n));
  return use.length ? use : all;
}

/** Whether this schema's view is the older one, without designation_id. */
const noDesignationId = new Set();

async function search(schema, q, limit = 20, role = null) {
  const term = String(q || '').trim();
  if (!usable(schema) || term.length < 3) return [];
  const like = `%${term}%`;
  const lim = Math.max(1, Math.min(50, limit | 0));
  const ids = designationsFor(role);

  // The narrow form: only the designations this box may book. An installation
  // whose view predates designation_id falls through to the wide form below,
  // and says so once -- silently returning nobody would look like "this man is
  // not on the master", which is a different and much more misleading answer.
  if (!noDesignationId.has(schema) && ids.length) {
    try {
      return await db.query(
        `SELECT hrms_id, cms_id, full_name, designation_id, designation_code,
                designation_name, hq_station, office_code
         FROM \`${schema}\`.v_rr_crew_lookup
         WHERE (full_name LIKE ? OR cms_id LIKE ?)
           AND designation_id IN (${ids.map(() => '?').join(',')})
         ORDER BY (cms_id = ?) DESC, full_name
         LIMIT ${lim}`,
        [like, like, ...ids, term]);
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      console.warn(`crew master ${schema}: v_rr_crew_lookup has no designation_id, so the `
                 + 'Loco Pilot and Assistant boxes cannot be told apart. Re-run '
                 + 'db/crtms/v_rr_crew_lookup.sql to narrow them.');
      noDesignationId.add(schema);
    }
  }

  try {
    return await db.query(
      `SELECT hrms_id, cms_id, full_name, designation_code, designation_name,
              hq_station, office_code
       FROM \`${schema}\`.v_rr_crew_lookup
       WHERE full_name LIKE ? OR cms_id LIKE ?
       ORDER BY (cms_id = ?) DESC, full_name
       LIMIT ${lim}`,
      [like, like, term]);
  } catch (e) {
    // A missing view or a refused grant is a deployment fact, not a crisis.
    // Say so once in the log, then leave the running room alone about it.
    if (!broken.has(schema)) {
      console.warn(`crew master ${schema} unreadable (${e.code || e.message}); `
                 + 'crew names will be typed. See db/crtms/README.md');
    }
    broken.set(schema, Date.now());
    return [];
  }
}

/** One person by their master key, for confirming what was picked. */
async function byHrmsId(schema, hrmsId) {
  if (!usable(schema) || !hrmsId) return null;
  try {
    return await db.one(
      `SELECT hrms_id, cms_id, full_name, designation_code, designation_name,
              hq_station, office_code
       FROM \`${schema}\`.v_rr_crew_lookup WHERE hrms_id = ?`, [hrmsId]);
  } catch (e) { broken.set(schema, Date.now()); return null; }
}

/**
 * The telephone number, from the separate view.
 *
 * Two things have to be true before this is called: the user holds
 * `crew.contact`, and the grant on v_rr_crew_contact was actually given. If
 * the Railway chooses to withhold the grant, this returns null and the screens
 * carry on without a number — that is a supported configuration, not a fault.
 */
async function contactFor(schema, hrmsId) {
  if (!usable(schema) || !hrmsId) return null;
  try {
    const row = await db.one(
      `SELECT contact_number FROM \`${schema}\`.v_rr_crew_contact WHERE hrms_id = ?`,
      [hrmsId]);
    return row && row.contact_number ? row.contact_number : null;
  } catch (e) { return null; }   // no grant: silent, and correct
}

/**
 * Resolve a crew row for a call, and keep it truthful about where it came from.
 *
 * Picked from the master  -> linked by hrms_id, marked `div_master`, and the
 *                            name and designation refreshed from the master so
 *                            the register does not drift.
 * Typed                   -> matched on the CMS number if one was given, else
 *                            on the name, else created and marked `typed`.
 *
 * The crew row keeps its own copy of the name. No foreign key crosses into
 * CRTMS, so a call book written today still reads correctly after the man has
 * retired and left the master.
 */
async function resolve({ hrmsId, schema, name, cmsNo, divisionId }) {
  if (hrmsId) {
    const m = await byHrmsId(schema, hrmsId);
    if (m) {
      const existing = await db.one('SELECT id FROM crew WHERE hrms_id = ?', [m.hrms_id]);
      if (existing) {
        await db.execute(
          `UPDATE crew SET full_name = ?, crew_id_no = COALESCE(?, crew_id_no),
                  designation = ?, headquarters = ?, source = 'div_master',
                  last_synced_at = NOW()
           WHERE id = ?`,
          [m.full_name, m.cms_id, m.designation_name, m.hq_station, existing.id]);
        return { id: existing.id, full_name: m.full_name, source: 'div_master' };
      }
      const ins = await db.execute(
        `INSERT INTO crew (hrms_id, crew_id_no, full_name, designation, headquarters,
                           division_id, source, last_synced_at)
         VALUES (?,?,?,?,?,?, 'div_master', NOW())`,
        [m.hrms_id, m.cms_id, m.full_name, m.designation_name, m.hq_station, divisionId]);
      return { id: ins.insertId, full_name: m.full_name, source: 'div_master' };
    }
    // The id did not resolve. Fall through and treat it as a typed name rather
    // than refusing the entry -- the call still has to be recorded.
  }

  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 150);
  const no = cmsNo ? String(cmsNo).trim().toUpperCase().slice(0, 20) : null;
  if (!clean) return null;

  let row = no ? await db.one('SELECT id FROM crew WHERE crew_id_no = ?', [no]) : null;
  if (!row) {
    row = await db.one(
      'SELECT id FROM crew WHERE LOWER(full_name) = LOWER(?) AND is_active = 1 LIMIT 1',
      [clean]);
  }
  if (row) {
    if (no) await db.execute(
      'UPDATE crew SET crew_id_no = COALESCE(crew_id_no, ?) WHERE id = ?', [no, row.id]);
    return { id: row.id, full_name: clean, source: 'typed' };
  }
  const ins = await db.execute(
    `INSERT INTO crew (crew_id_no, full_name, division_id, source)
     VALUES (?,?,?, 'typed')`, [no, clean, divisionId || null]);
  return { id: ins.insertId, full_name: clean, source: 'typed' };
}

/**
 * Trains, for the call book's train box.
 *
 * A train number typed at four in the morning becomes 12345, 1234 and 12435
 * for one service, and then a pattern of late calls cannot be attributed to a
 * train at all. Matching is on the number or the name, and two characters are
 * enough because a train number is short and a partial one is still a useful
 * narrowing -- unlike a name, where two letters would return the division.
 */
async function searchTrains(schema, q, limit = 20) {
  const term = String(q || '').trim();
  if (!usable(schema) || term.length < 2) return [];
  const like = `%${term}%`;
  try {
    return await db.query(
      `SELECT train_no, train_name, train_type, direction, run_days,
              from_station, to_station
       FROM \`${schema}\`.v_rr_train_lookup
       WHERE train_no LIKE ? OR train_name LIKE ?
       ORDER BY (train_no = ?) DESC, LENGTH(train_no), train_no
       LIMIT ${Math.max(1, Math.min(50, limit | 0))}`,
      [like, like, term]);
  } catch (e) {
    // A division whose train master has not been granted simply types the
    // number, exactly as it does today. Not a fault, and not worth a log line
    // every time somebody presses a key.
    return [];
  }
}

module.exports = { schemaForRunningRoom, search, byHrmsId, contactFor, resolve, searchTrains,
                   designationsFor };
