/**
 * Facility and material management — the recurring obligations in Schedules C
 * and D that are easy to let slide and are exactly what an inspection catches.
 *
 * Each page is a register plus one entry form. Nothing here computes money;
 * shortfalls are recorded and, where they map to a clause, can be raised as a
 * deficiency from the inspection checklist.
 */
const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const { runningRoomScope, assertRunningRoomAccess } = require('../middleware/scope');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const terms = require('../services/contract-terms');

/**
 * How many single-character edits turn one word into another.
 *
 * Used on the asset catalogue to catch "Cott" for "Cot" before it becomes a
 * second entry that nobody can count. Short strings only -- the names are a
 * handful of letters -- so the plain two-row table is quicker than anything
 * cleverer and easier to be sure of.
 */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const router = express.Router();
router.use(requirePermission('rr.view'));

const { today } = require('../lib/day');

async function context(req) {
  const s = runningRoomScope(req.user, 'rr', { operationalOnly: true });
  const rooms = await db.query(
    `SELECT rr.id, rr.name, rr.total_beds, rr.has_meal_facility, d.code AS div_code
     FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
     WHERE ${s.sql} ORDER BY rr.name`, s.params);
  if (!rooms.length) { const e = new Error('No running rooms within your access.'); e.status = 403; throw e; }
  const id = +req.query.rr || rooms[0].id;
  const rr = rooms.find(r => r.id === id);
  if (!rr) { const e = new Error('That running room is outside your access.'); e.status = 403; throw e; }
  return { rooms, rr, date: (req.query.date || today()).slice(0, 10) };
}

/* ------------------------------------------------------------- laundry */
// Clause C1 makes washing at a non-approved source a deficiency, and the tender
// requires the invoice as proof. Both live here.
router.get('/laundry', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    /* Each building keeps its own linen, so a consignment leaves a building and
       comes back to it. Pooling the four would mean receiving LP Mail's bed
       sheets against TM-BB's dispatch. */
    const blocks = await blocksOf(rr.id);
    const blockId = blocks.length ? await blockIdFor(rr.id, req.query.block) : null;
    /* RECORDS MADE BEFORE THE RUNNING ROOM HAD BUILDINGS.
       Igatpuri gained four buildings on 4 September. Everything recorded
       before that carries no building — and once these screens began
       REQUIRING one before they would show anything, those rows became
       unreachable: not viewable, not correctable, not closable. A bed sheet
       sent to the wash on 3 September was still out, and no screen in the
       system could reach it, because it belongs to no building anybody can
       select.

       Found in the officer's own data, by his instinct to check the register
       before changing the arithmetic: "we did some test other day also. do we
       deleted those or showing in this? have a check."

       At IGP that was test data. The mechanism is not: LNL already stands in
       two buildings, and any running room that gains them later would lose
       sight of its whole history in the same way, silently.

       So "no building" is a place you can LOOK. It is not a place you can
       WRITE: recording still demands a building, because a round is done in
       one and linen sits on one shelf. Read to close it out, not to carry on
       using it. */
    const viewNone = blocks.length > 0 && req.query.block === 'none';
    const orphans = blocks.length
      ? await db.scalar(`SELECT COUNT(*) FROM laundry_dispatch WHERE running_room_id = ? AND block_id IS NULL`, [rr.id])
      : 0;
    const needBlock = blocks.length > 0 && !blockId && !viewNone;
    const block = blocks.find(b => b.id === blockId) || null;
    const bk = blockId || 0;

    const vendor = await db.one(`
      SELECT v.* FROM running_room_vendors rv JOIN vendors v ON v.id = rv.vendor_id
      WHERE rv.running_room_id = ? AND rv.service_type = 'laundry'
        AND (rv.effective_to IS NULL OR rv.effective_to >= CURDATE())
      ORDER BY rv.effective_from DESC LIMIT 1`, [rr.id]);
    const rows = await db.query(`
      SELECT ld.*, v.name AS vendor_name, v.is_approved
      FROM laundry_dispatch ld LEFT JOIN vendors v ON v.id = ld.vendor_id
      WHERE ld.running_room_id = ? AND COALESCE(ld.block_id,0) = ?
      ORDER BY ld.dispatch_date DESC, ld.id DESC LIMIT 40`, [rr.id, bk]);
    /* WHAT HAS ALREADY GONE TODAY.
       The officer found this by reasoning about the man, not the code: "if
       supervisor sends 20 bedsheets from daily records. later on he comes to
       facility page and forgot the earlier entry and again makes those 20
       bedsheets for send to wash. possible right? because no record shows
       today's sent items and counts in facility page."

       He is right, and it was an asymmetry rather than a missing feature. The
       daily linen register prints a "Sent to wash" column, so a man filling
       that screen can SEE he has already sent today. This page had the same
       dispatches — in a register of the last forty, by date, with no total —
       which is not the same as being able to see them.

       IT WARNS, IT DOES NOT REFUSE. A second consignment of the same item on
       the same day is perfectly ordinary: the laundry man comes twice, or a
       late bundle follows the morning one. Blocking it would make the register
       lie about a real dispatch, which is worse than a duplicate somebody can
       correct. */
    const sentTodayRows = await db.query(`
      SELECT item_type, SUM(quantity_sent) AS qty, COUNT(*) AS consignments
      FROM laundry_dispatch
      WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND dispatch_date = ?
      GROUP BY item_type`, [rr.id, bk, today()]);
    const sentToday = {}; let sentTodayTotal = 0;
    sentTodayRows.forEach(r => {
      sentToday[r.item_type] = { qty: +r.qty, consignments: +r.consignments };
      sentTodayTotal += +r.qty;
    });

    const vendors = await db.query(
      `SELECT id, name, is_approved FROM vendors WHERE vendor_type = 'laundry' AND is_active = 1 ORDER BY name`);
    // Washing at a source the Railway has not approved is a clause C1 breach in
    // its own right, separate from anything about the quality of the wash. It
    // was already marked on each row; what was missing was the count, and the
    // count is what carries into a month's deficiencies. A dispatch with no
    // vendor at all is the same breach wearing a different hat -- the linen went
    // somewhere and the register cannot say where.
    const unapproved = rows.filter(r => r.vendor_id && !r.is_approved);
    const noVendor = rows.filter(r => !r.vendor_id);

    /* Overdue, PER ITEM, on the period the executed contract actually gives.
       Bed sheets, pillow covers and mosquito nets come back next day; curtains,
       mattress covers and woollen blankets in three; a blanket cover in seven.

       This screen used to apply one flat 48 hours to everything — clause C6 as
       written in the earlier tender paper — and was therefore wrong in both
       directions at once: a bed sheet two days late passed silently, and a
       blanket cover was called a breach four days before the contract says it
       is one. Neither error showed on the screen, and both would have been
       argued at a review from a register that looked authoritative.

       An item the contract sets no period for is never flagged. Inventing one
       would be the register making up a contractual term. */
    // Every column the screen prints, not the three the flag needs. The demo
    // stub hands back the whole row whatever the SELECT list says, so asking
    // for three and printing six was green there and rendered "Rs NaN" on a
    // real database. A stub that ignores the projection cannot fail this.
    // The running room's own contract where it has one, the fallback where it
    // has not. Until stage 36 this read the fallback for every site, which was
    // right only while IGP's contract was the one the fallback was copied from.
    const sched = (await terms.scopedRows(db, await terms.contractIdFor(db, rr.id),
      (scope, p) => [`
      SELECT item_type, name, delivery_days, wash_frequency, per_bed,
             recovery_rate, schedule_qty
      FROM linen_schedule WHERE ${scope} AND is_active = 1
      ORDER BY sort_order, id`, p])).rows;
    const dueDays = {}; const itemName = {};
    sched.forEach(x => { dueDays[x.item_type] = x.delivery_days; itemName[x.item_type] = x.name; });

    const nowMs = Date.parse(today() + 'T00:00:00Z');
    rows.forEach(r => {
      r.item_name = itemName[r.item_type] || r.item_type;
      r.due_days = dueDays[r.item_type] ?? null;
      r.days_out = Math.floor(
        (nowMs - Date.parse(String(r.dispatch_date).slice(0, 10) + 'T00:00:00Z')) / 86400000);
      r.is_overdue = r.quantity_returned < r.quantity_sent
        && r.due_days !== null && r.days_out > r.due_days;
    });
    const overdue = rows.filter(r => r.is_overdue);

    /* ------------------------------------------------ THE RETURN REGISTER
       The dispatch register answers "what went out". It cannot answer "what
       came back", because it is ordered by the day the linen LEFT and a
       consignment sent three weeks ago and returned yesterday sits twenty rows
       down. A washing bill is checked the other way round -- by what arrived,
       on the day it arrived -- so the return needs a register of its own,
       ordered on the return.

       HOW FAR BACK. Not an invented number: the longest return period THIS
       running room's contract sets for any item. At IGP that is the blanket
       cover's seven days. A window shorter than the slowest item would drop a
       consignment that is still legitimately at the wash, and a register that
       hides what is still out is worse than no register.

       WHAT NEVER SCROLLS AWAY. Anything not fully back stays on this register
       however old it is, marked, at the top. Linen that never came back is the
       one thing a laundry register exists to make impossible to lose sight of,
       and it is exactly what a date window would quietly drop. */
    const windowDays = sched.reduce(
      (a, x) => (x.delivery_days !== null && x.delivery_days > a ? x.delivery_days : a), 0) || 7;
    const retRows = await db.query(`
      SELECT ld.*, v.name AS vendor_name, v.is_approved
      FROM laundry_dispatch ld LEFT JOIN vendors v ON v.id = ld.vendor_id
      WHERE ld.running_room_id = ? AND COALESCE(ld.block_id,0) = ?
        AND ( ld.quantity_returned < ld.quantity_sent
              OR (ld.returned_on IS NOT NULL
                  AND ld.returned_on >= DATE_SUB(?, INTERVAL ? DAY)) )
      ORDER BY (ld.quantity_returned < ld.quantity_sent) DESC,
               ld.returned_on DESC, ld.dispatch_date DESC, ld.id DESC
      LIMIT 200`, [rr.id, bk, today(), windowDays]);
    retRows.forEach(r => {
      r.item_name = itemName[r.item_type] || r.item_type;
      r.due_days = dueDays[r.item_type] ?? null;
      r.open = r.quantity_returned < r.quantity_sent;
      r.shortfall = r.quantity_sent - r.quantity_returned;
      r.days_out = Math.floor(
        (nowMs - Date.parse(String(r.dispatch_date).slice(0, 10) + 'T00:00:00Z')) / 86400000);
      // Whole days between going and coming back. Same day out and back is 0,
      // which is not late by any period the contract sets.
      r.days_taken = r.returned_on
        ? Math.floor((Date.parse(String(r.returned_on).slice(0, 10) + 'T00:00:00Z')
                    - Date.parse(String(r.dispatch_date).slice(0, 10) + 'T00:00:00Z')) / 86400000)
        : null;
      // Late is only ever said where the contract sets a period. An item it is
      // silent about is never called late -- inventing a period would be the
      // register making up a term of the contract.
      r.late = r.due_days !== null &&
        (r.open ? r.days_out > r.due_days : r.days_taken > r.due_days);
    });
    const stillOut = retRows.filter(r => r.open);

    res.render('facility/laundry', { title: 'Linen & laundry', section: 'laundry',
      rooms, rr, date, vendor, rows, vendors, schedule: sched,
      blocks, block, blockId, needBlock, viewNone, orphans,
      sentToday, sentTodayTotal,
      retRows, windowDays, stillOut,
      stillOutPieces: stillOut.reduce((a, r) => a + r.shortfall, 0),
      // The real today, not the page's date: a return cannot be dated ahead of
      // it, and the form should not offer what the route will refuse.
      todayStr: today(),
      pending: rows.filter(r => r.quantity_returned < r.quantity_sent).length,
      noInvoice: rows.filter(r => !r.invoice_no).length,
      unapproved, noVendor, overdue,
      overduePieces: overdue.reduce((a, r) => a + (r.quantity_sent - r.quantity_returned), 0),
      unapprovedPieces: unapproved.reduce((a, r) => a + r.quantity_sent, 0) });
  } catch (e) { next(e); }
});

