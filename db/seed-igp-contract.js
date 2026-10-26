#!/usr/bin/env node
/**
 * IGP's executed contract, as the paper states it.
 *
 *   node db/seed-igp-contract.js
 *
 * WHY THIS FILE EXISTS
 *
 * RR-CMS's reference tables -- penalty clauses, cleaning schedule, consumables,
 * meal rates -- were all seeded from the EARLIER, GENERIC tender paper for
 * Central Railway running rooms. The executed contract for IGP,
 * GEMC-511687722391404 dated 28.08.2026, is a different document with different
 * numbers, and where the two differ the executed contract governs at IGP.
 *
 * That difference was found one question at a time, and answered one fix at a
 * time -- linen at stage 34, designations and establishment at stage 35. Wrong
 * shape of answer. This script enters EVERYTHING the contract states that
 * RR-CMS has a place for, in one pass, so nothing is left to be asked for.
 *
 * WHAT IT DOES NOT DO. It computes nothing. Rates, quantities and contract
 * values are recorded and printed beside what they refer to. No screen
 * multiplies a rate by a quantity, here or anywhere else in RR-CMS, and none
 * will until the penalty and payment schedule is settled with the officer.
 *
 * Idempotent: run it twice and the second run reports no change.
 */
require('dotenv').config();
const db = require('../src/db');

const CONTRACT = 'GEMC-511687722391404';
const SRC = `${CONTRACT} (28.08.2026)`;
const FROM = '2026-09-10';          // the contract's own service start date

/* ------------------------------------------------------------------ Part-A/F
 * The price schedule, 28 lines, exactly as printed.
 *
 * Rs 0.01 appears against fourteen lines because that is what the GeM schedule
 * shows: their value is carried inside the manpower and meal lines. It is
 * recorded as it stands. Putting a plausible figure there would be the system
 * inventing a contractual amount.
 *
 * The numbering error is the contract's own: NS-26 is used twice, for blanket
 * cover and again for the profit line, and there is no NS-28. It is left as the
 * paper has it -- an executed contract is quoted, not corrected.
 */
const LINES = [
  // code, part, part name, description, unit, qty, amount, designation, per day
  ['NS-1','A','Deployment of staff for general cleaning and maintenance',
   'Canteen Supervisor (skilled) — 02 Nos.','Nos',1460,1457488.80,'supervisor',2],
  ['NS-2','A','Deployment of staff for general cleaning and maintenance',
   'Head Cook (skilled) — 03 Nos.','Nos',2190,2186233.20,'head_cook',3],
  ['NS-3','A','Deployment of staff for general cleaning and maintenance',
   'Cook (semi-skilled) — 15 Nos. per day','Nos',10950,9511471.12,null,15],
  ['NS-4','A','Deployment of staff for general cleaning and maintenance',
   'Kitchen helper (semi-skilled) — 15 Nos. per day','Nos',10950,9511471.12,'kitchen_helper',15],
  ['NS-5','A','Deployment of staff for general cleaning and maintenance',
   'Table boy (semi-skilled) — 15 Nos. per day','Nos',10950,9511471.12,'table_boy',15],
  ['NS-6','A','Deployment of staff for general cleaning and maintenance',
   'Utensil cleaner (unskilled) — 15 Nos. per day','Nos',10950,8257423.47,'utensil_wash',15],
  ['NS-7','A','Deployment of staff for general cleaning and maintenance',
   'Running room bearer (unskilled) — 15 Nos. per day','Nos',10950,8257423.47,'rr_bearer',15],
  ['NS-8','A','Deployment of staff for general cleaning and maintenance',
   'Housekeeping staff (unskilled) — 25 Nos.','Nos',18250,13762372.45,'housekeeping',25],
  ['NS-9','A','Deployment of staff for general cleaning and maintenance',
   'Security Guard (without arms) — 02 Nos., night time only','Nos',1460,1457488.80,'security',2],
  ['NS-10','B','Cost of cleaning materials',
   'Cost of the cleaning materials for a period of two years',null,null,0.01,null,null],
  ['NS-11','C','Essential activities and materials for use of the running room',
   'Supply of newspapers and magazines in English, Hindi and Marathi as per Annexure-C','Months',24,0.01,null,null],
  ['NS-12','C','Essential activities and materials for use of the running room',
   'Supply and maintenance of 500 LPH RO plant — 1 No. and 250 LPH — 1 No.','SET',2,0.01,null,null],
  ['NS-13','C','Essential activities and materials for use of the running room',
   'Supply of cots — 10 sets every six months','Nos',40,0.01,null,null],
  ['NS-14','C','Essential activities and materials for use of the running room',
   'Supply of mattresses — 10 sets every six months','Nos',40,0.01,null,null],
  ['NS-15','C','Essential activities and materials for use of the running room',
   'Pest control of the running room once in two months (area approx. 53,010 sq ft)','Sq feet',636120,0.01,null,null],
  ['NS-16','C','Essential activities and materials for use of the running room',
   'Supply of foot massager — 02 Nos.','Nos',2,0.01,null,null],
  ['NS-17','C','Essential activities and materials for use of the running room',
   'Supply of shoe polish machine — 04 Nos.','Nos',4,0.01,null,null],
  ['NS-18','D','Readymade subsidised meals including the cost of gas cylinders',
   'Lunch, dinner and parcel — 200 Nos. per day','Nos',146000,9452040.00,null,null],
  ['NS-19','D','Readymade subsidised meals including the cost of gas cylinders',
   'Breakfast and parcel — 100 Nos. per day','Nos',73000,4252980.00,null,null],
  ['NS-20','E','Washing, ironing and supplying of soiled linen','Bed sheet','Nos',365000,0.01,null,null],
  ['NS-21','E','Washing, ironing and supplying of soiled linen','Pillow cover','Nos',182500,0.01,null,null],
  ['NS-22','E','Washing, ironing and supplying of soiled linen','Mosquito net','Nos',17680,0.01,null,null],
  ['NS-23','E','Washing, ironing and supplying of soiled linen','Curtain','Nos',12000,0.01,null,null],
  ['NS-24','E','Washing, ironing and supplying of soiled linen','Mattress cover','Nos',8160,0.01,null,null],
  ['NS-25','E','Washing, ironing and supplying of soiled linen','Woollen blanket','Nos',4000,0.01,null,null],
  ['NS-26','E','Washing, ironing and supplying of soiled linen','Blanket cover','Nos',9600,0.01,null,null],
  ['NS-26 (2)','F','Statutory compliances',
   'Profit @ 3.85% on the total basic rate of manpower without GST','Each',null,1835172.18,null,null],
  ['NS-27','F','Statutory compliances',
   'Bonus @ 8.33%, ceiling Rs 7,000 per month','Each',null,1399440.00,null,null],
];
const LINE_REMARKS = {
  'NS-3':  'The contract gives cooks as one cadre of 15. RR-CMS splits them veg/non-veg because the clause on separate utensils turns on it.',
  'NS-7':  'The schedule prints "25 Nos. per day" against a quantity of 10,950, which is 15 a day. The scope table and the GeM line item both say 15. The 25 is a typing error in the contract.',
  'NS-9':  'Night time only, per the Schedule of Quantities. One guard at RR-3 and one at RR-4.',
  'NS-12': 'The Schedule of Quantities says "at LNL BVT & GHAT running room". The GeM line item and the scope both say IGP. A typing error in the contract.',
  'NS-26 (2)': 'The contract uses NS-26 twice — for blanket cover and again here — and has no NS-28. Left as the paper has it.',
};
const ZERO_NOTE = 'Rs 0.01 is what the GeM price schedule prints; the value is carried in the manpower and meal lines.';

