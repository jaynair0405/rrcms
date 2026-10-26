# RR-CMS — Running Room Contract Management System

Central Railway. Node.js + Express + MySQL.

This repository is **completely independent of CRTMS**: separate application,
separate repository, separate database, separate database user, separate domain.
It never reads from or writes to the `bbtro` or `crtms` databases.

---

## Scope boundary with RRMS

Railways already runs **RRMS** as the official system of record for:

* the **occupancy register** — arrival, bed allotment, checkout
* **meal and subsidy accounting**

**RR-CMS does not duplicate either.** There is no `stays` table, no bed
inventory and no meal transaction table in this schema. The tender is
consistent with that split: it bills Schedule B on RRMS meal records and
requires occupancy to be "maintained on RRMS".

What RR-CMS owns is the **contract and compliance layer**, which RRMS does not
cover: contractor staff and screening, attendance, service quality as rated by
occupants, the joint compliance checklist, inspections, deficiencies, contractor
performance and bill assembly.

RR-CMS has **no access to RRMS data**. The one figure it needs from that side is
the monthly occupant count, which is the denominator for the tender's
minimum-50%-of-occupants feedback floor. That is typed in by the RR In-charge
into `occupancy_monthly`. The `source` column on that table (`manual` /
`rrms_export` / `rrms_api`) means a file import or an API feed can supersede
manual entry later **without a schema change** — so nothing is blocked on
getting RRMS access, and nothing has to be rebuilt if it arrives.

| Concern | RRMS | RR-CMS |
|---|---|---|
| Occupancy register, bed allotment | yes | no |
| Meal booking and subsidy accounting | yes | no |
| Call book timing and acknowledgement | no | yes |
| Linen availability and wash cycle | no | yes |
| Crew feedback and service grading | no | yes |
| Contractor staff, screening, attendance | no | yes |
| Joint checklist, inspections, deficiencies | no | yes |
| Contractor performance and bill deduction | no | yes |

---

## Status

Stage 36. Running on real MySQL against the four pilot sites — **IGP, LNL, ROHA,
JNPT**. `TESTING.md` is the working guide; `AUDIT.md` measures what is built against
the tender; `PENDING.md` carries everything known to be unfinished and why.

| Layer | State |
|---|---|
| Schema (41 migrations) | done |
| Reference seed (roles, designations, Schedule-A norms, 50 clauses, Schedule D) | done |
| Running room register (44 real sites; 4 in the pilot, 40 parked as not in scope) | done |
| Auth, roles, row-level scoping, dashboard, running rooms, contractors, masters | done |
| Contract staff, screening, documents, replacements, grading | done |
| Daily records: muster, call book, meals, linen, cleaning, complaints | done |
| Crew feedback — QR, posters, coverage, the signed physical register | done |
| Daily joint checklist, inspections, deficiency register | done |
| Facility: laundry, consumables, assets, kitchen, pest, foodstuff quality, garden | done |
| Menu — Table A and B, the weekly plan, the printed card and rate board | done |
| FSSAI licences, returns and inspections | done |
| Monthly certification pack; bill assembly and its eleven documents | done |
| The agreement record — LOA, period, deposits, rooms covered | done |
| Wages, EPF, ESIC, bonus, Shramik Kalyan, and clause M5 | done |
| Security and incident register | done |
| The contractor's standing obligations — PC, biometric, bond, extinguishers, plates | done |
| Occupancy register, bed allotment, meal accounting | never — RRMS owns these |
| Penalty computation and bill deduction | deferred until the schedule is finalised |

**Nothing in this build computes a penalty amount.** Deficiencies, gradings and late
wages are captured as facts; rates are shown and multiplied by nothing. The arithmetic
is a later, separate decision, and a deliberate one.

### The staff lifecycle, and who does what

