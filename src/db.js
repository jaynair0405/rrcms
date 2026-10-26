/**
 * Database access.
 *
 * The pool is injectable. Standalone, this module creates its own. Mounted
 * inside CRTMS, the host passes its pool to createApp({ pool }) and this
 * module never opens a connection of its own — one place to change, not many.
 */
const mysql = require('mysql2/promise');
const cfg = require('./config');
const day = require('./lib/day');

let pool = null;

function setPool(p) { pool = p; }

/* THE DATABASE IS PUT ON THE SAME CLOCK AS THE APPLICATION.
   CURDATE() and NOW() run on the database server's own time zone, and 70
   queries in this system use them. The application's dates are Indian dates
   (see lib/day.js). If the two disagree -- and they did, by 5½ hours a day,
   on any server not set to IST -- then `WHERE dispatch_date = CURDATE()` and
   `WHERE dispatch_date = ?` select different days from the same table, and
   nothing on any screen says so. Setting it per connection rather than
   trusting the server means a laptop, the container and the machine at Mumbai
   all answer the same. */
function onConnect(conn) {
  // The pool hands out the CALLBACK connection here, not the promise wrapper,
  // whatever the rest of this file is using. Calling .then() on it throws a
  // programming error at the moment a connection is made, which is to say at
  // the moment the first page is served.
  conn.query(`SET time_zone = '${day.sqlOffset()}'`, err => {
    // A server that will not take the offset is not a reason to refuse
    // service; the application's own dates are still right. It is worth
    // saying once, in the log, rather than failing a request over it.
    if (err) console.warn(`could not set the database time zone to ${day.sqlOffset()}: ${err.message}`);
  });
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...cfg.db, waitForConnections: true, queueLimit: 0, dateStrings: true,
      // mysql2 uses this when it writes JS Dates; the SET above governs what
      // the server itself calls now. Both have to say the same thing.
      timezone: day.sqlOffset() });
    pool.on('connection', onConnect);
  }
  return pool;
}

/** A host that injects its own pool gets the clock set on it too. */
function adoptPool(p) { pool = p; if (p && p.on) p.on('connection', onConnect); }

/** Rows for a SELECT. */
async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

/** First row, or null. */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Scalar from the first column of the first row. */
async function scalar(sql, params = []) {
  const row = await one(sql, params);
  return row ? Object.values(row)[0] : null;
}

/** INSERT/UPDATE/DELETE; returns the driver result. */
async function execute(sql, params = []) {
  const [res] = await getPool().execute(sql, params);
  return res;
}

/**
 * Run fn inside a transaction.
 *
 * fn receives a small facade with the same four methods as this module, bound
 * to the transaction's own connection. Use it — calling db.query() inside the
 * callback would go back to the pool on a different connection and quietly sit
 * outside the transaction, which is the classic way to end up with a rollback
 * that rolls nothing back.
 *
 *   await db.transaction(async tx => {
 *     await tx.execute('INSERT ...');
 *     await tx.execute('DELETE ...');
 *   });
 *
 * The raw connection is passed as the second argument for anything the facade
 * does not cover.
 */
async function transaction(fn) {
  const conn = await getPool().getConnection();
  const tx = {
    query: async (sql, params = []) => { const [rows] = await conn.query(sql, params); return rows; },
    one: async (sql, params = []) => {
      const [rows] = await conn.query(sql, params);
      return rows.length ? rows[0] : null;
    },
    scalar: async (sql, params = []) => {
      const [rows] = await conn.query(sql, params);
      return rows.length ? Object.values(rows[0])[0] : null;
    },
    execute: async (sql, params = []) => { const [res] = await conn.execute(sql, params); return res; },
  };
  try {
    await conn.beginTransaction();
    const out = await fn(tx, conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { adoptPool, setPool, getPool, query, one, scalar, execute, transaction };