// The contract names SEVEN linen items. This list carried five and an 'other',
// so a mattress cover or a blanket cover — separately priced, separately
// scheduled, separately recovered at Rs 400 and Rs 230 a unit — had nowhere to
// be recorded at all, and 'blanket' was quietly doing duty for both the woollen
// blanket and its cover. Order follows the contract's own table.
/* THE BUILDINGS A RUNNING ROOM STANDS IN.
   Most running rooms are one building and this comes back empty, which is the
   answer: there is nothing to choose between, and no screen should ask. Where
   a room does stand in several — Igatpuri in five, Lonavla in two — a thing
   fixed in a place has to say which place, or a man is sent to look for a
   water cooler across a site that is some distance end to end. */
/* A BUILDING FROM ANOTHER RUNNING ROOM IS NOT A BUILDING OF THIS ONE.
   The id arrives in a form field, so it is checked against the room rather
   than trusted: without this, a posted block_id could file an Igatpuri water
   cooler under a Lonavla building, and every per-building figure after it
   would be quietly wrong. Blank, "none", or an id that does not belong comes
   back NULL — "this running room, not any block of it". */
async function blockIdFor(runningRoomId, raw) {
  const id = +raw;
  if (!Number.isInteger(id) || id < 1) return null;
  const ok = await db.one(
    'SELECT id FROM running_room_blocks WHERE id = ? AND running_room_id = ? AND is_active = 1',
    [id, runningRoomId]);
  return ok ? id : null;
}

async function blocksOf(runningRoomId) {
  return db.query(`
    SELECT id, code, name, total_beds, physical_rooms, female_rooms,
           kitchens, cooks_here, bathrooms, toilets, facts_as_on, facts_source
    FROM running_room_blocks
    WHERE running_room_id = ? AND is_active = 1 ORDER BY sort_order, id`, [runningRoomId]);
}

/* The third hand-kept copy of the contract's item list, and the last. It
   matched IGP's schedule only because it was retyped when that contract was
   read in; the stock page's copy was not, and fell a contract behind without
   a symptom. The list comes from `linen_schedule` now — the room's own rows
   where its contract has been read in, the generic rows where it has not.
   `other` is appended because a consignment can carry something the schedule
   does not name, and a register that cannot record it would send the linen
   off the books entirely. */
async function laundryItemsFor(runningRoomId) {
  const rows = (await terms.scopedRows(db, await terms.contractIdFor(db, runningRoomId),
    (scope, p) => [`
    SELECT item_type FROM linen_schedule
    WHERE ${scope} AND is_active = 1 ORDER BY sort_order, id`, p])).rows;
  const codes = rows.map(r => r.item_type);
  if (!codes.includes('other')) codes.push('other');
  return codes.length > 1 ? codes : ['bedsheet', 'other'];
}

/**
 * A consignment goes to the wash.
 *
 * Two shapes are accepted, because they are the same event described two ways.
 *
 *   The grid    `qty_bedsheet=40&qty_pillow_cover=40&qty_mosquito_net=6`
 *               One challan, several items — which is what actually leaves the
 *               building when the laundry man comes. The bearer counts out the
 *               bundle in front of him and writes the count on the line it
 *               belongs to; he never picks an item from a list, and he never
 *               fills the form three times over for one collection.
 *
 *   One line    `item_type=bedsheet&quantity_sent=40`
 *               The older single-item form, kept because a correction entered
 *               afterwards is genuinely about one item.
 *
 * Either way the database gets one row per item type, because that is how the
 * washing is paid for and how the return has to be checked. The grid is a way
 * of writing, not a different record.
 */
