/**
 * Configuration. Every value comes from the environment so the same code runs
 * standalone or mounted inside another application.
 */
require('dotenv').config();

const cfg = {
  env:        process.env.NODE_ENV || 'development',
  port:       +(process.env.PORT || 3100),

  // '/' when standalone, '/rrcms' when mounted inside CRTMS. Every link and
  // form action is built from this, so nothing hardcodes an absolute path.
  basePath:   (process.env.APP_BASE_PATH || '/').replace(/\/+$/, '') || '',

  appName:    process.env.APP_NAME || 'RR-CMS',
  appSubtitle: process.env.APP_SUBTITLE || 'Central Railway',

  // Shown in the sidebar and on the demo banner so the running build is obvious.
  stage:      process.env.APP_STAGE || "36 — IGP's executed contract, read in against every table",

  // Which designations in the division staff master may be booked as crew on a
  // call. The Railway's own numbering: 1 and 2 are the assistants, 5, 6 and 7
  // the drivers. Held here rather than in the view so a division with a
  // different numbering is a setting, not a schema change — and so a clerk, a
  // cook or a CLI can never be booked as a driver even if the view is wider
  // than it should be.
  crewDesignationIds: (process.env.CREW_DESIGNATION_IDS || '1,2,5,6,7')
    .split(',').map(s => +s.trim()).filter(n => n > 0),
  // Which of those are drivers and which assistants, so the Loco Pilot box
  // offers drivers and the Assistant box offers assistants. Booking a cook as a
  // driver was never possible; booking the ALP as the LP was, and that is a
  // real keying error at four in the morning.
  crewRoleDesignations: {
    LP:  (process.env.CREW_LP_DESIGNATION_IDS  || '5,6,7').split(',').map(s => +s.trim()).filter(Boolean),
    ALP: (process.env.CREW_ALP_DESIGNATION_IDS || '1,2').split(',').map(s => +s.trim()).filter(Boolean),
  },

  // 'local'     — this application owns users and sessions (default)
  // 'delegated' — trust the host application's session; see src/auth/delegated.js
  authMode:   process.env.AUTH_MODE || 'local',

  sessionSecret:  process.env.SESSION_SECRET || '',
  sessionCookie:  process.env.SESSION_COOKIE || 'rrcms_sid',
  sessionHours:   +(process.env.SESSION_HOURS || 12),

  db: {
    host:     process.env.DB_HOST || '127.0.0.1',
    port:     +(process.env.DB_PORT || 3306),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: +(process.env.DB_POOL || 10),
  },

  uploadDir:  process.env.UPLOAD_DIR || './storage/uploads',
  maxLoginAttempts: 5,
  lockMinutes: 15,
};

// A secret that exists is not the same as a secret worth having. Sessions are
// signed with it, so a short or guessable one can be forged — and the value
// that gets typed in a hurry on deployment day is the one worth refusing.
if (cfg.env === 'production' && !cfg.sessionSecret)
  throw new Error('SESSION_SECRET must be set in production.');
if (cfg.env === 'production' && cfg.sessionSecret.length < 32)
  throw new Error('SESSION_SECRET must be at least 32 characters in production. Generate one:\n'
    + '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"');

module.exports = cfg;
