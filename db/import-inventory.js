#!/usr/bin/env node
/**
 * The Igatpuri inventory, read on to the register.
 *
 *   node db/import-inventory.js            # says what it would do, writes nothing
 *   node db/import-inventory.js --yes      # does it
 *
 * WHY THIS IS A SCRIPT AND NOT A SEED. A seed states what is always true; this
 * states what somebody counted on one day. Run it once at Igatpuri and never
 * again, unless a fresh count arrives — in which case the counts are REPLACED,
 * not added to, because two inventories of one building are not two hundred
 * fans.
 *
 * WHAT IT REFUSES TO DO
 *
 * It will not file a row whose building it cannot name. The whole value of a
 * per-building register is that a man is sent to the right building, and a row
 * quietly filed under "no building recorded" because a name did not match is
 * worse than a row rejected out loud — the officer would never know to look.
 *
 * It will not invent a catalogue entry. Every column maps to a named item, and
 * an unmapped column stops the run rather than being skipped, because a column
 * silently dropped is inventory the Railway owns and the system does not know
 * about.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const APPLY = process.argv.includes('--yes');
const SRC = path.join(__dirname, '..', 'data', 'pilot', 'igp-inventory.json');

/* THE SHEET'S ROWS, AND THE BUILDINGS THEY ARE.
   "the LP mail is split in two rows just to show the ladies room data" — the
   officer, 4 September 2026. So two rows are one building, and the ladies row
   is what makes its female room a fact rather than a footnote. Every other row
   is one building. Nothing is matched by fuzzy string comparison: the sheet's
   own text is written here against the block code, so a renamed row fails
   loudly instead of matching something near it. */
const ROW_TO_BLOCK = {
  'LP Mail':             'IGP-LPMAIL',
  'LP Ladies Staff':     'IGP-LPMAIL',
  'LP Ghat':             'IGP-LPGHAT',
  'TM BB':               'IGP-TMBB',
  'BSLTM & BB GOODS LP': 'IGP-BSLBB',
};

/* Which sheet row is the ladies' accommodation. Its rooms and beds fold into
   the building above; its separate identity survives as the female-room count,
   which is the only reason it was listed apart. */
const FEMALE_ROW = 'LP Ladies Staff';

/* THE COLUMNS.
   A count of a thing the Railway owns becomes an asset. A count of part of the
   building becomes a fact about the building. Anything not named here stops
   the run. */
const AS_ASSET = {
  'Water Cooler':        'Water cooler',
  'Water Heater':        'Geyser',            // a geyser is what the catalogue calls it
  'Tubelights':          'Tube light',
  // "All ceiling fans" — the officer. Exhaust fans are counted elsewhere or
  // not yet counted; they are a separate catalogue entry when they are.
  'Fan':                 'Ceiling fan',
  'Shoe Polish Machine': 'Shoe polish machine',
  'Foot Massager':       'Foot massager',
  'Refrigerator':        'Refrigerator',
  'Water Filter':        'Water filter',
  'AC':                  'Air conditioner',
  'Fire Extingusher':    'Fire extinguisher', // the sheet's spelling, kept as the key
};
const AS_FACT = { 'No of Rooms': 'rooms', "No of Bed`s": 'beds',
                  'Kitchen': 'kitchens', 'Bathrooms': 'bathrooms', 'Toilets': 'toilets' };
/* The RO plant is two columns — how many, and of what capacity — so it is
   handled on its own rather than by the table above. */
const RO_COUNT = 'RO Water PLANT', RO_SIZE = 'Capacity Litres (LPH)';

const bad = m => { console.error('\n  ' + m + '\n'); process.exit(1); };

