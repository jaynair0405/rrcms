# What is built, and what is not

An audit of RR-CMS against its two source documents, made on 20.08.2026 at
stage 17, with Part Four added at stage 18:

- **Concept Note — Contract Service Management System for Running Rooms**
  (Central Railway, v0.2)
- **Improvement of Running Room Facilities** — PCEE's office, Mumbai CSMT,
  ref **L.326.OP.RR Lobby/08 dated 24.07.2026**, forwarding the Solapur
  Division committee's *Indicative Special Conditions of Contract for Running
  Rooms over Central Railway*. 36 pages, from which roughly 200 distinct
  obligations were extracted and checked one by one.

The test applied throughout was **could this actually be recorded and got back
out again** — a table with no screen does not count as built, and there turned
out to be five of those.

---

# PART ONE — BUILT

Numbered for going through one at a time.

### The register and the contract

1. **Running rooms** — 44 sites from the tender with beds, rooms, female
   accommodation, category, meal facility, housekeeping and air-conditioning
   state. The four pilot sites are live; the other 40 carry `not_in_scope`,
   which says plainly that they are open and working but not yet on this system.
2. **Contractors and contracts** — firms with CLRA, EPF and ESIC registration
   numbers; agreements with period, security deposit and performance guarantee.
   *Read-only today — see P17.*
3. **Sanctioned strength** — Schedule A's twelve designations against the five
   bed bands (50/100/150/200/250), pro-rata scaling, per-site override, and a
   warning when a site is over or under its sanction.

### Contract staff

4. **Staff register** — the 63 real people at IGP, LNL and ROHA, with post,
   contractor and site.
5. **Particulars** — phone, father's name, date of birth, address, bank, IFSC,
   EPF and ESIC, correctable after creation with an audit of what changed.
6. **The six screening documents** — photo identity, police verification,
   medical fitness, bank, EPF and ESIC proof, each with reference number, issue
   date, expiry and a scan. Flags for missing medicals and expiring documents.
7. **Photograph** — file or camera, replacing rather than accumulating.
8. **Screening approval by the Railway**, and the gate that follows from it: an
   unapproved person **cannot be marked present**, enforced by the server.
9. **Identity cards** in the tender's own proforma, with the photograph.
10. **Uniform and shoe issue**, with the six-month and one-year clocks and a
    "uniform due" filter.
11. **Replacement and leaving**, including the Railway's permission for a
    replacement.

### The daily registers

12. **Muster** — present, absent, leave, weekly off, reliever; the whole roster
    marked in one press; a search for exceptions; yesterday's absentees marked
    out; the Railway's countersignature. A reliever must name whose post he
    covered, must be on that roster, and one absence can be covered only once.
13. **Call book** — crew resolved against the division's staff master, train
    resolved against the division's train master, delay computed and stored at
    the moment of entry, acknowledgement and crew-reported-late. *Being reworked
    — see Part Three.*
14. **Meals served** — one tick per crew per service per day, duplicate-proof,
    the list building itself from the call book. Schedule B ceilings held with
    their source; no amount computed.
15. **Linen, daily** — issues, washing sent, fresh received, stock in hand, with
    the arithmetic checked as it is typed.
16. **Linen stock, by item** — Railway-issued, in service, at laundry,
    condemned, lost — dated, with what is unaccounted for worked out.
17. **Complaint book** — a countable category list built from the deficiency
    schedule's own groups, with the Railway's own maintenance kept separate from
    the contractor's defaults; severity, assignment, closure with remarks.

### Facility and material

18. **Laundry** — dispatch with vendor, invoice and scan, quantity returned,
    wash quality; washing at an unapproved or unnamed centre counted as a
    clause C1 breach.
19. **Consumables** — supply against a due date, with brand and shortfall days.
20. **Assets and breakdowns** — defects against the 24-hour rectification clock.
    Assets can now be entered and jointly checked — see Part Four.
21. **Pest control** — five treatment types, scheduled against performed, the
    48-hour notice, areas, chemical, licensed vendor and delay days.
22. **Kitchen compliance** — FSSAI, fifteen-day grocery, twenty-four-hour
    perishables, approved brands, two spare cylinders, six-monthly gas pipe
    test, vegetarian and non-vegetarian utensils kept apart, water quality.
23. **CCTV** — cover judged by required place rather than by a count of cameras;
    working and recording asked separately; a camera nobody looked at left
    alone; retirement gated on the Railway.

### Compliance

24. **Food safety** — the Form C licence per premises with its validity, the
    180-day renewal window, the technical person and the Form IX person; the
    annual return and lab-test obligations with due dates; and a 42-item
    hygiene inspection, every item cited to a Condition of Licence or to
    Schedule 4, with critical items deciding the result on their own.
25. **The daily joint compliance checklist** — 30 clauses, per-item quantity,
    observation and photograph, with the contractor's representative named as a
    condition of filing. Four inspection types including surprise and
    higher-official.
26. **Deficiency register** — clause, date, quantity, evidence, source and
    closure.
27. **Crew feedback** — the QR form on cleanliness, food, linen and behaviour,
    with named staff and photographs; coverage against the 50%-of-occupants
    floor, which blocks the grading penalty when it is not met; monthly grading
    with the tender's banded R value.
28. **The monthly pack** — figures frozen, the deficiency list frozen with them,
    and a certify → countersign → return chain.

### Underneath everything

29. **Users, roles and scope** — six roles, row-level scoping by division,
    running room or contractor, created from a screen with the scope enforced;
    an administrator-issued password refused every screen until its owner
    chooses his own.