router.post('/laundry', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const n = k => Math.max(0, parseInt(req.body[k], 10) || 0);

    // Re-checked, not trusted from the form: a posted block id from another
    // running room would send Igatpuri's linen out of a Lonavla building.
    const postBlocks = await blocksOf(rrId);
    const postBlockId = postBlocks.length ? await blockIdFor(rrId, req.body.block) : null;
    if (postBlocks.length && !postBlockId) {
      const e = new Error('Which building is this linen going from? Each keeps its own.');
      e.status = 400; throw e;
    }

    /* WHERE THE LINEN IS COMING FROM.
       Used linen off the beds — almost every dispatch — was never on the fresh
       shelf, so the shelf figure is right to ignore it. Linen taken off the
       shelf and sent was on it, and the shelf must drop by that much or the
       same pieces are counted twice: once on the shelf, once at the wash. */
    const fromPool = req.body.from_pool === 'shelf' ? 'shelf' : 'used';

    const vendorId = +req.body.vendor_id || null;
    const dispatchDate = String(req.body.dispatch_date || today()).slice(0, 10);
    const invoice = String(req.body.invoice_no || '').trim().slice(0, 60) || null;

    // Linen that has not left the building yet cannot be on the register as
    // having left. The date box is capped in the browser too, but the cap in
    // the browser is a convenience and this is the rule.
    if (dispatchDate > today()) {
      const e = new Error('A dispatch cannot be dated in the future. The linen has not gone yet.');
      e.status = 400; throw e;
    }
    /* A DISPATCH RECORDS A DISPATCH, AND NOTHING ELSE.
       This form used to carry "Quantity returned" and "Returned on" boxes of
       its own. Filling them did not close the consignment that was actually
       out at the wash -- it wrote a NEW row that was born already returned.
       So the linen still showed as out, the overdue clock kept running, and
       the register held a return that belonged to no batch. A return is taken
       against the consignment it went out on, in the panel above the register,
       and there is now no second way to type one. */

    // The whole consignment shares its challan, its vendor and its date. Only
    // the counts differ by item.
    const LAUNDRY_ITEMS = await laundryItemsFor(rrId);
    let lines = LAUNDRY_ITEMS
      .map(code => ({ code, qty: n(`qty_${code}`) }))
      .filter(l => l.qty > 0);

    if (!lines.length) {
      const code = LAUNDRY_ITEMS.includes(req.body.item_type) ? req.body.item_type : 'bedsheet';
      const qty = n('quantity_sent');
      if (!qty) {
        const e = new Error('Nothing was entered. Put a count against at least one item.');
        e.status = 400; throw e;
      }
      lines = [{ code, qty }];
    }

    for (const line of lines) {
      await db.execute(`
        INSERT INTO laundry_dispatch (running_room_id, block_id, vendor_id, dispatch_date, item_type,
          from_pool, quantity_sent, quantity_returned, returned_on, invoice_no, quality_ok,
          quality_remarks, recorded_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [rrId, postBlockId, vendorId, dispatchDate, line.code, fromPool,
         line.qty, 0, null, invoice, null,
         String(req.body.quality_remarks || '').trim().slice(0, 300) || null, req.user.id]);
    }

    await audit.record(req, { table: 'laundry_dispatch', id: rrId, action: 'insert',
      after: { running_room_id: rrId, dispatch_date: dispatchDate, invoice_no: invoice,
               items: lines.map(l => `${l.code}:${l.qty}`).join(', ') } });
    res.redirect(backTo(req, rrId, postBlockId) + (req.body.back === 'linen' ? `&sent=${lines.length}` : ''));
  } catch (e) { next(e); }
});

/**
 * Where to return after a laundry entry.
 *
 * The dispatch and the return are both filled from two places now — the laundry
 * page itself, and the supervisor's daily linen page, which shows the wash
 * cycle beside the day's issues so he does his whole day on one screen. The
 * record is the same either way; only the way back differs.
 */
function backTo(req, rrId, blockId) {
  const date = String(req.body.back_date || '').slice(0, 10);
  // The building goes back with him. Landing on "choose a building" after
  // saving is the screen forgetting where he was standing.
  const blk = blockId ? `&block=${blockId}` : '';
  if (req.body.back === 'linen' && /^\d{4}-\d{2}-\d{2}$/.test(date))
    return `${cfg.basePath}/records/linen?rr=${rrId}&date=${date}${blk}`;
  return `${cfg.basePath}/facility/laundry?rr=${rrId}${blk}`;
}

/**
 * The laundry man brings the washed linen back.
 *
 * Recorded against the dispatch it went out on, never as a loose number. That
 * is the whole reason the daily register no longer carries a "fresh received"
 * column: a returned bundle belongs to a particular consignment, sent on a
 * particular date to a particular vendor, and the shortfall between sent and
 * returned is only visible if the two stay tied together.
 */
router.post('/laundry/:id/return', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    if (!Number.isInteger(id) || id < 1) { const e = new Error('Not found.'); e.status = 404; throw e; }
    const row = await db.one(`SELECT * FROM laundry_dispatch WHERE id = ?`, [id]);
    if (!row) { const e = new Error('That dispatch is not on record.'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, row.running_room_id);

    const returned = Math.max(0, parseInt(req.body.quantity_returned, 10) || 0);
    // More back than went out is a keying error, not a windfall.
    if (returned > row.quantity_sent) {
      const e = new Error(`Only ${row.quantity_sent} were sent on ${String(row.dispatch_date).slice(0, 10)}; ${returned} cannot come back.`);
      e.status = 400; throw e;
    }
    const on = String(req.body.returned_on || today()).slice(0, 10);
    if (on > today()) {
      const e = new Error('A return cannot be dated in the future.'); e.status = 400; throw e;
    }
    if (on < String(row.dispatch_date).slice(0, 10)) {
      const e = new Error(`The linen cannot have come back on ${on}; it was sent on ${String(row.dispatch_date).slice(0, 10)}.`);
      e.status = 400; throw e;
    }

    await db.execute(`
      UPDATE laundry_dispatch
         SET quantity_returned = ?, returned_on = ?, quality_ok = ?, quality_remarks = ?
       WHERE id = ?`,
      [returned, returned > 0 ? on : null,
       req.body.quality_ok === '1' ? 1 : req.body.quality_ok === '0' ? 0 : null,
       String(req.body.quality_remarks || '').trim().slice(0, 300) || null, id]);

    await audit.record(req, { table: 'laundry_dispatch', id, action: 'update',
      before: { quantity_returned: row.quantity_returned, returned_on: row.returned_on },
      after: { quantity_returned: returned, returned_on: on } });
    res.redirect(backTo(req, row.running_room_id, row.block_id));
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ CCTV */
/**
 * The CCTV obligation: what is installed, and what was found working.
 *
 * The contract names four places that must be covered — kitchen, dining area,
 * corridors, entrance. The screen answers two questions an inspecting officer
 * actually asks: is every required place covered at all, and of the cameras
 * that exist, which were last seen working and recording.
 *
 * There is no live picture and no stream address. See the migration for why:
 * a URL that reaches a camera carries the credentials that reach it, and a tile
 * showing a picture invites the belief that the system is watching, when all it
 * can honestly say is what somebody last verified.
 */
const CCTV_ZONES = [
  ['kitchen', 'Kitchen', true], ['dining', 'Dining area', true],
  ['corridor', 'Corridors', true], ['entrance', 'Entrance', true],
  ['store', 'Store', false], ['other', 'Elsewhere', false],
];

router.get('/cctv', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const cameras = await db.query(`
      SELECT c.*, k.checked_on, k.is_working AS last_working, k.recording_ok AS last_recording,
             k.footage_days_seen, k.remarks AS last_remarks, u.full_name AS checked_by_name
      FROM cctv_cameras c
      LEFT JOIN cctv_checks k ON k.id = (
        SELECT k2.id FROM cctv_checks k2 WHERE k2.camera_id = c.id
        ORDER BY k2.checked_on DESC, k2.id DESC LIMIT 1)
      LEFT JOIN users u ON u.id = k.checked_by
      LEFT JOIN running_room_blocks bl ON bl.id = c.block_id
      WHERE c.running_room_id = ?
      ORDER BY bl.sort_order IS NULL, bl.sort_order, c.is_active DESC,
               FIELD(c.zone, 'kitchen','dining','corridor','entrance','store','other'), c.label`,
      [rr.id]);

    const blocks = await blocksOf(rr.id);
    const wantBlock = /^\d+$/.test(String(req.query.block || '')) ? +req.query.block
      : (req.query.block === 'none' ? 'none' : null);

    const live = cameras.filter(c => c.is_active);

    /* COVER IS ABOUT A PLACE, AND A PLACE IS IN A BUILDING.
       One working camera in the kitchen satisfies the kitchen — but a camera
       in LP Mail's corridor does not watch TM-BB's, and pooling the four would
       have reported Igatpuri fully covered on four cameras in one building
       while three buildings had none. So the test is struck per building where
       a running room stands in several.

       The kitchen is the exception, and it is the contract's own: only one
       building cooks. A building with no kitchen is not in breach for having
       no kitchen camera, exactly as a running room with no meal facility is
       not. */
    const zonesFor = (list, hasKitchen) => CCTV_ZONES.map(([code, label, required]) => {
      const mine = list.filter(c => c.zone === code);
      const applies = required && (code !== 'kitchen' || hasKitchen);
      return { code, label, required: applies, count: mine.length,
        working: mine.filter(c => c.last_working).length,
        uncovered: applies && !mine.length };
    });
    const zones = zonesFor(
      blocks.length && wantBlock && wantBlock !== 'none'
        ? live.filter(c => c.block_id === wantBlock)
        : live,
      blocks.length && wantBlock && wantBlock !== 'none'
        ? !!(blocks.find(b => b.id === wantBlock) || {}).kitchens
        : rr.has_meal_facility);

    // Each building's own verdict, so the officer sees at a glance which is
    // uncovered rather than opening four screens.
    blocks.forEach(b => {
      const mine = live.filter(c => c.block_id === b.id);
      b.cameras = mine.length;
      b.uncovered = zonesFor(mine, !!b.kitchens).filter(z => z.uncovered).length;
    });
    const unplacedCams = blocks.length ? live.filter(c => !c.block_id).length : 0;

    const staleDays = c => c.checked_on
      ? Math.floor((new Date(date) - new Date(String(c.checked_on).slice(0, 10))) / 86400000) : null;
    live.forEach(c => { c.stale_days = staleDays(c); });

    res.render('facility/cctv', { title: 'CCTV', section: 'cctv',
      rooms, rr, date,
      cameras: (blocks.length && wantBlock)
        ? cameras.filter(c => wantBlock === 'none' ? !c.block_id : c.block_id === wantBlock)
        : cameras,
      live, zones, allZones: CCTV_ZONES,
      blocks, wantBlock, unplacedCams,
      uncovered: zones.filter(z => z.uncovered),
      notWorking: live.filter(c => c.checked_on && !c.last_working),
      notRecording: live.filter(c => c.checked_on && c.last_working && c.last_recording === 0),
      neverChecked: live.filter(c => !c.checked_on) });
  } catch (e) { next(e); }
});

router.post('/cctv', requirePermission('cctv.record'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const zone = String(req.body.zone || '');
    if (!CCTV_ZONES.some(z => z[0] === zone)) { const e = new Error('Choose where the camera is.'); e.status = 400; throw e; }
    const label = String(req.body.label || '').trim().slice(0, 80);
    if (!label) { const e = new Error('Give the camera a name the running room will recognise.'); e.status = 400; throw e; }
    // A camera is bolted to a wall in one building. Cover is judged per
    // building, so a camera with none counts towards nobody's cover.
    const camBlock = await blockIdFor(rrId, req.body.block);
    const ins = await db.execute(`
      INSERT INTO cctv_cameras (running_room_id, block_id, zone, label, location_note,
        installed_on, added_by)
      VALUES (?,?,?,?,?,?,?)`,
      [rrId, camBlock, zone, label, String(req.body.location_note || '').trim().slice(0, 200) || null,
       req.body.installed_on || null, req.user.id]);
    await audit.record(req, { table: 'cctv_cameras', id: ins.insertId, action: 'insert',
      after: { running_room_id: rrId, block_id: camBlock, zone, label } });
    res.redirect(`${cfg.basePath}/facility/cctv?rr=${rrId}` + (camBlock ? `&block=${camBlock}` : ''));
  } catch (e) { next(e); }
});

/** The day's check: every camera on the form, working and recording. */
router.post('/cctv/check', requirePermission('cctv.record'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const on = String(req.body.checked_on || today()).slice(0, 10);
    if (on > today()) { const e = new Error('A check cannot be dated in the future.'); e.status = 400; throw e; }

    const mine = new Set((await db.query(
      'SELECT id FROM cctv_cameras WHERE running_room_id = ? AND is_active = 1', [rrId])).map(r => r.id));
    let n = 0;
    for (const id of mine) {
      // A camera the officer did not look at is left alone. Writing "working"
      // for a camera nobody checked is the one thing this register must not do.
      if (!req.body[`seen_${id}`]) continue;
      const working = req.body[`w_${id}`] === '1';
      const rec = !working ? 0 : req.body[`r_${id}`] === '1' ? 1 : 0;
      const days = String(req.body[`d_${id}`] || '').trim();
      await db.execute(`
        INSERT INTO cctv_checks (camera_id, checked_on, is_working, recording_ok,
          footage_days_seen, checked_by, remarks)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE is_working = VALUES(is_working),
          recording_ok = VALUES(recording_ok), footage_days_seen = VALUES(footage_days_seen),
          checked_by = VALUES(checked_by), remarks = VALUES(remarks)`,
        [id, on, working ? 1 : 0, rec, days === '' ? null : Math.max(0, parseInt(days, 10) || 0),
         req.user.id, String(req.body[`rem_${id}`] || '').trim().slice(0, 300) || null]);
      n++;
    }
    await audit.record(req, { table: 'cctv_checks', id: rrId, action: 'update',
      after: { running_room_id: rrId, checked_on: on, cameras: n } });
    res.redirect(`${cfg.basePath}/facility/cctv?rr=${rrId}`);
  } catch (e) { next(e); }
});

/** Retiring a camera reduces the contractor's cover, so it is the Railway's. */
router.post('/cctv/:id/retire', requirePermission('rr.edit'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const cam = await db.one('SELECT id, running_room_id, label FROM cctv_cameras WHERE id = ?', [id]);
    if (!cam) { const e = new Error('No such camera.'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, cam.running_room_id);
    const why = String(req.body.retired_reason || '').trim().slice(0, 200);
    if (!why) { const e = new Error('Say why the camera is coming off the register.'); e.status = 400; throw e; }
    await db.execute(
      'UPDATE cctv_cameras SET is_active = 0, retired_on = CURDATE(), retired_reason = ? WHERE id = ?',
      [why, id]);
    await audit.record(req, { table: 'cctv_cameras', id, action: 'update',
      before: { is_active: 1 }, after: { is_active: 0, retired_reason: why } });
    res.redirect(`${cfg.basePath}/facility/cctv?rr=${cam.running_room_id}`);
  } catch (e) { next(e); }
});

/* --------------------------------------------------------- consumables */
router.get('/consumables', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const items = await db.query(
      // The contract wins WITHIN A CATEGORY it has spoken about, and nowhere
      // else. IGP's contract names four publications; it says nothing about
      // dustbins and buckets, so those keep the generic Schedule-D rows.
      `SELECT ci.* FROM consumable_items ci
        WHERE ci.is_active = 1
          AND ( ci.contract_id = ?
                OR ( ci.contract_id IS NULL
                     AND NOT EXISTS (SELECT 1 FROM consumable_items c2
                                      WHERE c2.contract_id = ? AND c2.is_active = 1
                                        AND c2.category <=> ci.category) ) )
        -- Grouped by category, not by name. A flat alphabetical list puts
        -- "Air freshener perfume" beside "Big dust bin" beside "India Today" --
        -- three different kinds of obligation, checked by different people at
        -- different times. The page reads them as groups, so the query hands
        -- them over already grouped. Uncategorised rows (uniform, shoes) last.
        ORDER BY ci.category IS NULL, ci.category, ci.schedule_code, ci.name`,
      (id => [id, id])(await terms.contractIdFor(db, rr.id) || 0));
    const rows = await db.query(`
      SELECT ci.*, i.name, i.unit, i.supply_frequency, i.approved_brands, i.schedule_code
      FROM consumable_issues ci JOIN consumable_items i ON i.id = ci.consumable_item_id
      WHERE ci.running_room_id = ?
      ORDER BY ci.due_date DESC, i.name LIMIT 60`, [rr.id]);
    res.render('facility/consumables', { title: 'Consumables', section: 'consumables',
      rooms, rr, date, items, rows,
      short: rows.filter(r => r.quantity_supplied < r.quantity_due).length });
  } catch (e) { next(e); }
});

router.post('/consumables', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const due = Math.max(0, parseInt(req.body.quantity_due, 10) || 0);
    const sup = Math.max(0, parseInt(req.body.quantity_supplied, 10) || 0);
    const dueDate = req.body.due_date || today();
    const suppliedOn = req.body.supplied_on || null;
    const shortDays = suppliedOn && suppliedOn > dueDate
      ? Math.round((new Date(suppliedOn) - new Date(dueDate)) / 86400000) : 0;
    await db.execute(`
      INSERT INTO consumable_issues (running_room_id, consumable_item_id, due_date, supplied_on,
        quantity_due, quantity_supplied, brand_supplied, acknowledged_by, shortfall_days, remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [rrId, +req.body.consumable_item_id, dueDate, suppliedOn, due, sup,
       String(req.body.brand_supplied || '').trim().slice(0, 120) || null, req.user.id, shortDays,
       String(req.body.remarks || '').trim().slice(0, 300) || null]);
    await audit.record(req, { table: 'consumable_issues', id: rrId, action: 'insert',
      after: { running_room_id: rrId, item: +req.body.consumable_item_id, due, supplied: sup } });
    res.redirect(`${cfg.basePath}/facility/consumables?rr=${rrId}`);
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------- assets */
// The tender hands Railway assets over under a joint note and gives 24 hours to
// rectify a defect, so the clock is the point of this page.
router.get('/assets', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const blocks = await blocksOf(rr.id);
    // The building filter. A supervisor at Igatpuri walks one block at a time,
    // and a register of six buildings' assets in one list is not the register
    // he is standing in front of.
    const wantBlock = /^\d+$/.test(String(req.query.block || '')) ? +req.query.block
      : (req.query.block === 'none' ? 'none' : null);
    const blockWhere = wantBlock === 'none' ? ' AND a.block_id IS NULL'
      : (wantBlock ? ' AND a.block_id = ' + wantBlock : '');
    const rows = await db.query(`
      SELECT a.*, bl.name AS block_name, bl.code AS block_code, bl.is_active AS block_live,
             (SELECT COUNT(*) FROM asset_breakdowns b WHERE b.asset_id = a.id AND b.status = 'open') AS open_faults
      FROM assets a LEFT JOIN running_room_blocks bl ON bl.id = a.block_id
      WHERE a.running_room_id = ?${blockWhere}
      ORDER BY bl.sort_order IS NULL, bl.sort_order, a.owned_by, a.name`, [rr.id]);
    // How many assets have no building against them, across the whole room —
    // not just within the current filter, or the count would vanish the moment
    // somebody filtered and look like nothing to fix.
    /* NO BUILDING IS NOT THE SAME AS "SOMEBODY FORGOT".
       A water cooler is bolted to a wall in one building and a row without one
       is unfinished work. The contractor's Part-C supplies — the cots, the
       mattresses, the foot massagers — are "for use of running room" in the
       contract's own words, and belong to Igatpuri rather than to any building
       in it. Counting those as unplaced would leave a red six on the screen
       for ever, pointing at nothing anybody can fix, and a warning that can
       never be cleared is a warning people learn to ignore. */
    const noBlock = blocks.length
      ? await db.scalar('SELECT COUNT(*) FROM assets WHERE running_room_id = ? AND block_id IS NULL', [rr.id])
      : 0;
    const unplaced = blocks.length
      ? await db.scalar(`SELECT COUNT(*) FROM assets
                          WHERE running_room_id = ? AND block_id IS NULL AND owned_by = 'railway'`, [rr.id])
      : 0;
    const faults = await db.query(`
      SELECT b.*, a.name AS asset_name, a.owned_by,
             TIMESTAMPDIFF(HOUR, b.reported_at, NOW()) AS hours_open
      FROM asset_breakdowns b JOIN assets a ON a.id = b.asset_id
      WHERE a.running_room_id = ? ORDER BY (b.status = 'open') DESC, b.reported_at DESC LIMIT 40`, [rr.id]);
    // The tender allows 24 hours to rectify. An open fault older than that is
    // already past the clock; a closed one is judged on hours_to_rectify.
    /* JUDGED BY THE DATABASE, for the reason given in src/auth/local.js: a
       DATETIME read back carries the running room's wall time, and comparing it
       with a JavaScript clock on a UTC server shifts every fault five and a
       half hours younger than it is -- so a fault open for thirty hours would
       not be counted as past its 24. Wrong in the direction that hides a
       breach, which is the direction that matters. The query now returns the
       age itself. */

    // The three-monthly joint check. Overdue is not a matter of opinion: the
    // tender says every three months, so ninety days since the last one is the
    // fact the screen states.
    const checks = await db.query(`
      SELECT c.*, u.full_name AS checked_by_name,
             (SELECT COUNT(*) FROM asset_check_items i WHERE i.check_id = c.id) AS items,
             (SELECT COUNT(*) FROM asset_check_items i WHERE i.check_id = c.id
               AND (i.quantity_found < i.quantity_expected OR i.condition_status = 'missing')) AS short
      FROM asset_checks c LEFT JOIN users u ON u.id = c.checked_by
      WHERE c.running_room_id = ? ORDER BY c.checked_on DESC LIMIT 12`, [rr.id]);
    const lastCheck = checks[0] || null;
    const daysSince = lastCheck
      ? Math.floor((new Date(date) - new Date(String(lastCheck.checked_on).slice(0, 10))) / 86400000)
      : null;

    /* The catalogue the "what it is" box picks from. A free-text name let one
     * In-charge write "Cot" and the next "Cott", and a register that holds the
     * same thing under two names cannot be counted. Grouped by category so a
     * list of thirty is still readable. */
    const catalogue = await db.query(
      `SELECT id, name, category FROM asset_items WHERE is_active = 1
        ORDER BY COALESCE(category, 'zz'), name`);
    const catGroups = [];
    catalogue.forEach(i => {
      const g = catGroups.find(x => x.category === (i.category || 'Other'));
      if (g) g.items.push(i); else catGroups.push({ category: i.category || 'Other', items: [i] });
    });

    res.render('facility/assets', { accepted: uploads.ACCEPTED, title: 'Assets', section: 'assets',
      rooms, rr, date, rows, faults, checks, lastCheck, daysSince, catGroups,
      blocks, wantBlock, unplaced, noBlock,
      checkOverdue: daysSince === null || daysSince > 90,
      short: req.query.short || null,
      railwayAssets: rows.filter(a => a.owned_by === 'railway' && !a.returned_on),
      open: faults.filter(f => f.status === 'open').length,
      overdue: faults.filter(f => f.status === 'open'
        ? f.hours_open > 24
        : f.hours_to_rectify !== null && f.hours_to_rectify > 24).length });
  } catch (e) { next(e); }
});

/**
 * Putting an asset on the register.
 *
 * General Instruction 1 requires a joint accountal record of Railway movable
 * items and fixed fittings, with copies held by the depot In-charge, the
 * Sr.DEE office and the contractor. The table has carried `handed_over_on`,
 * `joint_note_file_id` and `returned_on` since stage 6 and there was no way to
 * create a row — so every asset in the system arrived through a loader, and the
 * recovery clause A10 provides for rested on nothing.
 */
router.post('/assets', requirePermission('asset.manage'), uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    /* PICK FROM THE LIST, OR ADD TO THE LIST.
     *
     * `item_id` is a catalogue entry. `new_name` is the escape hatch for a thing
     * nobody has listed -- and it does not just get typed into this one asset:
     * it JOINS the catalogue, so the second person to receive one picks it
     * rather than spelling it his own way. A list that cannot grow is worse than
     * free text, because the man on the site stuffs a real asset into the
     * nearest wrong name.
     *
     * The match key is the name with everything but letters and digits removed,
     * lower case, so "Water cooler", "water-cooler" and "Water Cooler " cannot
     * become three entries. An existing entry is REUSED, never duplicated.
     */
    const key = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let itemId = +req.body.item_id || null;
    let name = '';
    if (itemId) {
      const it = await db.one('SELECT id, name FROM asset_items WHERE id = ?', [itemId]);
      if (!it) { const e = new Error('That item is not on the list.'); e.status = 400; throw e; }
      name = it.name;
    } else {
      const typed = String(req.body.new_name || '').trim().slice(0, 120);
      if (!typed) { const e = new Error('Choose what it is, or type a new one.'); e.status = 400; throw e; }
      const existing = await db.one('SELECT id, name FROM asset_items WHERE match_key = ?', [key(typed)]);
      if (existing) { itemId = existing.id; name = existing.name; }
      else {
        /* A MISSPELLING IS NOT A NEW ITEM.
         *
         * Matching on the reduced key collapses "Water cooler", "water-cooler"
         * and "Water Cooler " into one entry. It cannot collapse "Cott" into
         * "Cot" -- and nothing can, safely: "Cot" and "Cots" are the same thing,
         * "Fan" and "Pan" are not, and a system that merged them by guessing
         * would corrupt the register in the other direction.
         *
         * So it asks instead of guessing. A name within one or two letters of
         * something already on the list is refused until the person says it is
         * genuinely a different thing. He is told which name it resembles, so
         * the usual answer is to go back and pick that one.
         */
        const near = (await db.query('SELECT id, name, match_key FROM asset_items WHERE is_active = 1'))
          .map(i => ({ ...i, d: editDistance(key(typed), i.match_key) }))
          .filter(i => i.d <= (key(typed).length <= 5 ? 1 : 2))
          .sort((a, b) => a.d - b.d)[0];
        if (near && req.body.confirm_new !== '1') {
          const e = new Error(
            `"${typed}" is very close to "${near.name}", which is already on the list. `
            + `If it is the same thing, choose "${near.name}" instead. If it really is a different `
            + `item, tick "this is a different thing" and add it again.`);
          e.status = 400; throw e;
        }
        const ins = await db.execute(`
          INSERT INTO asset_items (name, match_key, category, source_ref, created_by)
          VALUES (?,?,?,?,?)`,
          [typed, key(typed), String(req.body.category || '').trim().slice(0, 80) || null,
           'Added from the asset register by the running room', req.user.id]);
        itemId = ins.insertId; name = typed;
        await audit.record(req, { table: 'asset_items', id: itemId, action: 'insert',
          after: { name: typed } });
      }
    }
    const owned = req.body.owned_by === 'contractor' ? 'contractor' : 'railway';

    /* The category comes from the catalogue unless he typed one. He picked
     * "Water cooler", which the catalogue already files under Drinking water --
     * making him type it again only produces the blank he left. */
    let category = String(req.body.category || '').trim().slice(0, 80);
    if (!category && itemId) {
      const it = await db.one('SELECT category FROM asset_items WHERE id = ?', [itemId]);
      if (it && it.category) category = it.category;
    }

    let fileId = null;
    if (req.files && req.files.length) fileId = await uploads.store(req.files[0],
      { entityTable: 'assets', entityId: null, userId: req.user.id });

    const ins = await db.execute(`
      INSERT INTO assets (running_room_id, block_id, asset_code, name, item_id, category, owned_by,
        quantity, condition_status, handed_over_on, joint_note_file_id, remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [rrId, await blockIdFor(rrId, req.body.block_id),
       String(req.body.asset_code || '').trim().slice(0, 40) || null, name, itemId,
       category || null, owned,
       Math.max(1, parseInt(req.body.quantity, 10) || 1),
       ['good','serviceable','defective','condemned'].includes(req.body.condition_status)
         ? req.body.condition_status : 'good',
       req.body.handed_over_on || null, fileId,
       String(req.body.remarks || '').trim().slice(0, 300) || null]);
    await audit.record(req, { table: 'assets', id: ins.insertId, action: 'insert',
      after: { running_room_id: rrId, name, owned_by: owned } });
    res.redirect(`${cfg.basePath}/facility/assets?rr=${rrId}`);
  } catch (e) { next(e); }
});

/**
 * Correcting an asset already on the register.
 *
 * There was no way to. An asset could be added and it could be RETURNED or
 * written off, and nothing in between -- so a row entered with the category
 * left blank, or the wrong quantity, or the wrong condition, stayed wrong for
 * the life of the contract. The only remedy was to write it off and add it
 * again, which puts a false disposal in the record of a thing that was never
 * disposed of.
 *
 * The NAME is corrected by choosing a different catalogue item, never by typing
 * over it: that is the whole point of the catalogue. Everything else is a plain
 * field. The change is audited with what it was before, because an asset
 * register that can be edited silently is not evidence of anything.
 */
router.post('/assets/:id/edit', requirePermission('asset.manage'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const before = await db.one('SELECT * FROM assets WHERE id = ?', [id]);
    if (!before) { const e = new Error('No such asset.'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, before.running_room_id);

    let itemId = +req.body.item_id || null;
    let name = before.name;
    if (itemId && itemId !== before.item_id) {
      const it = await db.one('SELECT id, name, category FROM asset_items WHERE id = ?', [itemId]);
      if (!it) { const e = new Error('That item is not on the list.'); e.status = 400; throw e; }
      name = it.name;
    } else if (!itemId) {
      itemId = before.item_id;
    }

    const after = {
      name,
      item_id: itemId,
      // An asset that was put on the register before the buildings were known
      // gets its building here — which is how the existing six at Igatpuri are
      // placed, one edit apiece, rather than by a script guessing.
      block_id: await blockIdFor(before.running_room_id, req.body.block_id),
      category: String(req.body.category || '').trim().slice(0, 80) || null,
      owned_by: req.body.owned_by === 'contractor' ? 'contractor' : 'railway',
      quantity: Math.max(1, parseInt(req.body.quantity, 10) || 1),
      condition_status: ['good', 'serviceable', 'defective', 'condemned']
        .includes(req.body.condition_status) ? req.body.condition_status : before.condition_status,
      handed_over_on: req.body.handed_over_on || null,
      asset_code: String(req.body.asset_code || '').trim().slice(0, 40) || null,
      remarks: String(req.body.remarks || '').trim().slice(0, 300) || null,
    };

    await db.execute(`
      UPDATE assets SET name = ?, item_id = ?, block_id = ?, category = ?, owned_by = ?, quantity = ?,
             condition_status = ?, handed_over_on = ?, asset_code = ?, remarks = ?
       WHERE id = ?`,
      [after.name, after.item_id, after.block_id, after.category, after.owned_by, after.quantity,
       after.condition_status, after.handed_over_on, after.asset_code, after.remarks, id]);
    await audit.record(req, { table: 'assets', id, action: 'update', before, after });
    res.redirect(`${cfg.basePath}/facility/assets?rr=${before.running_room_id}&edited=1`);
  } catch (e) { next(e); }
});

/** Returning a Railway asset at the end, or writing one off. */
router.post('/assets/:id/close', requirePermission('asset.manage'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const a = await db.one('SELECT id, running_room_id, name FROM assets WHERE id = ?', [id]);
    if (!a) { const e = new Error('No such asset.'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, a.running_room_id);
    const how = String(req.body.how || '');
    if (how === 'returned') {
      await db.execute('UPDATE assets SET returned_on = ?, remarks = ? WHERE id = ?',
        [req.body.returned_on || today(),
         String(req.body.remarks || '').trim().slice(0, 300) || null, id]);
    } else if (how === 'condemned') {
      await db.execute("UPDATE assets SET condition_status = 'condemned', remarks = ? WHERE id = ?",
        [String(req.body.remarks || '').trim().slice(0, 300) || null, id]);
    } else { const e = new Error('Say whether it was returned or condemned.'); e.status = 400; throw e; }
    await audit.record(req, { table: 'assets', id, action: 'update', after: { how } });
    res.redirect(`${cfg.basePath}/facility/assets?rr=${a.running_room_id}`);
  } catch (e) { next(e); }
});

/**
 * The three-monthly joint check.
 *
 * General Instruction 2: items handed over by the Railway are jointly inspected
 * every three months, and the full cost of damaged or short material is
 * recovered from the contractor at Railway purchasing cost. Without this the
 * recovery has no basis — nobody can say what was there in April and gone in
 * July.
 *
 * The contractor's representative is named as a condition of filing, because a
 * check that is not joint proves nothing against him.
 */
router.post('/assets/check', requirePermission('deficiency.record'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const on = String(req.body.checked_on || today()).slice(0, 10);
    if (on > today()) { const e = new Error('A joint check cannot be dated in the future.'); e.status = 400; throw e; }
    const rep = String(req.body.contractor_rep || '').trim().slice(0, 150);
    if (!rep) {
      const e = new Error('Name the contractor\'s representative who was present. '
        + 'A check that is not joint proves nothing against him.');
      e.status = 400; throw e;
    }

    const assets = await db.query(
      `SELECT id, name, quantity FROM assets
       WHERE running_room_id = ? AND owned_by = 'railway' AND returned_on IS NULL`, [rrId]);

    const ins = await db.execute(`
      INSERT INTO asset_checks (running_room_id, checked_on, checked_by, contractor_rep, remarks)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE checked_by = VALUES(checked_by),
        contractor_rep = VALUES(contractor_rep), remarks = VALUES(remarks)`,
      [rrId, on, req.user.id, rep, String(req.body.remarks || '').trim().slice(0, 500) || null]);

    let checkId = ins.insertId;
    if (!checkId) {
      const row = await db.one(
        'SELECT id FROM asset_checks WHERE running_room_id = ? AND checked_on = ?', [rrId, on]);
      checkId = row ? row.id : null;
    }
    if (!checkId) { const e = new Error('The check could not be recorded.'); e.status = 500; throw e; }

    let short = 0;
    for (const a of assets) {
      if (!req.body[`seen_${a.id}`]) continue;      // not looked at: left alone
      const found = Math.max(0, parseInt(req.body[`f_${a.id}`], 10) || 0);
      const cond = ['good','serviceable','defective','condemned','missing'].includes(req.body[`s_${a.id}`])
        ? req.body[`s_${a.id}`] : 'good';
      await db.execute(`
        INSERT INTO asset_check_items (check_id, asset_id, quantity_expected, quantity_found,
          condition_status, remarks)
        VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE quantity_expected = VALUES(quantity_expected),
          quantity_found = VALUES(quantity_found), condition_status = VALUES(condition_status),
          remarks = VALUES(remarks)`,
        [checkId, a.id, a.quantity, found, cond,
         String(req.body[`r_${a.id}`] || '').trim().slice(0, 300) || null]);
      // The condition on the asset itself follows the check, so the register
      // reads as the last joint check left it rather than as it was handed over.
      if (cond !== 'missing')
        await db.execute('UPDATE assets SET condition_status = ? WHERE id = ?', [cond, a.id]);
      if (found < a.quantity || cond === 'missing') short++;
    }

    await audit.record(req, { table: 'asset_checks', id: checkId, action: 'update',
      after: { running_room_id: rrId, checked_on: on, contractor_rep: rep, short } });
    res.redirect(`${cfg.basePath}/facility/assets?rr=${rrId}&short=${short}`);
  } catch (e) { next(e); }
});

router.post('/assets/fault', requirePermission('stay.manage'),
  uploads.upload.any(), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const assetId = +req.body.asset_id;
    const a = await db.one('SELECT id, running_room_id FROM assets WHERE id = ?', [assetId]);
    if (!a || a.running_room_id !== rrId) { const e = new Error('That asset is not at this running room.'); e.status = 400; throw e; }
    /* The photograph is stored BEFORE the row, so a file that fails to store --
     * a corrupt upload, a type the magic bytes refuse -- leaves no half-written
     * breakdown behind. store() returns null rather than throwing on a file it
     * will not take, and null is a defect reported without a picture, which is
     * a defect reported. */
    let photoId = null;
    if (req.files && req.files.length)
      photoId = await uploads.store(req.files[0],
        { entityTable: 'asset_breakdowns', entityId: null, userId: req.user.id });

    const ins = await db.execute(`
      INSERT INTO asset_breakdowns (asset_id, reported_at, reported_by, description,
        photo_file_id, status)
      VALUES (?, NOW(), ?, ?, ?, 'open')`,
      [assetId, req.user.id, String(req.body.description || '').trim().slice(0, 400) || 'Reported defective',
       photoId]);
    await audit.record(req, { table: 'asset_breakdowns', id: ins.insertId, action: 'insert',
      after: { asset_id: assetId, running_room_id: rrId, photo: photoId ? 'attached' : null } });
    res.redirect(`${cfg.basePath}/facility/assets?rr=${rrId}`);
  } catch (e) { next(e); }
});

router.post('/assets/fault/:id/rectify', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const f = await db.one(`
      SELECT b.id, a.running_room_id FROM asset_breakdowns b JOIN assets a ON a.id = b.asset_id
      WHERE b.id = ?`, [id]);
    if (!f) { const e = new Error('Not found'); e.status = 404; throw e; }
    await assertRunningRoomAccess(db, req.user, f.running_room_id);
    await db.execute(
      `UPDATE asset_breakdowns SET rectified_at = NOW(), status = 'rectified', remarks = ? WHERE id = ?`,
      [String(req.body.remarks || '').trim().slice(0, 300) || null, id]);
    await audit.record(req, { table: 'asset_breakdowns', id, action: 'update', after: { status: 'rectified' } });
    res.redirect(`${cfg.basePath}/facility/assets?rr=${f.running_room_id}`);
  } catch (e) { next(e); }
});

/* ---------------------------------------------------- kitchen compliance */
const KITCHEN_CHECKS = [
  ['fssai_licence',       'FSSAI / PFA licence', 'valid licence on display'],
  ['grocery_stock',       '15-day grocery stock', 'minimum stock of raw foodstuff'],
  ['perishables',         'Perishables for next 24 hrs', 'milk, curd, vegetables'],
  ['approved_brands',     'Approved brands in use', 'per the tender brand list'],
  ['lpg_spare',           'Two spare LPG cylinders', 'so kitchen service is not interrupted'],
  ['gas_pipe',            'Gas pipe replacement', 'every six months'],
  ['utensil_segregation', 'Veg / non-veg utensils separate', 'marked and stored apart'],
  ['water_quality',       'Water quality (TDS / pH)', 'checked monthly against BIS'],
];

router.get('/kitchen', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const latest = await db.query(`
      SELECT k.* FROM kitchen_compliance k
      WHERE k.running_room_id = ? AND k.as_on_date = (
        SELECT MAX(k2.as_on_date) FROM kitchen_compliance k2
        WHERE k2.running_room_id = k.running_room_id AND k2.check_type = k.check_type)`, [rr.id]);
    const by = Object.fromEntries(latest.map(k => [k.check_type, k]));
    const checks = KITCHEN_CHECKS.map(([type, label, note]) => ({ type, label, note, row: by[type] || null }));
    res.render('facility/kitchen', { title: 'Kitchen compliance', section: 'kitchen',
      rooms, rr, date, checks,
      shortfalls: checks.filter(c => c.row && c.row.status === 'shortfall').length,
      unrecorded: checks.filter(c => !c.row).length });
  } catch (e) { next(e); }
});

router.post('/kitchen', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const type = String(req.body.check_type || '');
    if (!KITCHEN_CHECKS.some(k => k[0] === type)) { const e = new Error('Unknown check.'); e.status = 400; throw e; }
    const status = ['compliant','shortfall','not_applicable'].includes(req.body.status) ? req.body.status : 'compliant';
    await db.execute(`
      INSERT INTO kitchen_compliance (running_room_id, check_type, as_on_date, status, detail, valid_till, recorded_by)
      VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE status = VALUES(status), detail = VALUES(detail),
        valid_till = VALUES(valid_till), recorded_by = VALUES(recorded_by)`,
      [rrId, type, req.body.as_on_date || today(), status,
       String(req.body.detail || '').trim().slice(0, 300) || null,
       req.body.valid_till || null, req.user.id]);
    await audit.record(req, { table: 'kitchen_compliance', id: rrId, action: 'update',
      after: { running_room_id: rrId, check_type: type, status } });
    res.redirect(`${cfg.basePath}/facility/kitchen?rr=${rrId}`);
  } catch (e) { next(e); }
});

/* ------------------------------------------------------- the weekly menu */
/**
 * What is actually being served this week, and whether it obeys the tender.
 *
 * Schedule B: "Contractor should prepare menu of standard meals/breakfast in
 * consultation with Railway's representative & Display on Kitchen Board on
 * daily basis." So the record has two halves and both are kept — the
 * contractor's supervisor prepares the week, the Railway agrees it. A menu
 * nobody agreed is a menu the contractor wrote for himself, and the tender
 * does not allow that.
 *
 * Two rules from the same schedule are checked against what is entered:
 *
 *   "Schedule items for Breakfast should not be repeated on subsequent day in
 *   the week."  Checked between consecutive days, and between Sunday and the
 *   following Monday only within the week that is on the screen -- a week
 *   boundary is not a licence to repeat, but this screen holds one week and
 *   will not reach into another to say so.
 *
 *   "Two seasonal vegetable dishes have to be served in each meal ...
 *   one of the vegetable dish is dry and the other one is with curry."
 *
 * Neither check raises anything. They put the fact in front of the officer who
 * agrees the week, before he agrees it.
 */
const MENU_MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']];
const WEEKDAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'],
                  [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']];

// The Monday of whatever date is given. One identity per week, so saving twice
// corrects rather than duplicates.
function mondayOf(dateStr) {
  const d = new Date(Date.parse(String(dateStr).slice(0, 10) + 'T00:00:00Z'));
  if (Number.isNaN(d.getTime())) return mondayOf(today());
  const iso = (d.getUTCDay() + 6) % 7;              // 0 = Monday
  d.setUTCDate(d.getUTCDate() - iso);
  return d.toISOString().slice(0, 10);
}
const addDays = (iso, n) =>
  new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// A breakfast is "the same" as yesterday's when the words are the same once
// case and spacing are set aside. Deliberately blunt: the check is there to
// catch poha on Monday and poha on Tuesday, not to referee whether upma with
// chutney differs from upma.
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function menuFindings(days) {
  const out = [];
  const bf = {};
  days.filter(d => d.meal_type === 'breakfast').forEach(d => { bf[d.day_of_week] = d; });
  for (let n = 1; n <= 6; n++) {
    const a = bf[n], b = bf[n + 1];
    if (!a || !b || !norm(a.main_item) || !norm(b.main_item)) continue;
    if (norm(a.main_item) === norm(b.main_item))
      out.push({ kind: 'breakfast_repeat', day: n + 1,
        text: `Breakfast on ${WEEKDAYS[n][1]} repeats ${WEEKDAYS[n - 1][1]}'s — "${b.main_item}". `
            + 'Schedule B: breakfast items are not to be repeated on the subsequent day in the week.' });
  }
  for (const d of days) {
    if (d.meal_type === 'breakfast') continue;
    if (!norm(d.main_item) && !norm(d.veg_dry) && !norm(d.veg_curry)) continue;  // nothing entered yet
    const missing = [];
    if (!norm(d.veg_dry)) missing.push('the dry vegetable');
    if (!norm(d.veg_curry)) missing.push('the vegetable with curry');
    if (missing.length)
      out.push({ kind: 'veg_missing', day: d.day_of_week,
        text: `${(WEEKDAYS.find(w => w[0] === d.day_of_week) || [0, '?'])[1]} `
            + `${d.meal_type} does not name ${missing.join(' or ')}. `
            + 'Schedule B: two seasonal vegetable dishes in each meal, one dry and one with curry.' });
  }
  return out;
}

