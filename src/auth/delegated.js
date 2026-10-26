/**
 * Delegated authentication — for the day RR-CMS is mounted inside CRTMS and
 * should not have its own login screen.
 *
 * NOT ACTIVE. Set AUTH_MODE=delegated to use it, and fill in the one function
 * below that reads the host application's session. Everything else in RR-CMS
 * stays exactly as it is: routes, permissions and scoping all go through
 * getCurrentUser and do not care where the identity came from.
 *
 * The mapping table is the important part. CRTMS knows its own users; it does
 * not know what an "RR In-charge" is. rrcms_user_map holds that link, so a
 * CRTMS login resolves to an RR-CMS role and scope without either system
 * needing to understand the other's role model.
 */
const db = require('../db');

/**
 * Read the host application's authenticated user id.
 * Replace the body when integrating — e.g. `return req.session?.user?.id`
 * for an express-session host, or verify whatever token CRTMS issues.
 */
function hostUserId(req) {
  return req.session && req.session.user ? req.session.user.id : null;
}

async function getCurrentUser(req) {
  const hostId = hostUserId(req);
  if (!hostId) return null;

  return db.one(`
    SELECT u.id, u.username, u.full_name, u.designation, u.role_id, u.division_id,
           u.running_room_id, u.contractor_id, 0 AS must_change_pw,
           r.code AS role_code, r.name AS role_name, r.scope_level
    FROM rrcms_user_map m
    JOIN users u ON u.id = m.rrcms_user_id AND u.is_active = 1
    JOIN roles r ON r.id = u.role_id
    WHERE m.host_user_id = ?`, [hostId]);
}

module.exports = { getCurrentUser };