| Act | Who | Permission |
|---|---|---|
| Add a worker to the register | the contractor's supervisor, or the RR In-charge | `staff.edit` |
| Upload their documents | the contractor's supervisor, or the RR In-charge | `staff.edit` |
| Screen — approve or reject | the divisional officer | `staff.screen` |
| Mark present on the muster | the contractor's supervisor | `muster.mark` |
| Counter-sign the muster | the RR In-charge | `muster.countersign` |
| Mark a worker as left | the contractor's supervisor | `staff.edit` |
| Permit a replacement | the divisional officer | `staff.screen` |

Entry is shared between the contractor's supervisor and the RR In-charge, so a
site does not stall because the contractor's man cannot get to a computer. The
decisions are not shared: **screening and permission belong to the divisional
officer alone**, so a running room cannot clear its own people. A new person is
created as **pending** and cannot be marked present until screening is approved.
The divisional officer screens and permits but does not enter staff — opening
the add form as that role returns 403.

Marking someone as left always writes a `staff_replacements` row, whether or not
a successor is named, because the tender treats a change of person as a contract
event: a replacement made without the Railway's permission is itself a
deficiency. The permission is a separate act by an officer, recorded against
that row with who gave it and when. Someone who has left drops out of the
register, the muster, the on-roll count and future certificates, but stays
findable under the "Left" filter — signed documents from earlier months refer
to them.

### Staff documents and identity

Every staff document row can carry the scan behind it — police verification,
medical fitness, photo ID, bank/EPF/ESIC proofs, qualification certificate and
the passport photograph that goes on the identity card. Files are stored outside
the web root, the type is verified from the file's own bytes rather than its
name or declared MIME, and a scan is reachable only through the staff member it
belongs to, by someone who may see that running room. JPEG, PNG, WebP, HEIC and
PDF are accepted, up to 8 MB.

The readiness checklist distinguishes **recorded** from **scanned**: a reference
number typed into a form records that a document was produced; the scan is what
proves it.

**Open with the officials — Aadhaar.** This build records *which* identity
document was produced (`photo_id`) and its reference, and can hold a scan. It
has no Aadhaar-specific field, and no decision has been taken on whether Aadhaar
numbers or copies may be stored at all. Storage of Aadhaar is legally
constrained in India, so the question should be settled — and minuted — before
any Aadhaar data is put into the system. Nothing in the schema has to change if
the answer is that it may not be.

### Why bill assembly is not built

A monthly bill needs three things this application does not have:

1. **Contract rates** — commercial data, not yet collected.
2. **The Schedule-B meal quantity** — RRMS maintains meal and subsidy accounting,
   and RR-CMS has no access to it.
3. **The penalty deduction** — the schedule is still under review.

Stage 8 therefore builds the **monthly certification pack** instead: the sheet
the RR In-charge signs and the divisional officer counter-signs, stating what
was actually delivered — manpower and attendance, occupant ratings against the
50% floor, deficiencies, inspections and the facility obligations. It travels
with the contractor's bill. When the three missing pieces arrive, the bill
screen sits on top of it without any of this being rebuilt.

The figures on a certificate are **frozen** into `monthly_certificates` when it
is generated, not recomputed on each view. A deficiency closed next week must
not silently change a document an officer has already signed; regenerating is
only possible while the pack is still a draft.

### Charts

Charts are rendered to SVG on the server (`src/lib/charts.js`) rather than drawn
by a JavaScript library in the browser. That keeps the deployment to the same
Node + Nginx pattern as CRTMS with no build step, no CDN dependency on a network
that may not reach one, and pages that print correctly. Every chart on a page is
accompanied by the same figures as a table, so no value is reachable only by
looking at a picture.

---

## Setup

### Run it

```bash
npm install
npm test                  # 13 checks, no database needed
node db/create-user.js admin sysadmin "System Administrator"
npm run dev               # http://localhost:3100
```

### First-time database setup

```bash
# 1. Database and a user scoped to this schema only.
mysql -u root -p <<'SQL'
CREATE DATABASE rrcms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rrcms_app'@'localhost' IDENTIFIED BY 'change-me';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON rrcms.* TO 'rrcms_app'@'localhost';
FLUSH PRIVILEGES;
SQL

# 2. Configure
cp .env.example .env      # fill in DB_PASSWORD

# 3. Install and build the database
npm install
npm run migrate           # apply all migrations
npm run seed              # reference data + the 44 real running rooms
npm run seed:dummy        # generate sample contractors, staff, stays, feedback
```

