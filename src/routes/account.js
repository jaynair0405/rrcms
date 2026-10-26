/**
 * A user's own account, and the administration of everyone else's.
 *
 * Two things lived outside the application until now and had to come in before
 * anybody could be handed a login:
 *
 *   - **Changing a password.** `db/create-user.js` prints a random one and sets
 *     must_change_pw, but nothing enforced it and there was no screen. Every
 *     officer would have been permanently using a password out of somebody's
 *     terminal history, which is worse than a weak password because it is a
 *     weak password that several people have seen.
 *
 *   - **Setting a user's scope.** The role said what he could do; the division,
 *     running room or contractor that decides *which records* he may touch had
 *     to be set with a SQL statement. That is not a thing to ask of a divisional
 *     office, and getting it wrong is not a cosmetic error -- it is the whole of
 *     row-level access control.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const auth = require('../auth');
const local = require('../auth/local');
const { requirePermission } = require('../middleware/auth');
const audit = require('../services/audit');

const router = express.Router();

/* ------------------------------------------------------------ own password */

/**
 * What a password has to be: six characters. Nothing else.
 *
 * The floor was ten, with a common-password list and a rule against containing
 * the username. Set by the Railway to six, no other restriction.
 */
function passwordFault(pw) {
  if (!pw || pw.length < 6) return 'The password must be at least 6 characters.';
  return null;
}

router.get('/password', (req, res) => {
  res.render('account/password', {
    title: 'Change password', section: 'account',
    forced: !!req.user.must_change_pw, error: null,
    // Set by the redirect after a successful change — see the POST below.
    done: req.query.changed === '1',
  });
});

