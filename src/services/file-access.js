/**
 * Who may see a stored file.
 *
 * THE FAULT THIS EXISTS TO CLOSE, found on 10.09.2026 while planning the photo
 * work and proved on a running system.
 *
 * `/inspections/photo/:fileId` fetched the row and then checked access only
 * `if (f.entity_table === 'inspection_items')`. Every other kind of file fell
 * straight through to being served. And EVERY upload in RR-CMS lands in one
 * `files` table -- staff documents, bill documents, food licences, wage sheets,
 * laundry invoices, incident evidence. So any signed-in user of any role could
 * walk ids 1, 2, 3 and read every document in the system, at every running room,
 * including ones their own role and their own scope never let them near.
 *
 * Proved by planting a row marked `staff_documents` and fetching it as the RR
 * In-charge and again as the contractor's supervisor. Both were served 200.
 *
 * WHY THE ANSWER IS AN ALLOW-LIST, AND WHY IT RESOLVES BACKWARDS
 *
 * `files.entity_table` cannot be trusted to answer this, for two reasons. Half
 * the uploaders record `entityId: null` -- the owning row points at the file
 * instead -- so the column often cannot say WHICH record a file belongs to. And
 * a column that describes a file is a claim by whoever wrote it, where the
 * question is who owns the file NOW.
 *
 * So the resolution runs the other way: every table that has a foreign key into
 * `files` is asked whether it points at this file. The first that does is the
 * owner, and its running room and its permission govern. That direction cannot
 * go stale -- if the owning row is deleted the file stops being reachable, which
 * is the correct behaviour and not a bug.
 *
 * DENY BY DEFAULT. A file no table claims is a 404, not a download. That means
 * a table added later without a line in OWNERS below is refused rather than
 * leaked, and `test/file-access.js` fails the build until somebody writes the
 * line. Getting it wrong is loud; forgetting it is safe.
 */
const { assertRunningRoomAccess } = require('../middleware/scope');

/* `loadUser` puts the role's permission codes on the user as a Set. There is no
 * exported can(user, code) -- views get `req.can` -- so the check is made here
 * against that Set, and a user with NO set is refused rather than allowed. A
 * missing permission list is exactly the state in which a mistake would let
 * everything through. */
const holds = (user, code) =>
  !!(user && user.permissions && typeof user.permissions.has === 'function'
     && user.permissions.has(code));

/**
 * Every table with a foreign key into `files`, what it needs to be seen.
 *
 *   cols  the columns on that table that hold a file id
 *   rr    SQL returning the running room the file belongs to, or NULL where the
 *         record is not about one running room
 *   perm  the permission the SCREEN that shows this file already requires --
 *         copied from that screen, not invented here, so the two cannot drift
 *         apart into a file being readable where its own page is refused
 */
