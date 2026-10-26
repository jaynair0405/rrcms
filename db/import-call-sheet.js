#!/usr/bin/env node
/**
 * Seed each running room's call sheet from the control office's loco link.
 *
 *   node db/import-call-sheet.js --dry-run          see what it would do
 *   node db/import-call-sheet.js                    do it
 *   node db/import-call-sheet.js --rr IGP           one room only
 *   node db/import-call-sheet.js --lead 90          crew signs on 90 min before
 *   node db/import-call-sheet.js --direction UP     force a direction
 *   node db/import-call-sheet.js --direction BOTH   import both directions
 *   node db/import-call-sheet.js --file data/pilot/call-sheet.json
 *                                                   seed from a prepared file
 *
 * The --file form needs no CRTMS view and no grant at all. It is how the four
 * pilot rooms are seeded: data/pilot/call-sheet.json was built from the
 * division's own working timetable summary and train master, so the numbers,
 * names, run days and times are real.
 *
 * WHICH DIRECTION A ROOM GETS. A crew works DOWN to Igatpuri, is relieved
 * there, sleeps, and is called for an UP train back towards Mumbai. So a room
 * at a section boundary (IGP, LNL, ROHA) gets the UP trains, and a room at the
 * Mumbai end (CSMT, LTT, PNVL, DR) gets the DN ones. The arriving train is how
 * the man got there; the departing train is what he is called for. Getting this
 * backwards fills the sheet with trains nobody is ever called for.
 *
 * That rule is a DEFAULT, not a law. It holds for the Mumbai end of the link,
 * where the boundary rooms only ever work back towards Mumbai. It stops holding
 * as soon as the neighbouring divisions come on: Bhusawal's crews rest at
 * Igatpuri too and are called for DN trains onward to Bhusawal. So the room's
 * list carries a direction on every row and can hold both, and --direction BOTH
 * imports both ends. Where a running room serves crews of two divisions, that
 * is what it should be given.
 *
 * Reads `v_rr_call_sheet` in the division's CRTMS schema (see
 * db/crtms/v_rr_call_sheet.sql) and copies it into RR-CMS's own
 * `call_sheet_trains`. Read ONCE, on purpose: the running room's sheet must
 * open at four in the morning whether or not the control office schema is
 * reachable, and the Railway must be able to correct its own list without
 * editing the control office's.
 *
 * Safe to re-run. Rows already there are updated, never duplicated, and a row
 * the Railway has EDITED BY HAND is left alone — an import that silently undoes
 * a correction somebody made on purpose is worse than no import.
 */
const db = require('../src/db');

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const DRY = flag('dry-run');
const ONLY = val('rr', null);
// How long before the train the crew is called to sign on. There is no figure
// in the tender for this; it is a planning convenience for pre-filling the
// sheet, and the bearer overwrites it with what the lobby actually says.
const LEAD = +val('lead', 90);

const DIRECTION = (val('direction', '') || '').toUpperCase() || null;
const FILE = val('file', null);

