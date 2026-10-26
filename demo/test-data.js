/**
 * Fills a few people in with invented particulars, so the screens downstream
 * of the staff register — muster, man-days, the monthly pack — can be tested
 * before the Railway has collected the real particulars.
 *
 *     npm run demo:test
 *
 * Everything this writes is FALSE, and is written to be obvious about it:
 *
 *   - phone numbers all begin 90000, which is not a number anybody holds;
 *   - EPF and ESIC numbers begin TEST/, so one search finds every one;
 *   - the sign-in banner says how many people carry invented particulars;
 *   - each such record carries a line on screen saying so.
 *
 * It is a separate command from `npm run demo:pilot` on purpose. The pilot
 * shows the Railway's data and its gaps truthfully; this shows what the system
 * looks like once those gaps are closed. Mixing the two silently would mean an
 * officer could not tell which figures were real, which is precisely the
 * failure this whole system exists to prevent.
 */

/** The six the tender requires before a person may be deployed. */
const REQUIRED = ['photo_id', 'police_verification', 'medical_fitness',
                  'bank_proof', 'epf_proof', 'esic_proof'];

const BANKS = [
  ['State Bank of India',  'SBIN000'], ['Bank of Baroda',   'BARB0IG'],
  ['Union Bank of India',  'UBIN080'], ['Bank of India',    'BKID000'],
  ['Punjab National Bank', 'PUNB011'],
];

function apply(D, opts = {}) {
  // Deterministic: the same run always produces the same particulars, so a
  // figure on screen can be traced back rather than shifting between runs.
  let seed = 7919;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = a => a[ri(0, a.length - 1)];
  const iso = d => d.toISOString().slice(0, 10);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const daysAgo = n => iso(new Date(today.getTime() - n * 86400000));

  // How many, and at which site. Everyone at one running room by default, so
  // the muster there is complete and the others stay visibly untouched.
  const site = opts.site || 'IGP';
  const rooms = D.RUNNING_ROOMS.filter(r => r.name === site && r.status === 'operational');
  if (!rooms.length) return { filled: 0, site: null };
  const rr = rooms[0];

  const people = D.STAFF.filter(s => s.running_room_id === rr.id && s.is_active);
  const limit = opts.limit === undefined ? people.length : Math.min(opts.limit, people.length);
  const chosen = people.slice(0, limit);

  let docId = 700000;
  let fileId = 800000;

  chosen.forEach((p, i) => {
    const bank = pick(BANKS);
    // Joining dates spread over the last two years, so length of service
    // differs between people and the register does not read as one batch.
    const joined = daysAgo(ri(90, 730));

    p.father_name     = p.full_name.split(' ').slice(-1)[0] + ' (father)';
    p.date_of_birth   = iso(new Date(Date.UTC(ri(1968, 2001), ri(0, 11), ri(1, 28))));
    p.gender          = /a$|i$|bai$/i.test(p.full_name.split(' ')[0]) ? 'F' : 'M';
    p.phone           = '90000' + String(10000 + i).slice(-5);
    p.address         = `${site} Running Room quarters, ${rr.div_name || 'Mumbai'} Division`;
    p.date_of_joining = joined;
    p.bank_account_no = String(ri(10000000000, 99999999999));
    p.bank_ifsc       = bank[1] + String(1000 + i).slice(-4);
    p.epf_no          = `TEST/EPF/${String(1000000 + i)}`;
    p.esic_no         = `TEST/ESIC/${String(3100000000 + i)}`;
    p.is_test_data    = true;

    // The six required documents, each with a reference and a scan, plus a
    // medical that expires a year from its issue -- so the expiry tracking and
    // the "needs attention" filters have something real to work on.
    D.DOCS[p.id] = REQUIRED.map((type, k) => {
      const issued = daysAgo(ri(30, 300));
      return {
        id: ++docId, staff_id: p.id, doc_type: type,
        reference_no: 'TEST/' + type.slice(0, 3).toUpperCase() + '/' + String(10000 + i * 7 + k),
        issued_on: issued,
        valid_till: type === 'medical_fitness'
          ? iso(new Date(new Date(issued).getTime() + 365 * 86400000)) : null,
        file_id: ++fileId,
      };
    });

    // Screened and approved: without that nobody can be marked present, and
    // the muster is the whole reason for filling these in.
    p.screening_status = 'approved';
    p.screened_on = daysAgo(ri(10, 60));
    p.rejection_reason = null;
    p.id_card_no = `${rr.code}/ID/${String(100 + i)}`;
    p.id_card_issued_on = p.screened_on;
  });

  // One person deliberately left short of the mark, so the deployment
  // checklist and the unscreened filter are not uniformly green.
  if (chosen.length > 3) {
    const odd = chosen[chosen.length - 1];
    odd.screening_status = 'pending';
    odd.screened_on = null;
    odd.id_card_no = null;
    D.DOCS[odd.id] = D.DOCS[odd.id].filter(d => d.doc_type !== 'police_verification');
  }

  return { filled: chosen.length, site, rrId: rr.id };
}

module.exports = { apply, REQUIRED };
