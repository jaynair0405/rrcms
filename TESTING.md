# Testing RR-CMS

Stage 36. Four pilot running rooms — **IGP, LNL, ROHA, JNPT** — on real MySQL,
with IGP's executed contract (GEMC-511687722391404) read in against every
reference table.

This file is for whoever has to satisfy themselves the system does what it claims.
It is written to be worked through in order; each section proves something the next
one assumes.

---

## The three levels of proof, and what each one cannot tell you

| | Needs | Proves | Blind to |
|---|---|---|---|
| `npm test` | nothing | views compile, permissions are held by somebody, audit vocabulary is real, scoping reaches the SQL | anything about your data |
| `npm run demo` | nothing | every screen renders and every flow completes, against a stub | **anything the stub agrees with** |
| a real install | MySQL 8 | the schema, the SQL, the write paths | nothing — this is the one that counts |

The middle row is the one to be careful about. The demo runs the **real** `src/` code
against a fake database, so it catches broken pages and broken logic. It cannot catch a
wrong column name, because the stub is keyed on the statement the route sends — ask it
for a column that does not exist and it will answer you politely. That has now happened
three times, and each time a real MySQL was what refused it. **Do not treat a green demo
as a tested system.**

---

## 1 · No database at all (2 minutes)

```bash
npm install
npm test
```

Expected, in order:

```
✓ 75 templates clean
4 passed, 0 failed        # permissions: declared, granted, and the demo agrees
2 passed, 0 failed        # every audit action is a value the ENUM holds
3 passed, 0 failed        # no route reads a contract-governed table unscoped
13 passed, 0 failed       # login, scoping, 404s, no escaped HTML
✓ same code serves correctly from the root path
```

If any of this fails, stop. It is the code, not your machine.

Three of those checks exist because of faults that reached a live screen:

- **seed-permissions** — nine permissions were once granted inside migrations, which run
  *before* seeds, so on a fresh install the grant matched nothing and nine screens were
  unreachable by every role. No new migration may write to `permissions` now.
- **audit-actions** — four routes wrote an audit action the column could not hold. The
  audit service swallows its own failures by design, so every save succeeded and the
  events simply never reached the trail.
- **root-mount** — RR-CMS has to mount under `/rrcms` inside CRTMS one day, so nothing
  may assume it is served from `/`.

## 2 · The demo (5 minutes, still no database)

```bash
npm run demo          # or: npm run demo:pilot   for the four real sites
```

Open **http://localhost:3100**. Sign in with the role as the username and `demo` as the
password: `sysadmin`, `div_officer`, `rr_incharge`, `contractor_sup`, `hq`.

Worth doing here rather than on real data, because the demo carries three years of
invented history that no pilot site has yet:

- the deficiency register with a year of entries behind it
- the twelve-month wage table with a contractor who pays late **every** month
- the dashboard's agreements panel with periods, expiries and gaps

---

## 3 · The real install

### 3.1 Database

MySQL **8.0+** (MariaDB 10.4+ works). The application user must reach `rrcms` and
nothing else — this matters on a machine that also carries CRTMS or BBTRO.

```sql
CREATE DATABASE rrcms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rrcms_app'@'localhost' IDENTIFIED BY 'pick-a-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON rrcms.* TO 'rrcms_app'@'localhost';
FLUSH PRIVILEGES;
```

Prove the isolation once, and be able to say you did:

```bash
mysql -u rrcms_app -p -e "SHOW DATABASES;"
```

Expected: `rrcms` and `information_schema` **only**. If `bbtro` or `crtms` appear, the
grant is wrong — stop and fix it before going further.

### 3.2 Configure, migrate, seed

```bash
cp .env.example .env      # set DB_PASSWORD and any random SESSION_SECRET
npm run migrate           # 41 migrations
npm run seed              # reference data + the 44 running rooms
```

`npm run seed` is **idempotent** — run it again any time; it adds what is missing and
changes nothing else. Run it after every upgrade that touches `db/seeds/`.

### 3.3 The pilot sites

```bash
npm run seed:pilot
```