/* ------------------------------------------------------------- the penalties
 * Section 4 of the contract, clauses (a) to (ee). THIRTY-ONE of them, against
 * the fifty A1..M12 codes RR-CMS carries from the generic paper. They are not
 * the same list and several collide outright -- the generic paper fines short
 * deployment Rs 500 per person per day, this contract Rs 1,000 per person per
 * SHIFT plus that day's minimum wages.
 *
 * Codes are prefixed IGP- because MySQL's collation is case-insensitive and a
 * bare 'a' would collide with 'A' under the unique key.
 */
const P = (code, desc, rate, unit, opts = {}) => ({
  code: `IGP-${code}`, desc, rate, unit,
  // Which generic clause this one stands in place of, where it plainly does.
  // FIVE of the thirty-one map onto the generic schedule. A mapping earns its
  // place when a screen or a route names the generic code: A3, A4, A9 and C6
  // are asked for BY CODE in the routes; A6 is printed on the cleaning register
  // as a verdict against the contractor. Both are reasons the code must resolve
  // to what THIS contract says.
  supersedes: opts.supersedes || null,
  checklist: opts.checklist === undefined ? 1 : opts.checklist,
  meals: opts.meals ? 1 : 0,
  freq: opts.freq || 'daily',
  formula: opts.formula ? 1 : 0,
  note: opts.note || null,
});
const PENALTIES = [
  P('a','Failure to deploy staff in any particular shift',1000,'per person per shift, in addition to deduction of that day\'s minimum wages for the absent staff',{supersedes:'A9'}),
  P('b','Staff found intoxicated during duty hours, or misusing running room assets — a replacement must be appointed',500,'per case',{supersedes:'A3'}),
  P('c','Staff found smoking or chewing tobacco anywhere in the running room premises during duty',100,'per case'),
  P('d','Staff found sleeping on duty in the running room',200,'per case'),
  /* supersedes A6, ruled by the officer on 09.09.2026: A6 is cleaning
   * GENERALLY, which is what (e) covers. (f) below is bathrooms and toilets
   * specifically and is left unmapped -- the cleaning register covers both, and
   * mapping one generic code onto two contract clauses would make the answer
   * depend on which row the query happened to reach first.
   *
   * Until this line existed, the cleaning register at IGP printed "clause A6 --
   * poor cleaning against schedule, Rs 1,000 a day" from the DIVISIONAL TENDER,
   * for conduct this contract prices itself at Rs 500 per incident. Nothing
   * computed money from it, so no bill was wrong; but the screen stated the
   * wrong clause at the wrong rate, and it was about to be made clickable. */
  P('e','Cleaning work not found satisfactory',500,'per incident, up to, in addition to deduction of the cleaning cost of that area',{supersedes:'A6'}),
  P('f','Failure to clean bathrooms, toilets and the like as per the scope of work',500,'per case'),
  P('g','Spitting mark noticed in the running room',200,'per incident'),
  P('h','Insecticide or mosquito repellent not sprayed daily on time',100,'per day'),
  P('i','Garbage not disposed away from the running room, or a dustbin found overflowing',50,'per incident'),
  P('j','Delay in repairing the bio-digester beyond 4 days, or beyond the period permitted by Sr.DEE/TRSO/BB',500,'per day',{checklist:0}),
  P('k','Staff misbehaving with occupants or Railway officials — the man must be removed and replaced; recurrence may terminate the contract',500,'per case'),
  P('l','Silence zone of the running room disturbed by contractor staff',500,'per case'),
  P('m','Damage to or loss of Railway property through the contractor\'s negligence or faulty working',null,'the cost of the damage, recovered from the bill',{checklist:0,freq:'monthly',formula:1,note:'Actual cost, assessed by the Railway. No rate is stated and none is assumed.'}),
  P('n','Record registers not maintained in the format prescribed by the Railway',500,'per case'),
  P('o','Contractor staff unreachable after repeated calls or messages on the phone the contractor must provide',500,'per case'),
  P('p','Unauthorised person found in the kitchen premises or cooking zone during inspection',500,'per case',{meals:1}),
  P('q','Delay in cooking or serving food, or carelessness or misconduct, causing deficiency against Railway service',1000,'per train per hour or part thereof',{meals:1}),
  P('r','Meal or breakfast found non-satisfactory on quality testing by Railway representatives',500,'per case',{meals:1}),
  P('s','Occupant complaint about the quality or taste of food, or the upkeep and maintenance of the running room',500,'per case',{meals:1}),
  /* supersedes B2 AND B4, ruled by the officer on 09.09.2026. The tender made
   * bad raw material two offences -- B2 poor quality at Rs 500, B4 rotten at
   * Rs 1,000. This contract writes them as one, at Rs 500, and adds that the
   * material is thrown out on the spot. The food register printed "clauses B2
   * and B4" as its verdict, so B4's Rs 1,000 was on an IGP screen for a rate
   * this contract does not contain. */
  P('t','Non-branded or non-Agmark grocery, edible oil, masalas, or decayed vegetables, eggs or chicken in use — material to be disposed of on the spot',500,'per case',{meals:1,supersedes:'B2,B4'}),
  P('u','Delay in submitting the FSSAI certificate beyond 30 days from the start of work',100,'per day',{checklist:0}),
  P('v','Delay in submitting police verification of staff deputed for the running room beyond 15 days from the start of work',100,'per day per head',{checklist:0}),
  P('w','Utensils in the kitchen and dining room not cleaned properly',500,'per case',{meals:1}),
  P('x','Staff for cleaning and staff for serving meals not kept separate',500,'per case',{meals:1}),
  P('y','Misuse of electricity, LPG gas or water observed',500,'per case'),
  P('z','Round-the-clock security arrangement of the running room not made',200,'per day'),
  P('aa','Contractor staff found without proper uniform, badge or I-card',100,'for each item, per day, per person',{supersedes:'A4'}),
  P('bb','Washed linen not delivered within the delivery period — no credit is given for supplying earlier than allowed',2,'per article per day',{checklist:0,supersedes:'C6'}),
  P('cc','Washed linen reported dirty during inspection by Railway officials',500,'per case'),
  P('dd','Occupant complaint about a dirty linen item',500,'each instance'),
  P('ee','Sr.DEE/DEE not satisfied with the contractor\'s performance, or adverse remarks by an inspecting officer',50000,'token penalty, per case',{checklist:0}),
  // Not lettered with the rest. It sits in the Part-B scope, and it is a
  // penalty with a rate, so it belongs with the others rather than nowhere.
  P('pb','Cleaning consumables for one month not deposited in the running room store in the first week of the month',1000,'per day',{checklist:0,note:'Part-B scope, not the lettered penalty list. Stock is issued by the Railway representative against a joint register.'}),
];