30. **Audit trail** of every write, and **reports and CSV exports**.

---

# PART TWO — NOT BUILT

Ranked by what the Railway could be asked to prove and could not.

## Half-built — FIXED at stage 18

All five were built on 20.08.2026. The schema had been laid down early and five
parts of it were never given a way in; they looked finished from the database
and were reachable from no screen. What each now does is under PART FOUR.

See PART FOUR.

## Never built

- **P6 · The daily cleaning record. BUILT AT STAGE 26.** Schedule C's schedule is
  now held as rows — twice a day, three times a day, every Sunday, second and
  fourth Sunday — and kept **round by round**, with the finishing time against
  the tender's own window, who did it, and whether the room freshener the
  schedule requires was sprayed. The Railway can now produce the *positive*: a
  record that cleaning was done, on a date, at an hour. A blank round stays
  unrecorded rather than becoming an accusation, and the two are counted apart.
  The contractor records and the Railway verifies; correcting a round withdraws
  the verification. Pest control — the fifth row of the same table — is not
  duplicated here, having kept its own register since stage 6.
- **P7 · Wages, EPF and ESIC deposits, bonus, Shramik Kalyan. BUILT AT STAGE
  30.** The muster proved a man was present; nothing proved he was paid for it.
  The register is **per man per month**, because clause M5 multiplies staff by
  days and a monthly total cannot answer it. The date wages actually reached the
  men is the one field the clause turns on, and it is recorded as a fact.
  Days present are carried across from the muster as a *suggestion* and never
  written in. A man left blank stays unrecorded — not written down as unpaid —
  and an amount of 0 is a finding, which is a third thing again. The four
  statutory returns (EPF, ESIC, bonus, Shramik Kalyan) each carry their date,
  reference, amount and the piece of paper. The contractor's supervisor records;
  the Railway verifies, and correcting a verified month withdraws the
  confirmation. Where wages are late the screen states the arithmetic — *eight
  days, fourteen men, 112 staff-days* — and offers to hand clause M5 to the
  deficiency register prefilled, once, for the officer to confirm or discard.
  **No rupee figure is computed**, here as nowhere else.
- **P8 · The occupation register.** Arrival, bed, departure and the occupant's
  signature. This is *deliberately* with RRMS and both the schema and PENDING.md
  say so — but measured against the contract it is a gap, and clause C4 and C5
  cases are weaker for it. **The cheaper answer is to confirm the RRMS boundary
  in writing, not to rebuild it here.**
- **P9 · Menu card, rate board and the Table A / Table B norms. BUILT AT STAGE
  25.** Table A with its stated quantities, Table B's 23 printed lines, a dated
  rate board, the weekly menu per room with the no-repeat-breakfast and
  two-seasonal-vegetable rules checked against what is entered, and a printable
  menu card for the kitchen board. One thing remains outstanding and it is not
  ours: **the tender fixes no rate for any Table-B item** — the cost column is
  printed blank and the figures are the Railway's to set — so clause B6 still
  has no price to test against until the division supplies them. Unpriced items
  print as *rate not yet fixed*, never as a blank or a zero.
- **P10 · The packed parcel meal. BUILT AT STAGE 25.** `parcel` is a fourth meal
  type, outside the three-meal ceiling as the Railway Board letter requires, with
  its own column on the meals register. The packing charge is a Table-B matter
  and waits on the same missing rates as the rest of Table B.
- **P11 · The raw-foodstuff quality register. BUILT AT STAGE 28.** Recorded as
  an event with the items examined under it and the signatures of the running
  staff beside it, per Schedule A L.7 — the seal and the FSSAI mark held apart
  from the quality, because a sealed pack from an approved brand can still be
  past its date. A check nobody signed is kept and flagged.
- **P12 · Garden and lawn upkeep. BUILT AT STAGE 28.** On the pest and garden
  tab, which had claimed the garden in its title since stage 6 and carried no
  field for it. The half-yearly ten plants in gamlas are counted against the
  tender's figure and the pot is checked against its stated material and size.
- **P13 · The physical feedback register signed by the occupant. ALREADY BUILT
  AT STAGE 19 — this entry was stale and is corrected here, 26.08.2026.** The
  signed register screen, the coverage count against the 50% floor and the
  `checkout_register` channel all went in at stage 19. Nothing further is owed.
  Recorded because very nearly building it a second time is exactly the
  duplication fault this audit exists to prevent.
- **P14 · THE INCIDENT REGISTER BUILT AT STAGE 31; the compliance ticks still
  open.** Fire, theft, miscreant activity, accident, death and intoxication now
  have a register: when it happened, when the Railway was told (and the gap
  between the two, which is what an enquiry reads first), who was informed and
  under what reference, what was done at once, and what was found when it was
  closed. **Almost nothing on it is a penalty** — a fire or a theft is an event
  the Railway must know about, not a deficiency, and the register raises nothing
  for it. The single exception is clause **A3**, Rs 1,000 per labour per case,
  and only where the man was the CONTRACTOR's: intoxication of running staff is
  the same word and a crew discipline matter carrying no contractor penalty
  whatever, so the register asks whose man it was and the route refuses A3 for
  the other answer rather than trusting the reader to know the difference.
  Closing an entry needs a line saying what was found; a bare "closed" answers
  nothing at an enquiry.
