#!/usr/bin/env node
/**
 * Why does a screen ask for a column the database has not got?
 *
 *   node tools/why-no-column.js
 *
 * READ ONLY. It changes nothing.
 *
 * The linen page died with "Unknown column 'from_pool' in 'where clause'"
 * after stage 72, which shipped migration 058 to add exactly that column.
 * Two very different things look identical from the error message alone:
 *
 *   058 never ran        -- the runner was never told to apply anything, or
 *                          it applied to a DIFFERENT database than the one
 *                          the server is reading.
 *   058 ran and failed   -- the ALTER was refused by MySQL 8 in some way
 *                          MariaDB did not refuse, and the run stopped there.
 *
 * The first is cured by one command. The second needs a new migration. So the
 * first thing to establish is which of the two it is -- and this asks the
 * database rather than reasoning about it, because the database is the only
 * thing that knows.
 */
require('dotenv').config();
const db = require('../src/db');

const WANT = [
  ['laundry_dispatch', 'from_pool',       '058_linen_leaves_a_pool.sql'],
  ['linen_daily_item', 'shelf_sent_seen', '059_shelf_movements_seen.sql'],
  ['linen_daily_item', 'shelf_off_seen',  '059_shelf_movements_seen.sql'],
  ['linen_daily_item', 'returns_seen',    '057_returns_since_the_count.sql'],
];

(async () => {
  const where = await db.one(
    'SELECT DATABASE() AS db, @@hostname AS host, @@version AS version, @@port AS port');
  console.log(`\n  Talking to database "${where.db}" on ${where.host}:${where.port} — MySQL ${where.version}`);
  console.log(`  (from .env: DB_NAME=${process.env.DB_NAME || '(unset)'} `
            + `DB_HOST=${process.env.DB_HOST || '127.0.0.1'} DB_PORT=${process.env.DB_PORT || 3306})\n`);

  const applied = new Map(
    (await db.query('SELECT filename, applied_at FROM schema_migrations')).map(r => [r.filename, r.applied_at]));

  console.log('  MIGRATIONS 055 ONWARDS, as the database records them');
  require('fs').readdirSync(require('path').join(__dirname, '..', 'db', 'migrations'))
    .filter(f => f.endsWith('.sql') && f >= '055').sort()
    .forEach(f => {
      const at = applied.get(f);
      console.log(`    ${at ? '[applied]' : '[PENDING]'}  ${f}`
        + (at ? '   ' + new Date(at).toISOString().slice(0, 19).replace('T', ' ') : ''));
    });

  console.log('\n  COLUMNS THE LINEN SCREENS ASK FOR');
  const missing = [];
  for (const [table, col, from] of WANT) {
    const row = await db.one(
      `SELECT COLUMN_TYPE AS column_type FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, col]);
    if (row) console.log(`    [present]  ${table}.${col}   ${row.column_type}`);
    else { console.log(`    [MISSING]  ${table}.${col}   added by ${from}`); missing.push([table, col, from]); }
  }

  console.log();
  if (!missing.length) {
    console.log('  Every column is there. If the page still fails, the running server is\n'
              + '  older than the database: stop it and start it again.\n');
  } else {
    const pending = missing.filter(m => !applied.has(m[2]));
    if (pending.length === missing.length) {
      console.log('  VERDICT — the migration was never applied to THIS database.\n'
                + '  Nothing is broken and nothing is lost. Apply it:\n\n'
                + '      npm run migrate\n\n'
                + '  If it says "Already up to date", then the database you applied it to is\n'
                + '  not the database above, and the .env line is what to look at.\n');
    } else {
      console.log('  VERDICT — the runner has RECORDED the migration but the column is not\n'
                + '  there. Re-running will not help: the runner skips what it has recorded.\n'
                + '  This needs a new, guarded migration. Tell me and I will write it.\n');
    }
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