`npm run db:reset` drops everything and rebuilds from scratch. It refuses to run
when `NODE_ENV=production`.

The grant above deliberately withholds `DROP`. Add it temporarily if you need
`db:reset`, then take it away again.

---

## What is real and what is generated

| Real | Generated |
|---|---|
| 44 running rooms with outsourced housekeeping | contractors (Contractor A–P) |
| Bed counts, physical rooms, category A/B/C | contracts and agreement numbers |
| Controlling department (Electrical / Mechanical) | contract staff and crew |
| Meal facility flag, AC status | feedback and ratings |
| Female-reserved rooms | call book and linen records |
| Crews per day, peak concurrent occupancy | call book, linen, inspections, deficiencies |
| Schedule-A manpower matrix, 50 deficiency clauses | monthly occupancy figures |

The running room register comes from the TRO dashboard extract. Everything else
is synthetic and deterministic — the same seed always produces the same dataset,
so a bug is reproducible and two developers see identical numbers.

```bash
node db/seed-dummy.js --seed 7 --wipe    # a different but repeatable dataset
```

---

## Schema at a glance

The running room is the hub. There is no stay record — that belongs to RRMS —
so every service and quality record attaches directly to the running room and
carries its own date.

```
divisions ──< running_rooms
                   │
                   ├──< contract_running_rooms >── contracts ──< contractors
                   ├──< running_room_manpower  >── designations >── manpower_norms
                   ├──< staff ──< staff_documents, staff_issues, staff_ratings
                   │      └──< attendance_daily ──> deployment_daily
                   │
                   ├──< occupancy_monthly        (typed in; RRMS is the source)
                   ├──< call_book                (timing drives clause C5)
                   ├──< linen_daily              (availability and wash cycle)
                   ├──< complaints
                   ├──< feedback ──< feedback_photos
                   │        └──> feedback_coverage, monthly_grading
                   │
                   ├──< inspections ──< inspection_items >── deficiency_clauses
                   ├──< deficiencies ──────────────────────> deficiency_clauses
                   └──< bills ──< bill_documents
```

`crew` exists but is not imported from anywhere — a row appears the first time
someone identifies themselves at a QR feedback form or is named on a call book
entry.

---

## Two rules the tender implies but does not tabulate

Both live in `db/seeds/04_manpower_derivation.sql`, as SQL rather than
application code, so the arithmetic stays visible to anyone who has to defend
the sanctioned figure.

**1. No meal facility means no kitchen crew.** 11 of the 44 sites serve no
subsidised meals. Head Cook, Cooks, Assistant Cooks, Bearers and Utensil
Washers are sanctioned at zero there, and the meals module and food grading
head do not apply.

**2. Schedule-A starts at 50 beds; 27 sites are smaller.** Down to 15 beds.
Applying the band as written would sanction 22 staff for a 15-bed room, so the
band-50 row is scaled pro-rata with a floor per role. The tender permits this:
*"Above numbers are indicative. Numbers of workers may increase/decrease
depending upon the local conditions of running room."*

Supervisor and Call Boy carry a floor of **3**, not 1 — the tender sanctions 3
even at the smallest band because they are round-the-clock posts, one per shift.
Scaling them to 1 would leave a running room uncovered at night.

`running_room_manpower.is_scaled` and `is_overridden` record which rule applied
and let a divisional officer depart from it with a written reason.

---

## Penalties are deferred

By decision, this build **captures deficiencies but computes no money**.

- `deficiency_clauses` holds all 50 clauses with their rates as reference data.
  Nothing reads those rates.
- `deficiencies` records what happened, against which clause, with what
  quantity and evidence.
- `monthly_grading` stores the monthly average per grading head *and* the banded
  R value the tender defines, so the input to the formula is already there.
