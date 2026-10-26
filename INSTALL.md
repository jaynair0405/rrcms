# RR-CMS — installation on a server

> **On the day itself, work from `deploy/GO-LIVE.md`.** It is the same ground as
> this file reduced to one page of things that are either done or not done. This
> file explains; that one is ticked.

Every command below was run against a real MariaDB 10.11 server before this
file was written. The output shown is the output it actually produced. Where
something bit, it is called out rather than smoothed over.

The application needs three things: Node.js 20 or later, a MySQL-compatible
database, and a directory it may write uploaded files into. Nothing else.

---

## 1. What the database server must be

MySQL 8.0 or MariaDB 10.6+. Both work. Two differences are worth knowing
before you start, because both have already caused a failure here:

**MariaDB reserves table names of the form `seq_<from>_to_<to>`.** Its Sequence
storage engine fabricates a virtual table of that name in every database, so
`CREATE TABLE seq_1_to_300` fails with *"table already exists"* while
`SHOW TABLES` lists nothing at all. Migration `000_helpers.sql` therefore
names its numbers table `number_series`. Do not rename it back.

**MySQL 8 enables `ONLY_FULL_GROUP_BY` by default; MariaDB does not.** The
application is written to satisfy the stricter of the two, and the verification
run was carried out with MySQL 8's default mode set explicitly on MariaDB. You
do not need to change `sql_mode` on your server — but if yours is unusually
permissive, that is not a licence for the application to rely on it.

---

## 2. Create the database and its user

The application's user must reach the `rrcms` schema and nothing else. On a
server that also carries CRTMS or BBTRO, this is the boundary that stops a
mistake here becoming a mistake there.

```sql
CREATE DATABASE rrcms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'rrcms_app'@'127.0.0.1' IDENTIFIED BY '<a strong password>';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON rrcms.* TO 'rrcms_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

`CREATE`, `ALTER`, `INDEX` and `REFERENCES` are needed because the application
runs its own migrations. If your policy forbids DDL rights to an application
user, run `node db/migrate.js up` as an administrator once per release and
grant only `SELECT, INSERT, UPDATE, DELETE` for day-to-day running.

`DROP` is deliberately **not** granted. Nothing in the application drops a
table, and withholding it means nothing ever can.

---

## 3. Configure

```bash
cp .env.example .env
```

Then edit `.env`:

```
NODE_ENV=production
PORT=3100

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=rrcms
DB_USER=rrcms_app
DB_PASSWORD=<the password from step 2>

SESSION_SECRET=<32+ random characters — the app refuses to start without it>
UPLOAD_DIR=/var/lib/rrcms/uploads
```

Generate the session secret rather than inventing one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Create the upload directory and give the service account write access to it.
Only file *metadata* goes in the database; the files themselves live here, and
this directory must be included in your backup.

```bash
mkdir -p /var/lib/rrcms/uploads
chown rrcms:rrcms /var/lib/rrcms/uploads
chmod 750 /var/lib/rrcms/uploads
```

---

## 4. Install and build the schema

```bash
npm ci --omit=dev
node db/migrate.js status      # shows 25 pending
node db/migrate.js up
node db/migrate.js seed
```

Expected output from `up`:

```
  applying 000_helpers.sql ... ok
  applying 001_platform.sql ... ok
  ... 25 in all ...

  25 migration(s) applied.
```

And from `seed`:

```
  44 running rooms carrying 2675 beds
  528 sanctioned manpower rows, 50 deficiency clauses, 42 food safety checks.