router.get('/menu', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const week = mondayOf(req.query.week || date);

    const plan = await db.one(`
      SELECT p.*, pu.full_name AS prepared_name, au.full_name AS agreed_name
      FROM menu_plans p
      LEFT JOIN users pu ON pu.id = p.prepared_by
      LEFT JOIN users au ON au.id = p.agreed_by
      WHERE p.running_room_id = ? AND p.week_start = ?`, [rr.id, week]);

    const days = plan ? await db.query(
      `SELECT * FROM menu_plan_days WHERE menu_plan_id = ?`, [plan.id]) : [];
    const cell = {};
    days.forEach(d => { (cell[d.day_of_week] ||= {})[d.meal_type] = d; });

    // Table A is what a plate must contain; printed beside the grid so the man
    // filling it is not working from memory.
    const tableA = await db.query(
      `SELECT * FROM menu_items WHERE schedule_table = 'A' AND is_active = 1 ORDER BY sort_order`);

    res.render('facility/menu', { title: 'Weekly menu', section: 'menu',
      rooms, rr, date, week, weekEnd: addDays(week, 6),
      prevWeek: addDays(week, -7), nextWeek: addDays(week, 7),
      plan, cell, weekdays: WEEKDAYS, menuMeals: MENU_MEALS, tableA,
      dateOf: Object.fromEntries(WEEKDAYS.map(([n]) => [n, addDays(week, n - 1)])),
      findings: menuFindings(days),
      saved: req.query.saved || null });
  } catch (e) { next(e); }
});

