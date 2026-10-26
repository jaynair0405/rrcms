#!/usr/bin/env node
/**
 * Everything the linen and laundry registers hold at one running room.
 *
 *   node tools/linen-state.js [running-room-code]      # default IGP
 *
 * READ ONLY. It writes nothing and changes nothing. It exists because a figure
 * like "264 unaccounted" cannot be judged without knowing what is behind it,
 * and days of earlier testing sitting in the register look exactly like real
 * history. Asked for by the officer, in the right order: "do we deleted those
 * or showing in this? have a check. if no laundry records for previous days
 * then we can make change."
 */
require('dotenv').config();
const db = require('../src/db');
const { today } = require('../src/lib/day');

const CODE = (process.argv[2] || 'IGP').toUpperCase();
const pad = (v, n) => String(v === null || v === undefined ? '—' : v).padEnd(n);
const d10 = v => v ? String(v).slice(0, 10) : null;

(async () => {
  const rr = await db.one('SELECT id, code, name FROM running_rooms WHERE code = ? OR name = ?', [CODE, CODE]);
  if (!rr) { console.log('No running room called ' + CODE); process.exit(1); }
  const blocks = await db.query(
    'SELECT id, name FROM running_room_blocks WHERE running_room_id = ? ORDER BY sort_order', [rr.id]);
  const bn = { 0: '(no building)' }; blocks.forEach(b => { bn[b.id] = b.name; });
  const T = today();
  let older = 0;

  console.log(`\n  ${rr.name} — what the linen and laundry registers hold today (${T})\n`);

  const dispatches = await db.query(`
    SELECT id, COALESCE(block_id,0) AS bk, dispatch_date, item_type, quantity_sent,
           quantity_returned, returned_on, invoice_no
    FROM laundry_dispatch WHERE running_room_id = ?
    ORDER BY dispatch_date, id`, [rr.id]);
  console.log(`  LAUNDRY DISPATCHES — ${dispatches.length}`);
  if (!dispatches.length) console.log('    none');
  dispatches.forEach(r => {
    const old = d10(r.dispatch_date) < T; if (old) older++;
    console.log('    ' + (old ? '‹older› ' : '        ')
      + pad(d10(r.dispatch_date), 12) + pad(bn[r.bk] || ('block ' + r.bk), 34)
      + pad(r.item_type, 15) + 'sent ' + pad(r.quantity_sent, 5)
      + 'back ' + pad(r.quantity_returned, 5)
      + (r.returned_on ? 'on ' + d10(r.returned_on) : 'still out'));
  });

  const items = await db.query(`
    SELECT COALESCE(block_id,0) AS bk, record_date, item_type, issued, fresh_in_hand,
           computed_in_hand, is_counted
    FROM linen_daily_item WHERE running_room_id = ?
    ORDER BY record_date, block_id, item_type`, [rr.id]);
  console.log(`\n  DAILY LINEN ROWS — ${items.length}`);
  if (!items.length) console.log('    none');
  items.forEach(r => {
    const old = d10(r.record_date) < T; if (old) older++;
    console.log('    ' + (old ? '‹older› ' : '        ')
      + pad(d10(r.record_date), 12) + pad(bn[r.bk] || ('block ' + r.bk), 34)
      + pad(r.item_type, 15) + 'issued ' + pad(r.issued, 6)
      + 'shelf ' + pad(r.fresh_in_hand, 6)
      + (r.is_counted ? 'counted' : 'from the ledger')
      + (r.computed_in_hand !== null ? '  (book said ' + r.computed_in_hand + ')' : ''));
  });

  const stock = await db.query(`
    SELECT COALESCE(block_id,0) AS bk, as_on_date, item_type, issued_by_railway
    FROM linen_stock WHERE running_room_id = ? ORDER BY as_on_date, block_id, item_type`, [rr.id]);
  console.log(`\n  WHAT THE RAILWAY ISSUED — ${stock.length}`);
  if (!stock.length) console.log('    none');
  stock.forEach(r => {
    const old = d10(r.as_on_date) < T; if (old) older++;
    console.log('    ' + (old ? '‹older› ' : '        ')
      + pad(d10(r.as_on_date), 12) + pad(bn[r.bk] || ('block ' + r.bk), 34)
      + pad(r.item_type, 15) + 'issued ' + r.issued_by_railway);
  });

  const off = await db.query(`
    SELECT COALESCE(block_id,0) AS bk, written_off_on, item_type, quantity, reason, from_pool
    FROM linen_written_off WHERE running_room_id = ? ORDER BY written_off_on`, [rr.id]);
  console.log(`\n  WRITE-OFFS — ${off.length}`);
  if (!off.length) console.log('    none');
  off.forEach(r => {
    const old = d10(r.written_off_on) < T; if (old) older++;
    console.log('    ' + (old ? '‹older› ' : '        ')
      + pad(d10(r.written_off_on), 12) + pad(bn[r.bk] || ('block ' + r.bk), 34)
      + pad(r.item_type, 15) + r.quantity + ' ' + r.reason + ', from ' + r.from_pool);
  });

  console.log(`\n  ${older} row(s) dated before today.`);
  console.log(older
    ? '  Those are the ones to look at: a test from an earlier day is indistinguishable\n'
      + '  from real history, and every figure on the stock page is built on them.\n'
    : '  Everything on record is from today, so nothing earlier is affecting the figures.\n');
  process.exit(0);
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
