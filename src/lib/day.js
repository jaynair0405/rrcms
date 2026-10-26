/**
 * THE APPLICATION'S CLOCK.
 *
 * Every date in this system is an Indian date. A running room works round the
 * clock — the night supervisor books a crew in at half past midnight — and the
 * day his entry belongs to is the day it is in Igatpuri, not the day it is in
 * Greenwich.
 *
 * WHAT WAS WRONG. Fifty-four places computed the date as
 * `new Date().toISOString().slice(0, 10)`, which is the UTC date. India is
 * 5½ hours ahead, so between midnight and 05:30 IST the application called it
 * YESTERDAY. Three things followed, none of them visible:
 *
 *   The date box opened on yesterday, so a night entry was filed to the wrong
 *   day unless the supervisor noticed and changed it.
 *
 *   Worse, the guards read `if (date > today())` and REFUSED the true current
 *   date as "in the future". Between midnight and half past five a supervisor
 *   could not record the day he was standing in at all.
 *
 *   And the database disagreed with the application. MySQL's CURDATE() runs on
 *   the server's own clock — IST on the machine at Mumbai — while the routes
 *   ran on UTC. For 5½ hours a day, `WHERE dispatch_date = CURDATE()` and
 *   `WHERE dispatch_date = ?` selected different days from the same table.
 *
 * So: one clock, named here, used by the routes, the views and the database
 * session alike. APP_TZ can move it — a railway that spans one time zone today
 * may not always — but it is one line, not fifty-four.
 */
const TZ = process.env.APP_TZ || 'Asia/Kolkata';

// en-CA formats as YYYY-MM-DD, which is the shape every DATE column, every
// <input type="date"> and every string comparison in this system expects.
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Today's date at the running room, as YYYY-MM-DD. */
function today(d) { return dayFmt.format(d || new Date()); }

/** This month at the running room, as YYYY-MM. */
function thisMonth(d) { return today(d).slice(0, 7); }

/** The wall clock at the running room, as HH:MM. */
function clock(d) { return timeFmt.format(d || new Date()); }

/** Now, as YYYY-MM-DD HH:MM:SS, for a DATETIME column. */
function stamp(d) {
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d || new Date());
  return `${today(d)} ${t}`;
}

/** N days before or after a date string, staying in YYYY-MM-DD. */
function shift(dateStr, days) {
  const t = Date.parse(String(dateStr).slice(0, 10) + 'T00:00:00Z') + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from a to b, both YYYY-MM-DD. Negative if b is earlier. */
function daysBetween(a, b) {
  return Math.round((Date.parse(String(b).slice(0, 10) + 'T00:00:00Z')
                   - Date.parse(String(a).slice(0, 10) + 'T00:00:00Z')) / 86400000);
}

/**
 * The first of the month, n months before the running room's today.
 *
 * The month helpers took `new Date()` and then read getUTCMonth() off it, so
 * for 5½ hours at the turn of every month they named the wrong month: at
 * 02:00 IST on 1 September, "last month" came back July. A month is chosen off
 * the Indian date like every other date here.
 */
function monthStart(n) {
  const [y, m] = today().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - (n || 0), 1)).toISOString().slice(0, 10);
}

/** The last day of the month a date falls in, as YYYY-MM-DD. */
function monthEnd(dateStr) {
  const [y, m] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The offset to hand the database, so CURDATE() means the same thing there. */
function sqlOffset(d) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(d || new Date());
  const name = (parts.find(p => p.type === 'timeZoneName') || {}).value || 'GMT+05:30';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? `${m[1]}${m[2]}:${m[3]}` : '+05:30';
}

module.exports = { TZ, today, thisMonth, clock, stamp, shift, daysBetween,
                   monthStart, monthEnd, sqlOffset };