/* -------------------------------------------------------- the cleaning table
 * Seventeen rows against the generic paper's nine. Rounds are expanded: a
 * frequency alone cannot say which round of the day was missed.
 */
const CLEAN = [
  ['C01','Sweeping of rooms, verandah, staircase and other covered area of the running rooms','thrice_daily',3],
  ['C02','Floor mopping in the running rooms','continuous',1],
  ['C03','Cleaning of the staircase with water','once_daily',1],
  ['C04','Bathroom and toilet cleaning','thrice_daily',3],
  ['C05','Window and door cleaning','once_daily',1],
  ['C06','Dining table and chair cleaning','on_need',1],
  ['C07','Cleaning of steel lockers, wooden cupboards, multi steel chairs, centre tables, wooden stands, wooden frames, notice boards, posters, table-cum-lockers and cots','once_daily',1],
  ['C08','Bathroom and toilet wall cleaning','once_daily',1],
  ['C09','Cleaning of electrical fittings — fans and regulators, tube lights, switch boards and switches, night lamps, exhaust fans, geysers, electric chimneys, hot boxes and fly catcher','weekly',1],
  ['C10','Outside area of the water coolers','once_daily',1],
  ['C11','Cleaning of wall clocks','weekly',1],
  ['C12','Cleaning of the area and exterior of the water cooler','once_daily',1],
  ['C13','Kitchen and dining hall','per_meal',1],
  ['C14','Cleaning of the peripheral area','morning_evening',2],
  ['C15','Cleaning of garbage','twice_daily',2],
  ['C16','Spraying of deodorising cum disinfectant fluid in all bedrooms, bathrooms, toilets, store rooms and corridors','thrice_daily',3],
  ['C17','Dusting and cleaning of the wire mesh, grills and pelmets','weekly',1],
];

/* ------------------------------------------------------------- Annexure-C
 * The contract NAMES its newspapers. The generic paper said "one popular Hindi
 * newspaper". Clause D2 fines short supply at twice the cost of what was not
 * supplied, so which publication is owed is not a detail. India Today is
 * MONTHLY here, two copies -- the generic paper had it weekly -- and there is
 * no Marathi magazine in this contract at all.
 */
