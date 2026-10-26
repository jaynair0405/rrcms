/**
 * Is the database behind the code?
 *
 * WHY THIS EXISTS
 *
 * On 26.08.2026 a divisional officer opened the dashboard and got
 *
 *     Error: Unknown column 'c.loa_no' in 'field list'
 *
 * because migration 035 had not been run. Nothing was wrong with the data and
 * nothing was wrong with the code: the two had simply drifted apart by one
 * file, and the application had no idea. It started happily, served every page
 * that touched no new column, and then failed with raw SQL in front of a user
 * who could do nothing about it.
 *
 * A pending migration is an operator's mistake with a one-line cure, and the
 * application is the only thing in a position to notice. So it now looks, at
 * boot, and says so in words that name the command.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not run migrations. Applying schema changes on startup means a
 * process restart can alter a live database with nobody watching, and two app
 * processes coming up together can race each other through the same file. The
 * check reports; a person still decides.
 *
 * In production a pending migration REFUSES THE BOOT. Serving pages that work
 * until somebody reaches the wrong screen is worse than not starting: the fault
 * is then discovered by a user rather than by whoever did the deployment.
 * Everywhere else it is a loud warning, because a developer mid-change should
 * not be blocked by his own half-written migration.
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');
const cfg = require('../config');

const DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

async function pendingMigrations() {
  let files = [];
  try {
    files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
  } catch {
    return { ok: true, pending: [], note: 'no migrations directory' };
  }

  let applied;
  try {
    const rows = await db.query('SELECT filename FROM schema_migrations');
    applied = new Set(rows.map(r => r.filename));
  } catch (e) {
    // No schema_migrations at all means nothing has ever been applied — a
    // fresh database, or the wrong one. Both are worth saying out loud.
    if (/schema_migrations/.test(e.message || '')) {
      return { ok: false, pending: files, fresh: true };
    }
    // Anything else is the database being unreachable, which the pool will
    // report far more clearly than a guess from here.
    return { ok: true, pending: [], note: `could not be checked: ${e.message}` };
  }

  return { ok: true, pending: files.filter(f => !applied.has(f)) };
}

/**
 * Called from the entry point before listening. Returns true if the process
 * should go on.
 */
async function verify() {
  const r = await pendingMigrations();
  if (r.note) { console.warn(`  schema check skipped — ${r.note}`); return true; }
  if (!r.pending.length) return true;

  const production = cfg.env === 'production';
  const lines = [
    '',
    r.fresh
      ? `  THE DATABASE HAS NO MIGRATIONS APPLIED AT ALL (${cfg.db.database}).`
      : `  THE DATABASE IS BEHIND THE CODE by ${r.pending.length} migration${r.pending.length === 1 ? '' : 's'}:`,
    ...r.pending.map(f => `      ${f}`),
    '',
    '  Screens that read the new columns will fail with a raw SQL error.',
    '  Run:',
    '      node db/migrate.js up',
    r.fresh ? '      node db/migrate.js seed' : '',
    '',
  ].filter(l => l !== '');

  if (production) {
    console.error(lines.join('\n'));
    console.error('  Refusing to start in production with the schema behind the code.\n');
    return false;
  }
  console.warn(lines.join('\n'));
  console.warn('  Starting anyway because this is not production.\n');
  return true;
}

module.exports = { verify, pendingMigrations };
