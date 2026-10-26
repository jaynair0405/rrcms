# Go-live — crtms.in/rrcms

Written for **your** server, not for a generic one. Ubuntu · nginx 1.24.0 ·
Node 24.14.1 · MySQL 8.0.46 · PM2 (`pm2-railway.service`) · CRTMS on port 3000,
counselling on 5003 · 48 GB disk, 32 GB free.

RR-CMS becomes a **fourth backend behind the reverse proxy you already run**:
its own process on port 3100, its own `rrcms` schema, reached at
`https://crtms.in/rrcms`.

Work down it. Each line is done or it is not.

---

## Part 0 · Before anything — the backup that does not exist

`/etc/cron.d/` holds certbot, e2scrub and sysstat. **There is no database backup
on that server.** bbtro — 153 tables, CRTMS and three applications — is not being
dumped anywhere. This has nothing to do with RR-CMS and it is the largest single
risk on the box.

- [ ] `deploy/mysql-backup.sh` → `/usr/local/sbin/mysql-backup.sh`, root-owned,
      mode 750. It dumps **bbtro and rrcms**, skips a database that does not
      exist yet, checks the size of what it wrote, and only deletes old dumps
      after a run that succeeded.
- [ ] `deploy/cron-mysql-backup` → `/etc/cron.d/mysql-backup`, mode 644.
- [ ] Run it once by hand and read the log before trusting the schedule.
- [ ] **Then get the dumps off this server** — a dump on the same disk as the
      database survives a mistake, not a dead disk. Part 6.
- [ ] `deploy/pull-backups.sh` on the MAC, scheduled by
      `deploy/in.crtms.rrcms-backup-pull.plist` in `~/Library/LaunchAgents`. It
      pulls the dumps AND `/var/lib/rrcms/uploads` — only the metadata of an
      upload is in the dump, so a restore without the files gives a register
      full of records pointing at documents that are not there. It checks that a
      dump arrived, how old it is, and that it unzips, and only prunes after a
      run that passed all three.

Twenty minutes, and it protects four applications that are already live.

## Part 1 · The database

`railway_user` can see only `bbtro`, so you will need a privileged account for
`CREATE DATABASE`. **Find out the MySQL root password before the day, not on it.**

- [ ] Create the schema and its user. `DROP` is deliberately not granted, so
      `npm run db:reset` can never run against production:

```sql
CREATE DATABASE rrcms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rrcms_app'@'localhost' IDENTIFIED BY '<a strong password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON rrcms.* TO 'rrcms_app'@'localhost';
FLUSH PRIVILEGES;
```

- [ ] Prove the isolation, and be able to say you did:

```bash
mysql -u rrcms_app -p -e "SHOW DATABASES;"
```

Expected: `rrcms`, `information_schema` and `performance_schema` — and **nothing
else**. `performance_schema` is granted to every account by MySQL 8 and holds no
application data; an earlier draft of this line said "information_schema only"
and would have made you stop for nothing. **If `bbtro` appears, stop** — that is
the one that matters.

- [ ] *(Later, not blocking)* the three bbtro lookup views and `SELECT` on them —
      `v_rr_crew_lookup`, `v_rr_crew_contact`, `v_rr_train_lookup`. See
      `db/crtms/README.md`. Until they exist the lookups fail soft and every crew
      name and train number is typed by hand. **This does not stop go-live.**

## Part 2 · The application

- [ ] Put it at `/opt/rrcms`, owned by the user PM2 runs as (`railway`).
- [ ] `npm ci --omit=dev`
- [ ] `mkdir -p /var/lib/rrcms/uploads /var/log/rrcms` and give that user write
      access to both.
- [ ] `cp deploy/env.production.example /opt/rrcms/.env`, then `chmod 600` it and
      fill in **every line marked `<-- SET`**:

