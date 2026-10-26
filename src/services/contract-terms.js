/**
 * Which contract governs a running room, and which reference rows it brings.
 *
 * THE PROBLEM THIS SOLVES. RR-CMS's reference tables -- penalty clauses, the
 * cleaning schedule, consumables, meal rates -- were seeded from the earlier,
 * generic tender paper for Central Railway running rooms. The executed contract
 * for a particular site is a different document with different numbers. IGP's
 * penalty schedule has 31 clauses lettered (a) to (ee); the generic paper has
 * 50 coded A1..M12. They are not the same list, and several collide outright.
 *
 * THE RULE. If a running room's contract has rows of its own in a table, those
 * rows are the WHOLE answer for that room. The generic rows are not merged in
 * underneath. A contract that names 31 penalties names 31 -- not 31 plus
 * whatever else was lying about. Where the contract has said nothing, the
 * generic rows stand, because they are better than an empty screen and they
 * carry their own source_ref saying where they came from.
 *
 * This is the same shape the linen schedule has used since stage 34, lifted out
 * so every table can use it instead of each one inventing it again.
 */

// A running room's live contract, or null. "Live" means the link has not been
// closed -- a handover closes the earlier link rather than deleting it, so a
// room that changed hands mid-month still reads correctly for either date.
async function contractIdFor(db, runningRoomId) {
  if (!runningRoomId) return null;
  const row = await db.one(`
    SELECT crr.contract_id AS id
    FROM contract_running_rooms crr
    WHERE crr.running_room_id = ?
      AND (crr.effective_to IS NULL OR crr.effective_to >= CURDATE())
    ORDER BY crr.effective_from DESC LIMIT 1`, [runningRoomId]);
  return row ? row.id : null;
}

/**
 * Run a query twice at most: once for the contract's own rows, and only if
 * those come back empty, once for the generic rows.
 *
 * `build(clause, params)` is handed the SQL fragment to drop into the WHERE and
 * the parameter it needs, and returns [sql, params] for the whole query. Two
 * round trips in the worst case, one in the common one, and the caller keeps
 * its own SQL where a reader can see it.
 */
async function scopedRows(db, contractId, build) {
  if (contractId) {
    const [sql, params] = build('contract_id = ?', [contractId]);
    const own = await db.query(sql, params);
    if (own.length) return { rows: own, fromContract: true };
  }
  const [sql, params] = build('contract_id IS NULL', []);
  return { rows: await db.query(sql, params), fromContract: false };
}

module.exports = { contractIdFor, scopedRows };

/**
 * The clause that governs a named deficiency AT THIS RUNNING ROOM.
 *
 * Three places raise a deficiency against a clause code written into the code:
 * intoxication as A3, late wages as M5, the standing obligations as D3, D4 and
 * M12. Those codes are the generic tender's. At a running room whose contract
 * carries its own penalty schedule they can be the wrong clause at the wrong
 * rate -- the generic paper fines intoxication Rs 1,000 per labour per case,
 * IGP's contract Rs 500 per case, and a deficiency raised under the wrong one
 * misstates what the Railway may recover.
 *
 * So the contract is asked first: has it a clause that stands in place of this
 * one? If it has, that is the clause. If it has not -- IGP's contract says
 * nothing about late wages -- the generic clause is used, and that is right
 * rather than a fallback: a site penalty list is not the whole of the contract
 * conditions, and refusing to record late wages because the site list omits
 * them would lose a real finding.
 *
 * Returns the clause row, or null if neither schedule holds one in force on the
 * date -- which the callers already report as "not on the schedule in force".
 */
async function clauseFor(db, runningRoomId, genericCode, onDate) {
  const contractId = await contractIdFor(db, runningRoomId);
  if (contractId) {
    const own = await db.one(`
      SELECT * FROM deficiency_clauses
      -- FIND_IN_SET, not '=': one contract clause may stand in place of several
      -- tender clauses. IGP's clause (t) replaces B2 AND B4, because the
      -- contract writes as one offence what the tender wrote as two. See
      -- migration 065. The table is under a hundred rows, so losing the index
      -- here costs nothing measurable.
      WHERE contract_id = ? AND FIND_IN_SET(?, supersedes_code) AND is_active = 1
        AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY effective_from DESC LIMIT 1`, [contractId, genericCode, onDate, onDate]);
    if (own) return own;
  }
  return db.one(`
    SELECT * FROM deficiency_clauses
    WHERE clause_code = ? AND contract_id IS NULL AND is_active = 1
      AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY effective_from DESC LIMIT 1`, [genericCode, onDate, onDate]);
}

module.exports.clauseFor = clauseFor;
