const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { requirePermission } = require('../middleware/auth');
const audit = require('../services/audit');
const uploads = require('../services/uploads');
const { today } = require('../lib/day');

const router = express.Router();
router.use(requirePermission('rr.view'));

/* ----------------------------------------------------------------- vendors */
/**
 * Washing centres and pest control operators.
 *
 * `vendors.is_approved` has been read since stage 6 — the laundry screen counts
 * a dispatch to an unapproved centre as a clause C1 breach — and until now
 * NOTHING IN THE APPLICATION COULD SET IT. Every vendor in the system arrived
 * through a seed file.
 *
 * The tender asks for the laundry premises to be "inspected and approved by the
 * Railway at the beginning of the contract and from time to time thereafter",
 * and for a centre drawing repeated complaints to be changed. So approval is
 * treated as an event with a date and an officer behind it, not as a tick: an
 * approval given in 2025 is not evidence that the premises were fit in 2027,
 * and the inspection history is what shows the difference.
 */
const VENDOR_TYPES = [['laundry', 'Washing centre'], ['pest_control', 'Pest control operator'],
                      ['other', 'Other']];

router.get('/vendors', async (req, res, next) => {
  try {
    const rows = await db.query(`
      SELECT v.*, u.full_name AS approved_by_name,
             (SELECT COUNT(*) FROM running_room_vendors rv
               WHERE rv.vendor_id = v.id
                 AND (rv.effective_to IS NULL OR rv.effective_to >= CURDATE())) AS sites,
             (SELECT COUNT(*) FROM laundry_dispatch ld WHERE ld.vendor_id = v.id) AS dispatches,
             k.inspected_on AS last_inspected_on, k.result AS last_result
      FROM vendors v
      LEFT JOIN users u ON u.id = v.approved_by
      LEFT JOIN vendor_inspections k ON k.id = (
        SELECT k2.id FROM vendor_inspections k2 WHERE k2.vendor_id = v.id
        ORDER BY k2.inspected_on DESC, k2.id DESC LIMIT 1)
      ORDER BY v.is_active DESC, v.vendor_type, v.name`);

    const todayStr = today();
    rows.forEach(v => {
      v.licence_expired = v.licence_valid_till && String(v.licence_valid_till).slice(0, 10) < todayStr;
      // An approval nobody has revisited in a year is not evidence of anything
      // today. The tender's "from time to time" is given a number so the screen
      // can say something rather than nothing.
      v.stale = v.is_approved && (!v.last_inspected_on
        || (Date.now() - new Date(String(v.last_inspected_on).slice(0, 10)).getTime()) > 365 * 86400000);
    });

    res.render('masters/vendors', { title: 'Washing centres & operators',
      rows, types: VENDOR_TYPES,
      inUseUnapproved: rows.filter(v => v.is_active && !v.is_approved && (v.sites || v.dispatches)) });
  } catch (e) { next(e); }
});

router.post('/vendors', requirePermission('vendor.approve'), async (req, res, next) => {
  try {
    const type = String(req.body.vendor_type || '');
    if (!VENDOR_TYPES.some(t => t[0] === type)) { const e = new Error('Choose what kind of vendor this is.'); e.status = 400; throw e; }
    const name = String(req.body.name || '').trim().slice(0, 180);
    if (!name) { const e = new Error('The name is required.'); e.status = 400; throw e; }
    // A vendor is created UNAPPROVED. Approval is a separate, dated act by an
    // officer -- creating and approving in one motion would make the approval
    // a side effect of typing a name.
    const ins = await db.execute(`
      INSERT INTO vendors (vendor_type, name, address, contact_person, phone, gst_no,
        licence_no, licence_valid_till, is_approved, is_active, created_by)
      VALUES (?,?,?,?,?,?,?,?,0,1,?)`,
      [type, name, String(req.body.address || '').trim().slice(0, 400) || null,
       String(req.body.contact_person || '').trim().slice(0, 120) || null,
       String(req.body.phone || '').trim().slice(0, 20) || null,
       String(req.body.gst_no || '').trim().slice(0, 20) || null,
       String(req.body.licence_no || '').trim().slice(0, 60) || null,
       req.body.licence_valid_till || null, req.user.id]);
    await audit.record(req, { table: 'vendors', id: ins.insertId, action: 'insert',
      after: { vendor_type: type, name, is_approved: 0 } });
    res.redirect(`${cfg.basePath}/masters/vendors`);
  } catch (e) { next(e); }
});