```
NODE_ENV=production
PORT=3100
APP_BASE_PATH=/rrcms
PUBLIC_BASE_URL=https://crtms.in/rrcms
DB_NAME=rrcms
DB_USER=rrcms_app
DB_PASSWORD=<from Part 1>
SESSION_SECRET=<generated on the server, 32+ chars — see below>
UPLOAD_DIR=/var/lib/rrcms/uploads
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The application **refuses to start** in production without a secret of at least
32 characters. Never copy the development one.

- [ ] `node db/migrate.js up` — every migration applies
- [ ] `node db/migrate.js seed` — the generic tender's reference tables
- [ ] `node db/seed-pilot.js` — the four pilot sites

**AND THEN THE FOUR THAT ARE NOT PART OF ANY SEED.** These were missing from
this list until 07.09.2026 and the production server went up without them, so
IGP ran on the GENERIC tender's figures — 50 penalty clauses instead of the
contract's 32, the divisional meal rate instead of GEMC's, 49 sanctioned posts
instead of 107, and no assets at all. Every one of them is an IGP-only script
because IGP is the only site whose contract has been read in:

- [ ] `node db/seed-igp-contract.js` — the executed contract's OWN reference
      rows: 32 penalty clauses, 25 cleaning rows, 3 meal ceilings, 7 linen
      items, 28 price lines, 6 Part-C assets. Without this the "contract
      governs" rule has nothing to govern with.
- [ ] `node db/seed-igp-establishment.js` — 107 posts across nine cadres, as
      Part-A states them. Three of those cadres (Kitchen Helper, Housekeeping,
      Running Room Bearer) have no bed-band row at all, and five posts the norm
      assumes are stood down to nil because the contract does not buy them.
- [ ] `node db/import-inventory.js` then `--yes` — 34 asset rows, 373 pieces,
      counted at the four buildings. Dry-run first; it says what it would do.
- [ ] `node db/import-call-sheet.js --dry-run` then without — the call sheet
      trains from the control office's loco link. Not needed on day one.

## THE ORDER MATTERS, AND IT BITES ON EVERY UPGRADE

`migrate.js seed` **undoes the pilot merge**: it resets IGP to the register's 44
beds and LNL to 42. It does NOT undo the manpower overrides, the contract-scoped
rows or the assets — those survive. So the rule for every future upgrade is:

```bash
node db/migrate.js up
node db/migrate.js seed
node db/seed-pilot.js        # ALWAYS. seed without this leaves IGP at 44 beds.
```

**When only ONE seed file changed**, name it and skip all of this. A full reseed
to pick up a change to one file is what makes the repair steps above necessary
in the first place:

```bash
node db/migrate.js seed 09    # runs 09_consumable_items.sql and nothing else
```

It matches on any part of the filename, refuses if the name matches none or more
than one, and prints no register summary — after one file that summary would
describe tables the run never touched.

The four scripts above are run ONCE and never again. Re-running seed-pilot
preserves what they wrote — it lifts the overrides out, re-derives the norm
underneath them, and puts them back.

Prove it after any upgrade:

```bash
mysql -u rrcms_app -p rrcms -e "
  SELECT (SELECT total_beds FROM running_rooms WHERE code='RR013') AS igp_beds,
         (SELECT SUM(sanctioned_count) FROM running_room_manpower
           WHERE running_room_id=13 AND effective_to IS NULL) AS sanctioned,
         (SELECT SUM(contract_id IS NOT NULL) FROM deficiency_clauses) AS scoped_clauses,
         (SELECT COUNT(*) FROM assets WHERE running_room_id=13) AS assets"
```

Expected: **131 beds, 107 sanctioned, 32 scoped clauses, 40 assets.**

## Part 3 · Run it under PM2

Matching the house, rather than being the only systemd unit on the box.

- [ ] `pm2 start deploy/ecosystem.config.js` (edit `cwd` if not `/opt/rrcms`)
- [ ] `pm2 save` — **do not skip this.** It writes the process list that
      `pm2-railway.service` resurrects at boot. Without it RR-CMS runs until the
      next reboot and then quietly does not.
- [ ] `pm2 logs rrcms --lines 30` — it names the port, the auth mode, and says
      **nothing about pending migrations**.
- [ ] `curl -I http://127.0.0.1:3100/rrcms/login` — a 200 before nginx is touched.

## Part 4 · nginx

The only change to a live site. Do it when a broken CRTMS would not matter.

- [ ] Paste `deploy/nginx-rrcms-location.conf` into the existing `crtms.in`
      server block, **above** `location / { proxy_pass http://localhost:3000; }`.
