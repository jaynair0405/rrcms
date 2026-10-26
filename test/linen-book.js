/**
 * THE ARITHMETIC THE LINEN REGISTER RESTS ON.
 *
 * The shelf figure has been wrong four times, and each time the fault was the
 * same one wearing different clothes: a movement recorded after the figure was
 * written down. The figure is now computed (src/lib/linen-book.js) and there is
 * no moment for it to age from -- so what has to be guarded is the arithmetic
 * itself, and above all its BOUNDARIES:
 *
 *   a movement on the baseline's own date is already in the baseline
 *   a movement the day after is not
 *   a dispatch of used linen never touches the shelf
 *   the book is never floored at zero
 *   a discrepancy is struck against the book AS AT THE DAY OF THE COUNT
 *
 * shelfBook takes its database as an argument, so this drives it with a small
 * one built from rows in the test -- no MySQL, and every query's date filter is
 * actually applied rather than assumed. A fixture that hands back whatever rows
 * it likes would pass whether the boundary said `>` or `>=`, which is the one
 * thing most worth knowing.
 */
const { shelfBook } = require('../src/lib/linen-book');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); } };
const eq = (got, want, msg) => ok(got === want, `${msg}   (got ${got}, wanted ${want})`);

/* A database of five little tables. It reads the SQL only far enough to know
   which table is being asked for, and then applies the WHERE the caller built:
   [rrId, bk, upto, then (item, date) pairs from the since-clause]. */
function makeDb(t) {
  const tables = {
    linen_shelf_baseline: t.baselines || [],
    linen_stock: t.stock || [],
    linen_daily_item: t.daily || [],
    laundry_dispatch: t.dispatch || [],
    linen_written_off: t.writeoff || [],
    linen_count: t.counts || [],
  };
  const query = async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ');
    const name = Object.keys(tables).find(n => s.includes(' ' + n) || s.includes('FROM ' + n));
    let rows = tables[name] || [];
    const upto = params[2];
    const since = {};
    for (let i = 3; i + 1 < params.length; i += 2) since[params[i]] = params[i + 1];

    if (name === 'linen_shelf_baseline') {
      rows = rows.filter(r => r.as_on_date <= upto);
      const latest = {};
      rows.forEach(r => { if (!latest[r.item_type] || latest[r.item_type].as_on_date < r.as_on_date) latest[r.item_type] = r; });
      return Object.values(latest).map(r => ({ ...r, set_by_name: r.set_by_name || null }));
    }
    if (name === 'linen_stock') return rows.filter(r => r.as_on_date <= upto);
    if (name === 'linen_count') return rows.filter(r => r.counted_on <= upto)
      .sort((a, b) => (a.counted_on < b.counted_on ? -1 : 1));

    // The four movement reads, and the two disturbance reads.
    const disturbance = s.includes('DISTINCT item_type');
    const col = name === 'linen_daily_item' ? 'record_date'
      : name === 'linen_written_off' ? 'written_off_on'
      : s.includes('returned_on') ? 'returned_on' : 'dispatch_date';
    if (disturbance) {
      const seen = new Set();
      const trip = params.slice(2);   // (item, date, stamp) triples after rr, bk
      for (let i = 0; i + 2 < trip.length + 1; i += 3) {
        const [item, on, at] = [trip[i], trip[i + 1], trip[i + 2]];
        rows.filter(r => r.item_type === item && r[col] <= on && r.updated_at > at)
            .forEach(r => seen.add(item));
      }
      return [...seen].map(item_type => ({ item_type }));
    }
    const out = {};
    for (const r of rows) {
      const d = r[col];
      if (!d || d > upto) continue;
      if (since[r.item_type] === undefined || d <= since[r.item_type]) continue;
      if (name === 'laundry_dispatch' && s.includes("from_pool = 'shelf'") && r.from_pool !== 'shelf') continue;
      if (name === 'laundry_dispatch' && s.includes('quantity_returned') && !r.quantity_returned) continue;
      if (name === 'linen_written_off' && s.includes("from_pool = 'shelf'") && r.from_pool !== 'shelf') continue;
      if (name === 'linen_daily_item' && (r.issued === null || r.issued === undefined)) continue;
      const key = r.item_type + '|' + d;
      const qty = name === 'linen_daily_item' ? r.issued
        : name === 'linen_written_off' ? r.quantity
        : s.includes('quantity_returned') ? r.quantity_returned : r.quantity_sent;
      out[key] = out[key] || { item_type: r.item_type, d, qty: 0 };
      out[key].qty += qty;
    }
    return Object.values(out);
  };
  return { query };
}