This merges the tender register's blocks into operational rooms (Igatpuri's five, Lonavla's
two), attaches the three named contractors and JNPT's placeholder, loads the catering
rosters, and **parks the other forty rooms as `not_in_scope`** — open and working, but not
carried on this system. Bringing a division on later is one UPDATE, not a re-keying job.

It invents nothing. No joining dates, no bank accounts, no EPF or ESIC numbers, no
agreement periods — because the Railway has supplied none. Every agreement number reads
`AGREEMENT-AWAITED/…`, and one search finds them all.

### 3.4 A login

```bash
npm run user -- admin sysadmin "System Administrator"
```

The password is printed once and stored only as a hash.

**Then create every other user through Account → Users, in the browser.** The command line
leaves the scope columns NULL, and a user with no scope sees nothing at all — which looks
exactly like a broken install.

### 3.5 Start

```bash
npm run dev
```

**http://localhost:3100** (the port is `PORT` in `.env`).

### The same screen, local and on the server

| | Base | A screen |
|---|---|---|
| Local | `http://localhost:3100` | `localhost:3100/facility/laundry` |
| crtms.in | `https://crtms.in/rrcms` | `crtms.in/rrcms/facility/laundry` |

**Everything after the base is identical.** The `/rrcms` exists only on the server: it is
`APP_BASE_PATH` in the server's `.env`, and nginx serves the app under that path. Locally
`APP_BASE_PATH` is unset, so the app sits at the root — which is why a local
`localhost:3100/rrcms/...` finds nothing, and why `localhost:3000` is a different
application altogether.

Every URL written anywhere in these notes is the local one. To read it on the server, put
`crtms.in/rrcms` where `localhost:3100` is.

If the database is behind the code, the boot message says so by name and gives the command
to run. Outside production it starts anyway; in production it refuses to start, because
pages that work until somebody reaches the wrong screen are worse than a process that does
not come up. It never applies migrations itself.

---

## 4 · The two tools that walk it for you

### `npm run crawl`

```bash
node tools/crawl.mjs http://localhost:3100 admin <password>
```

Fetches every page, then follows **every link the pages themselves render** — because a
hand-kept page list only ever contains what somebody remembered to add, and the link that
404'd was never on it.

A **403 is not a failure.** No single role reaches every screen; that is the permission
model working. Only a 5xx, a 404, or a rendered error page fails the run. To see the
operational screens, crawl as somebody who holds them.

### `node tools/write-check.mjs`

```bash
node tools/write-check.mjs http://localhost:3100 <officer> <password> <roomId>
```

Reading a page proves the SELECTs and says nothing about the INSERTs, and a real server
differs from the stub most at exactly that point: `STRICT_TRANS_TABLES` rejects an empty
string in a DATE column, a unique key finally gets enforced, an over-long value is an error
rather than a silent truncation. Re-runnable — it asserts end states, not transitions.

The site-level registers belong to the RR in-charge and the contractor's supervisor, not
to the officer — `stay.manage` is theirs — so give it a second login and it walks those
too. Without one it says which checks it skipped; a check that quietly does not run is
worse than no check.

```bash
node tools/write-check.mjs http://localhost:3100 <officer> <pass> <roomId> <incharge> <pass>
```

> **It writes real records** — a wage sheet, an M5 deficiency, an agreement,
> cleaning rounds, a menu week, foodstuff checks, a garden entry, incidents,
> FSSAI licences. **Never point it at a database you care about.** Build a
> scratch copy: create `rrcms_test`, run `DB_NAME=rrcms_test` against
> `db/migrate.js up`, `seed` and `seed-pilot.js`, create two users there and
> scope them through the browser or a direct `UPDATE`, start a second server on
> another port with `PORT=3200 DB_NAME=rrcms_test npm start`, and point the
> check at that. Drop the scratch database when it is green.

