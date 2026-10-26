'use strict';
/**
 * THE BOOK FIGURE — what a running room's linen shelf holds, worked out rather
 * than typed.
 *
 * ONE COMPUTATION, READ BY EVERY SCREEN THAT SHOWS A SHELF FIGURE. The daily
 * linen register, the linen stock reconciliation and the two-days'-stock test
 * all ask this module. They used to work it out separately, and two hand-kept
 * copies of one fact is the fault that has cost this project more than any
 * other -- the stock page fell a whole contract behind the daily register
 * exactly that way, and nobody noticed for two stages.
 *
 * THE ARITHMETIC, stated once:
 *
 *     book = the last accepted position
 *          + linen the Railway has issued since
 *          + linen that has come back from the wash since
 *          - linen issued to crew since
 *          - linen sent to the wash FROM THE SHELF since
 *          - linen written off FROM THE SHELF since
 *
 * Linen sits in one of four places -- fresh on the shelf, in use on the beds,
 * at the wash, written off -- and every movement says which place it left.
 * That is why `from_pool` exists on a dispatch and on a write-off: the
 * ordinary dispatch is used linen off the beds and must NOT touch the shelf,
 * because it left the shelf when it was issued.
 *
 * THE BOOK IS NEVER FLOORED AT ZERO. A negative book figure says more linen
 * has been issued than the shelf could have held, which is a real and urgent
 * fact about the register. Math.max(0, ...) would hide it, and hiding a
 * shortfall is the one direction this register must never be wrong in.
 *
 * A COUNT DOES NOT ENTER THE ARITHMETIC. It is compared with it. The
 * difference is a discrepancy -- linen that moved without being written down --
 * and it is kept, not resolved. Accepting a count writes a new baseline, and
 * only then does the book start again from what was seen.
 *
 * THE DAY BOUNDARY, and it is a convention worth stating on the screen: a
 * baseline is the position AT THE CLOSE OF its date. Movements are counted
 * from the day after. So a count is the shelf as it stands once the day's
 * issues are written down -- which is the end of the supervisor's day, not the
 * start of it.
 */

/** Every movement that touches the shelf, in the order they are shown. */
const KINDS = [
  ['railway',   'issued by the Railway',   +1],
  ['returns',   'back from the wash',      +1],
  ['issued',    'issued to crew',          -1],
  ['shelfSent', 'sent to the wash',        -1],
  ['shelfOff',  'written off',             -1],
];

/* Movements are read per item from the day after that item's own baseline, so
   the window is short however long the register has been running. Items are
   few (seven at IGP), so naming them in the clause is cheaper and far clearer
   than a correlated sub-select per row. */
function sinceClause(col, dates, codes) {
  const parts = [], params = [];
  for (const code of codes) {
    if (dates[code] === undefined) continue;
    parts.push(`(item_type = ? AND ${col} > ?)`);
    params.push(code, dates[code]);
  }
  return parts.length ? { sql: '(' + parts.join(' OR ') + ')', params } : null;
}

/**
 * @param db      the pool
 * @param rrId    running room
 * @param bk      block key -- the building's id, or 0 where the room is one building
 * @param codes   item codes, from the room's own contract
 * @param upto    the date the book is being read as at (inclusive)
 */