```

Both commands are safe to re-run. Migrations are recorded in
`schema_migrations` with a checksum, so an applied migration that has been
edited is refused rather than silently re-applied — if you see
*"has changed since it was applied"*, someone edited a released migration and
the fix is a new migration, never a correction to the old one.

The seeds are written with `ON DUPLICATE KEY UPDATE` throughout and may be run
after every upgrade to pick up new reference data.

A single seed file can be named, which is the safe way to apply a change to one
of them: `node db/migrate.js seed 09` runs `09_consumable_items.sql` alone. A
full `seed` re-runs `03_running_rooms.sql`, which rewrites the register from the
generic tender figures and puts IGP back to its unmerged 44 beds — see the order
warning in `deploy/GO-LIVE.md`.

### Loading the pilot instead of the sample data

```bash
node db/seed-pilot.js --only
```

Clears the generated sample dataset and loads the four pilot sites — IGP,
LNL, ROHA and JNPT — with the rosters the Railway supplied. It is safe to
re-run; staff are matched on running room, name and post, so a second run
corrects rather than duplicates. Drop `--only` to load the pilot alongside
whatever is already there.

The rosters live in `data/pilot/staff.json` and are meant to be edited: add a
site's list there and re-run rather than typing 31 people into a form.

**What the seeds contain, and what they do not.** They carry the real register
of 44 running rooms from the tender — names, divisions, beds, categories,
meal facility, female accommodation — plus the Schedule A designations, the
banded manpower norms, the 50 deficiency clauses and the 42 food safety checks.
They contain no contractor, no member of staff and no licence. Those are
yours to enter.

### Wiring the crew and train lookups to CRTMS (optional, one step per division)

The call book can offer a crew member's name and the train he was called for
back, instead of having both typed at four in the morning, by reading the two
masters CRTMS already keeps — `bbtro.div_staff_master` and `bbtro.div_trains`
for Mumbai.

RR-CMS is **not** given those tables. It reads three narrow views over them,
carrying a name, a CMS number, a designation and a headquarters; a telephone
number, separately; and a train number with its name and the stations it runs
between. Nothing else.
The master also holds Aadhaar and PAN numbers, caste, dates of birth and home
addresses; none of that may reach a running room, and putting the boundary in
the grant rather than in application code is what makes that true no matter
what a later stage of this software does.

```bash
mysql -u root -p < db/crtms/v_rr_crew_lookup.sql     # run on the CRTMS server
```

then grant, and tell RR-CMS which schema belongs to which division:

```sql
GRANT SELECT ON bbtro.v_rr_crew_lookup  TO 'rrcms_app'@'127.0.0.1';
GRANT SELECT ON bbtro.v_rr_crew_contact TO 'rrcms_app'@'127.0.0.1';
GRANT SELECT ON bbtro.v_rr_train_lookup TO 'rrcms_app'@'127.0.0.1';
FLUSH PRIVILEGES;

UPDATE rrcms.divisions SET crtms_schema = 'bbtro' WHERE code = 'BB';
```

Full reasoning, and what is deliberately left out, in `db/crtms/README.md`.

**Skipping this is a supported configuration.** A division with no
`crtms_schema` simply has every crew name typed, which is what happens today
and is correct for a division not yet on CRTMS. Nothing fails and no screen
complains.

---

## 5. Create the first users

Make one administrator from the command line. Everybody else is then created
from a screen inside the application.

```bash
node db/create-user.js admin sysadmin "System Administrator"
```

It prints a password. Sign in with it once — the application will refuse every
other screen until you have chosen your own, because a password an
administrator issued is a password two people know.

Then **Configuration → Users**. Create each RR In-charge, the divisional
officer, and a supervisor for each contractor. The form asks for a role and, for
the roles that need one, a division, a running room or a contractor:

| Role | Scoped by |
|---|---|
| HQ / PCEE office | nothing — sees every division, changes nothing |
| Sr. DEE (TRO) / DME | one division |
| RR In-charge / CLI | one running room |
| Contractor Supervisor | one contractor |
| System Administrator | nothing |

**The scope is not a formality.** A role that ought to be scoped and is not does
not see nothing — what it sees depends on how each individual query happens to
be written, which is how the wrong person ends up reading the wrong running room
for a month before anybody notices. The form refuses to create such an account,
and the Users screen marks any that already exist in red.

Each account gets a password shown once, on screen. Write it down and hand it
over; it is not stored anywhere readable and cannot be shown again. If it is
lost, **New password** on that row issues another.

## 6. Run it

```bash
node src/server.js
```

**On crtms.in, use PM2.** That server already runs everything under
`pm2-railway.service`, and being the only systemd unit on a PM2 box is how a
server becomes unmaintainable. `deploy/ecosystem.config.js` is the process
definition; `deploy/nginx-rrcms-location.conf` is the block that goes into the
existing `crtms.in` server; `deploy/GO-LIVE.md` is the day's checklist written
for that machine specifically. The rest of this section is for standing RR-CMS up
somewhere else.

Under systemd, **`deploy/rrcms.service`** is a working unit — copy it, reload,
enable. It runs the application as a `rrcms` user with the filesystem read-only
apart from the uploads directory, and it deliberately does **not** restart
forever: in production the application refuses to start when the database is
behind the code, and a unit that restarts a process which is correctly refusing
turns a clear message in the journal into a loop nobody reads.

**`deploy/nginx-rrcms.conf`** is a working TLS front end. The application does
not terminate TLS and must not be exposed directly. TLS is not optional here:
browsers refuse camera access over plain http, so screening photographs, the
daily joint checklist photographs and the signed feedback page all stop working
the day this is reached over `http://`.