**85 checks**, covering food safety, the wage sheet and clause M5, the agreement record,
the cleaning day, the weekly menu, raw-foodstuff quality, garden upkeep, the incident
register with its clause A3 interlock, and the standing obligations — including the one
that matters most at a pilot site: **with no LOA date on record, D3 cannot be raised at
all**, because a penalty must not run from a date nobody has given. Between them
they exercise every write path added from stage 24 onward, and every one of the guards
that only a real server enforces: a unique key finally biting, an agreement that ends
before it begins, a future date, a check with nothing examined, and a supply of plants
with no count.

---

## 5 · What to walk through at a running room

Tick these in the browser, on real data. Each one is here because it has been wrong at
least once.

### Scope — the one that matters most

Sign in as an RR in-charge for one site.

- [ ] The running-room selector on every register offers **his room only**
- [ ] The dashboard shows his figures, not the division's
- [ ] Type another room's URL directly — `/records/cleaning?rr=<other id>` — and it is
      **refused**, not served. If it renders, the scope is only hiding rows in the view
      and is not reaching the SQL, which is the fault worth catching before four rooms go
      live.
- [ ] Any nav link falls back to *his* room, never somebody else's

### Silence is not zero

The distinction the whole system turns on. Check it in three places:

- [ ] **Cleaning** — a round left blank counts as *not written down*, and is reported
      separately from *recorded as not done*
- [ ] **Wages** — a man left blank leaves no row at all; **0** means he was paid nothing,
      which is a finding; and where the muster was never marked the Present column shows a
      **dash**, not a nought
- [ ] **Linen** — an item the supervisor did not count is NULL, not 0

### Verification and reopening

- [ ] Verify a cleaning day → the rounds close to editing
- [ ] **Reopen** it → the confirmation is withdrawn, the rounds are editable again, and
      the withdrawal is in the audit trail
- [ ] Same for a wage month
- [ ] The counter-signed muster is the deliberate exception: final means final

### Clause M5 — wages by the 10th

- [ ] Enter a wage month, one man, and a payment date after the 10th of the following month
- [ ] The M5 card states it in words — days late, men, staff-days — and **computes no
      rupee figure**
- [ ] *Raise clause M5* hands a prefilled deficiency to the register, open, for the officer
      to confirm or discard
- [ ] Pressing it again is refused. Two penalties for one late payment would be the worst
      thing this register could produce.

### The officer's dashboard

- [ ] The agreements panel names each gap — LOA number, LOA date, the period, security
      deposit, performance guarantee — rather than leaving a blank
- [ ] A room no live agreement covers is called out separately
- [ ] A contract with no period reads **period not on record**, not "expired", and shows no
      day count

### The audit trail

After saving anything:

```sql
SELECT user_id, entity_table, action, LEFT(after_json,120), created_at
FROM audit_log ORDER BY id DESC LIMIT 10;
```

- [ ] The save is there, with before and after
- [ ] A withdrawn verification is there as its own event
- [ ] **No `Data truncated for column 'action'` in the server log** — that means an event
      was lost silently

### Mounting inside CRTMS

```bash
APP_BASE_PATH=/rrcms npm run dev
```

- [ ] Everything lives under `/rrcms` and every link, form and stylesheet still works

---

## 6 · What is deliberately not here

Don't raise these as faults.

| Missing | Why |
|---|---|
| Any rupee penalty, anywhere | RR-CMS records facts; the officer raises deficiencies. Rates are shown and multiplied by nothing. |
| Occupancy register, bed allotment, meal accounting | RRMS owns these. See `PENDING.md` on the boundary. |
| Table B rates on the menu card | The tender's cost column is blank. No row means no rate — never zero. |
| Agreement periods, deposits, LOA numbers | Not supplied for any of the four sites. Enter them at **Contractors → the agreement** as they arrive. |
| Joining dates, bank, EPF, ESIC for the rosters | Not supplied. Every man loads `pending` and is shown as such — he is never hidden for it. |

---

## 7 · When something breaks

| | |
|---|---|
| `ER_ACCESS_DENIED` | `.env` password doesn't match the MySQL user |
| `ER_NO_SUCH_TABLE` / `Unknown column` | `npm run migrate` hasn't run, or ran against another database. The boot guard now names this. |
| `ECONNREFUSED` | MySQL isn't running (`brew services start mysql`) |
| A screen the sysadmin cannot open | a permission granted in a migration instead of a seed — run `npm run seed`, then `npm test` |
| Page loads unstyled | cached stylesheet; hard-reload |
| Blank page, no error | read the terminal running `npm run dev` |