router.post('/vendors/:id', requirePermission('vendor.approve'), uploads.upload.any(), async (req, res, next) => {
  try {
    const id = +req.params.id;
    const v = await db.one('SELECT * FROM vendors WHERE id = ?', [id]);
    if (!v) { const e = new Error('No such vendor.'); e.status = 404; throw e; }
    const action = String(req.body.action || '');

    if (action === 'approve') {
      await db.execute(
        `UPDATE vendors SET is_approved = 1, approved_on = ?, approved_by = ?,
                blacklisted_on = NULL, blacklist_reason = NULL WHERE id = ?`,
        [req.body.approved_on || today(), req.user.id, id]);
      await audit.record(req, { table: 'vendors', id, action: 'update',
        before: { is_approved: v.is_approved }, after: { is_approved: 1 } });

    } else if (action === 'withdraw') {
      const why = String(req.body.blacklist_reason || '').trim().slice(0, 300);
      if (!why) { const e = new Error('Say why the approval is being withdrawn.'); e.status = 400; throw e; }
      // The row is NOT deleted and not deactivated. Dispatches already sent to
      // this centre must keep pointing at a vendor that still reads correctly,
      // or last month's clause C1 case loses its subject.
      await db.execute(
        `UPDATE vendors SET is_approved = 0, blacklisted_on = CURDATE(), blacklist_reason = ? WHERE id = ?`,
        [why, id]);
      await audit.record(req, { table: 'vendors', id, action: 'update',
        before: { is_approved: v.is_approved }, after: { is_approved: 0, blacklist_reason: why } });

    } else if (action === 'inspect') {
      const on = String(req.body.inspected_on || today()).slice(0, 10);
      const result = String(req.body.result || '');
      if (!['satisfactory', 'deficient', 'unfit'].includes(result)) {
        const e = new Error('Say what the inspection found.'); e.status = 400; throw e;
      }
      let fileId = null;
      if (req.files && req.files.length) {
        fileId = await uploads.store(req.files[0],
          { entityTable: 'vendor_inspections', entityId: id, userId: req.user.id });
      }
      await db.execute(`
        INSERT INTO vendor_inspections (vendor_id, inspected_on, inspected_by, result,
          observations, evidence_file_id)
        VALUES (?,?,?,?,?,?)`,
        [id, on, req.user.id, result,
         String(req.body.observations || '').trim().slice(0, 1000) || null, fileId]);
      // Found unfit, the approval goes with the finding. Leaving it standing
      // would mean the register said "approved" the day after an officer wrote
      // that the premises were not fit to wash railway linen.
      if (result === 'unfit') {
        await db.execute(
          `UPDATE vendors SET is_approved = 0, blacklisted_on = ?, blacklist_reason = ? WHERE id = ?`,
          [on, 'Premises found unfit on inspection of ' + on, id]);
      }
      await audit.record(req, { table: 'vendor_inspections', id, action: 'insert',
        after: { vendor_id: id, inspected_on: on, result } });

    } else { const e = new Error('Unknown action.'); e.status = 400; throw e; }

    // Back to the vendor, not to the list. The officer approving, inspecting or
    // withdrawing is looking at one firm's history and wants to see what his
    // action did to it.
    res.redirect(`${cfg.basePath}/masters/vendors/${id}`);
  } catch (e) { next(e); }
});

router.get('/vendors/:id', async (req, res, next) => {
  try {
    const id = +req.params.id;
    const v = await db.one('SELECT * FROM vendors WHERE id = ?', [id]);
    if (!v) { const e = new Error('No such vendor.'); e.status = 404; throw e; }
    const checks = await db.query(`
      SELECT k.*, u.full_name AS inspected_by_name
      FROM vendor_inspections k LEFT JOIN users u ON u.id = k.inspected_by
      WHERE k.vendor_id = ? ORDER BY k.inspected_on DESC, k.id DESC`, [id]);
    const sites = await db.query(`
      SELECT rr.name, rv.service_type, rv.effective_from, rv.effective_to
      FROM running_room_vendors rv JOIN running_rooms rr ON rr.id = rv.running_room_id
      WHERE rv.vendor_id = ? ORDER BY rr.name`, [id]);
    res.render('masters/vendor', { title: v.name, v, checks, sites, types: VENDOR_TYPES });
  } catch (e) { next(e); }
});


router.get('/', (req, res) => res.render('masters/index', { title: 'Master data' }));

router.get('/designations', async (req, res, next) => {
  try {
    const rows = await db.query(`
      SELECT dg.*, (SELECT COUNT(*) FROM staff st WHERE st.designation_id = dg.id AND st.is_active = 1) AS on_roll
      FROM designations dg WHERE dg.is_active = 1 ORDER BY dg.sort_order`);
    res.render('masters/designations', { title: 'Designations', rows });
  } catch (e) { next(e); }
});

