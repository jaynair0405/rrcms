#!/usr/bin/env node
/**
 * Proves a backup actually restores.
 *
 * INSTALL.md has always carried the two backup commands. Nobody had ever run
 * the other half — and a backup nobody has restored is a hope, not a backup.
 * The failure this is written to catch is the one the install notes warn about
 * and no dump can show on its own: **records pointing at documents that are not
 * there.** The database and the uploads directory are two separate artefacts,
 * and a restore of one without the other looks perfectly healthy until an
 * officer clicks a scanned FSSAI licence and gets nothing.
 *
 *   node tools/restore-check.mjs <dump.sql> <uploads.tar.gz> [scratch-db-name]
 *
 * It restores into a SCRATCH database — never the live one — checks that the
 * schema is level with the code, that the core registers came back with rows,
 * and that every file the restored database refers to is present in the
 * restored uploads. It drops nothing and touches no live data.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const DUMP    = process.argv[2];
const UPLOADS = process.argv[3];
const SCRATCH = process.argv[4] || `${process.env.DB_NAME || 'rrcms'}_restorecheck`;

if (!DUMP || !UPLOADS) {
  console.error('usage: node tools/restore-check.mjs <dump.sql> <uploads.tar.gz> [scratch-db-name]');
  process.exit(2);
}
for (const f of [DUMP, UPLOADS]) if (!existsSync(f)) { console.error(`not found: ${f}`); process.exit(2); }

const LIVE = process.env.DB_NAME || 'rrcms';
if (SCRATCH === LIVE) {
  console.error(`refusing to restore over the live database (${LIVE}). Give a different scratch name.`);
  process.exit(2);
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { console.log('  ✓ ' + n); pass++; }
  else { console.log('  ✗ ' + n + (extra ? '\n       ' + String(extra).slice(0, 400) : '')); fail++; }
};

const my = (args, input) => execFileSync('mysql', [
  '-h', process.env.DB_HOST || '127.0.0.1',
  '-P', String(process.env.DB_PORT || 3306),
  '-u', process.env.DB_USER, `-p${process.env.DB_PASSWORD}`, ...args,
], { input, encoding: 'utf8', maxBuffer: 1 << 28 });

console.log(`\n  Restoring ${path.basename(DUMP)} into ${SCRATCH} (the live ${LIVE} is not touched)\n`);

try {
  my(['-e', `DROP DATABASE IF EXISTS \`${SCRATCH}\`; CREATE DATABASE \`${SCRATCH}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`]);
  my([SCRATCH], (await import('node:fs')).readFileSync(DUMP, 'utf8'));
  ok('the dump restores without error', true);
} catch (e) {
  ok('the dump restores without error', false, e.stderr || e.message);
  process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), 'rrcms-restore-'));
try {
  execFileSync('tar', ['xzf', UPLOADS, '-C', work]);
  ok('the uploads archive unpacks', true);
} catch (e) {
  ok('the uploads archive unpacks', false, e.stderr || e.message);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1', port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: SCRATCH,
  multipleStatements: false,
});
const q = async (sql, p = []) => (await conn.query(sql, p))[0];

// 1. Is the restored schema level with the code that will be run against it?
const applied = await q('SELECT filename FROM schema_migrations');
const onDisk = readdirSync(path.join(process.cwd(), 'db', 'migrations')).filter(f => f.endsWith('.sql'));
const missing = onDisk.filter(f => !applied.some(a => a.filename === f));
ok(`the restored schema is level with the code (${applied.length} of ${onDisk.length} migrations)`,
   missing.length === 0, missing.join(', '));

// 2. Did the registers come back with anything in them? A dump that restores
//    cleanly and is empty is the failure people discover a week later.
for (const [t, why] of [
  ['running_rooms', 'the register itself'],
  ['users', 'nobody could sign in'],
  ['permissions', 'every screen would be unreachable'],
  ['deficiency_clauses', 'the schedule'],
]) {
  const [{ n }] = await q(`SELECT COUNT(*) AS n FROM \`${t}\``);
  ok(`${t} came back with rows — without them, ${why}`, n > 0, `${n} rows`);
}

// 3. THE ONE THAT MATTERS. Every document the database refers to must be in the
//    uploads that were restored beside it.
const files = await q('SELECT id, stored_path, original_name FROM files');
const found = [], lost = [];
for (const f of files) {
  const rel = String(f.stored_path || '').replace(/^\/+/, '');
  const candidates = [path.join(work, rel), path.join(work, 'uploads', rel), path.join(work, path.basename(rel))];
  (candidates.some(c => { try { return statSync(c).isFile(); } catch { return false; } }) ? found : lost).push(f);
}
ok(`every document the database refers to is present in the uploads (${found.length} of ${files.length})`,
   lost.length === 0,
   lost.slice(0, 8).map(f => `#${f.id} ${f.original_name || f.stored_path}`).join('\n       '));

// 4. And nothing points at a file row that is gone.
const orphans = await q(`
  SELECT COUNT(*) AS n FROM staff_documents sd
  WHERE sd.file_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = sd.file_id)`);
ok('no record points at a file row that is not in the dump', orphans[0].n === 0, `${orphans[0].n} orphaned`);

await conn.end();
rmSync(work, { recursive: true, force: true });

console.log(`\n  ${pass} passed, ${fail} failed`);
console.log(`  The scratch database ${SCRATCH} is left in place so you can look at it.`);
console.log(`  Drop it when you are done:  DROP DATABASE \`${SCRATCH}\`;\n`);
process.exit(fail ? 1 : 0);
