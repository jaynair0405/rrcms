/**
 * Authentication adapter.
 *
 * Everything downstream calls getCurrentUser(req) and never touches sessions
 * directly. Swapping RR-CMS onto CRTMS's login is a change of AUTH_MODE and one
 * file — not a rewrite of every route.
 */
const cfg = require('../config');

const impl = cfg.authMode === 'delegated'
  ? require('./delegated')
  : require('./local');

module.exports = {
  mode: cfg.authMode,

  /** Resolve the signed-in user, or null. Attaches nothing; callers decide. */
  getCurrentUser: impl.getCurrentUser,

  /** Present only in local mode. */
  login:  impl.login  || null,
  logout: impl.logout || null,

  /** True when this application owns the login screen. */
  ownsLogin: cfg.authMode === 'local',
};