- **P14 (remainder) · BUILT AT STAGE 32.** The standing obligations now have a
  page: the PC and printer, the biometric system, the indemnity bond, the
  uniform sample, fire-extinguisher refilling, emergency numbers at reception,
  the single-use-plastic prohibition, bed plates and name board, training before
  deployment. Most carry **no clause** and the page says so — an unlit name board
  is a thing to put right, not a penalty. Three carry a rate: **D3** and **D4**
  at Rs 1,000 a week, and **M12** for extinguisher refilling. Those behave like
  M5: state the weeks, offer the clause, compute no money. The clock runs from
  the **Letter of Acceptance**, so a site with no LOA date on record has no due
  date and is **not** reported as breached — a penalty must not run from a date
  nobody has given, and that is a second reason for the officer to chase it. The
  **18-to-60 age band is derived** from the staff register rather than ticked,
  and men with no date of birth on record are counted as unknown, not compliant.
  Still with no home: newspapers and magazines have their Schedule D seed but no
  daily supply record, and "any other irregularity not covered" has no clause row
  and no free-text path.
- **P14 (was) · Small things with no home:** bed indication plate and name board;
  newspapers and magazines (three dailies, India Today Hindi, a Marathi
  magazine — not even in the consumables list); staff training before
  deployment; the contractor's PC and printer and the biometric system supplied
  within a month, on which clauses D3 and D4 turn; the security and incident
  register (fire, theft, miscreant activity, accident, death, intoxication of
  running staff); the indemnity bond; fire-extinguisher refilling; uniform
  sample approval; the 18-to-60 age band; emergency numbers displayed at
  reception; the single-use-plastic prohibition; meal service time windows; and
  "any other irregularity not covered", for which there is no clause row and no
  free-text path.

## Recorded, but incomplete

- **P15 · Call book** — `booked_on_duty_at` and `ack_signature_file_id` exist as
  columns and are **never written**. So the "resulting in late on duty" element
  of clause C6 rests on a supervisor's checkbox rather than on the booking time,
  and no occupant signature is captured. This is the subject of Part Three.
- **P16 · Replacement reason** has no flag separating "replaced for poor
  grading" (General Instr. 28 — *no* penalty) from "frequent replacement without
  permission" (clause A18 — ₹10,000). The reason has to be read by a human.
- **P17 · Contractors and contracts are read-only.** No create or edit route, so
  all four pilot agreements still read `AGREEMENT-AWAITED`.
- **P18 · Linen washing frequencies** — mosquito nets twice monthly, curtains
  monthly, the 48-hour return — are not tracked as due dates, only
  reconstructable by counting rows. The monthly linen review and
  age-cum-condition withdrawal have no event.
- **P19 · CCTV 30-day retention** — we record the days of footage seen but
  nothing flags fewer than 30 as a breach, and nothing records that access was
  given to Railway representatives.
- **P20 · Shifts** — `attendance_daily.shift` is an enum and the muster writes
  `general` for everybody. There is no duty roster, so "ladies staff preferably
  on day shift" has no shift to be checked against.
- **P21 · The inspection signature** is a flag and a remark, not a signature
  artefact, and there is no contractor countersignature on the daily report.
- **P22 · Occupancy** is one keyed total per room per month, and its
  `verified_by` and `verified_at` are never written.
- **P23 · Uniform issue** records the giving but never the acknowledgement.
- **P24 · The identity card** prints "personal identification mark" as a blank
  line to be filled in by hand — there is no column for it.

## Deliberately not built, and why

- **No rupee figure is computed anywhere.** Deficiency rates, the
  `(5−R)/5 × 10%` grading formula and the Schedule B ceilings are all held as
  dated reference data and multiplied by nothing, because the penalty schedule
  is still under review. Everything the arithmetic will need is being captured.
- **No CCTV stream address and no live picture.** An address that reaches a
  camera carries the credentials that reach it, and a picture on screen invites
  the belief that the system is watching when all it can honestly say is what
  somebody last verified.
- **Bed allotment, occupancy and meal *accounting* stay with RRMS.** What we
  hold is the record of who ate, underneath it.

---

# PART THREE — THE CALL BOOK

Set aside for a proper design conversation rather than another patch. What is
known to be missing or unsettled:

1. **`booked_on_duty_at` is never written.** Clause C6 penalises failure to
   serve the call book in time *resulting in the crew being late on duty*. We
   record when the call was received and when it was served, and then ask the
   supervisor to tick "crew reported late". The booking time is the fact that
   would prove it.
2. **No occupant signature.** `ack_signature_file_id` exists and is never used.
   The tender wants the crew's acknowledgement.
3. **No bed number against the entry**, and no link to the occupation register —
   which lives in RRMS.
4. **A shift's worth of calls on one screen.** A supervisor works a shift, not a
   date. What he should see when he sits down has never been designed.
5. **Two men of the same name** without a CMS number still share one crew
   record. The remedy is the number, which the running rooms should be asked to
   write.

---

# Decisions still with the Railway

- Who may supply the photograph on an identity card.
- Whether the divisional officer may attach a document to a staff record.
- Whether the CCTV check itself should be the Railway's alone, given that the
  state of the cameras is evidence against the contractor.
- When linen stock counting narrows from the contractor to the RR In-charge.
- **Whether the RRMS boundary is confirmed** — see P8. This is the largest single
  question on the list, because it decides whether the occupation register is
  our gap or somebody else's record.

# Data the Railway still owes

The four agreements · the four FSSAI licences · JNPT's sanctioned figures and
contractor · Piyush Traders' address · the Supervisor, Call Boy, Security
Guard, Gardner and Sweeper rosters · joining dates, bank, EPF, ESIC and the six
screening documents for the 63 people loaded · the three lookup views and their
grants on CRTMS.


