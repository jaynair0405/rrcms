/**
 * Turns the demo into the pilot.
 *
 *     npm run demo:pilot
 *
 * The ordinary demo carries generated sample data across all 44 running rooms,
 * which is what you want when showing somebody what the application does. This
 * overlay replaces it with what the Railway has actually supplied: the four
 * pilot sites and the three real rosters, and nothing else.
 *
 * It deliberately does NOT invent operational history for these people. There
 * is no muster, no feedback, no inspection and no certificate, because none has
 * been taken. Attaching generated attendance to a named cook would put a figure
 * on screen that nobody can vouch for, and the whole point of loading real data
 * is to see the truth of it -- including how much of it is still missing.
 *
 * The result mirrors, screen for screen, what the real MySQL database holds
 * after `node db/seed-pilot.js --only`.
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'pilot');
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

function apply(D) {
  const SITES = read('sites.json');
  const STAFF = read('staff.json');
  const CONTRACTORS = read('contractors.json');

  const bandOf = b => b < 50 ? 50 : b <= 110 ? 100 : b <= 160 ? 150 : b <= 210 ? 200 : 250;
  const categoryOf = b => b >= 35 ? 'A' : b >= 25 ? 'B' : 'C';
  const inDiv = name => D.RUNNING_ROOMS.filter(
    r => r.name === name && r.div_code === SITES.division);

  /* ------------------------------------------------------------- merges */
  for (const m of SITES.merges) {
    const survivor = inDiv(m.survivor)[0];
    if (!survivor) continue;
    const absorbed = m.absorbs.map(n => inDiv(n)[0]).filter(Boolean);
    const parts = [survivor, ...absorbed];
    survivor.name = m.rename_to;
    survivor.total_beds = parts.reduce((a, r) => a + r.total_beds, 0);
    survivor.physical_rooms = parts.reduce((a, r) => a + r.physical_rooms, 0);
    survivor.female_rooms = parts.reduce((a, r) => a + r.female_rooms, 0);
    survivor.ref_crews_per_day = parts.reduce((a, r) => a + r.ref_crews_per_day, 0);
    survivor.ref_peak_occupancy = parts.reduce((a, r) => a + r.ref_peak_occupancy, 0);
    survivor.category = categoryOf(survivor.total_beds);
    survivor.band = bandOf(survivor.total_beds);
    survivor.remarks = `Merged for the pilot from ${parts.length} register entries: `
      + `${parts.map(p => p.name).join(', ')}. ${m.reason}`;
    absorbed.forEach(r => {
      r.status = 'closed';
      r.remarks = `Absorbed into ${m.rename_to} for the pilot. Register entry retained, not deleted.`;
    });
  }

  /* ---------------------------------------------------------- new sites */
  let nextId = Math.max(...D.RUNNING_ROOMS.map(r => r.id));
  for (const s of SITES.new_sites) {
    if (inDiv(s.name).length) continue;
    const div = D.DIVS.find(x => x.code === s.division);
    D.RUNNING_ROOMS.push({
      id: ++nextId, code: s.code, name: s.name, station_code: s.station_code,
      division_id: div.id, div_code: div.code, div_name: div.name,
      control_dept: 'Electrical', category: s.category,
      physical_rooms: s.physical_rooms, total_beds: s.total_beds,
      female_rooms: s.female_rooms, ref_crews_per_day: s.ref_crews_per_day,
      ref_peak_occupancy: s.ref_peak_occupancy,
      has_meal_facility: s.has_meal_facility, has_housekeeping: s.has_housekeeping,
      ac_status: s.ac_status, ac_remarks: null, status: s.status,
      band: bandOf(s.total_beds), remarks: s.remarks,
      contractor_id: null, contractor: null, agreement_no: null,
    });
  }

  /* ---------------------------------------- park everything else */
  const pilot = SITES.pilot.map(n => inDiv(n)[0]).filter(Boolean);
  const pilotIds = new Set(pilot.map(r => r.id));
  D.RUNNING_ROOMS.forEach(r => {
    if (!pilotIds.has(r.id) && r.status === 'operational') {
      r.status = 'not_in_scope';
      r.remarks = 'Not in the pilot. Open and working; not yet carried on this system.';
    }
  });

  /* ------------------------------------------ placeholder contractors */
  // Clear the generated contractor off every room first. Leaving it behind
  // let a supervisor whose placeholder id happened to match a generated one
  // reach running rooms his firm does not hold -- a scoping leak, not a
  // cosmetic one.
  D.RUNNING_ROOMS.forEach(r => { r.contractor_id = null; r.contractor = null;
                                 r.agreement_no = null; });
  D.CONTRACTORS.length = 0;
  CONTRACTORS.contractors.forEach((c, i) => {
    const rr = inDiv(c.site)[0];
    D.CONTRACTORS.push({ id: i + 1, code: c.code, name: c.name,
      contact_person: c.contact_person || null, phone: c.phone || null, is_active: 1,
      is_blacklisted: 0, address: c.address || null });
    if (rr) {
      rr.contractor_id = i + 1;
      rr.contractor = c.name;
      rr.contractor_code = c.code;
      rr.contractor_address = c.address || null;
      // No agreement has been supplied for any of the four.
      rr.agreement_no = `AGREEMENT-AWAITED/${c.site}/${c.code}`;
    }
  });

  /* -------------------------------------------------- the agreements
   *
   * The pilot's true state, and the reason the dashboard panel was asked for:
   * FOUR RUNNING ROOMS ARE WORKING AND NOT ONE AGREEMENT HAS BEEN SUPPLIED.
   * No agreement number, no LOA, no LOA date, no security deposit, no
   * performance guarantee. The demo says so rather than inventing paperwork —
   * an officer who opens this panel at go-live should see exactly what he will
   * see on the real system, which is a list of things to chase.
   */
  D.CONTRACTS.length = 0;
  CONTRACTORS.contractors.forEach((c, i) => {
    const rr = inDiv(c.site)[0];
    if (!rr) return;
    D.CONTRACTS.push({
      id: i + 1,
      agreement_no: rr.agreement_no,
      loa_no: null, loa_date: null,
      // The contract period is not known either. Held as the pilot go-live and
      // a year out so the panel has something to draw, and flagged as awaited
      // through the agreement number itself.
      start_date: null, end_date: null, extended_to: null,
      status: 'draft',
      security_deposit: null, performance_guarantee: null,
      contractor_id: i + 1, contractor_name: c.name, contractor_code: c.code,
      division_id: rr.division_id, div_code: rr.div_code,
      rooms: [rr],
    });
  });

  /* -------------------------------------------- sanctioned strength */
  Object.keys(D.MANPOWER).forEach(k => { delete D.MANPOWER[k]; });
  const KITCHEN = ['head_cook', 'cook_veg', 'cook_nonveg', 'asst_cook', 'table_boy', 'utensil_wash'];
  for (const rr of pilot) {
    D.MANPOWER[rr.id] = D.DESIGNATIONS.map(d => {
      const norm = D.NORMS[rr.band][d.code] || 0;
      const sanctioned = (!rr.has_meal_facility && KITCHEN.includes(d.code)) ? 0 : norm;
      return { running_room_id: rr.id, designation_id: d.id, name: d.name, code: d.code,
        skill_category: d.skill_category, sort_order: d.sort_order,
        band_beds: rr.band, norm_count: norm, sanctioned_count: sanctioned,
        on_roll: 0, is_scaled: 0, is_overridden: 0 };
    });
  }

  /* -------------------------------------------------- the real rosters */
  D.STAFF.length = 0;
  let sid = 1;
  for (const [site, roster] of Object.entries(STAFF.rosters)) {
    const rr = inDiv(site)[0];
    if (!rr) continue;
    for (const p of roster.staff) {
      const code = STAFF.designation_map[p.designation];
      const dg = D.DESIGNATIONS.find(x => x.code === code);
      if (!dg) continue;
      const id = 1000 + sid++;
      D.STAFF.push({
        id, staff_code: `${rr.code}-${String(id).padStart(5, '0')}`, full_name: p.name,
        father_name: null, date_of_birth: null, gender: null, phone: null, address: null,
        designation_id: dg.id, designation: dg.name, skill_category: dg.skill_category,
        requires_qualification: dg.requires_qualification,
        qualification_note: dg.qualification_note,
        running_room_id: rr.id, rr_id: rr.id, rr_name: rr.name, div_code: rr.div_code,
        contractor_id: rr.contractor_id, contractor: rr.contractor,
        contractor_code: rr.contractor_code || null,
        contractor_address: rr.contractor_address || null,
        // Nothing invented: no joining date, no bank, no EPF, no ESIC.
        date_of_joining: null, date_of_leaving: null,
        bank_account_no: null, bank_ifsc: null, epf_no: null, esic_no: null,
        screening_status: 'pending', screened_on: null, rejection_reason: null,
        id_card_no: null, id_card_issued_on: null,
        agreement_no: rr.agreement_no, is_active: 1,
        // The contractor's own word for the post, kept beside the one it maps to.
        contractor_designation: p.designation,
      });
      D.DOCS[id] = []; D.ISSUES[id] = []; D.REPLACEMENTS[id] = [];
      const m = (D.MANPOWER[rr.id] || []).find(x => x.designation_id === dg.id);
      if (m) m.on_roll++;
    }
  }

  /* --------------------- clear everything that has not actually happened */
  // These are records of things done at a site: a muster marked, a meal rated,
  // an inspection carried out. None has been, so none is shown.
  const emptyMap = o => Object.keys(o).forEach(k => { delete o[k]; });
  [D.ATTENDANCE, D.COUNTERSIGNED, D.CALLBOOK, D.CALLS, D.MEALS, D.LINEN, D.LINEN_STOCK, D.CCTV,
   D.COMPLAINTS, D.COVERAGE, D.GRADING, D.DEFICIENCIES, D.LAUNDRY, D.CONSUMABLE_ISSUES, D.ASSETS,
   D.BREAKDOWNS, D.PEST, D.KITCHEN_COMPLIANCE, D.RR_VENDORS].forEach(emptyMap);
  if (D.CALL_CHANGES) D.CALL_CHANGES.length = 0;

  /* ------------------------------- the real trains these rooms call for */
  // The one thing on a pilot screen that is NOT a record of something done,
  // and therefore the one thing that should be real rather than empty: the
  // room's list of trains. Invented five-digit numbers make the call sheet
  // look like a toy to anybody who knows the section.
  //
  // Built from the division's own working timetable summary and train master —
  // times at IGATPURI, LONAVLA and ROHA, with names and run days. Nothing in it
  // is generated.
  //
  // UP only is switched on: a crew works DOWN to Igatpuri, is relieved, sleeps,
  // and is called for an UP train back. The DN rows are carried but inactive —
  // they become live the day Bhusawal's crews rest here and are called DN
  // onward, and can be switched on under "Trains on the sheet".
  emptyMap(D.SHEET_TRAINS);
  {
    const sheet = read('call-sheet.json');
    let id = 0;
    for (const rr of pilot) {
      const code = rr.station_code || rr.name;
      const list = (sheet.rooms && sheet.rooms[code]) || [];
      D.SHEET_TRAINS[rr.id] = list.map(t => ({
        id: ++id, running_room_id: rr.id,
        train_no: t.train_no, train_name: t.train_name, direction: t.direction,
        sign_on_time: t.sign_on_time, arrives_at: t.arrives_at,
        from_station: t.from_station, to_station: t.to_station,
        run_days: t.run_days, effective_from: null, effective_until: null,
        source: 'imported', is_active: t.direction === 'UP' ? 1 : 0, notes: null,
      }));
    }
  }
  // The crew register is emptied because no call has been recorded at these
  // sites. The staff master is NOT emptied -- it is CRTMS's, it exists whether
  // or not RR-CMS has been used, and clearing it would hide the very feature
  // the pilot is meant to exercise.
  [D.CREW, D.FEEDBACK, D.INSPECTIONS, D.INSPECTION_ITEMS, D.VENDORS,
   D.FOOD_LICENCES, D.FOOD_RETURNS, D.FOOD_INSPECTIONS, D.FOOD_INSPECTION_ITEMS]
    .forEach(a => { a.length = 0; });
  D.CERTIFICATES.clear();
  D.CERT_DEFICIENCIES.clear();
  D.FILES.clear();

  return {
    sites: pilot.map(r => r.name),
    staff: D.STAFF.length,
    parked: D.RUNNING_ROOMS.filter(r => r.status === 'not_in_scope').length,
  };
}

module.exports = { apply };