router.post('/menu', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const week = mondayOf(req.body.week || today());

    const existing = await db.one(
      `SELECT * FROM menu_plans WHERE running_room_id = ? AND week_start = ?`, [rrId, week]);
    // An agreed week is closed. Correcting it means the Railway reopening it,
    // for the same reason a counter-signed muster cannot be re-marked: the
    // agreement was given to a particular menu.
    if (existing && existing.status === 'agreed' && req.body.action !== 'reopen') {
      const e = new Error('This week has been agreed by the Railway and can no longer be edited. Ask for it to be reopened.');
      e.status = 400; throw e;
    }

    if (req.body.action === 'agree' || req.body.action === 'reopen') {
      if (!req.can('menu.manage')) {
        const e = new Error('Agreeing a menu is the Railway\'s act.'); e.status = 403; throw e;
      }
      const agreeing = req.body.action === 'agree';
      await db.execute(`
        UPDATE menu_plans SET status = ?, agreed_by = ?, agreed_on = ?
        WHERE running_room_id = ? AND week_start = ?`,
        [agreeing ? 'agreed' : 'draft', agreeing ? req.user.id : null,
         agreeing ? today() : null, rrId, week]);
      await audit.record(req, { table: 'menu_plans', id: rrId, action: 'update',
        after: { running_room_id: rrId, week_start: week, status: agreeing ? 'agreed' : 'draft' } });
      return res.redirect(`${cfg.basePath}/facility/menu?rr=${rrId}&week=${week}&saved=${agreeing ? 'agreed' : 'reopened'}`);
    }

    await db.execute(`
      INSERT INTO menu_plans (running_room_id, week_start, status, prepared_by, remarks)
      VALUES (?,?, 'draft', ?, ?)
      ON DUPLICATE KEY UPDATE prepared_by = VALUES(prepared_by), remarks = VALUES(remarks)`,
      [rrId, week, req.user.id, String(req.body.remarks || '').trim().slice(0, 300) || null]);
    const plan = await db.one(
      `SELECT id FROM menu_plans WHERE running_room_id = ? AND week_start = ?`, [rrId, week]);

    const txt = (k, n) => String(req.body[k] || '').trim().replace(/\s+/g, ' ').slice(0, n) || null;
    let filled = 0;
    for (const [n] of WEEKDAYS) {
      for (const [code] of MENU_MEALS) {
        const main = txt(`main_${n}_${code}`, 200);
        const dry = txt(`dry_${n}_${code}`, 120);
        const curry = txt(`curry_${n}_${code}`, 120);
        const notes = txt(`notes_${n}_${code}`, 200);
        if (main === null && dry === null && curry === null && notes === null) {
          // Nothing written for this slot. Clear it rather than leaving a
          // half-row behind, so an emptied cell really is empty.
          await db.execute(
            `DELETE FROM menu_plan_days WHERE menu_plan_id = ? AND day_of_week = ? AND meal_type = ?`,
            [plan.id, n, code]);
          continue;
        }
        await db.execute(`
          INSERT INTO menu_plan_days (menu_plan_id, day_of_week, meal_type, main_item, veg_dry, veg_curry, notes)
          VALUES (?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE main_item = VALUES(main_item), veg_dry = VALUES(veg_dry),
            veg_curry = VALUES(veg_curry), notes = VALUES(notes)`,
          [plan.id, n, code, main, dry, curry, notes]);
        filled++;
      }
    }

    await audit.record(req, { table: 'menu_plans', id: rrId, action: 'update',
      after: { running_room_id: rrId, week_start: week, slots: filled } });
    res.redirect(`${cfg.basePath}/facility/menu?rr=${rrId}&week=${week}&saved=${filled}`);
  } catch (e) { next(e); }
});

