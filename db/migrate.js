#!/usr/bin/env node
/**
 * Migration runner.
 *
 *   node db/migrate.js up        apply every pending migration
 *   node db/migrate.js status    show what is applied and what is pending
 *   node db/migrate.js seed      run the seed files (idempotent)
 *
 * Migrations are plain .sql files applied in filename order and recorded in
 * schema_migrations. They are never edited once applied — a change is always
 * a new file. That is what makes the schema safe to keep changing while the
 * real data is still being collected.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const MIGRATIONS = path.join(__dirname, 'migrations');
const SEEDS = path.join(__dirname, 'seeds');

async function connect() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(120) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum   CHAR(64) NOT NULL,
      PRIMARY KEY (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

const sha = s => require('crypto').createHash('sha256').update(s).digest('hex');
const listSql = dir => fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

async function up(db) {
  await ensureTable(db);
  const [done] = await db.query('SELECT filename, checksum FROM schema_migrations');
  const applied = new Map(done.map(r => [r.filename, r.checksum]));
  let count = 0;

  for (const file of listSql(MIGRATIONS)) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const sum = sha(sql);

    if (applied.has(file)) {
      if (applied.get(file) !== sum) {
        console.error(`\n  ${file} has changed since it was applied.`);
        console.error('  Applied migrations must never be edited. Add a new migration instead.\n');
        process.exit(1);
      }
      continue;
    }
    process.stdout.write(`  applying ${file} ... `);
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?,?)', [file, sum]);
      console.log('ok');
      count++;
    } catch (e) {
      console.log('FAILED');
      console.error(`\n  ${e.message}\n`);
      process.exit(1);
    }
  }
  console.log(count ? `\n  ${count} migration(s) applied.` : '\n  Already up to date.');
}

async function status(db) {
  await ensureTable(db);
  const [done] = await db.query('SELECT filename, applied_at FROM schema_migrations');
  const applied = new Map(done.map(r => [r.filename, r.applied_at]));
  console.log();
  for (const file of listSql(MIGRATIONS)) {
    const at = applied.get(file);
    console.log(`  ${at ? '[applied]' : '[pending]'}  ${file}${at ? '   ' + at.toISOString().slice(0, 19).replace('T', ' ') : ''}`);
  }
  console.log();
}

/* `only` names ONE seed file, by its number or any part of its name.
 *
 * WHY IT EXISTS. Running every seed is not a safe way to apply a change to one
 * of them. 03_running_rooms.sql rewrites the register from the generic tender
 * figures, which puts IGP back to its unmerged 44 beds -- and the pilot merge
 * to 131 has to be re-applied afterwards or every per-bed figure in the system
 * is quietly computed against the wrong number. That has already happened once.
 *
 * So a one-file seed change gets a one-file way to apply it, instead of a full
 * reseed followed by two repair steps that someone has to remember. */
async function seed(db, only) {
  let files = listSql(SEEDS);
  if (only) {
    const want = String(only).toLowerCase();
    files = files.filter(f => f.toLowerCase().includes(want));
    if (!files.length) {
      console.error(`\n  No seed file matches "${only}". The seeds are:\n` +
                    listSql(SEEDS).map(f => '    ' + f).join('\n') + '\n');
      process.exit(1);
    }
    if (files.length > 1) {
      console.error(`\n  "${only}" matches more than one seed file:\n` +
                    files.map(f => '    ' + f).join('\n') +
                    '\n  Name it more exactly. Nothing was run.\n');
      process.exit(1);
    }
  }
  for (const file of files) {
    process.stdout.write(`  seeding ${file} ... `);
    try {
      await db.query(fs.readFileSync(path.join(SEEDS, file), 'utf8'));
      console.log('ok');
    } catch (e) {
      console.log('FAILED');
      console.error(`\n  ${e.message}\n`);
      process.exit(1);
    }
  }
  /* The summary below counts the whole register, so it is printed only after a
   * full seed. After one file it would describe tables that run did not touch,
   * and a figure that looks like a result but is not one is worse than none. */
  if (only) { console.log(); return; }
  // Counted from tables that actually exist. Beds are a column on
  // running_rooms, not a table -- allotment of an individual bed stays with
  // RRMS, and this summary once claimed to count a table that was never built.
  const one = async (sql) => (await db.query(sql))[0][0].c;
  const rr  = await one('SELECT COUNT(*) c FROM running_rooms');
  const bd  = await one('SELECT COALESCE(SUM(total_beds),0) c FROM running_rooms');
  const cl  = await one('SELECT COUNT(*) c FROM deficiency_clauses');
  const mp  = await one('SELECT COUNT(*) c FROM running_room_manpower');
  const fc  = await one('SELECT COUNT(*) c FROM food_check_items');
  console.log(`\n  ${rr} running rooms carrying ${bd} beds`);
  console.log(`  ${mp} sanctioned manpower rows, ${cl} deficiency clauses, ${fc} food safety checks.`);
}

(async () => {
  const cmd = process.argv[2] || 'status';
  const db = await connect();
  try {
    if (cmd === 'up') await up(db);
    else if (cmd === 'seed') await seed(db, process.argv[3]);
    else if (cmd === 'status') await status(db);
    else { console.error('usage: migrate.js [up | seed [one-file] | status]');
           process.exit(1); }
  } finally {
    await db.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