---

# PART FOUR — WHAT STAGE 18 BUILT

The five half-built parts of the schema, given screens on 20.08.2026.

**P1 · Bills.** A bill per agreement per month per running room, with the
tender's **eleven** bill-passing documents created alongside it — a checklist
built by hand is a checklist somebody shortens. The gross is added up rather
than typed, so a bill whose parts do not match its total is caught at the
counter and not at the audit. It **cannot be passed** while a required document
is awaited, nor before the date the contractor submitted it is recorded, because
clauses D5 and D6 turn on that date. Passing is the divisional officer's;
preparing and checking is not. The period's deficiencies are listed on the bill
with their schedule rates, **multiplied by nothing**.

*Corrected while building it:* the `doc_type` enum had been written from memory
of the tender and carried ten values where Payment Terms 5 lists eleven. Item
(2) — the staff list with salary through bank and bank details — had no value at
all, and items (4) and (5), the proof that EPF and ESI contributions reached the
departments, were conflated with (6), the receipts and challans. Those are
different pieces of paper and an accounts office asks for both. The enum is now
the tender's own eleven, in the tender's own order.

**P2 · Staff grading.** Per person per month. The occupant rating is computed
from feedback that actually named the man, and attendance from the muster; the
joint evaluation on dress, behaviour and work is typed, because it is the
Railway supervisor's judgement made with the contractor's supervisor. The
recommendation — retain, watch or replace — is never filled in automatically: a
screen that guessed "replace" from an arithmetic mean would be putting a man out
of work by rounding. A man nobody graded is left ungraded, because the retain
list is the one the Railway acts on and padding it makes it worthless. The
replace list carries General Instruction 28's protection on its face: **no
replacement penalty follows** where the Railway itself asked for the man to go.
The contractor's supervisor cannot grade his own men.

**P3 · The joint asset register.** An asset can be put on the register with its
handover date and the signed joint note attached, and the **three-monthly joint
check** General Instruction 2 requires now exists: expected against found, per
item, with the condition. The contractor's representative is **named as a
condition of filing** — a check that is not joint proves nothing against him.
An item nobody looked at is left alone. The screen states plainly when the last
check was more than ninety days ago, or when there has never been one, because
the recovery clause A10 provides for rests on exactly this.

**P4 · Vendor approval.** `is_approved` had been read since stage 6 and nothing
could set it. A vendor is created **unapproved** — creating and approving in one
motion would make the approval a side effect of typing a name. Approval is a
dated act by a named officer; the premises inspection the tender asks for "from
time to time" is a separate record with its own finding; and a vendor found
**unfit** loses its approval with the finding, because the register cannot say
"approved" the day after an officer wrote that the premises were not fit to wash
railway linen. Withdrawal does not delete or deactivate the row: dispatches
already sent there must keep pointing at a record that still reads correctly, or
last month's clause C1 case loses its subject. An approval nobody has revisited
in a year is flagged.

**P5 · Weekly and monthly deficiencies.** All fifty clauses were seeded and only
the daily ones could ever be recorded. There is now a periodic review — monthly
and weekly — carrying the twelve `M` clauses and the two weekly `D` clauses, so
garden upkeep, replacement without permission, uniform and shoes, wages not paid
by the 10th, misuse of water and electricity, the complaint book, the pest
schedule, loss of Railway material and fire extinguishers can be recorded at
last. **M10 is the tender's own catch-all**, so an irregularity the schedule
does not name has a home without inventing a clause. The grading clauses are
deliberately absent: they are computed from occupant feedback against the 50%
floor, not ticked by anybody. Saving the review again corrects it — but only
what is still open; a deficiency already rectified or closed is history.

## Two faults found while doing it

**The daily joint checklist could not be filed at a real running room.** The
form carries one photograph box per clause, and a browser sends an empty part
for every file input whether or not anything was chosen. The upload limit was
twelve files; the tender has thirty daily clauses. Every joint report would have
been refused with "too many files were sent at once" before a single photograph
was attached. **This had been true since stage 5 and was invisible** because the
demo carried an abridged clause list of twelve. The demo now parses the real
seed file, so the two cannot drift apart again, and the limit is 64.

**The crawler was calling correct behaviour broken.** A page a role is properly
refused was counted as a failure, and two hardcoded record ids produced 404s
that were not faults. A crawl that always ends "6 broken" trains whoever reads
it to skim past a real one. Refusals are now named separately and the ids are
discovered. Both roles crawl **0 broken**.

---

# PART FIVE — WHAT STAGE 19 BUILT

## The signed feedback register, and the fault it uncovered

**The tender does not ask for a feedback form. It asks for a register.**
Grading feedback on **cleanliness, food quality and linen washing** is to be
taken from each occupant every month **on a physical register, signed by the
occupant**, and the grading penalty may be applied only on the average from a
**minimum of 50% of the occupants**.

RR-CMS had QR feedback, which is useful and should stay — it tells the Railway
whether the crew are being asked at all, and it catches complaints the same
night. But it is **unsigned**. A deduction resting on unsigned feedback is a
deduction the contractor can argue with, and would probably win. So the two are
now counted **separately**, and it is the signed count the floor is tested
against.

**19.1 · `/feedback/register` — keying a page of the register.** One scan or
photograph of the signed page, a page number, and twelve lines under it —
because a page is many occupants, not one. Each line takes the occupant's name,
his CMS number if he gave it, the stay date, the three ratings and a remark.
Food is not asked for at a room with no meal facility, and none is invented.

