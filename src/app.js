/**
 * RR-CMS as a mountable Express router.
 *
 *   Standalone            require('./src/server')
 *   Inside CRTMS          app.use('/rrcms', createApp({ pool: crtmsPool }))
 *
 * Nothing here calls app.listen, sets an application-level view engine, or
 * assumes it is served from the root path. Those are the three things that
 * usually make a module impossible to mount later.
 */
const express = require('express');
const path = require('path');
const db = require('./db');
const cfg = require('./config');
const { viewEngine } = require('./render');
const { loadUser, requireAuth, requirePasswordChange } = require('./middleware/auth');
const errors = require('./middleware/errors');

function createApp({ pool = null } = {}) {
  if (pool) db.setPool(pool);

  const router = express.Router();

  router.use(express.urlencoded({ extended: false, limit: '1mb' }));
  router.use(express.json({ limit: '1mb' }));
  router.use('/assets', express.static(path.join(__dirname, 'public'), { maxAge: cfg.env === 'production' ? '7d' : 0 }));

  router.use(viewEngine());
  router.use(loadUser());

  // Public — the crew feedback form is deliberately outside authentication.
  router.use('/', require('./routes/public-feedback'));
  router.use('/', require('./routes/auth'));

  // Everything else requires a signed-in user
  router.use(requireAuth());
  // A password issued by an administrator is known to somebody else. Nothing
  // may be recorded under that account until its owner has chosen his own.
  router.use(requirePasswordChange());
  router.use('/account', require('./routes/account'));
  router.use('/', require('./routes/dashboard'));
  router.use('/running-rooms', require('./routes/running-rooms'));
  router.use('/staff', require('./routes/staff'));
  router.use('/records', require('./routes/records'));
  router.use('/feedback', require('./routes/feedback'));
  router.use('/facility', require('./routes/facility'));
  router.use('/inspections', require('./routes/inspections'));
  router.use('/deficiencies', require('./routes/deficiencies'));
  router.use('/incidents', require('./routes/incidents'));
  router.use('/compliance', require('./routes/compliance'));
  router.use('/contractors', require('./routes/contractors'));
  router.use('/certificates', require('./routes/certificates'));
  router.use('/bills', require('./routes/bills'));
  router.use('/wages', require('./routes/wages'));
  router.use('/food-safety', require('./routes/food-safety'));
  router.use('/reports', require('./routes/reports'));
  router.use('/masters', require('./routes/masters'));
  router.use('/photo', require('./routes/files'));
  router.use('/clauses', require('./routes/clauses'));
  router.use('/help', require('./routes/help'));

  router.use(errors.notFound);
  router.use(errors.handler());

  return router;
}

module.exports = createApp;
module.exports.createApp = createApp;