/**
 * The menu card and rate board, as they have to appear on the wall.
 *
 * Schedule B requires the rates to be "displayed in Dining Hall" and the menu
 * "Display on Kitchen Board on daily basis". Generated from the same rows the
 * rest of the application reads, so the paper on the wall and the record in
 * the system cannot drift apart — which is the whole failure mode a printed
 * rate board has.
 *
 * A Table-B item whose rate the Railway has not yet fixed prints as "rate not
 * yet fixed", never as a blank or a zero. A blank invites a pencil.
 */
router.get('/menu/card', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const week = mondayOf(req.query.week || date);

    const items = await db.query(
      `SELECT * FROM menu_items WHERE is_active = 1 ORDER BY schedule_table, sort_order`);
    const rates = await db.query(`
      SELECT r.menu_item_id, r.rate, r.effective_from, r.authority
      FROM menu_item_rates r
      JOIN (SELECT menu_item_id, MAX(effective_from) AS d FROM menu_item_rates
             WHERE effective_from <= ? GROUP BY menu_item_id) l
        ON l.menu_item_id = r.menu_item_id AND l.d = r.effective_from`, [date]);
    const rateBy = {}; rates.forEach(r => { rateBy[r.menu_item_id] = r; });

    // The contract's ceiling where this room's contract states one, and the
    // divisional control board's figure only where it does not. IGP's contract
    // sets Rs 64.74 and Rs 58.26 against the board's 62.37 and 37.80, and
    // showing the board's figure at IGP would be showing the wrong number.
    const mealRates = (await terms.scopedRows(db,
      await terms.contractIdFor(db, rr.id), (scope, p) => [`
      SELECT meal_type, subsidised_rate, full_rate, is_ceiling, cap_note,
             source_ref, effective_from
      FROM meal_rates WHERE effective_from <= ? AND ${scope}
      ORDER BY effective_from DESC`, [date, ...p]])).rows;
    const mealRateFor = {};
    mealRates.forEach(r => { if (!mealRateFor[r.meal_type]) mealRateFor[r.meal_type] = r; });

    const plan = await db.one(
      `SELECT * FROM menu_plans WHERE running_room_id = ? AND week_start = ?`, [rr.id, week]);
    const days = plan ? await db.query(
      `SELECT * FROM menu_plan_days WHERE menu_plan_id = ?`, [plan.id]) : [];
    const cell = {};
    days.forEach(d => { (cell[d.day_of_week] ||= {})[d.meal_type] = d; });

    res.render('facility/menu-card', { title: 'Menu card and rate board', section: 'menu',
      rooms, rr, date, week, weekEnd: addDays(week, 6), plan, cell,
      weekdays: WEEKDAYS, menuMeals: MENU_MEALS,
      tableA: items.filter(i => i.schedule_table === 'A'),
      tableB: items.filter(i => i.schedule_table === 'B'),
      rateBy, mealRateFor,
      unpriced: items.filter(i => i.schedule_table === 'B' && !rateBy[i.id]).length,
      dateOf: Object.fromEntries(WEEKDAYS.map(([n]) => [n, addDays(week, n - 1)])) });
  } catch (e) { next(e); }
});