- An empty line is **ignored**, not saved as zeroes — a blank row is an unused
  line on the form, not an occupant who said nothing.
- A line that **names a man but carries no rating** refuses the whole page.
  That is a keying slip, and half a page saved is worse than none.
- The save is **one transaction**. Before this it validated as it went, so a bad
  line at row 9 left rows 1–8 saved and the re-key duplicated them.
- Entries are stamped with **who keyed them and when**, and carry the page
  number, so any figure can be walked back to the paper.

**19.2 · Who may key it.** `feedback.enter` — the **RR In-charge** and the
**divisional officer**. The **contractor's supervisor is deliberately excluded**:
he must not key the register that decides his own grading. Reading it is
`feedback.view`, so HQ and the division can see whether the register is being
kept at all — which is itself the finding.

**19.3 · `feedback_coverage` was read in seven places and written by none.**
This is the fault the work uncovered, and it was the serious one. The dashboard,
the running room sheet, three reports, the monthly certificate and the grading
screen all read that table. **Nothing anywhere wrote to it.** On a real
installation it would have stayed empty for ever, which means:

- the grading screen's "meets the floor" was always null, so **the 50% condition
  the tender puts on the grading penalty was never actually applied to
  anything**;
- the monthly certificate froze a coverage of nil into the pack;
- every trend and league table read zero and looked like a real zero.

It went unnoticed because the `/feedback/coverage` screen computes its own
figures live and therefore always looked right.

`src/services/coverage.js` now computes and keeps both counts, and is called
whenever feedback arrives — QR, register or occupancy figure — plus a
**Recompute** button on the coverage screen for a whole month. The recompute is
best-effort: a coverage figure must never be the reason a crew member's feedback
fails to save.

**19.4 · The occupancy figure is the denominator.** With no occupancy entered
there is no percentage, and the screens now say **"cannot be computed"** rather
than showing a plausible zero. Entering the figure moves the stored coverage
immediately.

**19.5 · Grading now gates on the signed floor.** The R value is computed from
`checkout_register` rows only. Where there is no signed feedback the screen
shows the unsigned average **and states that it is not leviable**. As
everywhere else in RR-CMS, **no rupee figure is computed** — the `(5−R)/5 × 10%`
formula is held as dated reference text, multiplied by nothing, pending the
penalty schedule.

## A fault found in the demo while doing it

The demo's plain running-room list stub swallowed the coverage query — both join
`running_rooms` to `divisions` and order by the same column — so the coverage
screen answered first with bare rooms and **every figure on it read zero**,
including an occupancy figure typed in a second earlier. The same class of stub
collision has now bitten three times. The stub stands aside for the richer
query, and the occupancy lookup no longer invents a denominator from the
reference crews-per-day: no figure entered now reads as no figure entered, in
the demo exactly as on MySQL.

Verified on real MySQL, not only against the stub:

```
running_room_id  period_month  occupants  received  signed  coverage%  signed%  floor  signed floor
13               2026-08-01    6          6         6       100.00     100.00   1      1
```

433 browser checks pass, 13 unit tests, 62 templates clean, 0 broken on both
crawls.

---

# PART SIX — WHAT STAGE 20 BUILT

## The call book, rebuilt around the call

The working, as the Railway described it: the Jr Crew Controller in the lobby
telephones the running room and gives **one train, a sign-on time, and the men
booked for it** — LP and ALP, sometimes a guard. The bearer writes it on one
line of the manual book, goes to the beds, wakes them, takes their
acknowledgement, and **repeats the acknowledgement back to the lobby**.

RR-CMS recorded **one row per man**, with no notion of the call. That made the
bearer key the same call twice, and left the Railway unable to see the thing
that actually matters — that the LP was woken and the ALP was not.

**20.1 · A call is now one record.** `call_book_calls` carries the train, the
sign-on time, the time the lobby rang, which lobby and which Jr CC. The men are
lines under it, each with his role, his bed and his own outcome. Up to six men,
because the lobby occasionally names more than a pair.

**20.2 · The acknowledgement is a tap, and the time is the server's.** The
bearer opens the call at the bed and hands over the phone; each man presses a
button carrying **his own name**. The time is stamped by the server at that
moment — the bearer cannot type it and cannot write it up at the end of his
shift.

This is worth being clear about, because the instinct is that a tap is weaker
than a signature. It is weaker on **who**: a determined bearer can press it
himself. It is far stronger on **when**, and *when* is what the clause turns on.
The paper book gives a real signature and a **bearer-written time**; the tap
gives no signature and a **time nobody can write after the fact**. The paper
book continues alongside, unchanged. Signature-on-glass is designed for and left
as a later option — `ack_method` already carries `tap | signature | paper`.

**20.3 · Three outcomes, not two.** Acknowledged, refused, and **not in the
running room** — because Schedule A treats the last two as distinct
discrepancies, and they are.

**20.4 · The advice to the lobby, which had nowhere to go.**

> "For any discrepancy regarding non acknowledgement of call by staff or such
> staff is not available in the running room at the time of call serving, crew
> booking lobby shall be advised immediately for suitable action **with time**."

Recorded per man, with the time and who at the lobby was told. **Recorded, not
sent**: the bearer telephones the lobby exactly as he does now. RR-CMS is the
evidence, not a messaging system. This is as much the contractor's defence as
the Railway's record — a bearer who rang at 03:12 to say the ALP was not in his
bed should be able to prove it.