router.get('/manpower-norms', async (req, res, next) => {
  try {
    const rows = await db.query(`
      SELECT n.band_beds, dg.name, dg.sort_order, n.sanctioned_count
      FROM manpower_norms n JOIN designations dg ON dg.id = n.designation_id
      WHERE n.effective_to IS NULL ORDER BY dg.sort_order, n.band_beds`);
    const bands = [...new Set(rows.map(r => r.band_beds))].sort((a, b) => a - b);
    const matrix = new Map();
    for (const r of rows) {
      if (!matrix.has(r.name)) matrix.set(r.name, {});
      matrix.get(r.name)[r.band_beds] = r.sanctioned_count;
    }
    res.render('masters/manpower', { title: 'Manpower norms', bands, matrix: [...matrix.entries()] });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------- rate board */
/**
 * The rates for Table B — the optional and extra items.
 *
 * THE TENDER FIXES NONE OF THEM. Table B is printed with its "Cost in Rs."
 * column blank, and the terms say the cost of additional items "shall be fixed
 * by Railways ... on the basis of no-profit, no-loss" and displayed in the
 * dining hall. So every figure on this screen arrives from an order outside the
 * tender, and every figure therefore carries the authority that set it.
 *
 * Dated, because the tender adds that the rates are "subject to revision as it
 * will be decided by administration" — and a complaint about overcharging in
 * March has to be judged against March's rate board, not today's.
 *
 * An item with no rate has NO ROW. Not a zero: on a rate board, zero says the
 * item is free, which is a very different claim from "the Railway has not
 * decided yet".
 */
router.get('/menu', async (req, res, next) => {
  try {
    const items = await db.query(
      `SELECT * FROM menu_items WHERE is_active = 1 ORDER BY schedule_table, sort_order`);
    const rates = await db.query(
      `SELECT * FROM menu_item_rates ORDER BY menu_item_id, effective_from DESC`);
    const current = {}, history = {};
    const on = String(req.query.on || today()).slice(0, 10);
    for (const r of rates) {
      (history[r.menu_item_id] ||= []).push(r);
      const d = String(r.effective_from).slice(0, 10);
      if (d <= on && !current[r.menu_item_id]) current[r.menu_item_id] = r;
    }
    const mealRates = await db.query(
      `SELECT * FROM meal_rates ORDER BY meal_type, effective_from DESC`);
    const tableB = items.filter(i => i.schedule_table === 'B');
    res.render('masters/menu', { title: 'Menu card and rate board',
      tableA: items.filter(i => i.schedule_table === 'A'), tableB,
      current, history, mealRates, on,
      unpriced: tableB.filter(i => !current[i.id]).length,
      saved: req.query.saved ? +req.query.saved : null });
  } catch (e) { next(e); }
});

router.post('/menu', requirePermission('menu.manage'), async (req, res, next) => {
  try {
    const on = String(req.body.effective_from || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) {
      const e = new Error('A rate has to have a date it takes effect from.'); e.status = 400; throw e;
    }
    const authority = String(req.body.authority || '').trim().slice(0, 160) || null;
    const items = await db.query(`SELECT id FROM menu_items WHERE schedule_table = 'B'`);

    let set = 0;
    for (const it of items) {
      const raw = String(req.body[`r_${it.id}`] === undefined ? '' : req.body[`r_${it.id}`]).trim();
      // Blank means "still not fixed", and it leaves whatever is on record
      // alone. Clearing a rate that was once fixed is not something this screen
      // does: a rate board that silently loses a price is worse than a stale one.
      if (raw === '') continue;
      const rate = Number(raw);
      if (!Number.isFinite(rate) || rate < 0) continue;
      await db.execute(`
        INSERT INTO menu_item_rates (menu_item_id, effective_from, rate, authority, recorded_by)
        VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE rate = VALUES(rate), authority = VALUES(authority),
          recorded_by = VALUES(recorded_by)`,
        [it.id, on, rate.toFixed(2), authority, req.user.id]);
      set++;
    }

    await audit.record(req, { table: 'menu_item_rates', id: 0, action: 'update',
      after: { effective_from: on, items: set, authority } });
    res.redirect(`${cfg.basePath}/masters/menu?saved=${set}`);
  } catch (e) { next(e); }
});

router.get('/deficiency-clauses', async (req, res, next) => {
  try {
    const rows = await db.query(`
      SELECT * FROM deficiency_clauses WHERE is_active = 1
      ORDER BY group_code, LENGTH(clause_code), clause_code`);
    res.render('masters/clauses', { title: 'Deficiency schedule', rows });
  } catch (e) { next(e); }
});

module.exports = router;