- [ ] **`proxy_pass http://127.0.0.1:3100;` — no trailing slash.** The
      `/counselling/` block above it has one, which strips the prefix. RR-CMS
      needs the prefix to arrive. Copy the neighbour and every page 404s.
- [ ] `sudo nginx -t` → `sudo systemctl reload nginx`
- [ ] `https://crtms.in/rrcms` reaches the login page, over TLS, on the existing
      certbot certificate. No new certificate and no DNS change.
- [ ] `https://crtms.in` and `https://crtms.in/counselling/` still work.

## Part 5 · Prove it before anyone is told it exists

- [ ] The read-only walk, as the system administrator:

```bash
node tools/crawl.mjs https://crtms.in/rrcms <sysadmin> <password>
```

Every page, then every link the pages render. A **403 is not a failure** — no
role reaches every screen. Only a 5xx, a 404 or a rendered error page fails.

- [ ] Sign in as an RR in-charge and put another running room's id in the address
      bar. It must be **refused**, not served. If it renders, stop.
- [ ] Open the crew feedback page on a phone, over the real address, and submit
      one. If the camera or the form fails, TLS is not right.

> **`write-check.mjs` writes real records — never point it at production.** Build
> a scratch database and run it there; TESTING.md §4 has the steps. It is worth
> doing once on this server because it runs **MySQL 8** and every check to date
> has been run against MariaDB, which has twice accepted what MySQL refuses.

## Part 6 · The backup, proved rather than assumed

```bash
mysqldump --single-transaction --routines rrcms > /backup/rrcms-$(date +%F).sql
tar czf /backup/rrcms-uploads-$(date +%F).tar.gz -C /var/lib/rrcms uploads
```

- [ ] Both scheduled, writing off this server.
- [ ] **Rehearsed once**, into a scratch database, never the live one:

```bash
node tools/restore-check.mjs /backup/rrcms-YYYY-MM-DD.sql /backup/rrcms-uploads-YYYY-MM-DD.tar.gz
```

Expect `9 passed, 0 failed`. It checks the schema is level with the code, the
registers came back with rows, and that **every document the database refers to
is present in the restored uploads**. Drop the scratch database afterwards.

## Part 7 · The people

- [ ] `node db/create-user.js <name> sysadmin "System Administrator"` — once.
- [ ] **Everyone else through Account → Users, in the browser.** The command line
      leaves the scope columns NULL, and a user with no scope sees nothing at all
      — which looks exactly like a broken install.
- [ ] Nine accounts for the pilot: the sysadmin, the divisional officer, an RR
      in-charge for each of IGP, LNL, ROHA and JNPT, and a contractor's
      supervisor for each contractor. **Prabhakar Enterprises holds two sites**,
      so one supervisor account may cover both.
- [ ] Each person signs in once in front of you and changes the password you
      issued. A password somebody else chose is a password somebody else knows.

## Part 8 · The posters — last, and only last

- [ ] Confirm `PUBLIC_BASE_URL` is `https://crtms.in/rrcms` and that a QR code
      generated from the running application resolves on a phone **on the mobile
      network**, not only on office wifi.
- [ ] Only then print.

Everything else on this page is reversible in an afternoon. Paper on a wall at
four running rooms is not. And until the posters are up, the crew feedback
coverage stays at zero — which means the grading clauses stay unleviable.

---

## What will still be missing on the day, and is not a fault

- The agreements for LNL, ROHA and JNPT. **IGP's is on record** — GeM contract
  GEMC-511687722391404, 10.09.2026 to 09.09.2028.
- The FSSAI licence for each of the four kitchens.
- Joining dates, bank, EPF and ESIC particulars and screening documents for the
  63 people loaded.
- The Supervisor, Call Boy, Security, Gardner and Sweeper rosters.
- JNPT's sanctioned particulars and its contractor.
- The Table B rates, and the executed penalty schedule (`Penalties:1775150840.pdf`
  on GeM — ask for it; our 50 clauses came from the earlier tender paper).

Every one of them shows on screen as *not on record* rather than as a blank or a
guess, and the officer's dashboard prints the list. That is the right state to go
live in. The alternative is a system that looks complete and is not.

---

**IGP's contract begins 10 September 2026.**
