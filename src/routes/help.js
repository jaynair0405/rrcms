const express = require('express');
const { ROLES, PENDING_ROLES } = require('../help/roles');

const router = express.Router();

/**
 * "What do I do, where, and how?"
 *
 * One page per role, opening on the role of whoever is signed in. No permission
 * gates it beyond being signed in: a man is always allowed to read what his own
 * job is, and an officer explaining the system to a supervisor needs to be able
 * to see the supervisor's page.
 *
 * The page shows a link only where the reader's own permissions would let him
 * through the door. A help page that offers a screen and then refuses it is
 * worse than one that stays quiet -- so `can` decides what is a link and what is
 * plain text, and the text still tells him the step exists and whose it is.
 */
router.get('/', (req, res) => {
  const code = ROLES[req.query.role] ? req.query.role
             : (req.user && ROLES[req.user.role_code]) ? req.user.role_code
             : 'contractor_sup';
  res.render('help/index', {
    title: 'How this works', section: 'help',
    role: ROLES[code], roleCode: code,
    roles: Object.entries(ROLES).map(([k, v]) => [k, v.title]),
    pendingRoles: Object.entries(PENDING_ROLES),
    mine: !!(req.user && req.user.role_code === code),
  });
});

module.exports = router;