const OWNERS = [
  // --- records that carry the running room themselves --------------------
  { table: 'assets',            cols: ['joint_note_file_id'],   rr: 'running_room_id', perm: 'rr.view' },
  { table: 'asset_checks',      cols: ['note_file_id'],         rr: 'running_room_id', perm: 'rr.view' },
  /* A reported defect, photographed at the moment of reporting. One join, because
   * the breakdown hangs off the asset and the asset carries the room. `rr.view`
   * is what the assets screen requires, and the contractor's supervisor holds it
   * -- he is usually the man who finds the broken geyser. */
  { table: 'asset_breakdowns',  cols: ['photo_file_id'], perm: 'rr.view',
    join: 'JOIN assets p ON p.id = t.asset_id', rr: 'p.running_room_id' },
  { table: 'call_book',         cols: ['ack_signature_file_id'],rr: 'running_room_id', perm: 'rr.view' },
  { table: 'cleaning_log',      cols: ['photo_file_id'],        rr: 'running_room_id', perm: 'rr.view' },
  { table: 'compliance_status', cols: ['file_id'],              rr: 'running_room_id', perm: 'rr.view' },
  { table: 'deficiencies',      cols: ['evidence_file_id'],     rr: 'running_room_id', perm: 'rr.view' },
  { table: 'food_licences',     cols: ['certificate_file_id'],  rr: 'running_room_id', perm: 'rr.view' },
  { table: 'food_licence_returns', cols: ['document_file_id'],  rr: 'running_room_id', perm: 'rr.view' },
  { table: 'incidents',         cols: ['evidence_file_id'],     rr: 'running_room_id', perm: 'rr.view' },
  { table: 'kitchen_compliance',cols: ['evidence_file_id'],     rr: 'running_room_id', perm: 'rr.view' },
  { table: 'laundry_dispatch',  cols: ['invoice_file_id'],      rr: 'running_room_id', perm: 'rr.view' },
  { table: 'pest_control_log',  cols: ['certificate_file_id'],  rr: 'running_room_id', perm: 'rr.view' },
  { table: 'inspections',       cols: ['railway_sign_file_id', 'contractor_sign_file_id'],
                                                                rr: 'running_room_id', perm: 'rr.view' },
  // --- crew feedback is its own screen, with its own permission -----------
  { table: 'feedback',          cols: ['signature_file_id'],    rr: 'running_room_id', perm: 'feedback.view' },

  // --- records one join from a running room -------------------------------
  { table: 'inspection_items',  cols: ['evidence_file_id'], perm: 'rr.view',
    join: 'JOIN inspections p ON p.id = t.inspection_id', rr: 'p.running_room_id' },
  { table: 'food_inspection_items', cols: ['evidence_file_id'], perm: 'rr.view',
    join: 'JOIN food_inspections p ON p.id = t.inspection_id', rr: 'p.running_room_id' },
  { table: 'foodstuff_check_signatures', cols: ['signature_file_id'], perm: 'rr.view',
    join: 'JOIN foodstuff_checks p ON p.id = t.check_id', rr: 'p.running_room_id' },
  { table: 'feedback_photos',   cols: ['file_id'], perm: 'feedback.view',
    join: 'JOIN feedback p ON p.id = t.feedback_id', rr: 'p.running_room_id' },
  { table: 'bill_documents',    cols: ['file_id'], perm: 'rr.view',
    join: 'JOIN bills p ON p.id = t.bill_id', rr: 'p.running_room_id' },

  /* Staff documents are police verifications, medical certificates and the six
   * screening papers. The staff screen requires `staff.view`; so does this. The
   * contractor's supervisor holds it -- these are HIS men -- but the running
   * room check is what stops him reading another contractor's staff at another
   * site, which is exactly what the old route allowed. */
  { table: 'staff_documents',   cols: ['file_id'], perm: 'staff.view',
    join: 'JOIN staff p ON p.id = t.staff_id', rr: 'p.running_room_id' },

  // --- wages -------------------------------------------------------------
  { table: 'wage_months',       cols: ['sheet_file_id'],  rr: 'running_room_id', perm: 'wages.view' },
  { table: 'wage_returns',      cols: ['file_id'], perm: 'wages.view',
    join: 'JOIN wage_months p ON p.id = t.wage_month_id', rr: 'p.running_room_id' },

  /* A washing centre or pest vendor is approved for a DIVISION, not a running
   * room, so there is no room to scope by and the permission has to carry the
   * whole weight. `vendor.approve` is what the vendor screen requires. */
  { table: 'vendor_inspections', cols: ['evidence_file_id'], rr: null, perm: 'vendor.approve' },
];

/** The tables named above, for the test that keeps this list complete. */
const OWNED_TABLES = OWNERS.map(o => o.table);

/**
 * Resolve a file to its owner and check the reader may have it.
 *
 * Throws 404 for a file nothing owns -- deliberately the same answer as a file
 * that does not exist, so the route cannot be used to learn which ids are real.
 * Throws 403 only where the reader can see the record's running room but lacks
 * the permission the record's own screen requires.
 */
async function fileFor(db, user, fileId) {
  const id = parseInt(fileId, 10);
  if (!id || id < 1) { const e = new Error('Not found'); e.status = 404; throw e; }

  for (const o of OWNERS) {
    const where = o.cols.map(c => `t.${c} = ?`).join(' OR ');
    const row = await db.one(
      `SELECT ${o.rr ? o.rr : 'NULL'} AS rr FROM ${o.table} t ${o.join || ''} WHERE ${where} LIMIT 1`,
      o.cols.map(() => id));
    if (!row) continue;

    if (!holds(user, o.perm)) { const e = new Error('Not permitted'); e.status = 403; throw e; }
    if (row.rr != null) await assertRunningRoomAccess(db, user, row.rr);

    const f = await db.one('SELECT * FROM files WHERE id = ?', [id]);
    if (!f) { const e = new Error('Not found'); e.status = 404; throw e; }
    return f;
  }

  /* Nothing claims it. A file with no owner is unreachable by design -- see the
   * note on deny-by-default at the top. */
  const e = new Error('Not found'); e.status = 404; throw e;
}

module.exports = { fileFor, OWNERS, OWNED_TABLES };