const PRESS = [
  ['IGP-N1','Times of India or Indian Express','copy','daily',1,'Times of India, Indian Express'],
  ['IGP-N2','Lokmat or Gavkari','copy','daily',1,'Lokmat, Gavkari'],
  ['IGP-N3','Navbharat or Maharashtra Times','copy','daily',1,'Navbharat, Maharashtra Times'],
  ['IGP-N4','India Today (Hindi), monthly','copy','monthly',2,'India Today'],
];

/* ------------------------------------------------------------- Annexure-A
 * THE CLEANING MATERIALS. The list Part-B refers to and the 108-page contract
 * does not carry: the Annexure-A printed there is the Undertaking Certificate.
 * It came separately, as page 337 of e-office file 3558998/2026/O/o SR
 * DEE/TRSO/MUM/CR, headed "List of cleaning of materials for IGP RR" and signed
 * by the SSE (Drawing)/TRSO and the DEE (TRS-O), Central Railway, CSMT Mumbai.
 * Twenty-one items, Rs 25,31,088 for the two years, every line carrying its own
 * rate reference.
 *
 * WHAT IS RECORDED AND WHAT IS DERIVED
 *
 * `qty_contract` and `rate` are the sheet's own figures, untouched. The MONTHLY
 * quantity is qty_contract / 24 -- worked out, not copied, and the reason is
 * below. The check that the two agree runs at load time and refuses the row if
 * they do not, because a supply figure a supervisor is measured against must
 * not be able to drift from the figure the money was sanctioned on.
 *
 * WHY THE MONTHLY COLUMN IS NOT COPIED
 *
 * The sheet has BOTH a "Quantity required/month" column and a "Total qty for
 * two years" column, and on three lines they disagree:
 *
 *     bleaching powder      says  50 kg/month     2400 kg needs  100
 *     air freshener perfume says  10 nos/month     960 nos needs   40
 *     liquid hand wash      says  10 nos/month     480 nos needs   20
 *
 * Every line's own arithmetic -- quantity times rate equals amount -- is
 * correct, and the twenty-one amounts add to the sanctioned total exactly. So
 * the two-year column is the one the money was signed against and the monthly
 * column is the one that slipped. Ruled by the officer: take the two-year
 * figure. The sheet's own monthly words are kept in `source_ref` on those three
 * rows so the correction is visible and not silent.
 *
 * WHERE THE NAME AND THE PACK SIZE DISAGREE
 *
 * Three items are named with one size and packed in another:
 *
 *     air freshener perfume   named 300 ml, pack column 250 ml
 *     hydrochloric acid       named   1 kg, pack column   2 kg
 *     air freshener dispenser refill 300 ml in the description, 250 ml in the
 *                             MAKE/BRAND line of the same cell
 *
 * On the acid the pack size is the one that reconciles: 360 units against 30 kg
 * a month only works at 2 kg a unit. Ruled by the officer: the pack size
 * governs, so the perfume is entered as 250 ml. The dispenser is left at its
 * description's 300 ml and listed for the officer, because there the two
 * figures are in the same cell and neither is confirmed by a quantity.
 */
const MATERIALS = [
  // code, name, pack, unit, qty for 2 yrs, rate, rate reference, brands, note
  ['IGP-M01','Stable bleaching powder for household and industrial use',
   '25 kg','kg',2400,25.96,'GeM product ID 5116877-56000949136',null,
   'sheet states 50 kg per month; 2400 kg over two years is 100'],
  ['IGP-M02','Liquid soap','1 litre','litre',240,52,
   'Central Railway P.O. 92256079101018 dated 17-OCT-25',
   'Lifebuoy, Dettol, Flama, Savlon, Santoor',null],
  ['IGP-M03','Traditional straw (coconut) broom, 90 cm to under 100 cm',
   '1 no','nos',360,115,'GeM product ID 5116877-84809170340',null,
   'sheet states 30 Nos. every two months'],
  ['IGP-M04','Phenolic disinfectant fluid','1 litre bottle','litre',1200,75,
   'GeM product ID 5116877-2851964147',null,null],
  ['IGP-M05','Toilet cleaner','500 ml','litre',720,108,
   'GeM product ID 5116877-34213232680',
   'Harpic, Domex, Saini Fresh, O&G, Prestro',
   'sheet states 60 Nos. per month; 30 litres is the same 60 bottles'],
  ['IGP-M06','Soft broom with grass strips','1 no','nos',240,154,
   'Central Railway P.O. 56245840201151 dated 12-SEP-24',null,null],
  ['IGP-M07','Naphthalene balls','5 kg','pack',96,115,
   'GeM product ID 5116877-52762067264','Dhannu, Gayatri, Gainda, Wonder Fresh',
   'sheet unit column reads KG; 96 against 20 kg a month counts 5-kg packs'],
  ['IGP-M08','Automatic air freshener for lavatories — fully automatic dispenser, '
            +'24-hour working, manual day/night setting, refill 300 ml; one set is '
            +'1 refill and 1 set of battery',
   '1 set','set',480,622.76,
   'Western Railway P.O. 87245873100040 dated 16-JAN-25','Jade Multi 3000 or similar',
   'refill stated as 300 ml in the description and 250 ml in the make line'],
  ['IGP-M09','Hydrochloric acid, analytical reagent grade, in glass bottles',
   '2 kg','nos',360,350,'GeM product ID 5116877-82964765152',null,
   'sheet names the item 1 kg; only the 2 kg pack reconciles 360 with 30 kg a month'],
  ['IGP-M10','Glass cleaner, liquid','500 ml','nos',480,80,
   'Central Railway P.O. 69255005200004 dated 07-JAN-25',
   'Windex, Rain X, Colin, Cif, Spark',null],
  ['IGP-M11','Wet and dry mop, 20 litre capacity','1 set','nos',240,1394,
   'GeM product ID 5116877-58489866550',null,null],
  ['IGP-M12','Waste collection bag, 36 inch x 24 inch','1 unit','kg',480,110,
   'GeM product ID 5116877-25193320443',null,null],
  ['IGP-M13','Air freshener perfume, 250 ml','250 ml','nos',960,160,
   'GeM product ID 5116877-32810814973','Aer Cool, Godrej Aer Twist, Imee',
   'sheet names the item 300 ml and states 10 Nos. per month; pack column reads '
   +'250 ml and 960 over two years is 40'],
  ['IGP-M14','Liquid hand wash','500 ml','nos',480,98,
   'GeM product ID 5116877-27057232605','Dettol, Savlon, Santoor, Lifebuoy',
   'sheet states 10 Nos. per month; 480 over two years is 20'],
  ['IGP-M15','Microfibre cloth duster, 30 cm x 30 cm','1 no','nos',1440,34.99,
   'Central Railway P.O. 74255120100150 dated 28-FEB-25',null,null],
  ['IGP-M16','Dustbin container, 120 litre','1 no','nos',240,2550,
   'Central Railway P.O. 87255196100399 dated 22-NOV-25',null,null],
  ['IGP-M17','HDPE bucket, 20 litre capacity','1 no','nos',240,350.89,
   'GeM product ID 5116877-25215792797',null,null],
  ['IGP-M18','Hand gloves','1 pair','pair',1200,118.75,
   'Central Railway P.O. 92255585200513 dated 24-MAY-25',null,null],
  ['IGP-M19','Hand-held scrubbing brush','1 no','nos',480,180,
   'GeM product ID 5116877-42563381064',null,null],
  ['IGP-M20','Rubber floor wiper','1 no','nos',240,130,
   'GeM product ID 5116877-39816009562',null,null],
  ['IGP-M21','Mosquito repellent household insecticide liquid vaporizer, pack of 1',
   '100 ml','set',1440,98,'GeM product ID 5116877-81482204695',
   'All Out, Good Knight, Mortein',null],
];