**20.5 · The repeat-back.** "The acknowledgement of serving of call by
respective crew shall be repeated to crew lobby." One button, stamped, and
**held closed until every man on the call is settled** — the lobby cannot be
told a call is complete while a man's outcome is still open.

**20.6 · A withdrawn call is kept.** Train cancelled, crew changed, called in
error — closed with a reason rather than deleted. A call that disappears takes
with it the only evidence of what the running room was asked to do.

## The invented rule that was removed

The screen called anything over **twenty minutes** "Late — C5", and the KPI
strip judged the average delay "within norm" or "above norm".

**There is no lead time in minutes anywhere in the tender.** That figure was
invented in this codebase. What Schedule C item 6 actually says is:

> "If contractor fails to serve call book to running staff in time, **resulting
> late on duty** of running staff — Rs.500/- per case."

Two limbs, and a case needs both. So the twenty minutes is gone, along with the
norm. What is counted now is what somebody can point at: calls taken, men
acknowledged, men who refused, men not in the running room, men **never advised
to the lobby**, men reported late on duty, and — separately — how many were
**served after their sign-on time and went late**. Late on duty is recorded as
its own act, because the running room does not learn it at the bed; the lobby
tells them afterwards.

**No amount is computed**, here as everywhere else in RR-CMS.

## Faults found while doing it

**A query shape nobody had a stub for.** The serving screen asked for a running
room with a shape used nowhere else, and the demo answered with nothing — a
500 on a page that worked perfectly against MySQL. It now uses the same shape
the certificate pack uses. **Every new query shape is another chance for an
older stub to answer it first, and that has now caused four wrong-data bugs in
this codebase.** Reusing a shape is worth more than reading well.

**The demo generated one man per call**, which would have meant the case the
whole redesign exists for — one man acknowledging and the other not — was never
exercised. The demo now generates pairs, with roughly one call in ten carrying a
man who refused or was not there, and most but not all of those advised to the
lobby.

451 browser checks pass, 13 unit tests, 63 templates clean, 0 broken on both
crawls, and the whole call-book working verified end to end on real MySQL.

---

# PART SEVEN — WHAT STAGE 21 BUILT

## The call book became a sheet

Stage 20 built the call book as a **form**: take a call, type the train, type the
men. Faithful, and slow — because the bearer already knows which trains are
coming. They are the same trains every day.

So stage 21 rebuilds it on the model the Railway already uses, the control
office's **LPC daily sheet**:

| Control office | RR-CMS |
|---|---|
| `div_loco_link_master` — static list, one row per train per sheet, with `run_days`, `event_time`, validity window | `call_sheet_trains` — the same, per running room |
| `div_loco_link_log` — the daily fact, upserted on `(date, train, direction)` | `call_book_calls` — upserted on `(room, date, sheet row)` |
| `GET /today` materialises rows from the master and LEFT-joins the log | `/records/call-book` does exactly this |
| Ad-hoc specials: log rows with `master_id IS NULL` | Ad-hoc rows: `sheet_train_id IS NULL` |

Nothing is stored per day until somebody types. The day's rows are built at read
time from the room's list, filtered to what runs today, **ordered by sign-on
time**, with whatever has been keyed joined onto them.

**21.1 · Which direction a room's sheet is — and why it is easy to get wrong.**
A crew works **down** to Igatpuri, is relieved, sleeps, and is called for an
**UP** train back towards Mumbai. The arriving train is how he got there; the
departing train is what he is called for. The first cut of the import had this
backwards and filled Igatpuri's sheet with the DN arrivals — trains nobody at
that running room is ever called for.

That rule is a **default, not a law**. It holds while only Mumbai is loaded. It
stops holding the moment the neighbouring divisions come on: Bhusawal's crews
rest at Igatpuri too and are called for **DN** trains onward to Bhusawal. So
direction is carried on every row of the room's list, a room can hold both, and
the import takes `--direction BOTH`.

**21.2 · Where the trains come from.** `db/crtms/v_rr_call_sheet.sql` — the
fourth and last narrow view RR-CMS reads out of CRTMS, over
`div_loco_link_master` + `div_train_stops`. It hands over a number, a name, a
direction, the two ends, the run days and the timetable's time at the boundary.
No locos, sheds, links, mislinks or crew cross.

It is read **once**, by `node db/import-call-sheet.js`, which copies it into
RR-CMS's own table. Not on every page, and deliberately so: a running room at
four in the morning must not depend on the control office schema being
reachable, and the Railway must be able to correct its own list without editing
the control office's. Re-runnable; **a row somebody edited by hand is left
alone**, because an import that silently undoes a correction is worse than no
import.

**21.3 · Greying out.** A row goes faint when every man on it is settled **and
the lobby has been told** — not merely when somebody acknowledged. A call with a
man missing is not finished business.

**21.4 · Withdrawals and crew changes moved to their own tab.** Both carry a
reason and both are kept, in `call_book_changes`. A substitution that quietly
overwrote a name would erase the only evidence of what the running room was
originally asked to do — the same failure as deleting a withdrawn call. And a
crew change **reopens the call**: the new man has acknowledged nothing, so the
old man's acknowledgement is cleared and the lobby has to be told afresh.
An acknowledged man cannot be replaced on the sheet at all.

**21.5 · Who keeps the room's list.** New permission `callsheet.manage` — RR
In-charge, divisional officer, sysadmin. **Not the contractor's supervisor**: a
contractor who can edit which trains are expected can edit away the evidence
that one was never called. He works the daily sheet; he cannot open the list.