const B = ['bedsheet'];
const run = (t, upto) => shelfBook(makeDb(t), 1, 0, B, upto);

(async () => {
  console.log('\n  The book figure\n');

  let r = (await run({}, '2026-09-06')).bedsheet;
  ok(r.book === null, 'nothing issued and nothing counted: the book has no answer, and says so');

  r = (await run({ stock: [{ item_type: 'bedsheet', as_on_date: '2026-09-01', issued_by_railway: 600 }] },
    '2026-09-06')).bedsheet;
  eq(r.book, 600, "the Railway's first consignment IS the opening position");
  ok(r.baseline.implicit === true, 'and the screen can say where that position came from');

  const full = {
    stock: [{ item_type: 'bedsheet', as_on_date: '2026-09-01', issued_by_railway: 600 }],
    dispatch: [
      { item_type: 'bedsheet', dispatch_date: '2026-09-02', from_pool: 'shelf', quantity_sent: 100,
        returned_on: '2026-09-04', quantity_returned: 50 },
    ],
    writeoff: [{ item_type: 'bedsheet', written_off_on: '2026-09-03', from_pool: 'shelf', quantity: 8 }],
    daily: [{ item_type: 'bedsheet', record_date: '2026-09-05', issued: 40 }],
  };
  r = (await run(full, '2026-09-06')).bedsheet;
  eq(r.book, 502, '600 issued, 100 to the wash off the shelf, 50 back, 8 written off, 40 issued');

  const used = JSON.parse(JSON.stringify(full));
  used.dispatch[0].from_pool = 'used';
  used.dispatch[0].quantity_returned = 0; used.dispatch[0].returned_on = null;
  r = (await run(used, '2026-09-06')).bedsheet;
  eq(r.book, 552, 'a dispatch of USED linen never touches the shelf — it left when it was issued');

  /* THE BOUNDARY. A baseline is the position at the CLOSE of its date, so a
     movement on that date is already inside it and one the day after is not.
     Off by one day here and every accepted count double-counts a day's issues. */
  const bl = {
    baselines: [{ item_type: 'bedsheet', as_on_date: '2026-09-03', quantity: 300,
                  source: 'count', note: null, set_at: '2026-09-03 18:00:00.000' }],
    daily: [{ item_type: 'bedsheet', record_date: '2026-09-03', issued: 11,
              updated_at: '2026-09-03 09:00:00.000' },
            { item_type: 'bedsheet', record_date: '2026-09-04', issued: 7,
              updated_at: '2026-09-04 09:00:00.000' }],
  };
  r = (await run(bl, '2026-09-06')).bedsheet;
  eq(r.book, 293, 'the baseline day is already counted; only the day after is applied');
  ok(r.disturbed === false, 'a day settled after its own movements were written is not disturbed');

  /* THE SAME ROWS, with the baseline-day figure written down AFTER the officer
     accepted the count. Nothing about the arithmetic looks wrong and the
     position no longer rests on the record it was struck against. */
  const late = JSON.parse(JSON.stringify(bl));
  late.daily[0].updated_at = '2026-09-04 11:00:00.000';
  r = (await run(late, '2026-09-06')).bedsheet;
  ok(r.disturbed === true, 'a settled day written to after it was settled is flagged');

  r = (await run({
    stock: [{ item_type: 'bedsheet', as_on_date: '2026-09-01', issued_by_railway: 10 }],
    daily: [{ item_type: 'bedsheet', record_date: '2026-09-02', issued: 30 }],
  }, '2026-09-06')).bedsheet;
  eq(r.book, -20, 'the book is NEVER floored at zero — a shortfall must not be hidden');

  /* A DISCREPANCY IS STRUCK AGAINST THE DAY OF THE COUNT, not against today.
     Counted 500 on the 4th when the book said 502; 40 issued on the 5th. The
     difference is still -2, not -42. */
  r = (await run({
    stock: [{ item_type: 'bedsheet', as_on_date: '2026-09-01', issued_by_railway: 502 }],
    daily: [{ item_type: 'bedsheet', record_date: '2026-09-05', issued: 40 }],
    counts: [{ id: 9, item_type: 'bedsheet', counted_on: '2026-09-04', quantity: 500,
               accepted_on: null, note: null }],
  }, '2026-09-06')).bedsheet;
  eq(r.countBook, 502, 'the book as at the day of the count');
  eq(r.discrepancy, -2, 'and the difference is that day\'s, not today\'s');
  eq(r.book, 462, 'while the book itself has moved on with the days');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