- `feedback_coverage` tracks the minimum-50%-of-occupants floor, below which the
  grading penalty is not leviable at all.
- `bills.deduction_amount` exists and is always `0`.

When the penalty schedule under review is finalised, a single new migration adds
the computation and reads the rows already captured. **No back-entry, and month
one of live penalties has real history behind it.**

---

## Migrations

Applied migrations are never edited — a change is always a new numbered file.
The runner stores a checksum and refuses to proceed if a file it has already
applied has been modified.

```bash
npm run migrate:status
```

Schema will keep changing while real data is still being collected. That is
expected and cheap: add a file, run `npm run migrate`. It only becomes
expensive after go-live, which is a long way off.

---

## Open questions for the officials

1. **CSMT staffing.** 198 beds across 48 rooms, no meal facility, so
   Schedule-A leaves 19 staff — 5 sweepers and 6 call boys for 198 beds. The
   matrix appears to bundle housekeeping counts on the assumption of a meal
   operation. A no-meal site of that size probably needs a separate norm.
4. **The RRMS occupancy figure.** Until someone types it in each month, the
   50% feedback floor cannot be evaluated and the grading penalty cannot be
   levied. Worth deciding early whose job that is — and whether an RRMS export
   can be obtained later to remove the manual step.
2. **Peak over capacity.** Thane shows 34 concurrent against 32 beds, Roha 80
   against 64. Worth confirming independently of this system.
3. **Penalty approval workflow.** Assumed: proposed → contractor reply (7 days)
   → accepted or waived by Sr. DEE (TRO) → deducted from the bill. Needs
   confirmation before the penalty module is built.


---

## Mounting inside CRTMS

Nothing here calls `app.listen`, sets an application-level view engine, or
assumes it is served from the root path. Those are the three things that
usually make a module impossible to mount later, so all three are avoided
from the first commit.

```js
// in CRTMS
const createApp = require('rrcms/src/app');
app.use('/rrcms', createApp({ pool: crtmsPool }));   // or omit pool for its own
```

Four decisions make that work, and `npm test` verifies each of them:

| Decision | Where |
|---|---|
| Mountable router, never an app that owns the server | `src/app.js` |
| Auth behind an adapter — `local` today, `delegated` later | `src/auth/` |
| Base path from `APP_BASE_PATH`; every link and asset URL built from it | `src/render.js` |
| Database pool injectable rather than created at module load | `src/db.js` |

The test suite mounts the application at `/rrcms` with an injected stub pool —
the same path CRTMS would use — and asserts that redirects, form actions,
asset URLs and navigation links all carry the mount prefix. A second test
serves the identical code from `/` and asserts the same links resolve there.

**Switching to CRTMS's login later** means setting `AUTH_MODE=delegated` and
filling in one function in `src/auth/delegated.js` that reads the host's
session. No route changes: every route asks `getCurrentUser(req)` and does not
care where the identity came from. A mapping table carries the link between a
CRTMS user and an RR-CMS role, so neither system has to understand the other's
role model.

**Keep the schema separate even when mounted.** RR-CMS has `users`, `staff`,
`files`, `contracts`, `roles` and `sessions` — CRTMS almost certainly has some
of those names too. Same application and same login is easy; same *database* means
prefixing every table and gives up the isolation argument already made to
officials. Mounting the router while keeping the `rrcms` schema separate gets
the benefit without the cost.

---

## Roles and what they can do

Six roles, with permissions as data in `role_permissions` rather than
hardcoded, and row-level scoping enforced **in SQL** rather than in the view —
so a forgotten filter cannot leak rows.

| Role | Scope | Sees |
|---|---|---|
| HQ / PCEE Office | All CR | Everything, read-only |
| Sr. DEE (TRO) / DME (O&C) | Own division | Division's running rooms; approves and passes bills |
| RR In-charge / CLI | Own running room | That running room only |
| Contractor Supervisor | Own contractor | Only running rooms under a live contract |
| Running Staff (crew) | Self | Feedback submission only — no registers |
| System Administrator | All CR | Master data, roles, schedule versions |
