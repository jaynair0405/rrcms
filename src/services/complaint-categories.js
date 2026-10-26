/**
 * What a complaint is about.
 *
 * This was free text, and free text cannot be counted. One man writes "food",
 * the next "Food quality", the third "meal", and then nobody can answer how
 * many food complaints IGP had this quarter. A category you cannot count is
 * decoration.
 *
 * The list is deliberately the same one the rest of the system already uses --
 * the four groups of the deficiency schedule -- so a complaint can be escalated
 * into a recorded deficiency without being reclassified on the way.
 *
 * `contractor: false` marks the things that are the Railway's own to put right.
 * A dead geyser or a failed mains supply is not the contractor's default and
 * must not sit in the same bucket, or his complaint count carries faults he
 * could not have prevented and his grading suffers for the Railway's arrears.
 * The divisional officer can then see at a glance how much of a running room's
 * grief is the contractor's and how much is his own department's.
 */
const CATEGORIES = [
  { code: 'housekeeping', group: 'A', contractor: true,
    label: 'Housekeeping and cleaning',
    hint: 'Rooms, bathrooms, dustbins, common areas' },
  { code: 'meals', group: 'B', contractor: true,
    label: 'Meals and kitchen',
    hint: 'Quality, quantity, timing, hygiene of food' },
  { code: 'linen', group: 'C', contractor: true,
    label: 'Linen, washing and bed attending',
    hint: 'Soiled or missing linen, beds not made, call book service' },
  { code: 'consumables', group: 'D', contractor: true,
    label: 'Consumables and records',
    hint: 'Soap, toiletries, drinking water, registers not kept' },
  { code: 'behaviour', group: null, contractor: true,
    label: 'Staff behaviour',
    hint: 'Conduct of the contractor’s staff' },
  { code: 'maintenance', group: null, contractor: false,
    label: 'Maintenance — the Railway’s own',
    hint: 'Geyser, air conditioning, water supply, electrical, building' },
  { code: 'other', group: null, contractor: true,
    label: 'Other',
    hint: 'Anything the list above does not cover' },
];

const BY_CODE = new Map(CATEGORIES.map(c => [c.code, c]));

/** True for a value the form may submit. */
const isValid = code => BY_CODE.has(String(code || ''));

/**
 * What to print. Records written before the list existed carry typed text;
 * those are shown as they were written rather than discarded, because a
 * complaint someone lodged is not improved by hiding what they called it.
 */
function label(code) {
  if (!code) return null;
  const c = BY_CODE.get(String(code));
  return c ? c.label : String(code);
}

/** Whether a complaint counts against the contractor, for reporting. */
function isContractors(code) {
  const c = BY_CODE.get(String(code || ''));
  return c ? c.contractor : true;      // unclassified: assume it is, and be seen to
}

module.exports = { CATEGORIES, isValid, label, isContractors };
