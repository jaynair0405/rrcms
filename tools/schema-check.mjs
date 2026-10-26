#!/usr/bin/env node
/**
 * Schema faults that only a real database can see.
 *
 *   node tools/schema-check.mjs
 *
 * WHY THIS IS A TOOL AND NOT A TEST. The first version of this read the
 * migration files with a regular expression and reported nine faults, four of
 * which were multi-line ENUM columns it had misparsed. A check that cries wolf
 * is worse than no check: it trains you to skim past it. The live schema knows
 * the answer exactly, so it is asked, and this runs where the real MySQL is --
 * beside tools/crawl.mjs, at the level of proof that counts.
 *
 * CHECK 1 — a UNIQUE KEY over a NULLABLE column is not unique.
 *
 * MySQL treats two NULLs as different values in a unique index, so such a key
 * does not stop a duplicate, and every INSERT ... ON DUPLICATE KEY UPDATE that
 * leans on it silently becomes a plain INSERT.
 *
 * That happened. `linen_schedule` was created at stage 34 with
 * UNIQUE KEY (item_type, contract_id) and contract_id NULL on every row. The
 * seed is written to be re-run and to correct itself in place; it never
 * corrected anything. Three seed runs left twenty-four rows where there should
 * have been eight. Nothing broke -- the laundry screen keys its lookup on
 * item_type, so the duplicates collapsed into one correct answer -- and it
 * surfaced three stages later only because a script tried to stamp contract_id
 * onto those rows and hit the duplicate key.
 *
 * The fix is a stored generated column, AS (COALESCE(col,0)) STORED, and a
 * unique key over that. Migration 043 does it for linen_schedule and
 * contract_bills.
 *
 * CHECK 2 — rows that a unique key should have prevented, counted directly.
 * A key can be right today and the table still carry yesterday's duplicates.
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const db = await mysql.createConnection({
  host: env.DB_HOST || '127.0.0.1', port: +(env.DB_PORT || 3306),
  user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});

/* Where the nullability IS the point: the standard "unique when present, any
 * number of NULLs" idiom. Each one carries its reason, so an exemption has to
 * be argued rather than merely listed. A reader who disagrees can delete a line
 * and see what the database says. */
const DELIBERATE = {
  'crew.uq_crew_idno':
    'a crew member without an ID number must not collide with every other one',
  'crew.uq_crew_hrms':
    'the same, for crew not yet linked to an HRMS record',
  'food_licences.uq_fl_current':
    'is_current is 1 for the licence in force and NULL for every superseded one, '
    + 'so the key allows one current licence per room over unbounded history',
  'call_book_calls.uk_cbc_day_slot':
    'an ad-hoc call has no train slot and is meant to escape one-row-per-slot',
};

let bad = 0;
const say = (okFlag, line) => { console.log(`  ${okFlag ? '✓' : '✗'} ${line}`); if (!okFlag) bad++; };

const [nullableKeys] = await db.query(`
  SELECT s.TABLE_NAME AS t, s.INDEX_NAME AS k,
         GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX) AS cols,
         GROUP_CONCAT(CASE WHEN c.IS_NULLABLE = 'YES'
                            -- A stored COALESCE(...) column cannot return NULL,
                            -- whatever the catalogue says. MariaDB will not
                            -- accept NOT NULL on a generated column at all, so
                            -- the expression is the honest test, not the flag.
                            AND COALESCE(c.GENERATION_EXPRESSION, '') NOT LIKE '%coalesce%'
                       THEN s.COLUMN_NAME END) AS nullables,
         GROUP_CONCAT(CASE WHEN COALESCE(c.GENERATION_EXPRESSION, '') LIKE '%coalesce%'
                       THEN s.COLUMN_NAME END) AS derived
  FROM information_schema.STATISTICS s
  JOIN information_schema.COLUMNS c
    ON c.TABLE_SCHEMA = s.TABLE_SCHEMA AND c.TABLE_NAME = s.TABLE_NAME
   AND c.COLUMN_NAME = s.COLUMN_NAME
  WHERE s.TABLE_SCHEMA = DATABASE() AND s.NON_UNIQUE = 0 AND s.INDEX_NAME <> 'PRIMARY'
  GROUP BY s.TABLE_NAME, s.INDEX_NAME
  HAVING nullables IS NOT NULL
  ORDER BY s.TABLE_NAME, s.INDEX_NAME`);

console.log(`\n  ${env.DB_NAME} — unique keys covering a nullable column\n`);
const offenders = nullableKeys.filter(r => !DELIBERATE[`${r.t}.${r.k}`]);
if (!offenders.length) {
  say(true, 'no unique key covers a nullable column');
} else {
  for (const r of offenders) say(false, `${r.t}.${r.k} (${r.cols}) — nullable: ${r.nullables}`);
  console.log(`
       A unique key does not constrain NULLs. Add a stored generated column
       — AS (COALESCE(<col>,0)) STORED — and key on that instead.`);
}
for (const r of nullableKeys) {
  const why = DELIBERATE[`${r.t}.${r.k}`];
  if (why) console.log(`  · ${r.t}.${r.k} — by design: ${why}`);
}

const [derivedKeys] = await db.query(`
  SELECT s.TABLE_NAME AS t, s.INDEX_NAME AS k,
         GROUP_CONCAT(DISTINCT s.COLUMN_NAME) AS cols
  FROM information_schema.STATISTICS s
  JOIN information_schema.COLUMNS c
    ON c.TABLE_SCHEMA = s.TABLE_SCHEMA AND c.TABLE_NAME = s.TABLE_NAME
   AND c.COLUMN_NAME = s.COLUMN_NAME
  WHERE s.TABLE_SCHEMA = DATABASE() AND s.NON_UNIQUE = 0
    AND COALESCE(c.GENERATION_EXPRESSION, '') LIKE '%coalesce%'
  GROUP BY s.TABLE_NAME, s.INDEX_NAME ORDER BY s.TABLE_NAME`);
for (const r of derivedKeys) {
  console.log(`  · ${r.t}.${r.k} — keyed on a derived column (${r.cols}); NULL folded to 0`);
}

/* Duplicates that survived, counted where a nullable-keyed table might hold
 * them. Only the ones a NULL could have let through are worth counting. */
console.log('\n  duplicate rows a unique key should have prevented\n');
const DUP = [
  ['linen_schedule',  ['item_type', 'COALESCE(contract_id,0)']],
  ['bills',           ['contract_id', 'COALESCE(running_room_id,0)', 'period_month']],
];
for (const [table, cols] of DUP) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS extra FROM (
       SELECT COUNT(*) - 1 AS n FROM \`${table}\` GROUP BY ${cols.join(', ')} HAVING n > 0) x`);
  const [[tot]] = await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  say(row.extra === 0,
      `${table}: ${tot.n} row(s), ${row.extra === 0 ? 'no duplicate groups' : row.extra + ' duplicate group(s)'}`);
}

console.log(bad ? `\n  ${bad} fault(s) found.\n` : '\n  Schema clean.\n');
await db.end();
process.exit(bad ? 1 : 0);
