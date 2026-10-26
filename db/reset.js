#!/usr/bin/env node
/** Drops every table in the configured database. Development only. */
const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to reset in production.'); process.exit(1); }
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, multipleStatements: true,
  });
  const [rows] = await db.query(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?', [process.env.DB_NAME]);
  if (!rows.length) { console.log('  Nothing to drop.'); await db.end(); return; }
  await db.query('SET FOREIGN_KEY_CHECKS=0');
  for (const r of rows) await db.query(`DROP TABLE IF EXISTS \`${r.t}\``);
  await db.query('SET FOREIGN_KEY_CHECKS=1');
  console.log(`  Dropped ${rows.length} tables from ${process.env.DB_NAME}.`);
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
