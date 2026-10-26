/**
 * The feedback coverage figure, computed and kept.
 *
 * `feedback_coverage` is read in seven places — the dashboard, the running room
 * sheet, three reports, the monthly certificate and the grading screen — and
 * until now **nothing anywhere wrote to it**. On a real installation the table
 * would have stayed empty for ever, which means:
 *
 *   - the grading screen's "meets the floor" was always null, so the 50%
 *     condition the tender puts on the grading penalty was never actually
 *     applied to anything;
 *   - the monthly certificate froze a coverage of nil into the pack;
 *   - every trend and league table read zero and looked like a real zero.
 *
 * The /feedback/coverage screen computed its figures live and so looked right,
 * which is exactly why this went unnoticed.
 *
 * Two counts are kept, and the difference between them matters:
 *
 *   feedback_received — everything that arrived, QR included. The useful
 *                       operational number: are the crew being asked at all.
 *   signed_received   — entries keyed from the physical register, signed by the
 *                       occupant. This is the one the penalty clause names, and
 *                       `meets_signed_floor` is what a deduction must rest on.
 *
 * Recomputed whenever feedback arrives or the occupancy figure is entered, so
 * it is never stale, and re-runnable for a whole month from the screen.
 */
const db = require('../db');
const { thisMonth } = require('../lib/day');

/** Normalise anything month-ish to the first of that month. */
const firstOf = v => (v && /^\d{4}-\d{2}/.test(String(v))
  ? String(v).slice(0, 7) : thisMonth()) + '-01';

/**
 * Recompute one running room's coverage for one month.
 *
 * With no occupancy figure entered there is no denominator, and the row is
 * written with zeroes and `meets_floor = 0` rather than skipped — because a
 * site that has not had its occupancy typed in should read as "not established"
 * everywhere, not vanish from the reports.
 */
async function recompute(runningRoomId, month) {
  const first = firstOf(month);

  const counts = await db.one(`
    SELECT COUNT(*) AS received,
           SUM(channel = 'checkout_register') AS signed_received
    FROM feedback
    WHERE running_room_id = ?
      AND submitted_at >= ? AND submitted_at < DATE_ADD(?, INTERVAL 1 MONTH)`,
    [runningRoomId, first, first]);

  const occ = await db.one(
    'SELECT occupants_total FROM occupancy_monthly WHERE running_room_id = ? AND period_month = ?',
    [runningRoomId, first]);

  const total = occ ? Number(occ.occupants_total) || 0 : 0;
  const received = counts ? Number(counts.received) || 0 : 0;
  const signed = counts ? Number(counts.signed_received) || 0 : 0;
  const pct = total ? Math.round((received / total) * 10000) / 100 : 0;
  const signedPct = total ? Math.round((signed / total) * 10000) / 100 : 0;

  await db.execute(`
    INSERT INTO feedback_coverage (running_room_id, period_month, occupants_total,
      feedback_received, signed_received, coverage_pct, signed_pct, meets_floor,
      meets_signed_floor, computed_at)
    VALUES (?,?,?,?,?,?,?,?,?,NOW())
    ON DUPLICATE KEY UPDATE occupants_total = VALUES(occupants_total),
      feedback_received = VALUES(feedback_received), signed_received = VALUES(signed_received),
      coverage_pct = VALUES(coverage_pct), signed_pct = VALUES(signed_pct),
      meets_floor = VALUES(meets_floor), meets_signed_floor = VALUES(meets_signed_floor),
      computed_at = NOW()`,
    [runningRoomId, first, total, received, signed, pct, signedPct,
     total && pct >= 50 ? 1 : 0, total && signedPct >= 50 ? 1 : 0]);

  return { occupants_total: total, received, signed, pct, signedPct,
           meets: !!(total && pct >= 50), meetsSigned: !!(total && signedPct >= 50) };
}

/** Every running room in scope, for a month — used by the recompute button. */
async function recomputeMonth(runningRoomIds, month) {
  let n = 0;
  for (const id of runningRoomIds) { await recompute(id, month); n++; }
  return n;
}

/**
 * Best-effort: a coverage figure must never be the reason a crew member's
 * feedback fails to save. If the recompute throws, the feedback still stands
 * and the figure is corrected on the next write or from the screen.
 */
async function refresh(runningRoomId, month) {
  try { return await recompute(runningRoomId, month); }
  catch (e) { console.warn('coverage recompute failed:', e.message); return null; }
}

module.exports = { recompute, recomputeMonth, refresh, firstOf };