router.post('/password', async (req, res, next) => {
  try {
    const { current = '', fresh = '', again = '' } = req.body;
    const show = (error, done = false) => res.render('account/password', {
      title: 'Change password', section: 'account',
      forced: !!req.user.must_change_pw && !done, error, done,
    });

    const row = await db.one('SELECT password_hash, username FROM users WHERE id = ?', [req.user.id]);
    if (!row || !local.verifyPassword(current, row.password_hash)) {
      return show('The current password is not right.');
    }
    if (fresh !== again) return show('The two new passwords are not the same.');
    if (fresh === current) return show('The new password must be different from the old one.');
    const fault = passwordFault(fresh, row);
    if (fault) return show(fault);

    await db.execute('UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?',
      [local.hashPassword(fresh), req.user.id]);

    // Every other session belonging to this account goes. If the password was
    // being changed because somebody else knew it, leaving their session alive
    // would make the change pointless.
    await db.execute(
      'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL',
      [req.user.id, req.user.sessionId || '']);

    await audit.record(req, { table: 'users', id: req.user.id, action: 'password_change' });
    req.user.must_change_pw = 0;

    /* REDIRECT, DO NOT RENDER. A page rendered straight from a POST stays
       attached to that POST: a refresh, a back-then-forward, an Enter pressed
       twice or a double-click all deliver the form a second time. The second
       delivery carries the OLD password, which by then is wrong — so the user
       is shown "The current password is not right" over a form, and never sees
       that the change he made actually worked.
     
       That is not a hypothetical. It happened to the first account created on
       the production server, within a minute of the system going live, and it
       reads exactly like a failure: no confirmation, the same form again, and
       an error when you try once more. The password had been changed correctly
       the whole time.

       Redirecting means the address bar holds a GET. Refresh it as often as you
       like and it re-renders the confirmation, because there is no form data
       left to re-send. */
    return res.redirect(`${cfg.basePath}/account/password?changed=1`);
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------ user admin */

const ROLE_HELP = {
  hq: 'Sees every division. Reads everything; changes nothing.',
  div_officer: 'One division. Approves screening, inspects, records and closes deficiencies, passes bills.',
  rr_incharge: 'One running room. Counter-signs the muster, keeps the daily registers, certifies the month.',
  contractor_sup: 'One contractor. Marks the muster and keeps his own staff records, at that firm\'s sites only.',
  crew: 'Submits feedback. No access to any register.',
  sysadmin: 'Administers users and master data. Makes none of the operational decisions.',
};

/** What each role must be scoped by, and what it must not carry. */
/* WHAT EACH ROLE MUST BE SCOPED BY.
 *
 * THIS MUST AGREE WITH `roles.scope_level`, and for one role it did not.
 * `runningRoomScope` reads that column to decide which filter to apply, and for
 * contractor_sup it says `running_room` -- the scope is the room the man works
 * at. This table said `contractor_id`, so the screen asked for a firm, set
 * contractor_id, and left running_room_id empty. The filter then read "the
 * running room whose id is null", matched nothing, and every supervisor made
 * through this screen was refused every page with "No running rooms within
 * your access".
 *
 * It hid because db/create-user.js gets it right -- it asks for a running room
 * and DERIVES the firm from that room's live contract -- and every account made
 * during development was made with that. The screen is the one the go-live
 * checklist tells you to use for everybody, and the first supervisor account
 * created on the production server was unusable.
 *
 * The contractor is still recorded, because bills and certificates read it. It
 * is DERIVED, never asked for: a supervisor at Igatpuri works for whichever firm
 * holds Igatpuri today, and asking a second question whose answer is already
 * known is exactly how two answers come to disagree.
 */
const SCOPE_OF = {
  hq: [], div_officer: ['division_id'], rr_incharge: ['running_room_id'],
  contractor_sup: ['running_room_id'], crew: [], sysadmin: [],
};

/** The firm holding a running room today, or null. The query create-user.js uses. */
async function firmHolding(runningRoomId) {
  return db.one(`
    SELECT ct.id, ct.name
      FROM contract_running_rooms crr
      JOIN contracts c    ON c.id  = crr.contract_id
      JOIN contractors ct ON ct.id = c.contractor_id
     WHERE crr.running_room_id = ?
       AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
     ORDER BY crr.effective_from DESC LIMIT 1`, [runningRoomId]);
}

/** A supervisor's firm follows the running room he is posted to. */
async function attachFirm(scope, roleCode) {
  if (roleCode !== 'contractor_sup') return scope;
  const firm = await firmHolding(scope.running_room_id);
  if (!firm) {
    const e = new Error('No contractor holds that running room today, so there is no firm to '
      + 'attach this supervisor to. Read the contract in first — a supervisor with no firm '
      + 'cannot be shown his own staff, his bills or his certificates.');
    e.status = 400; throw e;
  }
  scope.contractor_id = firm.id;
  return scope;
}

async function chooser() {
  const [roles, divisions, rooms, contractors] = await Promise.all([
    db.query('SELECT id, code, name FROM roles ORDER BY id'),
    db.query('SELECT id, code, name FROM divisions ORDER BY sort_order, name'),
    db.query(`SELECT rr.id, rr.name, rr.status, d.code AS div_code
              FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
              WHERE rr.status = 'operational' ORDER BY d.sort_order, rr.name`),
    db.query('SELECT id, code, name FROM contractors WHERE is_active = 1 ORDER BY name'),
  ]);
  return { roles, divisions, rooms, contractors };
}

router.get('/users', requirePermission('user.manage'), async (req, res, next) => {
  try {
    const users = await db.query(`
      SELECT u.id, u.username, u.full_name, u.designation, u.phone, u.is_active,
             u.must_change_pw, u.last_login_at, u.locked_until,
             r.code AS role_code, r.name AS role_name,
             d.code AS div_code, rr.name AS rr_name, c.name AS contractor_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN divisions d      ON d.id  = u.division_id
      LEFT JOIN running_rooms rr ON rr.id = u.running_room_id
      LEFT JOIN contractors c    ON c.id  = u.contractor_id
      ORDER BY u.is_active DESC, r.id, u.full_name`);

    // The check that matters. A role whose scope is not set does not see
    // "nothing" -- what it sees depends on how each query was written, and that
    // is exactly the kind of thing nobody discovers until the wrong person has
    // been reading the wrong running room for a month.
    users.forEach(u => {
      const need = SCOPE_OF[u.role_code] || [];
      u.unscoped = need.length > 0 && !(
        (need.includes('division_id') && u.div_code) ||
        (need.includes('running_room_id') && u.rr_name) ||
        (need.includes('contractor_id') && u.contractor_name));
    });

    res.render('account/users', { title: 'Users', section: 'users',
      users, ...(await chooser()), roleHelp: ROLE_HELP, created: req.query.created || null,
      newPassword: req.query.pw || null });
  } catch (e) { next(e); }
});

/** Reads role and scope off the form, refusing combinations that mean nothing. */
function scopeFrom(body, roleCode) {
  const need = SCOPE_OF[roleCode];
  if (!need) { const e = new Error('Unknown role.'); e.status = 400; throw e; }
  const out = { division_id: null, running_room_id: null, contractor_id: null };
  for (const key of need) {
    const v = +body[key] || null;
    if (!v) {
      const what = key === 'division_id' ? 'a division'
                 : key === 'running_room_id' ? 'a running room' : 'a contractor';
      const e = new Error(`A ${roleCode.replace('_', ' ')} must be given ${what}. `
        + 'Without it the account has no defined reach, which is not the same as having none.');
      e.status = 400; throw e;
    }
    out[key] = v;
  }
  return out;
}

router.post('/users', requirePermission('user.manage'), async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase().slice(0, 60);
    const fullName = String(req.body.full_name || '').trim().slice(0, 150);
    const roleCode = String(req.body.role_code || '');
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
      const e = new Error('The username may use letters, digits, dot, dash and underscore only, and at least three of them.');
      e.status = 400; throw e;
    }
    if (!fullName) { const e = new Error('The full name is required.'); e.status = 400; throw e; }

    const role = await db.one('SELECT id, code FROM roles WHERE code = ?', [roleCode]);
    if (!role) { const e = new Error('Unknown role.'); e.status = 400; throw e; }
    const scope = await attachFirm(scopeFrom(req.body, role.code), role.code);

    const clash = await db.one('SELECT id FROM users WHERE username = ?', [username]);
    if (clash) { const e = new Error(`There is already an account called "${username}".`); e.status = 400; throw e; }

    // A password nobody chose, shown once. It cannot be looked up afterwards --
    // only the hash is kept -- and the account must change it at first sign-in.
    const pw = require('crypto').randomBytes(9).toString('base64url');
    const ins = await db.execute(
      `INSERT INTO users (username, full_name, designation, phone, password_hash, role_id,
                          division_id, running_room_id, contractor_id, is_active, must_change_pw)
       VALUES (?,?,?,?,?,?,?,?,?,1,1)`,
      [username, fullName, String(req.body.designation || '').trim().slice(0, 120) || null,
       String(req.body.phone || '').trim().slice(0, 20) || null,
       local.hashPassword(pw), role.id,
       scope.division_id, scope.running_room_id, scope.contractor_id]);

    await audit.record(req, { table: 'users', id: ins.insertId, action: 'insert',
      after: { username, full_name: fullName, role: role.code, ...scope } });
    res.redirect(`${cfg.basePath}/account/users?created=${encodeURIComponent(username)}&pw=${encodeURIComponent(pw)}`);
  } catch (e) { next(e); }
});