/* ----------------------------------------------------- pest and garden */
router.get('/pest', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const blocks = await blocksOf(rr.id);
    const wantBlock = /^\d+$/.test(String(req.query.block || '')) ? +req.query.block
      : (req.query.block === 'none' ? 'none' : null);
    const pestWhere = wantBlock === 'none' ? ' AND p.block_id IS NULL'
      : (wantBlock ? ' AND p.block_id = ' + wantBlock : '');
    const rows = await db.query(`
      SELECT p.*, v.name AS vendor_name, v.licence_valid_till,
             bl.name AS block_name, bl.is_active AS block_live
      FROM pest_control_log p
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN running_room_blocks bl ON bl.id = p.block_id
      WHERE p.running_room_id = ?${pestWhere}
      ORDER BY p.scheduled_on DESC LIMIT 40`, [rr.id]);

    /* WHEN EACH BUILDING WAS LAST TREATED.
       The contract prices pest control once in two months over approximately
       53,010 square feet, and that is the whole site. Treating one building
       every two months would satisfy a register that only counts treatments;
       it would not satisfy the clause, and it would not keep the cockroaches
       out of the other three. So each building carries its own last-treated
       date and its own overdue flag. */
    const PEST_EVERY_DAYS = 61;
    if (blocks.length) {
      const last = await db.query(`
        SELECT COALESCE(block_id, 0) AS bk, MAX(performed_on) AS d
        FROM pest_control_log
        WHERE running_room_id = ? AND performed_on IS NOT NULL
        GROUP BY COALESCE(block_id, 0)`, [rr.id]);
      const lastBy = {}; last.forEach(r => { lastBy[r.bk] = String(r.d).slice(0, 10); });
      const atMs = Date.parse(date + 'T00:00:00Z');
      blocks.forEach(b => {
        b.last_pest = lastBy[b.id] || null;
        b.pest_age = b.last_pest
          ? Math.floor((atMs - Date.parse(b.last_pest + 'T00:00:00Z')) / 86400000) : null;
        b.pest_due = b.last_pest === null || b.pest_age > PEST_EVERY_DAYS;
      });
    }
    const vendors = await db.query(
      `SELECT id, name, licence_valid_till FROM vendors WHERE vendor_type = 'pest_control' AND is_active = 1 ORDER BY name`);
    /* ------------------------------------------------- garden upkeep (P12)
     *
     * The tab has said "Pest & garden" since stage 6 and the garden half was
     * one sentence of prose with no field behind it. The tender gives garden
     * upkeep its own heading and its own penalty — "Non maintenance of open
     * area and garden/lawn ... will attract penalty as per the penalty clause".
     *
     * One of its four obligations is countable and dated, so it is treated
     * differently from the rest: TEN plants in cement or fibre gamlas of at
     * least eighteen inches, EVERY SIX MONTHS. That is a supply with a due
     * date, and the page works out where the running room stands against it
     * rather than leaving an officer to count backwards through a log.
     */
    const garden = await db.query(`
      SELECT g.*, st.full_name AS done_by_name
      FROM garden_upkeep g LEFT JOIN staff st ON st.id = g.done_by_staff_id
      WHERE g.running_room_id = ? ORDER BY g.work_date DESC, g.id DESC LIMIT 40`, [rr.id]);

    const GAMLA_TARGET = 10, GAMLA_MONTHS = 6;
    const since = new Date(Date.parse(today() + 'T00:00:00Z') - GAMLA_MONTHS * 30 * 86400000)
      .toISOString().slice(0, 10);
    const gamlaRows = garden.filter(g => g.work_type === 'gamla_supply'
      && String(g.work_date).slice(0, 10) >= since);
    const gamlas = {
      target: GAMLA_TARGET, months: GAMLA_MONTHS, since,
      supplied: gamlaRows.reduce((a, g) => a + (g.plants_supplied || 0), 0),
      // The tender states the pot as well as the plant: cement or fibre, at
      // least eighteen inches. A delivery in the wrong pot is still short.
      wrongPot: gamlaRows.filter(g => (g.pot_material && g.pot_material === 'other')
        || (g.pot_size_inches !== null && g.pot_size_inches < 18)).length,
    };
    gamlas.short = Math.max(0, GAMLA_TARGET - gamlas.supplied);

    res.render('facility/pest', { title: 'Pest control & garden', section: 'pest',
      rooms, rr, date, rows, vendors, garden, gamlas,
      blocks, wantBlock, pestEvery: 61,
      gardenStaff: await db.query(`
        SELECT s.id, s.full_name FROM staff s
        WHERE s.running_room_id = ? AND s.is_active = 1
          AND s.screening_status IN ('approved','provisional')
        ORDER BY s.full_name`, [rr.id]),
      savedGarden: req.query.garden ? +req.query.garden : null,
      overdue: rows.filter(r => !r.performed_on && r.scheduled_on < today()).length });
  } catch (e) { next(e); }
});