(async () => {
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const rr = await db.one('SELECT id, name, total_beds, physical_rooms FROM running_rooms WHERE code = ?',
    [src.running_room_code]);
  if (!rr) bad(`No running room with code ${src.running_room_code}.`);

  const blocks = await db.query(
    `SELECT id, code, name, female_rooms FROM running_room_blocks
     WHERE running_room_id = ? AND is_active = 1`, [rr.id]);
  const byCode = {}; blocks.forEach(b => { byCode[b.code] = b; });
  if (!blocks.length) bad(`${rr.name} has no buildings on record. Run db/seed-pilot.js first.`);

  // Every column in the file must be accounted for before anything is written.
  const seen = new Set();
  src.rows.forEach(r => Object.keys(r).forEach(k => { if (k !== 'sheet_row') seen.add(k); }));
  const unknown = [...seen].filter(k =>
    !AS_ASSET[k] && !AS_FACT[k] && k !== RO_COUNT && k !== RO_SIZE);
  if (unknown.length) bad(
    `These columns are in the sheet and this script does not know what they are:\n     `
    + unknown.join(', ')
    + `\n\n  Nothing has been written. Add them to AS_ASSET or AS_FACT in this file — a`
    + `\n  column silently skipped is inventory the Railway owns and the system does not`
    + `\n  know about.`);

  // And every row must be a building we hold.
  const strays = src.rows.map(r => r.sheet_row).filter(n => !ROW_TO_BLOCK[n]);
  if (strays.length) bad(`These rows name no building this script knows: ${strays.join(', ')}`);
  const missing = [...new Set(Object.values(ROW_TO_BLOCK))].filter(c => !byCode[c]);
  if (missing.length) bad(`These buildings are not on the register: ${missing.join(', ')}`);

  const items = await db.query('SELECT id, name FROM asset_items WHERE is_active = 1');
  const itemByName = {}; items.forEach(i => { itemByName[i.name] = i; });

  /* ------------------------------------------------ fold the sheet up */
  const facts = {}, assets = {};   // by block code
  for (const row of src.rows) {
    const code = ROW_TO_BLOCK[row.sheet_row];
    const f = facts[code] || (facts[code] = { rooms: 0, beds: 0, kitchens: 0, bathrooms: 0, toilets: 0, female_rooms: 0 });
    const a = assets[code] || (assets[code] = {});

    for (const [col, key] of Object.entries(AS_FACT)) if (row[col]) f[key] += +row[col];
    if (row.sheet_row === FEMALE_ROW) f.female_rooms += +row['No of Rooms'] || 0;

    for (const [col, item] of Object.entries(AS_ASSET)) {
      if (!row[col]) continue;
      if (!itemByName[item]) bad(`The catalogue has no "${item}". Run the seeds first.`);
      a[item] = (a[item] || 0) + (+row[col]);
    }
    if (row[RO_COUNT]) {
      const size = +row[RO_SIZE] || 0;
      const item = `RO plant ${size} LPH`;
      if (!itemByName[item]) bad(
        `The catalogue has no "${item}", which ${row.sheet_row} has ${row[RO_COUNT]} of.`);
      a[item] = (a[item] || 0) + (+row[RO_COUNT]);
    }
  }

  /* --------------------------------------------------------- the sums */
  const beds = Object.values(facts).reduce((s, f) => s + f.beds, 0);
  const rooms = Object.values(facts).reduce((s, f) => s + f.rooms, 0);
  console.log(`\n  ${src.title}`);
  console.log(`  counted ${src.counted_on}, from ${src.source_file}\n`);
  console.log(`  ${rr.name}: the sheet totals ${rooms} rooms and ${beds} beds; `
    + `the register carries ${rr.physical_rooms} and ${rr.total_beds}.`);
  if (beds !== rr.total_beds || rooms !== rr.physical_rooms) bad(
    `They do not agree, so nothing has been written. A building list that disagrees\n`
    + `  with the room above it is worse than none.`);
  console.log('  They agree.\n');

  /* --------------------------------------------------- what would happen */
  let assetRows = 0, pieces = 0;
  for (const [code, a] of Object.entries(assets)) {
    const b = byCode[code], f = facts[code];
    console.log(`  ${b.name}`);
    console.log(`      ${f.rooms} rooms · ${f.beds} beds`
      + (f.female_rooms ? ` · ${f.female_rooms} for ladies` : '')
      + ` · ${f.kitchens} kitchen${f.kitchens === 1 ? '' : 's'}`
      + ` · ${f.bathrooms} bathrooms · ${f.toilets} toilets`);
    const names = Object.keys(a).sort();
    console.log('      ' + names.map(n => `${a[n]} × ${n}`).join(', '));
    assetRows += names.length;
    pieces += names.reduce((s, n) => s + a[n], 0);
  }
  console.log(`\n  ${assetRows} asset rows, ${pieces} pieces in all.`);

  if (!APPLY) {
    console.log('\n  Nothing has been written. Run again with --yes to record it.\n');
    process.exit(0);
  }

  /* ------------------------------------------------------------- write */
  /* FEMALE ROOMS ARE CHECKED HERE, NOT WRITTEN.
     The sheet shows the ladies' accommodation as a row of its own and it was
     tempting to write female_rooms from it. That is two writers for one fact,
     and it bit within the hour: db/seed-pilot.js overwrites the block from
     sites.json on every run, so the next seed put LP Mail's one ladies' room
     back to zero without a word. The figure is stated in sites.json now. This
     script only says so when the sheet and the register disagree — which is
     what a second source is actually good for. */
  for (const [code, f] of Object.entries(facts)) {
    const b = byCode[code];
    if (f.female_rooms !== b.female_rooms) {
      console.log(`\n  ! ${b.name}: the sheet shows ${f.female_rooms} room(s) for ladies, `
        + `the register holds ${b.female_rooms}.`);
      console.log(`    Neither is changed here. Correct it in data/pilot/sites.json `
        + `and re-run db/seed-pilot.js.`);
    }
    await db.execute(`
      UPDATE running_room_blocks
         SET kitchens = ?, bathrooms = ?, toilets = ?, facts_as_on = ?, facts_source = ?
       WHERE id = ?`,
      [f.kitchens, f.bathrooms, f.toilets, src.counted_on,
       `${src.source_file}, sheet ${src.sheet}`, b.id]);
  }

  /* A SECOND RUN REPLACES THE COUNT, IT DOES NOT ADD TO IT. Two inventories of
     one building are not two hundred fans. Only rows this inventory put there
     are removed, so an asset somebody entered by hand afterwards survives. */
  const tag = `${src.source_file} — counted ${src.counted_on}`;
  const gone = await db.execute(
    'DELETE FROM assets WHERE running_room_id = ? AND remarks = ?', [rr.id, tag]);
  if (gone.affectedRows) console.log(`\n  replaced ${gone.affectedRows} row(s) from an earlier run of this inventory`);

  let wrote = 0;
  for (const [code, a] of Object.entries(assets)) {
    const b = byCode[code];
    for (const name of Object.keys(a).sort()) {
      await db.execute(`
        INSERT INTO assets (running_room_id, block_id, name, item_id, category, owned_by,
          quantity, condition_status, remarks)
        VALUES (?,?,?,?,(SELECT category FROM asset_items WHERE id = ?),'railway',?,'good',?)`,
        [rr.id, b.id, name, itemByName[name].id, itemByName[name].id, a[name], tag]);
      wrote += 1;
    }
  }
  console.log(`\n  ${wrote} asset rows written, ${pieces} pieces, against ${Object.keys(assets).length} buildings.`);
  console.log(`  Condition is recorded as "good" throughout — the sheet does not say, and`);
  console.log(`  the joint check with the incoming contractor is where condition is settled.\n`);
  process.exit(0);
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