router.post('/users/:id', requirePermission('user.manage'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const before = await db.one(
      `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [id]);
    if (!before) { const e = new Error('No such user.'); e.status = 404; throw e; }

    const action = String(req.body.action || 'save');

    if (action === 'reset') {
      const pw = require('crypto').randomBytes(9).toString('base64url');
      await db.execute(
        'UPDATE users SET password_hash = ?, must_change_pw = 1, failed_logins = 0, locked_until = NULL WHERE id = ?',
        [local.hashPassword(pw), id]);
      // Their sessions go with the password. A reset exists because somebody
      // has lost control of the account; leaving a live session behind defeats it.
      await db.execute('UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
      await audit.record(req, { table: 'users', id, action: 'password_reset' });
      return res.redirect(`${cfg.basePath}/account/users?created=${encodeURIComponent(before.username)}&pw=${encodeURIComponent(pw)}`);
    }

    if (action === 'deactivate' || action === 'activate') {
      const on = action === 'activate' ? 1 : 0;
      // The last working administrator may not switch himself off, or there is
      // nobody left who can switch anybody back on.
      if (!on) {
        const others = await db.one(`
          SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.is_active = 1 AND u.id <> ? AND r.code = 'sysadmin'`, [id]);
        if (before.role_code === 'sysadmin' && (!others || !others.n)) {
          const e = new Error('This is the only working administrator account. '
            + 'Create another before switching this one off.');
          e.status = 400; throw e;
        }
      }
      await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [on, id]);
      if (!on) await db.execute('UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
      await audit.record(req, { table: 'users', id, action: on ? 'activate' : 'deactivate' });
      return res.redirect(`${cfg.basePath}/account/users`);
    }

    if (action === 'unlock') {
      await db.execute('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [id]);
      await audit.record(req, { table: 'users', id, action: 'unlock' });
      return res.redirect(`${cfg.basePath}/account/users`);
    }

    const role = await db.one('SELECT id, code FROM roles WHERE code = ?', [String(req.body.role_code || '')]);
    if (!role) { const e = new Error('Unknown role.'); e.status = 400; throw e; }
    const scope = await attachFirm(scopeFrom(req.body, role.code), role.code);
    await db.execute(
      `UPDATE users SET full_name = ?, designation = ?, phone = ?, role_id = ?,
              division_id = ?, running_room_id = ?, contractor_id = ? WHERE id = ?`,
      [String(req.body.full_name || before.full_name).trim().slice(0, 150),
       String(req.body.designation || '').trim().slice(0, 120) || null,
       String(req.body.phone || '').trim().slice(0, 20) || null,
       role.id, scope.division_id, scope.running_room_id, scope.contractor_id, id]);

    // A change of role or scope changes what this person may see. The session
    // caches neither, but revoking is cheap and removes the question entirely.
    if (role.id !== before.role_id || scope.division_id !== before.division_id
        || scope.running_room_id !== before.running_room_id
        || scope.contractor_id !== before.contractor_id) {
      await db.execute('UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
    }
    await audit.record(req, { table: 'users', id, action: 'update',
      before: { role: before.role_code, division_id: before.division_id,
                running_room_id: before.running_room_id, contractor_id: before.contractor_id },
      after: { role: role.code, ...scope } });
    res.redirect(`${cfg.basePath}/account/users`);
  } catch (e) { next(e); }
});

module.exports = router;
