/**
 * Row-level scoping.
 *
 * A role's scope_level decides which running rooms it may see:
 *   cr           — every running room
 *   division     — running rooms in the user's division
 *   running_room — the user's own running room
 *   contractor   — running rooms the user's contractor holds a live contract for
 *   self         — none (crew submit feedback; they see no registers)
 *
 * Returning SQL rather than filtering in JavaScript keeps the restriction in
 * the query, so a forgotten filter cannot leak rows.
 *
 * opts.operationalOnly additionally drops running rooms that are closed or
 * under renovation. Scope answers "may this user see it"; that flag answers
 * "is there anything to see". They are different questions and a closed site
 * belongs in the register -- where it must remain readable -- but not in the
 * kitchen compliance count, the month's certification list, or the room
 * picker on a daily entry screen.
 */
function runningRoomScope(user, alias = 'rr', opts = {}) {
  const live = s => opts.operationalOnly
    ? `(${s}) AND ${alias}.status = 'operational'` : s;
  if (!user) return { sql: '1 = 0', params: [] };
  switch (user.scope_level) {
    case 'cr':
      return { sql: live('1 = 1'), params: [] };
    case 'division':
      return { sql: live(`${alias}.division_id = ?`), params: [user.division_id] };
    case 'running_room':
      return { sql: live(`${alias}.id = ?`), params: [user.running_room_id] };
    case 'contractor':
      return {
        sql: live(`${alias}.id IN (
                SELECT crr.running_room_id
                FROM contract_running_rooms crr
                JOIN contracts c ON c.id = crr.contract_id
                WHERE c.contractor_id = ?
                  AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE()))`),
        params: [user.contractor_id],
      };
    default:
      return { sql: '1 = 0', params: [] };
  }
}

/** Throws 403 unless the user may see this running room. */
async function assertRunningRoomAccess(db, user, runningRoomId) {
  const scope = runningRoomScope(user, 'rr');
  const row = await db.one(
    `SELECT rr.id FROM running_rooms rr WHERE rr.id = ? AND (${scope.sql})`,
    [runningRoomId, ...scope.params]);
  if (!row) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
  return true;
}

module.exports = { runningRoomScope, assertRunningRoomAccess };