async function shelfBook(db, rrId, bk, codes, upto) {
  const out = {};
  codes.forEach(code => { out[code] = blank(code); });

  /* THE LAST ACCEPTED POSITION at or before the date being read. Reading it as
     at a date rather than "the latest" is what lets the register be read for
     last Tuesday and give last Tuesday's answer. */
  const baselines = await db.query(`
    SELECT b.item_type, b.as_on_date, b.quantity, b.source, b.note, b.set_at,
           u.full_name AS set_by_name
      FROM linen_shelf_baseline b
      LEFT JOIN users u ON u.id = b.set_by
      JOIN (SELECT item_type, MAX(as_on_date) AS d FROM linen_shelf_baseline
             WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND as_on_date <= ?
             GROUP BY item_type) m
        ON m.item_type = b.item_type AND m.d = b.as_on_date
     WHERE b.running_room_id = ? AND COALESCE(b.block_id,0) = ?`,
    [rrId, bk, upto, rrId, bk]);

  const from = {};
  for (const b of baselines) {
    if (!out[b.item_type]) continue;
    const on = String(b.as_on_date).slice(0, 10);
    from[b.item_type] = on;
    out[b.item_type].baseline = { on, qty: +b.quantity, source: b.source,
      note: b.note, byName: b.set_by_name, at: b.set_at };
  }
  /* LINEN THE RAILWAY HAS ISSUED. `linen_stock.issued_by_railway` is a running
     total, not a consignment, so what arrived is the difference between one
     dated figure and the one before it. Taking the difference rather than the
     total is also what makes a CORRECTION behave: changing 600 to 550 on the
     same date changes the difference, and the book follows with nothing to
     unpick by hand. */
  const stock = await db.query(`
    SELECT item_type, as_on_date, issued_by_railway FROM linen_stock
     WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND as_on_date <= ?
     ORDER BY item_type, as_on_date`, [rrId, bk, upto]);
  const firstStock = {};
  for (const r of stock) if (firstStock[r.item_type] === undefined) {
    firstStock[r.item_type] = String(r.as_on_date).slice(0, 10);
  }

  /* THE OPENING POSITION OF A ROOM THAT HAS NEVER COUNTED ANYTHING.
     A running room's linen story starts when the Railway hands over a
     consignment: before that there was nothing on the shelf, and that nothing
     is a perfectly good position to start a book from. Without this a brand
     new room would enter what the Railway gave it, see "no accepted position"
     against every item, and have nothing to do about it -- the register would
     be unusable on the one day it most needs to be right.

     So the position is taken as ZERO on the day before the first consignment,
     and the consignment itself is the first movement. Nothing is invented: the
     figure is nought, and the screen says where it came from. The moment
     anybody counts and the Railway accepts it, that becomes the position and
     this is never consulted again. */
  const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  for (const code of codes) {
    if (from[code] !== undefined || firstStock[code] === undefined) continue;
    const on = dayBefore(firstStock[code]);
    from[code] = on;
    out[code].baseline = { on, qty: 0, source: 'opening', implicit: true,
      note: 'nothing on the shelf before the Railway issued any', byName: null, at: null };
  }

  const live = codes.filter(c => from[c] !== undefined);

  if (live.length) {
    const add = async (kind, sql, col, extra) => {
      const w = sinceClause(col, from, live);
      if (!w) return;
      const rows = await db.query(
        sql.replace('/*since*/', 'AND ' + w.sql),
        [rrId, bk, upto, ...w.params, ...(extra || [])]);
      for (const r of rows) {
        const it = out[r.item_type]; if (!it) continue;
        const on = String(r.d).slice(0, 10);
        it.moves.push({ on, kind, qty: +r.qty });
      }
    };

    await add('issued', `
      SELECT item_type, record_date AS d, SUM(issued) AS qty FROM linen_daily_item
       WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND record_date <= ?
         AND issued IS NOT NULL /*since*/
       GROUP BY item_type, record_date`, 'record_date');

    await add('returns', `
      SELECT item_type, returned_on AS d, SUM(quantity_returned) AS qty FROM laundry_dispatch
       WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND returned_on <= ?
         AND returned_on IS NOT NULL AND quantity_returned > 0 /*since*/
       GROUP BY item_type, returned_on`, 'returned_on');

    await add('shelfSent', `
      SELECT item_type, dispatch_date AS d, SUM(quantity_sent) AS qty FROM laundry_dispatch
       WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND dispatch_date <= ?
         AND from_pool = 'shelf' /*since*/
       GROUP BY item_type, dispatch_date`, 'dispatch_date');

    await add('shelfOff', `
      SELECT item_type, written_off_on AS d, SUM(quantity) AS qty FROM linen_written_off
       WHERE running_room_id = ? AND COALESCE(block_id,0) = ? AND written_off_on <= ?
         AND from_pool = 'shelf' /*since*/
       GROUP BY item_type, written_off_on`, 'written_off_on');
  }

  let prevCode = null, prevQty = 0;
  for (const r of stock) {
    if (r.item_type !== prevCode) { prevCode = r.item_type; prevQty = 0; }
    const on = String(r.as_on_date).slice(0, 10);
    const delta = +r.issued_by_railway - prevQty;
    prevQty = +r.issued_by_railway;
    const it = out[r.item_type];
    if (!it || from[r.item_type] === undefined || on <= from[r.item_type] || !delta) continue;
    it.moves.push({ on, kind: 'railway', qty: delta });
  }

  /* THE LATEST COUNT at or before the date, and every count since the baseline
     -- the screen shows the latest, the discrepancy needs the book as at the
     day it was taken, and both come from the same rows. */
  const counts = await db.query(`
    SELECT c.*, u.full_name AS by_name, a.full_name AS accepted_by_name
      FROM linen_count c
      LEFT JOIN users u ON u.id = c.counted_by
      LEFT JOIN users a ON a.id = c.accepted_by
     WHERE c.running_room_id = ? AND COALESCE(c.block_id,0) = ? AND c.counted_on <= ?
     ORDER BY c.counted_on`, [rrId, bk, upto]);
  for (const c of counts) {
    const it = out[c.item_type]; if (!it) continue;
    it.count = { id: c.id, on: String(c.counted_on).slice(0, 10), qty: +c.quantity,
      byName: c.by_name, at: c.counted_at, note: c.note,
      acceptedOn: c.accepted_on ? String(c.accepted_on).slice(0, 10) : null,
      acceptedByName: c.accepted_by_name };
  }

  /* A SETTLED DAY THAT HAS BEEN CHANGED SINCE IT WAS SETTLED.
     Accepting a count fixes the position at the close of a day. If a movement
     dated on or before that day is WRITTEN DOWN afterwards -- an issue figure
     corrected next morning, a challan found in a drawer -- then the position
     was struck against a record that no longer exists, and nothing about it
     looks wrong. No arithmetic can put it right: the count was of a shelf, on
     a day, and only the man who counted knows whether the correction was
     already in his figure. So it is detected and shown, and the officer is
     told his accepted position rests on a record that has since moved. */
  const disturbed = {};
  const accepted = codes.filter(c => out[c].baseline && !out[c].baseline.implicit && out[c].baseline.at);
  if (accepted.length) {
    const parts = [], params = [];
    for (const c of accepted) {
      parts.push('(item_type = ? AND record_date <= ? AND updated_at > ?)');
      params.push(c, out[c].baseline.on, out[c].baseline.at);
    }
    for (const [table, dateCol] of [['linen_daily_item', 'record_date'], ['laundry_dispatch', 'dispatch_date']]) {
      const rows = await db.query(`
        SELECT DISTINCT item_type FROM ${table}
         WHERE running_room_id = ? AND COALESCE(block_id,0) = ?
           AND (${parts.join(' OR ').replace(/record_date/g, dateCol)})`,
        [rrId, bk, ...params]);
      rows.forEach(r => { disturbed[r.item_type] = true; });
    }
  }
  for (const c of codes) out[c].disturbed = !!disturbed[c];

  const dayMs = 86400000, atMs = Date.parse(upto + 'T00:00:00Z');
  for (const code of codes) {
    const it = out[code];
    it.moves.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
    for (const [k] of KINDS) it.since[k] = 0;
    if (it.baseline) {
      for (const m of it.moves) it.since[m.kind] += m.qty;
      it.book = it.baseline.qty + it.since.railway + it.since.returns
              - it.since.issued - it.since.shelfSent - it.since.shelfOff;
      /* THE BOOK AS AT THE DAY THE COUNT WAS TAKEN. Recomputed, never stored:
         a dispatch entered a day late changes what the shelf should have held
         that day, and a discrepancy that no longer follows from the record is
         worse than no discrepancy at all. */
      if (it.count) {
        let n = it.baseline.qty;
        for (const m of it.moves) {
          if (m.on > it.count.on) break;
          n += (m.kind === 'railway' || m.kind === 'returns') ? m.qty : -m.qty;
        }
        it.countBook = n;
        it.discrepancy = it.count.qty - n;
      }
    }
    it.countAge = it.count ? Math.floor((atMs - Date.parse(it.count.on + 'T00:00:00Z')) / dayMs) : null;
  }
  return out;
}

function blank(code) {
  return { code, baseline: null, moves: [], since: {}, book: null,
           count: null, countBook: null, discrepancy: null, countAge: null,
           disturbed: false };
}

module.exports = { shelfBook, KINDS };