## Two faults found while building it

**A `<form>` inside a `<tr>` does not work.** The browser hoists it out of the
table and the row silently stops submitting — no error, nothing saved. Each
row's form is now declared once outside the table and every control points at it
with `form=""`. Plain HTML; no JavaScript needed, so the sheet still works with
scripting off.

**The unique key was wrong for the domain.** The first cut keyed the daily fact
on `(room, date, train_no)`, copying the loco link log. Real data refused it:
a train genuinely can be called **twice in one day** — called, withdrawn by the
lobby, called again for a changed crew. The key is now the **sheet slot**, and
ad-hoc rows carry no slot and are therefore exempt, which is what lets a goods
working with no number be entered as many times as it actually happened.

458 browser checks pass, 13 unit tests, 66 templates clean, 0 broken on both
crawls, and the whole sheet verified end to end on real MySQL — including the
importer, against a stand-in loco-link view.

## Stage 21a — the trains are real now

The sheet was right and the numbers on it were invented, which is the one thing
that makes a screen look like a toy to somebody who knows the section.

`data/pilot/call-sheet.json` is built from the division's **own** documents —
`Train_Timings_Summary.xlsx` for the times at IGATPURI, LONAVLA and ROHA, and
`div_trains_stations.csv` for names and run days. Nothing in it is generated:
164 workings at Igatpuri, 128 at Lonavla, 58 at Roha, each with its real number,
name, run days, and the time the train is actually due at that station.

The **UP** rows are switched on, because that is what a rested crew is called
for. The **DN** rows are carried but inactive — they go live the day Bhusawal's
crews rest at these rooms and are called DN onward, and are switched on from
*Trains on the sheet* or by re-importing with `--direction BOTH`. Carrying them
switched off rather than dropping them means that day costs a click, not
another import.

`node db/import-call-sheet.js --file data/pilot/call-sheet.json` seeds a real
database from it and **needs no CRTMS view and no grant at all** — which is how
the four pilot rooms should be seeded now, with the loco-link view left for when
the timetable changes and the whole division is loaded.

The demo uses the same file, in pilot mode and in the ordinary demo alike, for
the three rooms that have one. The other running rooms still carry generated
numbers, which is honest: the Railway has not supplied a timetable for them.

**Also fixed:** the crawler still had one hardcoded id, `/masters/vendors/1`,
which 404s on a pilot install because no vendor has been approved yet. That is a
site with nothing recorded, not a broken page. The id is discovered now, and the
page is dropped when there is none — so a pilot crawl reads **0 broken** instead
of teaching whoever runs it to ignore one.

---

# PART EIGHT — WHAT STAGE 22 BUILT

## A special that turns up between two booked trains

Two ways, because a bearer at four in the morning should not have to remember
one of them:

- **On the row below the table, with its time.** The sheet sorts by sign-on
  time, so a special typed there lands where it belongs. This already worked at
  stage 21; it is now said plainly on the screen instead of being left to be
  discovered.
- **`+ row` on the row above it.** Opens one blank line exactly where the
  bearer is looking.

**One blank at a time, on purpose.** Opening a second closes the first. A sheet
that can sprout a blank under every row becomes a field of half-filled boxes,
and then nobody can tell what was actually called from what somebody started
typing and abandoned.

With scripting off the `+` does nothing and the row below the table does the
whole job — so the sheet never depends on JavaScript to record a call.

## Mail and goods are two different sheets

A goods running room has no business being shown the mail links. Its crews are
called for workings that are **on no timetable at all**, so a pre-filled list of
mail trains is not merely useless there — it is a screen full of rows nobody
will ever tick, which is how a register stops being read.

- Two tabs, **Mail / Express** and **Goods**, on every running room.
- The **goods sheet opens as blank lines**, which is what the paper book is.
- A goods row **does not need a train number**. A working identified by its crew
  and its time is enough; inventing a number to satisfy a form would be worse
  than leaving it out. It still refuses a row with nothing on it at all.
- Each room is **marked once** with the tab it opens on, so a goods room's
  bearer never clicks again.
- **Both tabs stay reachable everywhere.** Hiding the one a room does not
  normally use would make the day something unusual happens the day the register
  cannot hold it.

Calls and listed trains both carry the service, so the two sheets never bleed
into one another.

## Who may be booked as crew

The lookup was already restricted to running staff, so a cook or a clerk could
never be booked as a driver. But **LP and ALP both passed that test** — and
booking the assistant as the driver is a real keying error at four in the
morning, not a hypothetical one.

`v_rr_crew_lookup` now carries `designation_id`, and the boxes narrow:

| Box | Designations offered |
|---|---|
| Loco Pilot | 5, 6, 7 |
| Asst. Loco Pilot | 1, 2 |
| anything else | 1, 2, 5, 6, 7 |

The numbers live in `src/config.js`, not in the view — a division that numbers
its designations differently is a setting, not a schema change. And because the
narrowing is applied in RR-CMS as well as the view, a view that is wider than it
should be still cannot put a cook in the Loco Pilot box.

**An installation whose view predates `designation_id` keeps working.** The
query falls back to the wider form, logs *once* what to re-run, and still finds
people — because silently returning nobody would read as "this man is not on the
master", which is a different and far more misleading answer than "the boxes
cannot be told apart yet".

## A fault found while building it

