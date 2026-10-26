/**
 * Audit trail. This system produces evidence used in contractual disputes, so
 * every mutation is recorded with before and after state. Failures are logged
 * but never propagate — an audit write must not break the user's action.
 */
const db = require('../db');

async function record(req, { table, id, action, before = null, after = null }) {
  try {
    await db.execute(
      `INSERT INTO audit_log (user_id, entity_table, entity_id, action, before_json, after_json, ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user ? req.user.id : null, table, id ?? null, action,
       before ? JSON.stringify(before) : null,
       after ? JSON.stringify(after) : null,
       req.ip || null]);
  } catch (e) {
    console.error('[audit] failed:', e.message);
  }
}

module.exports = { record };