/* ------------------------------ raw-foodstuff quality register (P11) -------
 *
 * Schedule A, L.7: "The quality of raw food stuff such as wheat flour, grains,
 * pulses, eatable oils etc shall be verified by obtaining the signature of
 * available running staff/Supervisors in the register after ascertaining
 * quality /seal of the eatables."
 *
 * The kitchen page's approved-brands tick is not this and never was. A tick
 * records a belief; this records that the stock was opened up, the seals were
 * looked at, and the men who were about to eat it put their names to what they
 * saw. That is the whole force of the clause and it cannot be had from a
 * checkbox.
 *
 * Recording it is the Railway's act — the tender names the Health Inspector,
 * the inspecting officer and the running supervisor — so it sits behind
 * `inspection.create`, which the contractor does not hold.
 */
const FOODSTUFF_ITEMS = [
  'Wheat flour', 'Rice', 'Food grains', 'Pulses (toor / moong / chana)',
  'Edible oil', 'Spices', 'Salt (iodised)', 'Milk', 'Sugar', 'Tea / coffee',
  'Seasonal vegetables', 'Eggs', 'Other',
];

router.get('/foodstuff', async (req, res, next) => {
  try {
    const { rooms, rr, date } = await context(req);
    const checks = await db.query(`
      SELECT c.*, u.full_name AS recorded_name
      FROM foodstuff_checks c LEFT JOIN users u ON u.id = c.recorded_by
      WHERE c.running_room_id = ? ORDER BY c.checked_on DESC, c.id DESC LIMIT 30`, [rr.id]);
    const ids = checks.map(c => c.id);
    const items = ids.length ? await db.query(
      `SELECT * FROM foodstuff_check_items WHERE check_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
    const sigs = ids.length ? await db.query(
      `SELECT * FROM foodstuff_check_signatures WHERE check_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids) : [];
    for (const c of checks) {
      c.items = items.filter(i => i.check_id === c.id);
      c.signatures = sigs.filter(g => g.check_id === c.id);
      c.poor = c.items.filter(i => i.quality === 'poor').length;
      // A check nobody signed is the one thing the clause does not allow. It is
      // still kept -- deleting it would hide that the check happened at all --
      // and it is flagged wherever it appears.
      c.unsigned = c.signatures.length === 0;
    }
    res.render('facility/foodstuff', { title: 'Raw foodstuff quality', section: 'foodstuff',
      rooms, rr, date, checks, foodstuffItems: FOODSTUFF_ITEMS,
      unsigned: checks.filter(c => c.unsigned).length,
      poorItems: checks.reduce((a, c) => a + c.poor, 0),
      saved: req.query.saved ? +req.query.saved : null });
  } catch (e) { next(e); }
});

router.post('/foodstuff', requirePermission('inspection.create'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const on = String(req.body.checked_on || today()).slice(0, 10);
    if (on > today()) {
      const e = new Error('A quality check cannot be dated in the future.'); e.status = 400; throw e;
    }

    // The items examined. A check with nothing examined is not a check.
    const lines = [];
    for (let i = 0; i < FOODSTUFF_ITEMS.length + 3; i++) {
      const item = String(req.body[`item_${i}`] || '').trim().slice(0, 160);
      if (!item) continue;
      lines.push({
        item,
        brand: String(req.body[`brand_${i}`] || '').trim().slice(0, 120) || null,
        seal: req.body[`seal_${i}`] === '1' ? 1 : req.body[`seal_${i}`] === '0' ? 0 : null,
        fssai: req.body[`fssai_${i}`] === '1' ? 1 : req.body[`fssai_${i}`] === '0' ? 0 : null,
        quality: req.body[`quality_${i}`] === 'poor' ? 'poor' : 'good',
        remarks: String(req.body[`iremarks_${i}`] || '').trim().slice(0, 300) || null,
      });
    }
    if (!lines.length) {
      const e = new Error('Name at least one item that was examined.'); e.status = 400; throw e;
    }

    // The signatures. The clause turns on these, so a check saved without one
    // is accepted and flagged rather than refused: refusing would mean a check
    // that genuinely happened with nobody available to sign goes unrecorded,
    // and an unrecorded check is worse evidence than an unsigned one.
    const signatures = [];
    for (let i = 0; i < 8; i++) {
      const name = String(req.body[`sig_name_${i}`] || '').trim().replace(/\s+/g, ' ').slice(0, 150);
      if (!name) continue;
      signatures.push({
        name,
        designation: String(req.body[`sig_desig_${i}`] || '').trim().slice(0, 80) || null,
      });
    }

    const r = await db.execute(`
      INSERT INTO foodstuff_checks (running_room_id, checked_on, checked_at, conducted_by, remarks, recorded_by)
      VALUES (?,?,NOW(),?,?,?)`,
      [rrId, on, String(req.body.conducted_by || '').trim().slice(0, 150) || null,
       String(req.body.remarks || '').trim().slice(0, 300) || null, req.user.id]);
    const checkId = r.insertId;

    for (const l of lines)
      await db.execute(`
        INSERT INTO foodstuff_check_items (check_id, item, brand, seal_intact, fssai_mark, quality, remarks)
        VALUES (?,?,?,?,?,?,?)`,
        [checkId, l.item, l.brand, l.seal, l.fssai, l.quality, l.remarks]);

    for (const g of signatures)
      await db.execute(`
        INSERT INTO foodstuff_check_signatures (check_id, signatory_name, designation, signed_at)
        VALUES (?,?,?,NOW())`, [checkId, g.name, g.designation]);

    await audit.record(req, { table: 'foodstuff_checks', id: checkId, action: 'insert',
      after: { running_room_id: rrId, checked_on: on, items: lines.length,
               signatures: signatures.length, poor: lines.filter(l => l.quality === 'poor').length } });
    res.redirect(`${cfg.basePath}/facility/foodstuff?rr=${rrId}&saved=${lines.length}`);
  } catch (e) { next(e); }
});

const GARDEN_TYPES = [
  ['lawn_cutting', 'Lawn grass cut'],
  ['trimming',     'Plants and fencing trimmed'],
  ['watering',     'Watering'],
  ['fertiliser',   'Fertiliser applied'],
  ['pesticide',    'Pesticide applied'],
  ['fencing',      'Fencing and gamlas cleaned or repaired'],
  ['gamla_supply', 'Plants supplied in gamlas'],
  ['other',        'Other garden work'],
];

router.post('/pest/garden', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const workDate = String(req.body.work_date || today()).slice(0, 10);
    if (workDate > today()) {
      const e = new Error('Garden work cannot be recorded for a future date.'); e.status = 400; throw e;
    }
    const type = GARDEN_TYPES.some(t => t[0] === req.body.work_type) ? req.body.work_type : 'other';
    const isGamla = type === 'gamla_supply';
    const plants = isGamla ? Math.max(0, parseInt(req.body.plants_supplied, 10) || 0) : null;
    if (isGamla && !plants) {
      const e = new Error('A supply of plants needs a count. Ten are due every six months.');
      e.status = 400; throw e;
    }
    await db.execute(`
      INSERT INTO garden_upkeep (running_room_id, work_date, work_type, plants_supplied,
        pot_material, pot_size_inches, organic, detail, done_by_staff_id, recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [rrId, workDate, type, plants,
       isGamla && ['cement','fibre','other'].includes(req.body.pot_material) ? req.body.pot_material : null,
       isGamla && req.body.pot_size_inches ? Math.max(0, parseInt(req.body.pot_size_inches, 10) || 0) : null,
       type === 'fertiliser' ? (req.body.organic === '1' ? 1 : 0) : null,
       String(req.body.detail || '').trim().slice(0, 300) || null,
       +req.body.done_by_staff_id || null, req.user.id]);
    await audit.record(req, { table: 'garden_upkeep', id: rrId, action: 'insert',
      after: { running_room_id: rrId, work_date: workDate, work_type: type, plants_supplied: plants } });
    res.redirect(`${cfg.basePath}/facility/pest?rr=${rrId}&garden=1`);
  } catch (e) { next(e); }
});

router.post('/pest', requirePermission('stay.manage'), async (req, res, next) => {
  try {
    const rrId = +req.body.rr;
    await assertRunningRoomAccess(db, req.user, rrId);
    const scheduled = req.body.scheduled_on || today();
    const performed = req.body.performed_on || null;
    const delay = performed && performed > scheduled
      ? Math.round((new Date(performed) - new Date(scheduled)) / 86400000) : 0;
    /* Treating one building every two months would satisfy a register that
       only counts treatments. It would not satisfy the clause, which prices
       the whole 53,010 square feet, and it would not keep the cockroaches out
       of the other three buildings. */
    const pestBlock = await blockIdFor(rrId, req.body.block);
    await db.execute(`
      INSERT INTO pest_control_log (running_room_id, block_id, vendor_id, treatment_type,
        scheduled_on, performed_on, notice_given_on, areas_covered, chemical_used,
        delay_days, remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [rrId, pestBlock, +req.body.vendor_id || null,
       ['rodent','insecticide','flying_insect','bed_bug','fumigation'].includes(req.body.treatment_type)
         ? req.body.treatment_type : 'insecticide',
       scheduled, performed, req.body.notice_given_on || null,
       String(req.body.areas_covered || '').trim().slice(0, 400) || null,
       String(req.body.chemical_used || '').trim().slice(0, 200) || null,
       delay, String(req.body.remarks || '').trim().slice(0, 300) || null]);
    await audit.record(req, { table: 'pest_control_log', id: rrId, action: 'insert',
      after: { running_room_id: rrId, treatment: req.body.treatment_type, delay_days: delay } });
    res.redirect(`${cfg.basePath}/facility/pest?rr=${rrId}` + (pestBlock ? `&block=${pestBlock}` : ''));
  } catch (e) { next(e); }
});

module.exports = router;