**The changes tab went silently empty.** Adding the service filter to the demo's
call-lookup stub made it match only the sheet's query shape; the changes tab
asks for the whole day without a service, fell through to no stub at all, and
rendered a page with no calls and no error anywhere. Found by a test, not by
eye. The stub now answers both shapes and says in its comment why there are two
— this is the fifth wrong-data bug this file has produced, and every one of them
has been a stub answering, or failing to answer, a query it was not written for.

476 browser checks pass, 13 unit tests, 66 templates clean, 0 broken on all
three crawls, and mail, goods, slotting and the narrowed lookup all verified end
to end on real MySQL as well as the demo.


---

# STAGE 22a — THE FIRST LIVE INSTALL

RR-CMS was installed on a real MySQL for the first time on 20.08.2026: 29
migrations, the six seed files, the four Mumbai pilot rooms, 350 real trains,
and the three `bbtro` views granted — **2,823 running staff visible to the crew
lookup and nothing else in that schema**.

One fault surfaced in the first five minutes, and it was a real one.

## The audit log could not record account events

`audit_log.action` is an ENUM, written at stage 1 with seven values, before the
account screens existed. Five of the actions the application records were never
added to it:

    password_change   password_reset   unlock   activate   deactivate

MySQL answers an out-of-range ENUM with *"Data truncated for column 'action'"*.
The audit service catches it and warns — correctly, because an audit write must
never be the reason an operation fails — and the event is lost.

So **the first real password change on the first real database went
unrecorded**. Every one of the five is an account-security event, which is the
category an audit trail exists for above all others.

Migration **029** widens the enum. Appending ENUM values is metadata-only, so it
does not rewrite the table.

**Why nothing caught it.** The demo's stub accepts any string for any column, so
it cannot see an enum range — just as it cannot see a column width or a foreign
key. That is now three classes of fault that only a real database will find, and
the standing lesson is the one this install proved: a stage is not finished
until it has run against MySQL.

---

# PART NINE — WHAT STAGE 23 BUILT

## The muster could not be filed on day one

Found by walking the daily registers on the first live install. Every man on a
contractor's roster arrives in RR-CMS as `pending`, and a pending man cannot be
marked present — correctly, because the tender does not permit an unscreened
person to work in a running room. So on the day a site is switched on, **no
muster can be filed at all**, at any of the four rooms, for 63 people.

But those men are working *today*. The Railway has, in the real world, let them
in. `pending` was an artefact of a three-day-old system, not a finding that
anybody was unscreened.

**Both obvious answers are wrong.** Bulk-approving them would make the record
say the Railway screened 63 men in one afternoon; it did not, and screening is
the control that keeps an unverified man out of a railway kitchen. Refusing
everybody until the six documents arrive is strictly right and means the muster
is not kept for the weeks that takes — and a register nobody keeps proves
nothing.

**23.1 · A fourth status: `provisional`.** Admitted to work *because he was
already working when this system arrived*. May be marked present. Flagged as
**not screened** on every screen he appears on, counted on the staff page, and
filterable as its own worklist, until the Railway works through them.

Nothing is laundered. An inspector reading the register a year later sees
exactly which men were verified and which were let through on the strength of
already being there.

**23.2 · It is deliberately not a screening.** `screened_by` and `screened_on`
stay **empty** — nobody screened anybody. The reason and date go to
`provisional_note` and `provisional_on`, which are different columns because
they are a different claim.

**23.3 · The go-live action.** One button on the staff list, offered to the
Railway only (`staff.screen` — the contractor's supervisor cannot admit his own
men), for one running room at a time, with the reason recorded and every name
written into the audit entry.

**There is still no way to bulk *approve*, and there should not be.** A control
that one click satisfies is not a control. Approval stays one man at a time,
with his six documents in front of the officer.

**23.4 · The reliever rule follows it.** A provisionally admitted man is
working, so he can be named as the man a reliever covered. A `pending` man
cannot — his post was never one he was permitted to work, and "covered" would
paper over exactly that.

## What this says about the walk-through

Three faults in the first hour of driving RR-CMS with real data: the audit log
could not record account events, a dead column invited the next photograph
feature to write to the wrong place, and the muster could not be filed at all on
the day a site opens. None was visible to 476 browser checks, because the demo's
stub accepts any value and its data was already screened.

476 browser checks pass, 13 unit tests, 66 templates clean, 0 broken on both
crawls, and the whole chain — pending refused, admitted provisionally, marked
present, still flagged — verified end to end on real MySQL.


## Stage 23a — the muster now says what happened

Reported from the first real use: *"on save muster no further feedback. again
it can be saved. multiple click."*

The save worked and always had — it is an upsert on
`(running_room, staff, date)`, so pressing it five times leaves one muster. But
the page came back looking exactly as it went, so the bearer had no way to tell
whether anything had been written, and pressing again was the only way to find
out. The view even had two empty placeholder lines where a banner was clearly
once intended and never filled in.

Three messages now, and the third is the one that matters most:

- **On save** — *"The muster has been saved. 4 people marked for 2026-08-21."*
  With, where it applies, how many could not be marked present because the
  Railway has not permitted them to work.
- **On counter-signing** — how many rows were signed, or that there was nothing
  left to sign because it had already been done.
- **On simply opening the page again** — *"This muster is on record — 4 marked,
  last saved 05:04 on 2026-08-21. Saving again simply corrects it; it does not
  add a second muster."*

The third exists because a confirmation the user has navigated away from is no
longer an answer to "is this on record?". The register itself should say so.

482 browser checks, 13 unit tests, 66 templates clean, 0 broken on both crawls.