/* The sheet's own total, in its own words: "Rs. Twenty Five lakh Thirty One
 * Thousand and eighty eight only". Checked against the twenty-one lines at load
 * time. If a rate or a quantity is ever mistyped into the list above, the sum
 * stops matching and the load refuses -- which is the only reason this constant
 * is here. */
const MATERIALS_TOTAL = 2531088;
const MATERIALS_MONTHS = 24;        // the contract's own period, 10.09.2026 to 09.09.2028

const MEALS = [
  ['lunch',     64.74, 'Rs 64.74 per meal, or 90% of the accepted cost of the meal, whichever is less'],
  ['dinner',    64.74, 'Rs 64.74 per meal, or 90% of the accepted cost of the meal, whichever is less'],
  ['breakfast', 58.26, 'Rs 58.26 per meal, or 90% of the accepted cost of the meal, whichever is less'],
];

(async () => {
  /* BY REGISTER CODE, NOT BY NAME.
   *
   * TWO register entries are named "IGP": RR013, the Mumbai-division site the
   * pilot merges the five Igatpuri blocks into, and RR020, a separate 67-bed
   * entry in Bhusawal division. Matching on the name picked whichever came
   * first; matching on name plus "the one with more beds" was worse still,
   * because a `migrate.js seed` run resets RR013 to its unmerged 44 beds and
   * the tie-break then silently chose the WRONG DIVISION'S running room.
   *
   * A code does not move. */
  const rr = await db.one(
    `SELECT id, name, total_beds, status FROM running_rooms WHERE code = 'RR013'`);
  if (!rr) {
    console.error('\n  No running room RR013. Run db/seed-pilot.js first.\n');
    process.exit(1);
  }
  /* The merge must have been applied, or every per-bed figure this contract
   * touches is computed against 44 beds instead of 131. That reverted silently
   * once already -- see the merge note in db/seed-pilot.js -- so it is checked
   * here rather than assumed. */
  if (rr.total_beds < 100) {
    console.error(`\n  ${rr.name} carries ${rr.total_beds} beds. The five Igatpuri blocks`);
    console.error('  total 131. The pilot merge has been undone -- a `migrate.js seed` run');
    console.error('  resets the register figures. Run `node db/seed-pilot.js` and try again.\n');
    process.exit(1);
  }

  const con = await db.one('SELECT * FROM contracts WHERE agreement_no = ?', [CONTRACT]);
  if (!con) {
    console.error(`\n  No contract ${CONTRACT}.`);
    console.error('  Run db/seed-pilot.js first — it now carries IGP\'s agreement particulars.\n');
    process.exit(1);
  }
  console.log(`\n  ${rr.name} (id ${rr.id}) — contract ${CONTRACT}, id ${con.id}\n`);

  const done = [];
  const say = (what, n) => { done.push(`${String(n).padStart(4)}  ${what}`); };

  /* ----------------------------------------------------------- the area */
  await db.execute('UPDATE running_rooms SET area_sqft = 53010 WHERE id = ?', [rr.id]);
  say('cleanable area set to 53,010 sq ft', 1);

  /* ------------------------------------------------------- line items */
  let n = 0;
  for (let i = 0; i < LINES.length; i++) {
    const [code, part, partName, desc, unit, qty, amount, dg, perDay] = LINES[i];
    const remarks = [LINE_REMARKS[code], Number(amount) === 0.01 ? ZERO_NOTE : null]
      .filter(Boolean).join(' ') || null;
    await db.execute(`
      INSERT INTO contract_line_items
        (contract_id, item_code, part_code, part_name, description, unit, schedule_qty,
         amount, designation_code, daily_strength, remarks, source_ref, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        part_code = VALUES(part_code), part_name = VALUES(part_name), unit = VALUES(unit),
        schedule_qty = VALUES(schedule_qty), amount = VALUES(amount),
        designation_code = VALUES(designation_code), daily_strength = VALUES(daily_strength),
        remarks = VALUES(remarks), source_ref = VALUES(source_ref), sort_order = VALUES(sort_order)`,
      [con.id, code, part, partName, desc, unit, qty, amount, dg, perDay, remarks,
       `${SRC} Schedule of Quantities and Rates`, (i + 1) * 10]);
    n++;
  }
  say('price schedule line items', n);

  const sum = await db.one(
    'SELECT ROUND(SUM(amount),2) AS t FROM contract_line_items WHERE contract_id = ?', [con.id]);
  const stated = Number(con.total_value);
  const tallies = Math.abs(Number(sum.t) - stated) < 0.005;
  say(`line items total Rs ${Number(sum.t).toLocaleString('en-IN')} — ${tallies
      ? 'agrees with the contract value' : 'DOES NOT AGREE with the contract value'}`, tallies ? 'ok' : '!!');

  /* --------------------------------------------------------- penalties */
  n = 0;
  for (const p of PENALTIES) {
    await db.execute(`
      INSERT INTO deficiency_clauses
        (clause_code, contract_id, supersedes_code, group_code, group_name, description,
         rate, unit, frequency, is_formula, formula_note, in_daily_checklist,
         applies_to_meals, effective_from, source_ref, is_active)
      VALUES (?,?,?,'P','Penalty schedule of this contract',?,?,?,?,?,?,?,?,?,?,1)
      ON DUPLICATE KEY UPDATE
        contract_id = VALUES(contract_id), supersedes_code = VALUES(supersedes_code),
        description = VALUES(description),
        rate = VALUES(rate), unit = VALUES(unit), frequency = VALUES(frequency),
        is_formula = VALUES(is_formula), formula_note = VALUES(formula_note),
        in_daily_checklist = VALUES(in_daily_checklist),
        applies_to_meals = VALUES(applies_to_meals), source_ref = VALUES(source_ref)`,
      [p.code, con.id, p.supersedes, p.desc, p.rate, p.unit, p.freq, p.formula, p.note,
       p.checklist, p.meals, FROM, `${SRC} section 4, clause (${p.code.slice(4)})`]);
    n++;
  }
  say('penalty clauses from the contract', n);

  /* -------------------------------------------------- cleaning schedule */
  n = 0;
  for (let i = 0; i < CLEAN.length; i++) {
    const [code, area, freq, rounds] = CLEAN[i];
    for (let r = 1; r <= rounds; r++) {
      await db.execute(`
        INSERT INTO cleaning_schedule
          (code, contract_id, area_name, frequency, round_no, sort_order, source_ref, is_active)
        VALUES (?,?,?,?,?,?,?,1)
        ON DUPLICATE KEY UPDATE
          contract_id = VALUES(contract_id), area_name = VALUES(area_name),
          frequency = VALUES(frequency), round_no = VALUES(round_no),
          sort_order = VALUES(sort_order), source_ref = VALUES(source_ref)`,
        [`IGP-${code}${rounds > 1 ? '-' + r : ''}`, con.id, area, freq, r,
         (i + 1) * 10 + r, `${SRC} Part-B cleaning schedule, row ${i + 1}`]);
      n++;
    }
  }
  say('cleaning schedule rows (17 rows, rounds expanded)', n);

  /* ------------------------------------------------- newspapers, meals */
  n = 0;
  for (const [code, name, unit, freq, qty, brands] of PRESS) {
    await db.execute(`
      INSERT INTO consumable_items
        (code, contract_id, name, schedule_code, category, unit, supply_frequency,
         qty_per_unit, approved_brands, source_ref, is_active)
      VALUES (?,?,?,'D','press',?,?,?,?,?,1)
      ON DUPLICATE KEY UPDATE
        contract_id = VALUES(contract_id), name = VALUES(name), unit = VALUES(unit),
        supply_frequency = VALUES(supply_frequency), qty_per_unit = VALUES(qty_per_unit),
        approved_brands = VALUES(approved_brands), source_ref = VALUES(source_ref)`,
      [code, con.id, name, unit, freq, qty, brands, `${SRC} Annexure-C`]);
    n++;
  }
  say('newspapers and magazines named by the contract', n);

  /* ------------------------------------- Annexure-A, the cleaning materials
   *
   * THE CHECK COMES FIRST, AND IT REFUSES.
   *
   * Three figures on every line have to agree: the two-year quantity, the rate,
   * and the amount the sheet totals to. And the monthly figure this system will
   * measure a supervisor against is derived from the two-year quantity, so if
   * the two-year quantity is wrong the monthly one is wrong in the same breath
   * and nothing downstream can tell. So the twenty-one lines are added up and
   * compared with the sanctioned total BEFORE a single row is written. A typo
   * stops the load; it does not quietly become a supply obligation. */
  {
    let sum = 0;
    for (const m of MATERIALS) sum += m[4] * m[5];
    if (Math.abs(sum - MATERIALS_TOTAL) > 0.005) {
      console.error(
        `\n  Annexure-A does not add up: the 21 lines come to ${sum.toFixed(2)}, ` +
        `the sheet totals ${MATERIALS_TOTAL}.\n  Nothing was written. Fix the list ` +
        `in MATERIALS before running this again.\n`);
      process.exit(1);
    }
    /* A monthly figure that is not a whole number of the unit is a figure a
     * store register cannot be kept in. None of the twenty-one are, today; if a
     * revised sheet ever brings one, it should be seen and not rounded away. */
    for (const m of MATERIALS) {
      const per = m[4] / MATERIALS_MONTHS;
      if (Math.abs(per - Math.round(per * 100) / 100) > 1e-9) {
        console.error(`\n  ${m[0]}: ${m[4]} over ${MATERIALS_MONTHS} months is ` +
                      `${per}, which no register can hold. Nothing was written.\n`);
        process.exit(1);
      }
    }
  }

  n = 0;
  for (const [code, name, pack, unit, qty2yr, rate, rateRef, brands, note] of MATERIALS) {
    /* Two facts, two columns. `source_ref` says where the row came from;
     * `contract_note` says, where this row departs from that source, what the
     * source itself said -- so the correction is readable on the screen and
     * nobody has to take this loader's word for it. They were one column once,
     * and every note was chopped mid-word; see migration 064. */
    const src = `${SRC} Annexure-A (e-office 3558998/2026/O/o SR DEE/TRSO/MUM/CR)`;
    if (src.length > 160 || (note && note.length > 300)) {
      console.error(`\n  ${code}: the source reference or its note is longer than ` +
                    `the column holds, and would be stored cut in half. Nothing ` +
                    `was written.\n`);
      process.exit(1);
    }
    await db.execute(`
      INSERT INTO consumable_items
        (code, contract_id, name, schedule_code, category, unit, pack_size,
         supply_frequency, qty_per_unit, qty_contract, rate, rate_ref,
         approved_brands, source_ref, contract_note, is_active)
      VALUES (?,?,?,'D','cleaning',?,?,'monthly',?,?,?,?,?,?,?,1)
      ON DUPLICATE KEY UPDATE
        contract_id = VALUES(contract_id), name = VALUES(name),
        category = VALUES(category), unit = VALUES(unit),
        pack_size = VALUES(pack_size), supply_frequency = VALUES(supply_frequency),
        qty_per_unit = VALUES(qty_per_unit), qty_contract = VALUES(qty_contract),
        rate = VALUES(rate), rate_ref = VALUES(rate_ref),
        approved_brands = VALUES(approved_brands), source_ref = VALUES(source_ref),
        contract_note = VALUES(contract_note)`,
      [code, con.id, name, unit, pack, qty2yr / MATERIALS_MONTHS, qty2yr, rate,
       rateRef, brands, src, note]);
    n++;
  }
  say('cleaning materials from Annexure-A (Rs 25,31,088 for two years)', n);


  n = 0;
  for (const [type, rate, note] of MEALS) {
    await db.execute(`
      INSERT INTO meal_rates
        (meal_type, contract_id, effective_from, subsidised_rate, full_rate,
         is_ceiling, cap_note, source_ref)
      VALUES (?,?,?,?,NULL,1,?,?)
      ON DUPLICATE KEY UPDATE
        contract_id = VALUES(contract_id), subsidised_rate = VALUES(subsidised_rate),
        is_ceiling = VALUES(is_ceiling), cap_note = VALUES(cap_note),
        source_ref = VALUES(source_ref)`,
      [type, con.id, FROM, rate, note, `${SRC} Part-D`]);
    n++;
  }
  say('meal rate ceilings (the Railway share, not a price)', n);

  /* --------------------------------------------------- Part-C equipment
   *
   * The five Part-C lines that buy a physical thing had nowhere to be recorded.
   * The Assets screen exists -- with a three-monthly joint check, a breakdown
   * register and the tender's 24-hour rectification clock -- and had never been
   * seeded, so it opened empty at every running room. Nobody could record that
   * the RO plant was running or that a foot massager was broken, and the clock
   * had nothing to run against. That is the fifth table laid down ahead of the
   * data that gives it meaning.
   *
   * ONE ROW PER ITEM, carrying the count the contract states -- not four
   * separate shoe-polish rows. The RR In-charge adds more from the screen
   * (Facility -> Assets -> Add), which is how a second RO plant or a replaced
   * massager gets on the register without a loader.
   *
   * owned_by = 'contractor': these are supplied BY the contractor under the
   * contract. 'railway' on this screen means an asset handed over TO him, which
   * is a different thing and is checked differently.
   *
   * Cots and mattresses are a RECURRING supply -- 10 sets every six months, 40
   * over the contract -- not a standing count. The row carries this half-year's
   * 10 and says so, because a register showing 40 cots on day one would be
   * showing something that has not happened.
   */
  const EQUIPMENT = [
    ['NS-12', 'RO plant 500 LPH', 'Drinking water', 1,
     'Supply and maintenance. Part-C, NS-12.'],
    ['NS-12b', 'RO plant 250 LPH', 'Drinking water', 1,
     'Supply and maintenance. Part-C, NS-12 — the second of the two sets.'],
    // Singular, matching the catalogue. The count lives in `quantity`; a row
    // named "Cots" with a quantity of 10 reads as ten lots of cots, and it fails
    // to match the catalogue entry "Cot", which is how a register starts holding
    // two different things that are the same thing.
    ['NS-13', 'Cot', 'Bedding', 10,
     'Part-C, NS-13 — 10 sets every six months, 40 over the contract. This row is the current half-year.'],
    ['NS-14', 'Mattress', 'Bedding', 10,
     'Part-C, NS-14 — 10 sets every six months, 40 over the contract. This row is the current half-year.'],
    ['NS-16', 'Foot massager', 'Crew amenity', 2, 'Part-C, NS-16.'],
    ['NS-17', 'Shoe polish machine', 'Crew amenity', 4, 'Part-C, NS-17.'],
  ];
  n = 0;
  let already = 0, repaired = 0;
  for (const [code, name, category, qty, note] of EQUIPMENT) {
    // `assets` has no unique key, so identity is the running room and the
    // contract's own item code. Without this the loader would add six more
    // every time it ran.
    // The catalogue entry for this name, so the register counts by item and not
    // by spelling. See migration 047.
    const item = await db.one(
      `SELECT id FROM asset_items WHERE match_key = LOWER(REGEXP_REPLACE(?, '[^A-Za-z0-9]', ''))`,
      [name]);

    const have = await db.one(
      'SELECT id, name, item_id FROM assets WHERE running_room_id = ? AND asset_code = ?',
      [rr.id, code]);
    if (have) {
      // Repair rather than skip. An earlier run of this loader named these rows
      // in the plural, before the catalogue existed, and they matched nothing.
      if (have.name !== name || have.item_id !== (item ? item.id : null)) {
        await db.execute('UPDATE assets SET name = ?, item_id = ? WHERE id = ?',
          [name, item ? item.id : null, have.id]);
        repaired++;
      }
      already++; continue;
    }
    await db.execute(`
      INSERT INTO assets (running_room_id, asset_code, name, item_id, category, owned_by,
                          quantity, condition_status, handed_over_on, remarks)
      VALUES (?,?,?,?,?, 'contractor', ?, 'good', ?, ?)`,
      [rr.id, code, name, item ? item.id : null, category, qty, FROM, `${note} ${SRC}.`]);
    n++;
  }
  say(`Part-C equipment on the asset register`
      + `${already ? ` (${already} already there${repaired ? `, ${repaired} corrected` : ''})` : ''}`,
      n || already);

  /* ------------------------------------------------------------- linen */
  /* The linen schedule was read in at stage 34 against contract_id NULL,
   * because IGP's contract was the only one anybody had read and its terms were
   * the best available reading for all 44 running rooms.
   *
   * IGP now gets ITS OWN COPY rather than continuing to ride the fallback. The
   * moment ROHA's contract arrives and its delivery periods differ, that
   * fallback has to change -- and if IGP were still riding it, IGP's
   * contractual terms would silently change with it. That is the same fault
   * this whole stage exists to close, so the duplication is worth its cost.
   *
   * The first attempt at this was an UPDATE that moved the fallback rows onto
   * the contract, wrapped in a .catch() that turned any failure into a silent
   * zero. It failed on a duplicate key -- see migration 043 -- and printed
   * nothing. No catch here: if this cannot be done, the script says so and
   * stops.
   */
  const linen = await db.query(
    `SELECT * FROM linen_schedule WHERE contract_id IS NULL AND item_type <> 'other'
      ORDER BY sort_order, id`);
  let copied = 0;
  for (const l of linen) {
    await db.execute(`
      INSERT INTO linen_schedule
        (item_type, contract_id, name, delivery_days, wash_frequency, per_bed,
         recovery_rate, schedule_qty, source_ref, sort_order, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,1)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name), delivery_days = VALUES(delivery_days),
        wash_frequency = VALUES(wash_frequency), per_bed = VALUES(per_bed),
        recovery_rate = VALUES(recovery_rate), schedule_qty = VALUES(schedule_qty),
        source_ref = VALUES(source_ref), sort_order = VALUES(sort_order)`,
      [l.item_type, con.id, l.name, l.delivery_days, l.wash_frequency, l.per_bed,
       l.recovery_rate, l.schedule_qty, l.source_ref, l.sort_order]);
    copied++;
  }
  say('linen items held against this contract in their own right', copied);
  if (!copied) {
    console.error('\n  ! No fallback linen rows to copy. Run `node db/migrate.js seed` first.\n');
    process.exit(1);
  }

  console.log('  ' + done.join('\n  '));
  console.log(`
  WHAT REMAINS AN OPEN QUESTION FOR THE OFFICER

    - Bed sheets: Table-A of Part-E says 365,200. The Schedule of Quantities
      (NS-20) and the GeM line item both say 365,000. RR-CMS holds 365,200,
      which is the minority figure. Two sources against one.
    - Annexure-A, the cleaning materials list, is not in the 108 pages -- the
      Annexure-A printed there is the Undertaking Certificate. The list came
      separately, as page 337 of e-office file 3558998/2026, and is loaded. It
      should be attached to the contract file so the two travel together.
    - Annexure-A, air freshener dispenser (IGP-M08): the refill is 300 ml in the
      description and 250 ml in the make/brand line of the same cell. Neither is
      confirmed by a quantity, so it is entered at 300 ml and needs a ruling.
    - Annexure-A, dustbin containers (IGP-M16): 10 containers of 120 litres every
      month for two years, Rs 6,12,000 -- the largest line on the sheet. Recorded
      as printed. Worth confirming that this is a replacement rate and not a
      one-time supply that was multiplied.
    - Part-E is headed ROHA throughout. Part-A and the GeM line items say IGP.
      Confirmed a typing error by the officer, left as it stands.
`);
  process.exit(0);
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