**`deploy/env.production.example`** is the production `.env`, with every line
that must be changed marked. Nothing in it may be copied from a development
machine.

If RR-CMS is to live inside CRTMS rather than stand alone, it mounts as a
router — see the top of `src/app.js`. Set `APP_BASE_PATH` to the mount point
so that every generated link and QR code carries the prefix.

---

## 7. Prove the installation

Two scripts ship for exactly this, and both were used to verify the build:

```bash
node tools/crawl.mjs https://<host> <sysadmin> <password>
```

`crawl.mjs` fetches every page and then **follows every link the pages
themselves render** — a hand-kept page list only ever contains what somebody
remembered to add, and the link that once 404'd was never on it. A 403 against
`/staff/new` or `/inspections/new` for a system administrator is **correct**:
that role reads and configures, it does not enter operational records. Only a
5xx, a 404, or a rendered error page fails the run. Expect roughly
**310 clean, 0 broken**, with a handful outside that role.

```bash
node tools/write-check.mjs https://<host> <officer> <pass> <roomId> <incharge> <pass>
```

`write-check.mjs` exercises the **write** paths, which is where a real server
differs from anything else: STRICT_TRANS_TABLES rejects an empty string in a
DATE column, a unique key finally bites, an over-long value is an error rather
than a silent truncation. 68 checks covering food safety, the wage sheet and
clause M5, the agreement record, cleaning, the weekly menu, foodstuff quality,
garden upkeep, the incident register with its clause A3 interlock, and the
standing obligations. The site-level registers belong to the RR in-charge and
the contractor's supervisor, so it takes a second login; without one it names
the checks it skipped. Expect **68 passed, 0 failed**.

> **It writes real records.** Never point it at the live database. Build a
> scratch copy and run it there — TESTING.md §4 has the steps.

---

## 8. Backing up

Two things, and they must be taken together or a restore will produce records
pointing at documents that are not there:

```bash
mysqldump --single-transaction --routines rrcms > rrcms-$(date +%F).sql
tar czf rrcms-uploads-$(date +%F).tar.gz -C /var/lib/rrcms uploads
```

Restore is the reverse into an empty database. Do not restore a dump over a
running application.

**And rehearse it.** A backup nobody has restored is a hope, not a backup:

```bash
node tools/restore-check.mjs rrcms-YYYY-MM-DD.sql rrcms-uploads-YYYY-MM-DD.tar.gz
```

It restores into a **scratch** database — never the live one — and checks the
schema is level with the code, that the registers came back with rows, and that
**every document the database refers to is present in the restored uploads**.
That last check is the reason it exists: the dump and the uploads are two
separate artefacts, and a restore of one without the other looks perfectly
healthy until an officer clicks a scanned licence and gets nothing. Expect
`9 passed, 0 failed`; drop the scratch database afterwards.

---

## 9. Upgrading

```bash
git pull            # or unpack the new release beside the old one
npm ci --omit=dev
node db/migrate.js up
node db/migrate.js seed
systemctl restart rrcms
```

New migrations apply; applied ones are left alone. Take a backup first —
migrations are not written to be reversed, because a reversal that has never
been tested is a false promise.