const SAFE_SCHEMA = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** 'HH:MM' minus n minutes, wrapping at midnight. */
function minus(hhmm, mins) {
  if (!/^\d{1,2}:\d{2}$/.test(String(hhmm || ''))) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  let t = h * 60 + m - mins;
  while (t < 0) t += 1440;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Seed from a prepared file instead of the control office view.
 *
 * Same rules as the view import: existing rows are updated, never duplicated,
 * and a row somebody edited by hand is left alone. Rows whose direction is not
 * the one this room calls for are loaded INACTIVE rather than dropped — a room
 * that later serves a second division's crews only has to switch them on.
 */
async function fromFile(rooms) {
  const path = require('path');
  const fs = require('fs');
  const full = path.isAbsolute(FILE) ? FILE : path.join(process.cwd(), FILE);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  const byRoom = data.rooms || data;
  let created = 0, updated = 0, kept = 0;

  for (const rr of rooms) {
    const code = (rr.station_code || rr.name || '').trim();
    const list = byRoom[code] || [];
    if (!list.length) { console.log(`  ${rr.name} (${code}): nothing in the file for this station`); continue; }
    const want = DIRECTION || 'UP';
    let c = 0, u = 0, k = 0, off = 0;
    for (const t of list) {
      const dir = ['UP', 'DN', 'BYPASS'].includes(t.direction) ? t.direction : 'OTHER';
      const active = (want === 'BOTH' || dir === want) ? 1 : 0;
      if (!active) off++;
      const existing = await db.one(
        'SELECT id, source FROM call_sheet_trains WHERE running_room_id = ? AND train_no = ? AND direction = ?',
        [rr.id, t.train_no, dir]);
      if (existing && existing.source === 'manual') { k++; continue; }
      if (DRY) { existing ? u++ : c++; continue; }
      if (existing) {
        await db.execute(`
          UPDATE call_sheet_trains
             SET train_name = ?, sign_on_time = ?, arrives_at = ?, from_station = ?, to_station = ?,
                 run_days = ?, is_active = ?, source = 'imported'
           WHERE id = ?`,
          [t.train_name || null, t.sign_on_time || null, t.arrives_at || null,
           t.from_station || null, t.to_station || null, t.run_days || 'DAILY', active, existing.id]);
        u++;
      } else {
        await db.execute(`
          INSERT INTO call_sheet_trains (running_room_id, train_no, train_name, direction,
            sign_on_time, arrives_at, from_station, to_station, run_days, is_active, source)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'imported')`,
          [rr.id, t.train_no, t.train_name || null, dir, t.sign_on_time || null,
           t.arrives_at || null, t.from_station || null, t.to_station || null,
           t.run_days || 'DAILY', active]);
        c++;
      }
    }
    console.log(`  ${rr.name} (${code}): ${list.length} in the file — ${c} new, ${u} updated, `
              + `${k} left as hand-edited, ${off} carried but switched off`);
    created += c; updated += u; kept += k;
  }
  console.log('');
  console.log(`${DRY ? 'Would create' : 'Created'} ${created}, ${DRY ? 'would update' : 'updated'} ${updated}, `
            + `${kept} left alone because somebody had edited them by hand.`);
  if (DRY) console.log('Nothing was written. Run again without --dry-run.');
}

async function main() {
  const rooms = await db.query(`
    SELECT rr.id, rr.name, rr.station_code, d.code AS div_code, d.crtms_schema
    FROM running_rooms rr JOIN divisions d ON d.id = rr.division_id
    WHERE rr.status = 'operational' ${FILE ? '' : 'AND d.crtms_schema IS NOT NULL'}
      ${ONLY ? 'AND (rr.name = ? OR rr.station_code = ? OR rr.code = ?)' : ''}
    ORDER BY d.sort_order, rr.name`, ONLY ? [ONLY, ONLY, ONLY] : []);

  if (!rooms.length) {
    console.log('No running room matched, or no division has a CRTMS schema set.');
    console.log('Set divisions.crtms_schema first — see db/crtms/README.md.');
    return;
  }

  if (FILE) return fromFile(rooms);

  let created = 0, updated = 0, kept = 0, skipped = 0;

  for (const rr of rooms) {
    if (!SAFE_SCHEMA.test(rr.crtms_schema)) { console.log(`  ${rr.name}: schema name refused`); continue; }
    // The station a running room serves. Without it there is nothing to match
    // on, and inventing one from the room's name would be a guess.
    const station = (rr.station_code || '').trim();
    if (!station) { console.log(`  ${rr.name}: no station code on the running room — skipped`); skipped++; continue; }

    let found;
    try {
      found = await db.query(
        `SELECT boundary_station, terminal_station, train_no, train_name, direction, section,
                from_station, to_station, run_days, terminal_time,
                boundary_departs_at, boundary_arrives_at,
                effective_from, effective_until
         FROM \`${rr.crtms_schema}\`.v_rr_call_sheet
         WHERE boundary_station = ? OR terminal_station = ?`, [station, station]);
    } catch (e) {
      console.log(`  ${rr.name} (${station}): ${e.message}`);
      console.log('    → the view is missing or not granted. See db/crtms/v_rr_call_sheet.sql.');
      skipped++;
      continue;
    }

    if (!found.length) { console.log(`  ${rr.name} (${station}): nothing on the loco link for this station`); continue; }

    // A room is at one end of the link or the other, and that decides which
    // direction its crews are called for.
    const atBoundary = found.some(t => t.boundary_station === station);
    const want = DIRECTION || (atBoundary ? 'UP' : 'DN');
    const relevant = want === 'BOTH' ? found.filter(t => t.direction === 'UP' || t.direction === 'DN')
                                     : found.filter(t => t.direction === want);
    if (!relevant.length) {
      console.log(`  ${rr.name} (${station}): ${found.length} on the link but none ${want} — `
                + `nothing a crew resting here would be called for. Use --direction to override.`);
      continue;
    }

    let c = 0, u = 0, k = 0;
    for (const t of relevant) {
      const dir = ['UP', 'DN', 'BYPASS'].includes(t.direction) ? t.direction : 'OTHER';
      // The crew signs on before the train DEPARTS. At the boundary the
      // timetable's departure from this station is the figure; at the Mumbai
      // end the loco link sheet's own terminal time is. The arrival is kept
      // beside it only as context -- it is never what a call is timed from.
      const at = atBoundary ? (t.boundary_departs_at || t.boundary_arrives_at) : t.terminal_time;
      const signOn = minus(at, LEAD);

      const existing = await db.one(
        'SELECT id, source FROM call_sheet_trains WHERE running_room_id = ? AND train_no = ? AND direction = ?',
        [rr.id, t.train_no, dir]);

      if (existing && existing.source === 'manual') { k++; continue; }   // hand-corrected: leave it

      if (DRY) { existing ? u++ : c++; continue; }

      if (existing) {
        await db.execute(`
          UPDATE call_sheet_trains
             SET train_name = ?, sign_on_time = ?, arrives_at = ?, from_station = ?, to_station = ?,
                 run_days = ?, effective_from = ?, effective_until = ?, source = 'imported'
           WHERE id = ?`,
          [t.train_name || null, signOn, at, t.from_station || null, t.to_station || null,
           t.run_days || 'DAILY', t.effective_from || null, t.effective_until || null, existing.id]);
        u++;
      } else {
        await db.execute(`
          INSERT INTO call_sheet_trains (running_room_id, train_no, train_name, direction,
            sign_on_time, arrives_at, from_station, to_station, run_days,
            effective_from, effective_until, source)
          VALUES (?,?,?,?,?,?,?,?,?,?,?, 'imported')`,
          [rr.id, t.train_no, t.train_name || null, dir, signOn, at,
           t.from_station || null, t.to_station || null, t.run_days || 'DAILY',
           t.effective_from || null, t.effective_until || null]);
        c++;
      }
    }
    console.log(`  ${rr.name} (${station}): ${relevant.length} ${want} of ${found.length} on the link `
              + `— ${c} new, ${u} updated, ${k} left as hand-edited`);
    created += c; updated += u; kept += k;
  }

  console.log('');
  console.log(`${DRY ? 'Would create' : 'Created'} ${created}, ${DRY ? 'would update' : 'updated'} ${updated}, `
            + `${kept} left alone because somebody had edited them by hand.`);
  if (skipped) console.log(`${skipped} running room(s) skipped — see the lines above.`);
  if (DRY) console.log('Nothing was written. Run again without --dry-run.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
