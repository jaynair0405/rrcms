/**
 * Authentication and authorisation middleware.
 * All of it goes through the auth adapter, never through sessions directly.
 */
const auth = require('../auth');
const db = require('../db');
const cfg = require('../config');

const permCache = new Map();          // role_id -> { set, at }

/* THE CACHE HOLDS FOR A MINUTE, NOT FOR THE LIFE OF THE PROCESS.
 *
 * A permission is granted by a SEED, which runs in a different process from the
 * server. Caching a role's permissions for ever meant that `npm run seed`
 * followed by a look at the screen showed no change at all: the database was
 * right, the running server was wrong, and nothing anywhere said so. It cost
 * the officer an evening hunting for a button that the database had already
 * given him -- "as cli. in contract staff -> the only test staff showing. no
 * button." -- and it would have cost the same on the day a real running room
 * needed a permission changed.
 *
 * A minute is long enough that the query is made once per role per minute
 * whatever the traffic, and short enough that nobody has to be told to restart
 * a server to see a grant. clearPermissionCache() stays for the tests, which
 * want the change now rather than in a minute.
 */
const PERM_TTL_MS = 60_000;

async function permissionsFor(roleId) {
  const hit = permCache.get(roleId);
  if (hit && Date.now() - hit.at < PERM_TTL_MS) return hit.set;
  const rows = await db.query(
    `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?`,
    [roleId]);
  const set = new Set(rows.map(r => r.code));
  permCache.set(roleId, { set, at: Date.now() });
  return set;
}
function clearPermissionCache() { permCache.clear(); }

/** Attaches req.user (or null) and view locals. Never blocks. */
function loadUser() {
  return async (req, res, next) => {
    try {
      const user = await auth.getCurrentUser(req);
      req.user = user;
      if (user) {
        user.permissions = await permissionsFor(user.role_id);
        req.can = code => user.permissions.has(code);
      } else {
        req.can = () => false;
      }
      res.locals.user = user;
      res.locals.can = req.can;
      next();
    } catch (e) { next(e); }
  };
}

/** Blocks anonymous requests. */
function requireAuth() {
  return (req, res, next) => {
    if (req.user) return next();
    if (req.accepts('html') && auth.ownsLogin) {
      const back = encodeURIComponent(req.originalUrl || '/');
      return res.redirect(`${cfg.basePath}/login?next=${back}`);
    }
    res.status(401).json({ error: 'authentication required' });
  };
}

/** Blocks users whose role lacks the permission. */
function requirePermission(code) {
  return (req, res, next) => {
    if (req.user && req.user.permissions.has(code)) return next();
    const err = new Error(`Permission "${code}" is required.`);
    err.status = 403;
    next(err);
  };
}

/**
 * Sends a user whose password was issued to him, rather than chosen by him,
 * to change it before he does anything else.
 *
 * An account created by an administrator carries a password that at least one
 * other person has seen, on a screen or in a terminal. Until it is changed,
 * every entry that account makes is attributable to two people, which is
 * precisely what a muster signature and a counter-signature are for. So the
 * block is real, not a reminder that can be dismissed.
 *
 * Signing out is left open, and so are the static assets, or the person is
 * trapped on a page he cannot style or leave.
 */
function requirePasswordChange() {
  const allowed = new Set(['/account/password', '/logout', '/login']);
  return (req, res, next) => {
    if (!req.user || !req.user.must_change_pw) return next();
    if (allowed.has(req.path) || req.path.startsWith('/assets')) return next();
    if (!req.accepts('html')) return res.status(403).json({ error: 'password change required' });
    res.redirect(`${cfg.basePath}/account/password`);
  };
}

module.exports = { loadUser, requireAuth, requirePermission, requirePasswordChange,
                   permissionsFor, clearPermissionCache };
