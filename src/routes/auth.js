const express = require('express');
const auth = require('../auth');
const cfg = require('../config');
const audit = require('../services/audit');

const router = express.Router();

router.get('/login', (req, res) => {
  if (!auth.ownsLogin) return res.redirect(cfg.basePath + '/');
  if (req.user) return res.redirect(cfg.basePath + '/');
  res.render('login', { title: 'Sign in', bare: true, error: null, next: req.query.next || '' });
});

router.post('/login', async (req, res, next) => {
  if (!auth.ownsLogin) return res.status(404).end();
  const { username = '', password = '', next: dest = '' } = req.body;
  try {
    const result = await auth.login(req, res, username.trim(), password);
    if (!result.ok) {
      const message = result.reason === 'locked'
        ? 'Too many failed attempts. Try again in a few minutes.'
        : result.reason === 'inactive'
          ? 'That account is not active.'
          : 'Username or password is incorrect.';
      return res.render('login', { title: 'Sign in', bare: true, error: message, next: dest });
    }
    req.user = { id: result.userId };
    await audit.record(req, { table: 'users', id: result.userId, action: 'login' });
    const safe = typeof dest === 'string' && dest.startsWith('/') && !dest.startsWith('//') ? dest : cfg.basePath + '/';
    res.redirect(safe);
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res, next) => {
  try {
    if (req.user) await audit.record(req, { table: 'users', id: req.user.id, action: 'logout' });
    if (auth.logout) await auth.logout(req, res);
    res.redirect(cfg.basePath + '/login');
  } catch (e) { next(e); }
});

module.exports = router;