`npm run db:reset` starts over cleanly. It drops everything — never point it at anything
you want to keep. In production the application's database user is not granted `DROP`
for exactly this reason.

---

## 8 · Going live

`deploy/GO-LIVE.md` is the one-page checklist for the day: the database user, the
session secret, `PUBLIC_BASE_URL` before any QR poster is printed, TLS, the bbtro
views, the service unit, the two verification runs, a **rehearsed** restore, and
the nine accounts. `INSTALL.md` explains the same ground at length; the checklist
is what gets ticked.

---

## Stage 36 · The contract's own terms

The point of this stage is that a running room reads from **its own contract**
where it has one, and from the general tender paper where it has not. IGP has
one; LNL, ROHA and JNPT do not yet. So every check below is the same check run
twice, at IGP and at LNL, and **the answers should differ**.

### Load it

```bash
node db/migrate.js up
node db/migrate.js seed
node db/seed-pilot.js
node db/seed-igp-establishment.js
node db/seed-igp-contract.js
```

The last one prints what it wrote and, at the end, the questions still open on
the paper. One line to read carefully:

```
    ok  line items total Rs 8,08,52,475.88 — agrees with the contract value
```

The 28 price-schedule lines are entered independently of the contract value on
the face of the document. **If they did not add up, that line would say so.**

### What to look at, and what should differ

| Screen | At IGP | At LNL |
|---|---|---|
| `Contractors → GEMC-511687722391404` | 28 priced lines, grouped by Part, adding to the contract value | — |
| `Running rooms → IGP` | contractor **Prabhakar Enterprises**, valid to 09.09.2028 | Piyush Traders, no period |
| `Records → Meals`, dated **15.09.2026** | ceiling ₹64.74 and ₹58.26, "a ceiling, not a price" | ₹62.37 / ₹69.30 and ₹37.80 / ₹42.00 |
| `Records → Meals`, dated **01.09.2026** | ₹62.37 — *the contract has not started yet* | unchanged |
| `Records → Cleaning` | 25 rounds, including "continuous" and "on need basis" | 23 rounds from the general paper |
| `Inspections → new` | clauses lettered IGP-a … IGP-ee | clauses coded A1 … D6 |
| `Facility → Consumables` | Times of India, Lokmat, Navbharat, India Today | "one popular Hindi newspaper" |

### The one that is easy to miss

**The date boundary.** IGP's contract runs from 10.09.2026. Ask for the meals
page dated 01.09.2026 and the OLD ceilings are correct — the contract had not
started. That is the same rule the deficiency clauses follow: raise an
intoxication case dated 1 September at IGP and it takes generic clause A3 at
Rs 1,000; dated 15 September it takes the contract's clause (b) at Rs 500.

### The guard

```bash
node test/contract-scoped.js
```

Fails the build if any route reads a contract-governed table without scoping it.
That is the fault this whole stage exists to close: four separate tables were
showing the wrong figures for IGP, nothing errored, and the only symptom was an
officer asking four times whether the contract was reflected on the site.

### The schema check

```bash
node tools/schema-check.mjs
```

Needs the real database — it reads `information_schema`, not the migration
files. It reports two things:

- **unique keys covering a nullable column.** MySQL treats two NULLs as
  different values in a unique index, so such a key does not stop a duplicate
  and every `ON DUPLICATE KEY UPDATE` leaning on it silently becomes a plain
  INSERT. That cost `linen_schedule` three duplicate copies of every row between
  stages 34 and 36, with no visible symptom at all.
- **duplicate rows that a unique key should have prevented**, counted directly,
  because a key can be right today while the table still carries yesterday's
  duplicates.

Four keys cover a nullable column deliberately — the "unique when present"
idiom, such as a crew member with no HRMS id, or one current food licence per
room over unbounded history. Each is listed by name with its reason rather than
silently skipped.

Expected: `Schema clean.`

