# Open items

Everything known to be unfinished, in one place: work deferred with its reason,
decisions the Railway has to take, data still owed, and constraints that are
true but are not faults. Nothing here is a defect — defects get fixed as they
are found, not listed.

**Nothing on this list blocks the four Mumbai rooms going live.** It is all work
that comes after, or data that makes existing records complete.

Last reviewed at stage 28, on 26.08.2026 (029–036 added on first live use).

---

## Four screens are still zoomed out on a phone

Found 10.09.2026 after the officer tested the photograph boxes on his Android
and reported that the camera would not open. Fixing that led to measuring the
app on a Pixel 7 (412px), where **every screen** reported a layout viewport of
463 to 561px. Chrome widens the viewport when content will not fit and then
shrinks the whole page — which is why the app looked large and cramped at the
same time, and why nobody had reported it as "broken".

**Twelve of sixteen now fit**, from none. What was actually wrong, in order of
how much it cost:

- `.topbar` had `flex-wrap: nowrap` and needed 474px in 348px. The user chip
  alone wanted 298 — full name, role, Password, Sign out.
- `table.tbl th` is `white-space: nowrap`. Chrome sizes the mobile viewport from
  the INTRINSIC width of the content, so the cleaning register's minimum was the
  sum of its eight headings, 829px, even though `.tblwrap` was holding the table
  at 290px and scrolling it perfectly. **The table never overflowed; its
  unbreakable headings did.**
- `.card-h` could not wrap its subtitle, and `.st` chips carry sentences.

**Still wide, and by how much:** `wages` 718px, `obligations` 520px,
`consumables` 449px, `linen` 424px. `contain: inline-size` on the scroll
containers did not move them, so on these four the width comes from content
OUTSIDE a table.

**The method that found it**, for whoever picks this up: emulate a phone, read
`window.innerWidth` — anything above 412 means the page was zoomed out. Then
clone each top-level block of `.content` into an off-screen `width: min-content`
box and measure it; the widest one is the culprit. Measuring rendered widths is
useless, because the browser has already widened the viewport so that nothing
overflows it.

Not urgent while the work is done at a desk. It becomes urgent as photographs
become the normal way of recording a defect, because a photograph is taken on a
phone and the register is filled on whatever is in the man's hand.

## A cleaning row bundles several areas, and they cannot all be done in a day

Asked for by the officer on 10.09.2026: split the cleaning items into their own
rows, *"especially for weekly items. because all items can not be done in a day.
so they may prefer verandha on monday, corridor on wednesday etc."*

**The case that proves it is IGP-C09**, a single weekly row reading: *"Cleaning of
electrical fittings — fans and regulators, tube lights, switch boards and
switches, night lamps, exhaust fans, geysers, electric chimneys, hot boxes and
fly catcher"*. Nine kinds of thing, across four buildings, on one weekly tick.
IGP-C17 bundles three (wire mesh, grills, pelmets); IGP-C01 bundles rooms,
verandah, staircase and other covered area.

`cleaning_weekly_day` already pins a weekly row to a chosen weekday — but ONE
weekday for the whole row. So the register today asks whether all nine were done
on Tuesday. Nobody does all nine on Tuesday, so the row gets ticked anyway or
left blank, and either way it stops describing anything real.

**THE DESIGN TRAP, and it is the whole difficulty.** The obvious move is to
split C09 into nine rows. That would put rows in `cleaning_schedule` that the
contract does not contain — and every other table in this system follows the
rule that a running room's contract rows ARE the answer for that room. Nine
invented rows against one contractual obligation would break that, and the
first time a deficiency is raised against "IGP-C09-3 tube lights" the contractor
will ask which clause that is.

**The shape that does not break it:** the contract row stays as the obligation
and the clause. Under it sits a WORKING BREAKDOWN — parts named by the Railway,
each with its own weekday — and the round is recorded per part. The contract row
is met when its parts are; a deficiency is still raised against C09, because C09
is what the contract says. The breakdown is the Railway's way of organising the
work, not a re-writing of the schedule.

**Open before building:**

- Who names the parts — the officer, per running room, or one list for all 44?
- Does a missed part make the whole row not done, or is the row judged on the
  parts due that week?
- Do the parts carry over to ROHA and LNL, whose contracts may bundle
  differently?

Not urgent. IGP is running on the register as it stands. It becomes urgent the
first time a weekly item is disputed, because "was C09 done" has no answer today
that anybody could defend.

## The laundry has no vendor on record, and clause C1 reads breached until it does

Raised by the officer on 10.09.2026: *"we dont have any option to add a laundry
vendor now (or do we have it?)"*.

**The option exists.** `Master data → Vendors` carries an add form, and a vendor
is created UNAPPROVED — approval is a separate, dated act, so it cannot happen as
a side effect of typing a name. `db/seeds` ships none, and production holds
**zero vendors**.

**Who can use it is the part that bites.** `vendor.approve` is held by the
**divisional officer** and sysadmin only. The RR In-charge cannot enter the
laundry his own running room uses; the contractor's supervisor certainly cannot.
Defensible — the Railway approves a washing centre, not the site — but it means
nothing can be recorded until the divisional officer does it.

**What that costs today.** Clause C1 penalises washing at a non-approved source.
With no vendor on record, every dispatch at IGP is counted a breach, and the
laundry page has been saying so since go-live. The figure is not wrong — nothing
IS approved — but it is a breach of the Railway's own record-keeping, not of the
contractor's obligation, and the screen cannot tell the two apart.

**To do, in this order:**

1. The divisional officer enters IGP's washing centre and approves it. One form,
   two minutes, and it clears a standing breach.
2. Then decide whether the RR In-charge should be able to ENTER a vendor while
   approval stays with the officer. Entering is a statement of fact about which
   laundry is used; approving is a Railway decision. They are different acts and
   today one permission covers both.
3. Related and already on the list: whether approval is per running room or per
   vendor. `vendors.is_approved` is one flag, so a laundry approved for IGP is
   approved everywhere — and the officer has said (07.09.2026) it should be
   *"separate for each running room. IGP has one Roha has Another."*

## Standing list, parked 10.09.2026 — to be taken in this order

Named by the officer after go-live: *"mark these 6 down. we will come to it."*

1. **The off-site backup pull is broken.** Failing since 08.09.2026 with
   `Permission denied (publickey,password)` — the scheduled job on the Mac fires
   on time and cannot authenticate. **No RR-CMS dump has ever reached the Mac**:
   the last successful pull was 07.09, and RR-CMS's first server dump was 08.09,
   so the break falls exactly in that window. One copy was taken by hand on
   09.09. The server's own nightly dumps are sound. Diagnose with
   `ssh -o BatchMode=yes -o PreferredAuthentications=publickey railway@… 'echo KEY_WORKS'`,
   which asks the same question the scheduler asks.
2. **Restore rehearsal** — `tools/restore-check.mjs`, against a dump that is by
   then off-site. It restores into a scratch database and checks that every file
   the restored records point at is present in the restored uploads.

   **Fix the tool while doing it.** Its header says *"It drops nothing and
   touches no live data"*, which sounds careful and means it LEAVES A FULL COPY
   of the database on disk after every run. That is exactly what left
   `bbtro_restore_test` — 2.29 GB — sitting on crtms.in from the restore attempts
   of 07.09.2026, found on 10.09.2026 while looking for what had eaten 5.5 GB.
   RR-CMS's own database is 10 MB today, so the same behaviour would go unnoticed
   for a year. The rule should be: keep the scratch database when the check
   FAILS, so somebody can look at what went wrong; drop it when it passes.
3. **MySQL binary logs on crtms.in.** Enabled, retention **30 days**. The
   07.09.2026 bbtro restore wrote every row of a 2.5 GB database into them:
   tables total 4.8 GB while `/var/lib/mysql` is 9 GB, so roughly 4 GB is binlog.

   Shortening the retention frees several GB — but binlogs are what allow
   recovery to a point BETWEEN nightly dumps, so it is a trade, not a cleanup. A
   week keeps that ability for the window that matters and returns about 3 GB.
   It is a server-wide setting and affects bbtro as well as RR-CMS, so it is the
   officer's call rather than a change to make quietly.

   Disk on crtms.in as of 10.09.2026: 48 GB total, 23 GB used, 25 GB free.
   `/var/lib/mysql` 9 GB, `/var/backups/mysql` 1.9 GB across 20 dumps (the
   14-day retention working as intended — NOT a runaway, an earlier guess of
   mine that the numbers disproved), `/var/log` 373 MB, `/opt/rrcms` 15 MB.

4. **The truncated bbtro dump**, and the script change behind it. `mysql-backup.sh`
   writes straight to the final filename, so a killed run leaves something that
   looks exactly like a backup — a 42 MB file sits beside the good 176 MB one.
   Write to `.part` and rename on success.
5. **The two blocking contract questions**, both in `contract-questions.docx`:
   the Performance Guarantee stated at 5% (clause 2.2, page 20) and 3% (clause
   2.5, page 21) — Rs 16.17 lakh apart — and the missing LOA date, which leaves
   clauses D3 and D4 with no due date and unraisable.
6. **The HQ help page** — the last of four. Needs the officer's account of HQ's
   own day, the same five questions the other three were built from.
7. ~~**A git repository, replacing scp.**~~ **Done 26.10.2026.** The code is at
   `github.com:jaynair0405/rrcms` (its own repo, not the shared `bbtro` one) and
   `/opt/rrcms` is a clone of it, started at stage 99b. A deploy is now
   `cd /opt/rrcms && git pull && pm2 restart rrcms`, with
   `npm ci --omit=dev` before the restart when `package-lock.json` changed.

## Named after testing stages 99 and 99b — 10.09.2026

Taken in this order unless the officer says otherwise.

1. **The vendor page must reach the RR in-charge.** Settled by the officer:
   *"the vendor add option (laundry etc) rr incharge to have access and
   permission"*. Today only `div_officer` and `sysadmin` hold `vendor.approve`,
   so the washing centre for IGP cannot be entered by the man who knows which
   one it is, and clause C1 reads breached until somebody with a divisional
   login does it for him. Grant it in a SEED, never a migration.

   Worth settling at the same time: whether a washing centre is approved for the
   division or for one running room — the open question already recorded at the
   end of this file. Adding the permission without answering that decides it by
   accident.

2. **Split the weekly cleaning rows.** The officer's request, first made on
   09.09.2026: C09 bundles nine areas under one weekly tick, and they are not
   all done on the same day. The difficulty I raised then still stands and needs
   his ruling before any code: the tender penalises the CLAUSE, not the area, so
   nine rows that can each fail separately either produce nine penalties where
   the contract intends one, or need a rule saying how many misses make a
   breach. Ask him which the contract means; the schema follows the answer.

3. **Occupant grading treats IGP as one place, and IGP is five buildings.**
   Raised from the grading screen: *"Occupant grading shows IGP as one. which
   among the 4? cleaning, linen etc may change building to building."* Correct —
   cleanliness and linen are properties of a block, not of a running room, and
   IGP's five Igatpuri blocks total 131 beds. Feedback carries no block today, so
   a crew member in one block and a crew member in another are averaged into a
   single grade for the site, and an officer reading a poor cleanliness score
   cannot tell which building to walk into.

   What it needs: the QR to be per block (the code already distinguishes them —
   inspections take `?rr=13&block=2`), a block column on `feedback`, and the
   grading screen to show the site total AND the blocks under it. Not small.
   Park it until the pilot has enough feedback rows to be worth splitting.

4. **Show the rating as stars on the officer's screen.** *"if needed can we show
   5star also?"* The inbox prints 4.25 where the crew member tapped four stars
   and a bit. Cosmetic, an hour's work, no schema change.

Also noted, not on the list:

- **The laundry page scrolls sideways at phone width.** It predates the clause
  work and only bites on a handset.
- **Five routes serve stored files; they should be one.** `/photo/:id` resolves
  a file through `services/file-access`, which knows all 22 tables that can hold
  one. compliance, food-safety, staff and wages still serve their own, and all
  four are correct — but four correct implementations of one rule is four places
  to get it wrong next time. Routing them through `fileFor` would leave one lock
  on one door. Not urgent: none of them leaks today, and rewriting four working
  routes on a live system is its own risk. Worth doing when one of them is being
  touched for another reason.

## Settled since the last review

**A CORRECTED STYLESHEET THE BROWSER WOULD NOT FETCH — stage 90.** Assets are
served with a seven-day cache in production, which is right. Nothing told the
browser when they CHANGED, so a corrected `app.css` sat on the server while every
screen went on using the old one — and a hard refresh does not reliably re-fetch
a subresource. Two rounds of "I copied it up and nothing changed" in one evening,
on two different fixes.

Each asset URL now carries the file's own modification time. It is read at
REQUEST time, not at startup, so copying a stylesheet up WITHOUT restarting still
busts the cache — which is exactly how a stylesheet gets deployed. Memoised for
five seconds, so a page costs one stat rather than one per link.


**THE HELP PANEL WAS NEVER ACTUALLY HIDDEN — stage 89.** `.helppanel` carries
`display:flex`, which is an AUTHOR rule and beats the browser's own
`[hidden]{display:none}`, a user-agent rule. So the `hidden` attribute the panel
ships with did nothing: 900px of help panel sat at the bottom of every page that
had one, below the sidebar, because a third grid item with only two columns
declared flows onto a new row. One line: `.helppanel[hidden]{display:none}`.

Every screenshot taken while building it was of the TOP of the page. The fault
was 3,500 pixels down. `test/shot.mjs` now fails if anything marked `hidden` has
a height.

**And the stale permission cache that hid the occupancy form.** The RR In-charge
saw no occupant-count box on the running room page. The file was right, the
permission was granted, the stylesheet was current — and `can('occupancy.record')`
was false inside the running process, because `src/middleware/auth.js` had been
copied to the server without a `pm2 restart`, so the old cache-for-ever code was
still running. A restart fixed it. Nothing on disk or in the database could show
this: both were correct, and only the live process was not.

Worth remembering: after copying any file to the server, `pm2 restart rrcms`.
A static asset is the only exception.


**A MISSING TEXT BOX THAT WAS NOT MISSING — stage 88.** The RR In-charge
reported the occupancy section as having no text box, and as overlapping the
sidebar when scrolled. Both boxes were there. At 1100px the page was **1443px
wide** and the "Occupants (from RRMS)" input sat at x=1174 — past the right
edge, reachable only by scrolling sideways, which nobody does looking for a box
they have no reason to think exists. Once a page scrolls horizontally the
content also slides across the sticky sidebar, which was the second symptom.

Cause: grid children default to `min-width:auto` and refuse to shrink below
their content's minimum — a wide table, or a row of fixed-width boxes. The
column overflows its track and the whole page grows. `.main` has carried
`min-width:0` since the shell was built for exactly this reason; the grids
inside it never did. One line: `.grid > *{min-width:0}`.

It survived every look because **at 1500px that page is perfectly fine**. It
only appears below a threshold, and the machine it was built on is wider than
the threshold.

`test/shot.mjs` now drives a browser over every page at 1500, 1200 and 1000 and
fails if any scrolls sideways. It is NOT in `npm test` — playwright is not a
dependency — so it must be run deliberately. Worth reconsidering: this class of
fault is invisible to every check that does not use a real browser at a real
width, and there are now two of them (this, and the unbalanced markup that
collapsed the main column at stage 66).


**THE PRODUCTION SERVER WENT UP ON THE GENERIC TENDER'S FIGURES — found and
corrected 07.09.2026.** Four loaders exist that no seed runs and that the
go-live checklist did not mention: `seed-igp-contract.js`,
`seed-igp-establishment.js`, `import-inventory.js` and `import-call-sheet.js`.
The deployment sequence given was `migrate → seed → seed-pilot`, so IGP came up
with 50 generic penalty clauses instead of the contract's 32, the divisional
meal rate instead of GEMC's, 49 sanctioned posts instead of 107, and no assets.
The whole contract-governs architecture was deployed with nothing loaded for it
to govern with.

It was not caught by any test because the development database had the same
hole — the same three commands had been run there. It was caught by the officer
reading a screen and knowing the number was wrong: *"the staff strength in IGP
shows old 49, in local we changed that to 107, right?"*

**And the ordering rule the checklist had backwards.** `migrate.js seed` UNDOES
the pilot merge — it resets IGP to the register's 44 beds and LNL to 42. It does
not touch the manpower overrides, the contract-scoped rows or the assets, which
survive. The old checklist said "run seed after every upgrade too". It now says
seed is ALWAYS followed by `seed-pilot`, with a verification query that must
return 131 beds, 107 sanctioned, 32 scoped clauses and 40 assets.

Worth considering: these four scripts have no test asserting they were ever run.
A check that the pilot sites carry contract-scoped rows would have caught this
on any database, including production.


**AN OUT-OF-SCOPE RUNNING ROOM OPENED AN EMPTY PAGE INSTEAD OF REFUSING — stage
87.** Found by the officer walking the scope on the live server himself, three
days before go-live: *"staff?rr=19 not refusing. opens Contract Staff page."*

**No data ever leaked.** The scope is in the SQL, so `?rr=19` as Igatpuri's CLI
produced `rr.id = 13 AND rr.id = 19` and matched nothing — Roha's people were
never reachable. But the page opened with an empty register, which STATES
something false about another running room, and teaches whoever reads it that a
blank page means nothing-there rather than not-permitted. The day a screen is
written without a scope clause, nobody would notice.

Six screens took `?rr=` as a filter on top of the scope rather than as a claim to
be checked: staff, staff grading, deficiencies, incidents, inspections and
feedback. All now call `assertRunningRoomAccess`, which every WRITING route has
always used — it was only the list filters that skipped it.

`/staff/grading` was the worse of the six: `rooms.find(...) || rooms[0]` fell
back silently, so asking for Roha showed IGATPURI's grading under an address
saying Roha. Real figures under a wrong label, and a screenshot of it would be
evidence of something that never happened. Falling back is now done only when
nothing was asked for.


**EVERY CONTRACTOR SUPERVISOR MADE THROUGH THE USER SCREEN WAS UNUSABLE — stage
86.** Three places declare what a role is scoped by, and for `contractor_sup`
they disagreed. `roles.scope_level` said `running_room`, which is what
`runningRoomScope` reads; `SCOPE_OF` in the route and its twin in the browser
both said `contractor_id`. So the screen asked for a firm, set contractor_id,
left running_room_id empty — and the filter then read "the running room whose id
is null", matched nothing, and the account was refused every page in the system
with "No running rooms within your access".

It hid for weeks because `db/create-user.js` gets it right: it asks for a running
room and DERIVES the firm from that room's live contract. Every account made
during development was made with that command. The screen is the one the go-live
checklist tells you to use for everybody — so it surfaced on the production
server, on the first supervisor account, three days before the contract began.

The screen now asks for the running room and derives the firm, exactly as
create-user.js does — one question, because a supervisor at Igatpuri works for
whoever holds Igatpuri, and asking a second question whose answer is already
known is how two answers come to disagree. `test/scope-agrees.js` checks the
seed, the route and the browser against each other on every run.


**THE FIRST SCREEN A NEW ACCOUNT MEETS TOLD IT THE CHANGE HAD FAILED — stage 85.**
`/account/password` rendered its result straight from the POST, so a second
delivery of that form — a double-click, Enter pressed twice, a refresh, a
back-then-forward — re-sent the OLD password, which by then was wrong. The user
was left looking at "The current password is not right" over the form, with no
sign that the change he had made had worked perfectly.

It happened to the first account created on the production server, within a
minute of the system going live, and it reads exactly like a failure. Reproduced
here by posting the same form twice: first 200 with the confirmation, second 200
with the error, and the error is the one left on screen.

Now Post/Redirect/Get: a successful change redirects to
`?changed=1` and the confirmation is rendered by a GET, so a refresh re-renders
the confirmation and there is no form data left to re-send. Every other POST in
the system was checked for the same shape — auth, public feedback and the signed
feedback register all render only on failure and redirect on success. This was
the one exception.


**A FIFTEEN-MINUTE LOCK-OUT WOULD HAVE LASTED FIVE AND A HALF HOURS IN
PRODUCTION — stage 84.** `locked_until` is a DATETIME with no zone in it, and
the pool is set to Asia/Kolkata, so what comes back is IST wall time.
`new Date(user.locked_until) > new Date()` reads that wall time as UTC on any
server whose own clock is UTC — which every Linux server is unless somebody
changed it — and pushes the lock 5½ hours further out than it was ever meant to
be. Five wrong password tries would have shut an officer out for the rest of the
working day, on crtms.in only, where nobody is watching a console.

It could not show on the officer's Mac, which is on IST, so the two agreed. That
is exactly how the September date faults hid: the machine doing the testing
shared the mistake. Found because a diagnostic written for a different question
printed "-330 minutes ago" and called a live lock-out "not locked".

The lock is now judged by the database (`locked_until > NOW()` in the query).
The same fault was in `facility.js` — an open asset fault's age against the
tender's 24 hours — where it made every fault read 5½ hours YOUNGER, so a fault
open thirty hours would not have been counted as past its clock. Wrong in the
direction that hides a breach. Both now ask SQL for the comparison.

`tools/why-no-login.js` reports why an account will not sign in, and `--unlock`
clears a lock-out without touching the password.


**THE DIVISIONAL OFFICER'S HELP PAGE — stage 83**, from the officer's answers:
he is at a running room monthly or once a quarter, an ADEE or DEE may go in his
place, and the daily checklist stays the CLI's work whoever visits — so what he
does at a site is a footnote, not a section. A bill goes CLI-prepares →
divisional-officer-passes with nothing between. Three roles written; HQ remains.

Two things deliberately left out of it, at his instruction: what CLOSING A
DEFICIENCY means in practice (he is settling that with the officer first — the
step is on the page, but it claims nothing beyond what the screen does), and the
AUDIT TRAIL.


**AN INSPECTION COULD NOT BE FILED UNLESS THE CONTRACTOR WAS THERE — stage 82.**
The daily checklist REQUIRED the contractor's representative to be named, on the
assumption that it is always a joint report. The officer, describing his own
site: *"cli checks. daily is required. supervisor may or may not be there as cli
can inspect any time and supervisor available only on day shift."* So a night
inspection could not be recorded at all — and an inspection that cannot be filed
is one that never happened, as far as any record goes.

The name is now optional, but silence is not: either a name, or a tick saying
nobody from the contractor was present. The two are different facts and the
report prints which — a contractor with no man available at two in the morning
is worth knowing about, and is not the same as an inspector who forgot to type a
name. No migration: the column was already nullable and, being required until
today, every row on record carries a real name, so NULL means exactly the new
thing and nothing else.

**THE RR IN-CHARGE'S HELP PAGE — written at stage 82**, from the officer's
answers: he is at the running room most days; the daily check is his and not
necessarily joint; he prepares the bill for now; he copies the occupant count
across from RRMS by hand, because RR-CMS has no access to it; and the monthly
grading screen already exists, carrying what the occupants said and what the
muster says, so he adds only the joint evaluation and the recommendation. Two
roles remain — Sr. DEE and HQ.


**THE HELP CAME TO THE SCREEN — stage 81.** The officer asked whether the help
could sit beside the screen it describes, and raised the right objection in the
same breath: *"but how several pages. think."* There are no several pages. Help
per screen was never a thing to write: every step of a man's day already NAMES
the screen it happens on, so the index only has to be read the other way round.
Fourteen of the supervisor's screens answer from the data written at stage 80,
notes and all, and each role written later lights up its own screens for its own
people without a line being written twice.

A `? Help` button appears in the header **only on a screen the reader's own day
mentions**, which is what keeps it worth pressing. Open, the panel becomes a
third grid column so the page REFLOWS rather than being covered — half these
screens are wide tables that already scroll sideways, and a panel lying over one
would hide the column being read. It can therefore be left open all day, which
is what a first fortnight wants. Under 1080px it overlays instead. Whether it
was left open is remembered per browser: a preference about a panel is not a
fact about a running room and has no business on the server.


**THE HELP SECTION — first role written at stage 80.** Asked for in the
officer's own words: *"a help section for each user role. what to do where and
how to do, where to find what etc. now even i have to open many links to find
which is where."* One page per role at `/help`, opening on the reader's own
role, answering three questions in the order they get asked: what do I do today,
where do I find a thing, and who does the thing I cannot.

**The sequence is the officer's, not invented.** Every step was put to him as a
draft and corrected — the bearer keeps the call book; the muster is marked by
the supervisor AND the bearer until biometric attendance arrives; meals are
written up like the linen until the crew can acknowledge them on a screen. Where
a step is a stop-gap that will change, the page says so.

A step is a LINK only where the reader's own permissions would open it; anything
else is plain text naming whose act it is. `test/help-links.js` requests every
path the page offers against the real router and fails if any answers 404 — a
help page is believed, which is its whole value and its whole danger, and
RR-CMS has already sent this officer to a route that was never written once.

**Still to write: RR In-charge, Sr. DEE and HQ**, one at a time and with the
Railway. The sequence of a man's day belongs to the man who works it; guessing
it from a permission list is how a help page ends up describing a system nobody
recognises. `src/help/roles.js` holds the content as data, so each is an edit to
one file.


**A PERMISSION GRANT NEEDED A SERVER RESTART, AND NOTHING SAID SO — stage 79.**
Role permissions were cached in the running process for the life of the process.
A permission is granted by a SEED, which runs in a different process, so
`npm run seed` followed by a look at the screen showed no change at all: the
database was right, the running server was wrong, and nothing anywhere said
which. It cost the officer an evening hunting for a button the database had
already given him. The cache now holds for **one minute** — one query per role
per minute whatever the traffic, and no one has to be told to restart a server
to see a grant. `tools/why-no-admit.js` reports the same thing from the database
side when a button is missing.


**SCREENING AND ADMISSION WERE ONE PERMISSION — split at stage 77.** Approving a
man and admitting him provisionally were both `staff.screen`, held by the Sr.
DEE alone. So on the day a running room is switched on, its whole roster waited
for a divisional officer before a single muster could be filed, and the RR
In-charge — the Railway's own man standing at the site, looking at the men —
could do nothing at all. Found by the officer trying to test the muster: *"to
test mark attendance railway should approve staff first. who does it? as rr
incharge igp_cli i tried. but no option."*

The officer's decision, 07.09.2026: **the CLI admits, the Sr. DEE approves.**
`staff.admit` is new and is held by the RR In-charge and the Sr. DEE; it admits
a man provisionally, which is reversible, flagged on every screen he appears on,
and clears nothing. `staff.screen` — approve, reject, and permit a replacement —
stays with the divisional officer, because that is the control that keeps an
unverified man out of a railway kitchen and moving it to the site would be a
loosening rather than a convenience. One form posts all three decisions, so the
stronger permission is checked **inside** the handler where the decision is
known, not at the door: an RR In-charge who posts an approval is refused.


**THE MUSTER COULD NOT RECORD A SHIFT — stage 76.** `attendance_daily` has
carried a `shift` column and a unique key over (staff, date, shift) since it was
built. The screen wrote `'general'` into it every time and offered no way to say
otherwise, and no way to reach another day. So the evening and the night — the
two shifts the day-shift supervisor is not present for, and the two he marks the
following morning — could not be recorded at all. Found by the officer
describing his own site: *"the supervisor can mark previous days evening and
night shifts."* The screen now carries a day box and a shift, the counter-
signature is taken shift by shift (the night is marked the next morning, so
signing the whole day in the afternoon would put the Railway's name under rows
that did not yet exist), and **the deployment panel counts each man once across
every shift**, because Schedule A sanctions men for the running room and says
nothing about how they are spread across the clock.

It was also **the one daily register with no future-date guard** — attendance
could be filed for next Tuesday and nothing objected. It now refuses, and the
screen lands on today and says why rather than throwing an error page.


**THE LINEN PAGE NOW OPENS ON YESTERDAY — stage 74.** The supervisor is on the
day shift and linen goes out around the clock, so he writes a day up the
following morning: "to fill the linen usage for the day he should fill it for
the previous day." Back-dating was always accepted by the routes — only a future
date was ever refused — but there was **no way to reach a day that had nothing
recorded yet**: the page took its date only from the address bar, and the
fortnight table below only links days that already have a row. The one day he
needed was the one day with no link to it. There is now a date box on the page,
defaulting to yesterday and labelled with what that day is.

Three things follow from the page moving off today, and each would have been
wrong the moment it did:

* **Clause C6's clock is measured to today**, never to the page's day, or a
  consignment's age would understate by exactly as many days as the supervisor
  is behind.
* **A dispatch and a return are dated today**, not the page's day. The laundry
  man is at the door while he is standing there; the grid above is a write-up of
  a day that is finished. Both stay editable.
* **The send card says what has already gone today**, because the per-item "sent
  to wash" column shows the page's day and a challan raised this morning would
  otherwise appear nowhere near the box that would send it again — the duplicate
  the officer predicted, made likelier by the new default.

**The morning count is yesterday's closing count.** What is on the shelf before
the day's first issue is what was on it when yesterday ended. Recorded against
yesterday it can be accepted the same morning, because a day is settled once it
is over — which is what makes the whole book-figure model fit a day shift rather
than fighting it. The count panel says so, and warns when the page is on today.


**THE SHELF FIGURE WAS TRYING TO BE TWO THINGS AT ONCE — settled at stage 73.**
`linen_daily_item.fresh_in_hand` was both a running balance and a physical
count. Four faults were found in one week and each was patched where it showed
(migrations 057, 058, 059) before the diagnosis became clear: they were not four
faults but one seam, and there was no reason to think 059 was the last of them.
A count is true at a moment and ages from it; a balance is true continuously and
is never observed. Writing both into one column loses every movement recorded
after the column was last written.

The shelf figure is now a BOOK figure, computed and never typed
(`src/lib/linen-book.js`, read by every screen that shows a shelf figure). A
count is recorded separately, against a name and a date, and produces a
DISCREPANCY. Accepting a count is the Railway's own act (`linen.accept`) and is
the only thing that moves the book's starting position. Two rules close the last
of the seam: **a day can only be settled once it is over** — the register knows a
day's issues as one figure for the whole day, so today's count cannot yet mean
the closing position — and **a settled day that is written to afterwards is
flagged**, since no arithmetic can decide whether a late correction was already
in the man's count. Struck against the book, not the last count, for clause vii:
the officer's ruling, on the grounds that the book is current every day where a
count is only as fresh as the day somebody walked to the shelf.

**MARKUP THAT DOES NOT CLOSE IS NOW CAUGHT — added at stage 73.** A script that
added the sticky building bar left three views with an unclosed `<div>`; the
page returned 200, the template compiled, the crawl passed, and the main column
collapsed to 800px against a 6479px page. `tools/crawl.mjs` now counts opening
and closing tags on every rendered page. Crude on purpose: it needs no parser,
and a mismatch is never innocent in hand-written markup.


**NINE PERMISSIONS WERE HELD BY NOBODY — found 28.08.2026, on the real
database.** The worst fault found so far, and it had been there for ten stages.
Each of `user.manage`, `crew.contact`, `crew.link`, `cctv.record`,
`vendor.approve`, `asset.manage`, `staff.grade`, `feedback.enter` and
`callsheet.manage` was declared in the migration that added its screen and
granted there with a join against `roles`. **Migrations run before seeds**, so
on a fresh install `roles` is empty at that moment: the permission row was
written, the grant matched nothing, MySQL raised no error, and the screen became
unreachable by every role in the system. On a database seeded once already the
same statement worked — which is why it survived seven migrations.

Found when the sysadmin could not open the **user admin screen**, which is the
one screen needed to give the other three running rooms their in-charge and
supervisor logins. All nine are now declared and granted in
`db/seeds/01_reference.sql`. **The seven migrations are left exactly as they
shipped** — an applied migration must never be edited, because `migrate.js`
checksums every one and refuses to run if a byte changed; editing them to tidy
up would have stopped every existing database from upgrading. Their INSERTs are
now inert: the seed does the work, and `ON DUPLICATE KEY UPDATE` makes the
migration's own attempt a no-op. **`test/seed-permissions.js` runs in
`npm test`** with four checks:
every declared permission is held by somebody, no NEW migration writes to
`permissions` or `role_permissions` (the seven are grandfathered by name and
nothing may be added to that list), and the demo's own copy of the grants
matches the seed in both directions. That last one closed a live drift —
the demo had been granting the sysadmin `menu.manage` and `cleaning.verify`
that the seed did not.

> **On the affected database, re-run `node db/migrate.js seed`.** The seed is
> idempotent; it adds the nine grants and changes nothing else.

**A verified cleaning day could not be corrected by anybody — found on the
first walk-through, 26.08.2026.** Verification closes the rounds to editing,
which is right: what was confirmed was a particular set of rounds. But the
screen removed the save button and offered nothing in its place, so a day
verified by mistake, or verified before the evening round was entered, was
sealed for good. The route had always withdrawn the verification on a save; the
view gave no way to reach it. The Railway can now **reopen a day** — a
deliberate act, by the hands that verified it, audited — after which the rounds
are back in the contractor's hands and the day needs verifying again. The
contractor can do neither. Same shape as the weekly menu; the counter-signed
muster stays the deliberate exception, where final means final.

**A pending migration took the dashboard down, 26.08.2026 — and the fix is the
guard, not the migration.** An officer opened the dashboard and got
`Unknown column 'c.loa_no' in 'field list'` because migration 035 had not been
run. Nothing was wrong with the data or the code: they had drifted apart by one
file and the application had no idea. It started happily, served every page that
touched no new column, and then failed with raw SQL in front of a user who could
do nothing about it. `src/services/schema-check.js` now compares the applied
migrations against the files on disk **at boot**: outside production it prints
what is pending and the command to run and starts anyway; **in production it
refuses to start**, because pages that work until somebody reaches the wrong
screen are worse than a process that does not come up. It never applies
migrations itself — a restart must not be able to alter a live database with
nobody watching, and two processes coming up together would race.

**P11, the raw-foodstuff quality register — stage 28.** Schedule A, L.7: *"The
quality of raw food stuff such as wheat flour, grains, pulses, eatable oils etc
shall be verified by obtaining the signature of available running staff/
Supervisors in the register after ascertaining quality /seal of the eatables."*
The kitchen page's approved-brands tick was never this. A tick records a belief;
the clause asks that the stock was opened, the **seals** were examined, and **the
men about to eat it signed**. Three tables, because the check is an event, the
items are what was examined at it, and the signatures are who stood there —
flatten any into the others and the clause stops being provable. A poor item is
evidence for **B2** or **B4**; RR-CMS records and raises nothing. A check nobody
signed is **kept and flagged, never refused**: a check that happened with no crew
available to sign is better evidence than no record at all.

**P12, garden and lawn upkeep — stage 28.** The tab has said "Pest & garden"
since stage 6 with no field behind the garden half. Of the tender's four
obligations one is countable and dated, so the page works it out: **ten plants in
cement or fibre gamlas of at least eighteen inches, every six months.** The page
says how many of the ten have come and flags a delivery in a pot the tender does
not allow. Watering, trimming, fencing, fertiliser (preferably organic) and lawn
cutting are recorded as work done on a date.

**Schedule D was never seeded — found while looking for P14's newspapers.**
`consumable_items` was created at stage 6 with a working screen and **has never
had a single row on a real database**; every item on the consumables page comes
from the demo. So the newspapers and magazines were not missing from a list —
there was no list. Seed **09** puts Schedule D's fourteen items in as printed.
Quantities are deliberately absent: the tender gives them as "Actual Nos." and
"as per requirement", to be estimated per site. **This is the fourth appearance
of one fault** — a table laid down ahead of the data that gives it meaning
(`feedback_coverage`, `staff.photo_file_id`, `menu_items`, now this) — and the
demo hid it every time, because the demo's stub always has something to return.

**P13 was already built and the audit said otherwise.** The signed feedback
register went in at stage 19. AUDIT.md still listed it as missing; the entry has
been corrected rather than the register built twice.

**The Letter of Acceptance on the dashboard, stage 27 — asked for by a
divisional officer.** `contracts` has carried `loa_date` since stage 3 and never
had the LOA's **number**, which is what actually identifies the letter: "the LOA
dated 14.03.2025" is not a reference anybody can look up. Migration **035** adds
`loa_no`, and the dashboard gains an agreements panel answering the two
questions an officer could not answer on any one screen — **which agreement
covers each of my running rooms, and when does it run out.** The LOA reference
stands beside the agreement number because between acceptance and execution the
LOA *is* the authority the contractor works under, and that is the period an
officer most needs to see. Scoped like everything else. **No amount is
computed:** the security deposit and performance guarantee are shown as present
or missing, nothing more.

> **What the panel will show you at go-live, and it is not flattering.** All
> four pilot rooms read *AGREEMENT-AWAITED* with **no LOA number, no LOA date,
> no period, no security deposit and no performance guarantee** — because none
> has been supplied. The panel prints each gap by name rather than leaving a
> blank, so the officer reading his own dashboard has the chase-list in front of
> him. A running room no live agreement covers at all is called out separately:
> nothing on this system can say who is answerable for that site today.

> **Offered and not taken:** a place to attach the LOA document itself. That is a
> contract-documents table and an upload screen; say the word and it is small.

**The agreement record, stage 29 — the way into the panel above.** The LOA panel
went in at stage 27 and read a table that no screen in RR-CMS could write to.
`contracts` had no create and no edit path anywhere: the rows came from
`db/seed-pilot.js`, run from a terminal. So the officer could see that his LOA
number was missing and had nowhere to put it when it arrived. Found by the user
asking the obvious question — *is anything pending on LOA?*

Migration **037** makes `start_date` and `end_date` nullable, which the pilot
had already proved necessary: the state the officer needs to record is *LOA
issued, agreement not yet executed*, and until now the table refused to hold it.
The dashboard was already reporting "the period" as a gap that its own schema
made impossible. Under `Contractors → Record an agreement`, or by clicking any
agreement number on the dashboard, the officer can now enter the LOA number and
date, the period, the security deposit, the performance guarantee, the contract
value and which running rooms the agreement covers. Gated on `contract.edit` —
the divisional officer and the System Administrator, nobody else; `contract.view`
roles get the same page read-only.

> **Three things the room list does deliberately.** Unticking a room **stands it
> down** — `effective_to` is set to today — it is never deleted, because who was
> answerable for a site last March is the only question that table exists to
> answer. Ticking a room another live agreement holds is a **handover**: the
> earlier link is closed on the same date, so no site is ever shown under two
> agreements at once, and the move is reported back on the screen rather than
> done silently. And a running room **outside the signed-in user's access is
> never touched** — a CR-wide agreement edited by a divisional officer must not
> shed the other division's rooms merely because they were not on his screen to
> tick.

> **Blank is not nought.** A security deposit entered as 0 says the agreement
> demanded none. A blank says nobody has told us yet. Those are two different
> findings at a review, so a blank amount is stored as NULL and shown as *not on
> record*. Nothing on that screen is computed.

> **Caught on the way in, worth remembering.** `SELECT DISTINCT … ORDER BY` a
> column that is not in the select list is accepted by MariaDB — which the demo
> and the checks here run against — and refused outright by MySQL 8, which is
> what runs on the officer's machine. The fault would have appeared only on his
> disk. The column is now selected as well as ordered by.

> **Two faults found on the first walk-through, both by the RR in-charge.**
>
> *The room list offered all forty-four.* Scope answers "may this user see it";
> status answers "is there anything to see". The picker used only the first, so
> the officer was asked to tick CLA and CSMT against an Igatpuri agreement —
> forty of those rooms are marked `not_in_scope`, open and working but not
> carried on this system. It now lists operational rooms only, **plus whatever
> the agreement already holds**, because a site can close or go under renovation
> without the contract ending, and a room that cannot be shown cannot be
> unticked either.
>
> *The period arrived pre-filled.* `db/seed-pilot.js` invented 01.04.2025 to
> 31.03.2027 for all four sites, because until migration 037 the table would not
> accept a NULL period, and said so in the contract remark. But a remark on the
> contract record does not travel: the dashboard read those invented dates and
> printed a confident day count against them — an assumption wearing the clothes
> of a fact, on the one screen an officer trusts. `data/pilot/contractors.json`
> now carries `start_date: null` and `end_date: null`, and the loader falls back
> to today's date for `effective_from` on the running-room link, which is NOT
> NULL and rightly so. **Existing rows are not rewritten by the loader** — the
> four already on the database keep the assumed period until it is cleared on
> the agreement screen or corrected in SQL, because silently overwriting a
> period an officer had typed in would be the worse fault.

**The linen schedule as the contract actually states it, stage 34 — a bug found
by reading the executed contract, not by testing.** Pages 83 and 84 of
GEMC-511687722391404 give a **delivery period per linen item**. The register had
been applying a flat 48 hours to everything — clause C6 as written in the earlier
tender paper — and was therefore wrong in both directions at once:

| Item | Contract | What the register did |
|---|---|---|
| Bed sheet, pillow cover, mosquito net | next day | nothing until day 3 |
| Curtain, mattress cover, woollen blanket | 3 days | flagged from day 3 — early |
| Blanket cover | 7 days | flagged from day 3 — four days early |

A bed sheet two days late passed silently; a blanket cover four days inside its
period was called a breach. Neither error was visible on the screen, and both
would have been argued at a review from a register that looked authoritative.

**And two items did not exist.** The contract names seven; the enum carried five
and an `other`. The mattress cover and the blanket cover — separately priced,
separately washed, separately recovered at Rs 400 and Rs 230 a unit — had nowhere
to be recorded, and `blanket` was doing duty for the woollen blanket and its
cover at once.

Migration **041** widens the three item ENUMs by appending (metadata-only) and
adds `linen_schedule`; seed **11** carries the contract's own table. The periods
are a seeded master rather than constants in the code, so the day a running
room's contract differs the answer is a row and not a release — `contract_id`
NULL means "what we apply where a site's own contract has not been read in",
which today is every room but IGP.

> **What else those two pages gave us**, now recorded and shown beside the
> register: the washing frequency in the contract's own words (2 bed sheets and
> 1 pillow cover per occupant, mosquito net weekly, mattress cover and blanket
> cover and curtain every 15 days, blanket monthly), the schedule quantity for
> two years, and the **recovery rate per unit** for a lost or damaged item — bed
> sheet Rs 170, pillow cover Rs 45, mosquito net Rs 170, woollen blanket Rs 397,
> curtain Rs 450, mattress cover Rs 400, blanket cover Rs 230. **Nothing
> multiplies them.** A shortfall of eleven bed sheets is eleven, beside Rs 170 a
> unit, and what comes off the bill is the officer's act.

> **A discrepancy inside the contract:** the GeM line item says 365,000 bed
> sheets over two years; Table A on page 83 says 365,200. The seed carries
> 365,200, the figure in the scope of work. Worth a question to the officer.

> **The stub could not have caught this, and did not.** The route selected three
> columns and the view printed six. `demo/server.js` hands back the whole row
> whatever the SELECT list says, so the demo was green and a real MySQL rendered
> *Rs NaN*. Caught by `write-check.mjs` against MySQL 8. The stub now carries a
> comment saying plainly that it cannot check a projection.

**The monthly occupant count, stage 33 — entry put where the consequence is.**
No migration: `occupancy_monthly` has held the figure since stage 1 and the
coverage screen has printed the consequence for as long. What was wrong was
narrower and worse than a missing feature.

**The one man who has the register could not type the number in.** Entry lived
only on each running room's own page, behind `rr.edit` — which also governs bed
counts, category and sanctioned strength, and which the RR In-charge rightly does
not hold. So the figure could only be entered by a divisional officer who does
not have the register in front of him.

> **And the figure is not decoration.** It is the DENOMINATOR of the tender's
> 50% feedback floor. With no figure, coverage computes as zero, the floor is not
> met, and clauses **GC, GF and GL** — the rating-linked penalties, each 10% of
> the monthly bill — **cannot be levied at all**. A contractor with genuinely
> poor grading escapes them because nobody typed a number, and on screen that is
> indistinguishable from coverage honestly falling short. Weak collection quietly
> protects a poor contractor; an unentered denominator does it silently.

Entry is now a column on `/feedback/coverage` — the page that already prints the
consequence — one month, as many rooms as there are figures for, behind a new
narrow permission `occupancy.record`. The running-room page keeps its own form,
re-gated to the same permission.

> **The contractor's supervisor is deliberately NOT given it.** He could
> otherwise set the denominator of his own grading penalty: enter a large number
> and the coverage percentage collapses below the floor, switching the penalty
> off, with nothing on the screen looking wrong. Refused at the route, not merely
> hidden in the view — proved both ways.

> **A blank box is not a zero.** Left empty, a room is untouched: the officer is
> saying nothing about it this visit. A typed 0 is a statement and is stored. The
> faint figure in an empty box is that room's reference crews-per-day times
> thirty — an order-of-magnitude check, never a value that gets saved.

> **Two demo stubs were answering for each other.** An early catch-all,
> `FROM occupancy_monthly WHERE running_room_id` → `return []`, replied "nothing
> on record" to every shape of that query, so the audit trail recorded every
> entry as a first insert and never as a correction. And a second
> `INSERT INTO occupancy_monthly` stub written far below one that already existed
> was dead code that read as though it were doing the work. Both fixed at the one
> place rather than by adding a third.

> **A test that kept time.** `write-check.mjs` built its clause M5 case from
> *last* month and invented a payment date on the 22nd of the month after — which
> is in the future for the first three weeks of any month. It passed for most of
> August and failed on 2 September. It now works two months back, so the due date
> is always comfortably past.

**The contractor's standing obligations, stage 32 — P14 closed, and with it the
last unbuilt item on the audit.** The PC and printer, the biometric system, the
indemnity bond, the uniform sample, fire-extinguisher refilling, emergency
numbers at reception, the single-use-plastic prohibition, bed plates and name
board, training before deployment. Migration **040** and seed **10**.

> **Most of these carry no clause, and the page says so.** An unlit name board or
> a missing emergency-number board is a thing to put right, not a penalty, and a
> compliance page that read like an accusation sheet would stop being used.
> Three carry a rate — **D3** and **D4** at Rs 1,000 a WEEK, and **M12** for
> extinguisher refilling — and those behave exactly like M5 on the wage
> register: state the weeks, offer the clause, compute no money.

> **The clock runs from the Letter of Acceptance, and at the pilot it has not
> started.** "Within one month" has to be one month after something. No LOA date
> is on record at any of the four sites, so D3 and D4 have **no due date**, are
> **not** reported as breached, and cannot be raised — the route refuses it and
> says why. A penalty must not run from a date nobody has given. That is the
> second concrete reason for the officer to chase the LOA, and it now shows on
> the obligations page as well as the dashboard.

> **The invented period came back through a side door — found on the first
> walk-through.** The anchor fell back to the agreement's start date where no LOA
> date was recorded. Sound for an agreement that exists; wrong at the pilot,
> because three of the four still carry the 01.04.2025–31.03.2027 period the
> loader used to invent. So the obligations page showed clocks running from a
> date nobody ever gave — the exact fault the dashboard was corrected for at
> stage 29, arriving again by a different route. An agreement whose **number**
> says `AGREEMENT-AWAITED` cannot supply a trustworthy start date by definition,
> so its period is no longer used as an anchor whatever is sitting in the column,
> and the page says why. The test is on the agreement number rather than on the
> dates, so it corrects itself the moment a real number is entered — proved both
> ways in `write-check.mjs` against a real database.

> **The 18-to-60 age band is derived, not ticked.** The staff register already
> holds a date of birth, and an arithmetic answer is worth more than a box
> somebody ticked. Men with no date of birth on record — at the pilot, everyone —
> are counted as **unknown**, never as compliant.

> **Two more of the same fault, and one only a real database could find.**
> Written the obvious way, the clause lookup asked
> `SELECT df.id ... FROM deficiencies df JOIN deficiency_clauses dc` — the
> deficiency register's own stubbed pair — so every clause reported itself as
> already raised and no button ever appeared. Eleventh collision of the shape;
> aliased `cdf`/`cdc` at the source.
>
> And the age query aliased its columns `under` and `over`. Both are **reserved
> words** since window functions arrived; MySQL and MariaDB refuse them, the stub
> had no opinion whatever, and the page was a clean 200 in the demo and a 500 on
> a real server. Caught by `write-check.mjs`, which is the whole reason it
> exists. A bare `/compliance` with no `?rr=` also threw a 500 — Express 5 leaves
> `req.body` undefined on a GET — and that one was caught by the crawl's own
> page list.

**The security and incident register, stage 31 — half of P14.** Fire, theft,
miscreant activity, accident, death, intoxication. Nothing in RR-CMS recorded any
of them, and this is the one gap where having no record is itself the danger: an
officer asked what happened at a site six months ago had nowhere to look, and the
contractor had nothing to show either.

Migration **039** is two tables. Who was told is a child table rather than a row
of booleans, because the question at an enquiry is never *was the police
informed* — it is **when, by whom, and under what number**.

> **Almost nothing here is a penalty, and the screen says so.** A fire or a theft
> is an event the Railway must know about, not a deficiency, and the register
> raises nothing for it. The one exception is clause **A3** — Rs 1,000 per labour
> per case — and only where the man was the **contractor's**. Intoxication of
> running staff is the same word and an entirely different matter: a crew
> discipline question for the lobby and the controller, with no contractor
> penalty whatever. The register asks whose man it was and the **route** refuses
> A3 for the other answer, rather than hiding the button and trusting whoever is
> reading to know the difference.

> **The gap between the event and the report is the finding.** `reported_on` is a
> recorded date, not a flag, and the register prints *same day*, *N days later*
> or *not reported*. An empty register because nothing happened and an empty
> register because nobody wrote anything down look exactly alike, which is the
> same argument as everywhere else here. Closing an entry needs a line saying
> what was found: a bare "closed" answers nothing.

> **Two more stub collisions, and this time fixed at the source.** Written the
> obvious way, the register asked `SELECT rr.id, rr.name, d.code AS div_code FROM
> running_rooms` and `SELECT i.*, rr.name AS rr_name` — statements two existing
> stubs already answer, one with a SINGLE room and one with an inspection. The
> room list came back as one row, and once it came back empty the screen refused
> every role for having no running rooms at all. Ninth and tenth of this shape in
> `demo/server.js`. Rather than reorder stubs again, the route now spells its
> aliases `dv` and `inc`, which cannot collide.
>
> The `INSERT INTO deficiencies` stub also stopped being a pile of booleans: four
> statements now write to that table, and it reads `source` and
> `source_ref_table` out of the SQL literals instead of guessing from position.
> The A3 insert was additionally binding its quantity as a literal `1` rather
> than a placeholder, which shifted every parameter after it — and silently
> disarmed the guard against raising the same clause twice. Bound now, so all
> four statements share one layout.

**The wages register, stage 30 — P7 closed. The last of the Large items.**
Nothing in RR-CMS recorded that a labourer was paid, when, or how much. The
muster proved a man was present; no register anywhere proved he was paid for
being there — which is the first question a labour inspector, an accounts office
and a review committee all ask.

Migration **038** adds three tables. It is three and not one because of clause
M5: *Rs 100 per staff per DAY where wages are not paid by the 10th of the
following month.* A penalty that multiplies men by days cannot be answered from
a monthly total, so the register is **per man**, and the date wages actually
reached him is a recorded fact rather than an inference from a bill.

> **What the screen does with a late payment.** It states the arithmetic in
> words — *wages for July paid on the 18th, eight days after the due date of
> 10 August, to fourteen men; 14 × 8 = 112 staff-days* — and offers, once, to
> hand clause M5 to the deficiency register prefilled. The officer confirms or
> discards it. The register does not raise it by itself, because a penalty is an
> accusation and an accusation is a human act. Raising it twice is refused
> outright: two penalties for one late payment would be the worst fault this
> system could produce. **No rupee figure is computed**, here as nowhere else.

> **Three states, not two, and the distinction is the whole point.** A man left
> entirely blank is **unrecorded** — nobody has said anything about him. A man
> with a row and no amount was written down and the amount was not stated. An
> amount of **0** says he was paid nothing, which is a finding. An officer
> reading this a year later has to be able to tell the three apart, so a blank
> row is deleted rather than saved as zeroes.

> **Days present are offered, never written in.** The muster's count for the
> month appears as the placeholder on each man's line. Wages may be paid on a
> different basis, and a register that filled the figure in itself would be
> putting words in the contractor's mouth.
>
> *Corrected on the first walk-through, twice.* First, the column showed **0** where the
> muster had never been marked, which reads as "present on no day" and invites a
> supervisor to write down 0 days paid — this register manufacturing a finding
> out of silence, in the one screen where that matters most. A man with no marks
> at all now shows a **dash**, a man marked and never present shows **0**, and
> where the whole room is unmarked the sheet says so in a banner and points at
> the muster. Found by the RR in-charge with one sentence: *no present marked
> for july, so all 0.*
>
> Then, worse: the payment sheet came back **empty at every pilot room**. Two
> filters in the roll query, both wrong in the same way. `date_of_joining <= ?`
> silently drops every man whose joining date is not on record — and the Railway
> has supplied joining dates for nobody, so that is the entire roster.
> `screening_status IN ('approved','provisional')` drops every man still
> pending — again the entire roster, since no screening document has been
> supplied for anyone either. Between them the register was unusable on the day
> it shipped, and only the two staff the in-charge had keyed in himself appeared
> at all. Found the same way: *the sheet shows nobody was on the roll at this
> running room during July 2026.*
>
> The rule this breaks is the one the rest of the system runs on: **missing data
> is not a reason to hide a man.** He is on the roll; he was paid or he was not.
> Everyone active is now listed, with the unfinished screening, the absent
> joining date and the absent bank account said on his own line — because a man
> paid while unscreened is a finding an officer needs to SEE, and a register
> that leaves him off the sheet is hiding it rather than recording it.

> **The demo confirmed my own typo, and only a real database refused it.** The
> M5 button threw a 500 in front of the officer: the route asked
> `deficiency_clauses` for a column called `code`, and the real column is
> `clause_code`. The demo was green throughout, because the stub had been keyed
> on the route's own statement — `WHERE code = 'M5'` — and answered it
> perfectly. **A stub written to match the statement can only ever confirm the
> statement.** That is a structural limit of the demo, not an oversight in it,
> and it is the third fault of this family (a missing migration, a
> MariaDB-versus-MySQL difference, now a wrong column name) that reached the
> officer's screen before anything here caught it.
>
> Two things changed. The clause lookup now asks for the row **in force on the
> day the default occurred** — the schedule is versioned by `effective_from`,
> and a penalty is charged at the rate that stood when it happened, not at
> whichever version is newest. And `tools/write-check.mjs` — which runs against
> a **real MySQL**, not the stub — now exercises the whole wage path: the sheet
> saving with one man written down and the rest left silent, M5 being handed to
> the deficiency register, the refusal to raise it twice, verification, and
> reopening. Written to be re-runnable against a database that keeps its state:
> on a second run the clause is already raised, and being refused is then the
> right answer, so what is asserted is the end state rather than the transition.
>
> **Since done.** `write-check.mjs` now carries **85 checks** and covers every
> write path added from stage 24 onward — food safety, the wage sheet and clause
> M5, the agreement record, the cleaning day, the weekly menu, raw-foodstuff
> quality, garden upkeep, the incident register with its A3 interlock and the
> standing obligations. It takes
> a second login for the site-level
> registers, because `stay.manage` belongs to the RR in-charge and the
> contractor's supervisor and an officer posting to them is correctly refused;
> without one it names the checks it skipped, since a check that quietly does
> not run is worse than no check at all.

> **A link to a route nobody ever wrote.** The M5 card offered *Open it* against
> `/deficiencies/:id`. There is no such route — the register is a list, and
> there is nothing a page-per-deficiency would carry that the row does not
> already. So the officer clicked a link the system itself had drawn for him and
> got a 404. The register now takes `?highlight=<id>`, which anchors and tints
> that one row, and the wages screen points at it.
>
> `tools/crawl.mjs` gained a **second pass that follows every link the pages
> actually render**, on top of its hand-kept list — because a hand-kept list
> only ever contains what somebody remembered to add, and this link was never on
> it. 250 rendered links, walked, on every crawl.

> **Four events were missing from the audit trail, silently. Found in a log
> line while chasing something else.** `audit_log.action` is an ENUM, and
> `services/audit.js` swallows its own failures on purpose — an audit write must
> never break the user's action. Together they are a trap. Creating a contract,
> attaching a running room to one (both stage 29), opening a wage month and
> raising clause M5 (both stage 30) all wrote `action: 'create'`, and the column
> knows only `insert`. MySQL answered "Data truncated for column 'action'", the
> audit service logged it and moved on, every save succeeded, every screen
> looked right — and four kinds of event simply never reached the trail of a
> system whose entire purpose is producing evidence in a contractual dispute.
>
> All four now write `insert`. **`test/audit-actions.js` runs in `npm test`**:
> it reads the ENUM out of the migrations rather than restating it, so widening
> the column widens the test in the same commit, and it fails the build if any
> route writes an action the column cannot hold.

> **Caught while building it.** The demo's `INSERT INTO deficiencies` stub had
> two parameter shapes — the daily checklist and the weekly review — and read
> the description by position. The wages register is a third shape, and without
> teaching the stub about it the M5 description came out as a row id. Same
> family as the eight SQL-prefix collisions before it: something narrower
> arriving under something written for a wider case.

**The daily cleaning record, stage 26 — P6 closed. The largest contractual gap
in the application.** Schedule C sets out a cleaning schedule by area, by
frequency and by hour: bed rooms, recreation hall, galleries, open space and
garden **twice a day**; kitchen, kitchen store, dining hall, bathrooms and
lavatories **three times a day**; racks, cupboards, furniture, windows and glass
**every Sunday**; walls, cobwebs and ceilings on the **second and fourth
Sunday**. Clause **A6 — poor cleaning against schedule, ₹1000 a day** — is the
largest recurring penalty in Schedule A, and nothing in RR-CMS recorded whether
a single round had happened. An officer raising A6 had only his recollection;
**a contractor who had kept the schedule had no way to show it**, and that half
matters as much.

Migration **034** and seed **08** record the **round**, not the day, because
that is what the tender buys — the kitchen block cleaned once on a day it should
have been cleaned three times is exactly the shortfall A6 names, and a day
carrying three rounds where five were due now says so by arithmetic rather than
by opinion. The hours are kept too: a round finished at 23:50 against a window
that closed at 20:00 is recorded as **done and as late**, both, neither hidden
and neither judged.

Three deliberate choices worth knowing:

- **A blank round stays unrecorded — it is never written as "not done".** Silence
  and a statement are different things and the register counts them separately.
  A fortnight of unrecorded rounds is its own answer at a review; it is not
  evidence of a missed round and is not counted as one.
- **The contractor records, the Railway verifies** — the same division of hands
  as the muster and the weekly menu. Correcting any round withdraws the
  verification, because what was verified was a particular set of rounds.
- **Pest control is not duplicated.** It is the fifth row of the tender's own
  cleaning table, but it is monthly specialist work and has kept its own
  register since stage 6. Two records of one fact is how two registers come to
  disagree.

Garbage — *"disposed at least twice a day … shall not be kept overnight"* — is
carried as two rounds, cited to the scope item it comes from rather than to the
schedule table, since the tender states it without an hour.

**The menu card and rate board, stage 25 — P9 closed.** Schedule B's Table A and
Table B had nothing behind them: no menu, no item list, no rates, no weekly
menu. The stage-6 reasoning that left them out — *"meal and subsidy accounting
is maintained in RRMS"* — was right about transactions and wrong about the menu.
A menu is not an accounting artefact; it is what the contractor must cook, in
what quantity, and what he may charge for anything extra. RRMS bills the
subsidy; it does not hold what a dinner must contain. The RRMS boundary had been
stretched over something on the wrong side of it. Migration **033** and seed
**07** add the item master (Table A with its stated quantities, Table B's 23
printed lines), a dated rate board, the weekly menu per room, and the printable
menu card. Clause **B6** — overcharging or serving less quantity — now has both
an approved quantity and, once the Railway fixes them, an approved rate.

> **Data the Railway owes: every Table-B rate.** The tender prints Table B with
> its *Cost in Rs.* column **blank** — the rates "shall be fixed by Railways …
> on the basis of no-profit, no-loss" and displayed in the dining hall. Nothing
> is invented: an unpriced item has no row, and prints as *rate not yet fixed*
> rather than as a blank or a zero. **Until the division supplies them, B6
> cannot be tested on any extra item.** Table A's rates are the tender's own and
> were already held (₹69.30 / ₹62.37 a meal, ₹42.00 / ₹37.80 breakfast, incl. 5%
> GST).

> **For the Railway to correct.** The tender's own Table B prints **"Parathas"**
> as its fifth line and **"Paratha"** as its twentieth. Both are carried as
> printed. If they are one item the Railway should say so — an item quietly
> removed from a rate board is an item a contractor can be charged against with
> no recourse.

**The parcel meal, stage 25 — P10 closed.** Meal types were breakfast, lunch and
dinner. The Railway Board letter the tender quotes (2006/M(L)/467/2) caps
subsidised meals at three in a 24-hour stay and puts the en-route packed meal
**in addition to that ceiling**. Without a type of its own a parcel was either
unrecorded or booked as a lunch, and in the second case the ceiling arithmetic
was wrong for the man who took it. `parcel` is now a fourth type, and the unique
key gives exactly what the letter describes.

**A permission grant that silently inserted nothing — found before it shipped.**
Migration 033 first declared `menu.manage` and granted it with a join against
`roles`. Migrations run **before** seeds, so on a fresh install the `roles`
table is still empty at that point: the join matched nothing, MySQL raised no
error, and the permission existed with nobody holding it. On an
already-seeded database the same statement works, so the fault would have
surfaced only on the next fresh install. Permissions are now declared in
`db/seeds/01_reference.sql` with every other permission — seeds are idempotent
and always run. **Worth remembering as a rule: a migration must not assume seed
data exists.**

**The linen register was item-wise for issues and aggregate for everything
else, stage 24.** Found by the running room supervisor's own question on first
reading the screen: *"for fresh received, which item?"* There was no answer —
`soiled_sent_to_wash`, `fresh_received` and `fresh_stock_in_hand` were one
number for bedsheets, pillow covers, mosquito nets and blankets together. Two
contractual things rested on it and neither could stand: Schedule C's **two sets
of washed bedsheets and pillow covers at all times** cannot be checked against a
single stock figure, and washing is **paid by item type** (curtains at the
mosquito-net rate), which a single dispatch figure can neither support nor
dispute. Migration **032** makes the register item-wise, and settles the
duplication behind it — `laundry_dispatch` had recorded the wash cycle properly,
per item and per vendor with the invoice, since stage 11. **One fact, one
writer:** the daily register holds what the supervisor counted (issued, on the
shelf), the laundry record holds what left and came back, and the daily page
shows and writes both without either being typed twice.

> **For production.** 032 creates `linen_daily_pre032`, a verbatim copy of
> whatever was in `linen_daily` before the change, because the three aggregates
> cannot be split into five item figures without inventing four of them. It is
> read by nothing. Keep it until the Railway is satisfied no old figure is in
> dispute, then it can be dropped.

**Clause C6 was recorded and never named, stage 24.** A consignment's age at the
laundry was printed as a grey aside past two days and nothing said what that
means. C6 — *failure to supply linen after washing beyond 48 hours* — is a named
breach in Schedule C, and the running room is the only place it can be seen at
all: nobody reviewing the month can know a bundle sat at the laundry unless the
day it went out is on record beside the day it came back. It is now flagged on
the daily linen page and counted on the laundry page, with the pieces still out.
Counted at strictly more than two whole days, so the flag is raised only where
the 48 hours have certainly passed. **RR-CMS records the fact and applies
nothing** — raising the deficiency remains the reviewing officer's act.

> **For the Railway to confirm.** The minimum-stock flag now reads Schedule C as
> **two sets per sanctioned bed**, for bedsheets and pillow covers. The screen
> prints that arithmetic beside the result rather than showing a bare flag. If
> the clause is read differently at your rooms — two sets per occupant, or a
> flat holding per room — say so; it is a setting, not a rule.

**Provisional admission, stage 23.** A running room could not file its first
muster, because every man on the roster arrives as `pending` and a pending man
cannot be marked present. The Railway now admits a site's roster
**provisionally** in one act — they may be marked present, and they stay flagged
as never screened, with a count, until each is screened properly. There is still
no bulk *approval* and there should not be. **The provisional count is the
Railway's worklist: it should be driven to zero as the six documents per man are
collected.**

**The audit log could not record account events — found and fixed on the first
live install, 20.08.2026.** `audit_log.action` was an ENUM written at stage 1
and never widened; `password_change`, `password_reset`, `unlock`, `activate` and
`deactivate` were all outside it, so MySQL truncated them, the audit service
warned, and the event was dropped. The first real password change on the first
real database went unrecorded. Migration **029** widens the enum. The demo never
caught it because its stub accepts any string — the third class of fault (after
column widths and foreign keys) that only a real MySQL can find.

**Mail and goods sheets, stage 22.** Two tabs on every call sheet. A goods room
opens on blank lines, because goods workings are on no timetable and there is
nothing to pre-fill; a goods row is accepted with a crew and a time and no train
number. Each room is marked once with the tab it opens on. A special turning up
between two booked trains can be slotted in with `+ row`, one blank at a time,
or typed on the last row with its time — either way it sorts into place.

**Crew boxes narrowed, stage 22.** Only designations 5, 6 and 7 are offered into
the Loco Pilot box and 1 and 2 into the Assistant box; the numbers are settings
in `src/config.js`, not schema. **Re-run `db/crtms/v_rr_crew_lookup.sql`** on the
division schema — it now carries `designation_id`. Until it is re-run the boxes
still work but cannot be told apart, and the log says so once.

**The call sheet, built at stage 21.** The call book is now a sheet on the model
of the control office's LPC daily sheet: the running room's own list of trains,
filtered to what runs today, ordered by sign-on time, with the LP and ALP keyed
into the row and the row opening the screen the bearer carries to the bed. The
list is seeded from the loco link by `node db/import-call-sheet.js` and can be
corrected by hand. Withdrawals and crew changes live on their own tab, carry a
reason and are kept. See PART SEVEN of AUDIT.md.

**The pilot rooms' trains are real.** Built from the division's own working
timetable summary and train master — 164 workings at Igatpuri, 128 at Lonavla,
58 at Roha, with real numbers, names, run days and times. Seed a database with
`node db/import-call-sheet.js --file data/pilot/call-sheet.json`, which needs no
CRTMS view and no grant. JNPT has none: it is not on the timetable, and the
screen says so rather than inventing one.

**Still to settle on the call sheet.** The sheet's direction is currently
decided per room by which end of the Mumbai link it sits on — boundary rooms get
UP. When Bhusawal and the other divisions come on, rooms that serve two
divisions' crews will need both directions loaded, and somebody has to decide
per room which is right. The import already takes `--direction BOTH`; what is
missing is the Railway's answer for each site.

**The call book, rebuilt at stage 20.** A call is now what the lobby actually
makes — one train, a sign-on time, and the men booked for it — with each man
acknowledging by pressing his own name at the bed. The time is stamped by the
server, so it cannot be typed or written up at the end of the shift. Three
outcomes are carried (acknowledged, refused, not in the running room), the
advice to the lobby is recorded per man with its time, and the repeat-back to
the lobby is held until every man on the call is settled. Signature-on-glass is
designed for and left as a later option. See PART SIX of AUDIT.md.

**The twenty-minute lateness rule, removed at stage 20.** The tender prescribes
no lead time in minutes; the figure was invented in this codebase and was
labelling calls "Late — C5" on that basis. Schedule C item 6 needs both limbs —
served late **and** the man late on duty — and that is now what is counted.

**The signed feedback register, built at stage 19.** The tender asks for grading
feedback on a *physical register signed by the occupant*, not a form, and puts
the grading penalty on the average from at least 50% of the occupants. That
register can now be keyed page by page at `/feedback/register`, with the signed
page attached, and signed entries are counted **separately** from QR feedback —
it is the signed count the 50% floor is tested against, because a deduction
resting on unsigned feedback is one the contractor can argue with. The
contractor's own supervisor is deliberately barred from keying it.

**`feedback_coverage` was read in seven places and written by none — fixed at
stage 19.** The dashboard, the running room sheet, three reports, the monthly
certificate and the grading screen all read that table and nothing wrote to it,
so the 50% condition on the grading penalty had never actually been applied to
anything. It is now computed and kept whenever feedback arrives or the occupancy
figure is entered, with a recompute button for a whole month. See PART FIVE of
AUDIT.md.

**The CCTV register, built at stage 17.** Cameras by place, with a daily check
that asks separately whether each was working and whether it was recording —
that second question is the failure that matters after the event. Cover is
judged by place, not by a count: one working camera covers the kitchen. A room
with no meal facility is not in breach for having no kitchen camera. A camera
nobody looked at is left alone rather than written as working, and taking one
off the register needs the Railway and a reason, because it reduces the cover
the contract requires.

*Deliberately not built:* no stream address and no live picture. An address that
reaches a camera carries the credentials that reach it, and a tile showing a
picture invites the belief that the system is watching when all it can honestly
say is what somebody last verified.

**The non-approved laundry rule, built at stage 17.** Dispatches to an
unapproved washing centre — and dispatches naming no centre at all, which is the
same breach — are now counted and called out as a clause C1 matter, with a link
to raise it from the inspection checklist. Still no rupee figure: the amount
waits on the schedule with everything else.

**The reliever, decided 18.08.2026.** A reliever must come from the running
room's own roster and must name whose post he covered, chosen from the people
marked absent or on leave there that day. A substitute sent in from outside the
roster cannot be marked at all — he has to be screened and taken on first. Built
at stage 15 and enforced by the server, not only by the form. One refinement
made while building it: a man the Railway has not yet screened is posted as
absent by the muster because he cannot be marked present, and he is deliberately
**not** offered as somebody who can be relieved. His post was never one he was
permitted to work, and "covered" would paper over exactly that.

---

## Before crtms.in — do not deploy without these

**These are now a one-page checklist at `deploy/GO-LIVE.md`**, which is what
should be worked from on the day; what follows is the reasoning behind each
line. Also new, and all of it previously missing: `deploy/rrcms.service` (a
working systemd unit — `INSTALL.md` had pointed at this file for weeks and it
did not exist), `deploy/nginx-rrcms.conf` for TLS, and
`deploy/env.production.example`. `INSTALL.md`'s verification numbers were
28 stages stale — it promised *42 pages, 39 clean, 12 passed* against today's
310 and 68, so anyone following it would have concluded a healthy install was
broken.

**The restore had never been rehearsed.** `tools/restore-check.mjs` now does it:
it restores into a scratch database, checks the schema is level with the code,
that the registers came back with rows, and that **every document the database
refers to is present in the restored uploads** — the failure the install notes
warned about and no dump can show on its own. Proved to bite: with a file row in
the dump and the document absent from the archive it fails, and passes when the
document is there.

**And `SESSION_SECRET` is now checked for length, not just presence.** A secret
that exists is not the same as a secret worth having, and the value typed in a
hurry on deployment day is the one worth refusing.

Recorded 20.08.2026, at the first live install.

**1. Database credentials.** The `.env` used for local development carries a
personal MySQL account and a development password. Production needs a
**dedicated `rrcms_app` user with a real password**, holding rights on `rrcms`
only, plus `SELECT` on the four `bbtro` views and nothing else. You will already
be using a privileged account there, because you have to run `CREATE DATABASE` —
do the grants in the same session.

**2. `PUBLIC_BASE_URL` is empty.** It is printed on the crew feedback QR
posters. If it is blank or `localhost` when the posters are printed, every
poster at every running room is dead paper and the feedback never arrives.
Set it to an address a crew member's phone can actually reach, **before**
anything is printed.

**3. `SESSION_SECRET`** must be a fresh random value on the server, not the
development one. Sessions signed with a known secret can be forged.

**4. The four `bbtro` views must be created and granted** on the production
schema: `v_rr_crew_lookup`, `v_rr_crew_contact`, `v_rr_train_lookup` and — if
the call sheet is to be re-imported from the loco link rather than the supplied
file — `v_rr_call_sheet`. Until then the lookups fail soft and every crew name
is typed.

**5. HTTPS.** The camera capture used for screening documents, the daily joint
checklist photographs and the signed feedback page will not work over plain
HTTP on a phone. The browser refuses it.

**6. MySQL root is not known on the production server.** Recoverable over SSH,
but find out before deployment day rather than during it.

## How it will be deployed — settled 31.08.2026, from the server itself

**`crtms.in/rrcms`, standalone process, its own `rrcms` schema.** Not a separate
site and not inside CRTMS's process — a fourth backend behind the reverse proxy
that already serves CRTMS and the Python applications.

**The shared-database question is closed, on evidence.** `bbtro` already carries
its own `users` and `sessions` tables; RR-CMS creates both. Two applications
writing to each other's authentication tables is not a rename problem. bbtro also
holds 153 tables serving four applications, and it is Mumbai division's schema
while RR-CMS covers all of Central Railway. RR-CMS keeps `rrcms` and reads bbtro
through the narrow granted views in `db/crtms/`.

**The address is the one irreversible decision**, because it is printed on the
crew feedback QR poster at every running room. `crtms.in/rrcms` survives the
later move into CRTMS's own process — the URLs do not change — whereas a
subdomain would make every printed poster dead paper on the day of that move.
`APP_BASE_PATH=/rrcms` from the first day, and never changed. **Settle the
address first, print last.**

> **The nginx trap.** The existing `/counselling/` block uses
> `proxy_pass http://127.0.0.1:5003/;` — the trailing slash makes nginx STRIP
> the prefix, and the Python app never sees it. RR-CMS is the opposite: with
> `APP_BASE_PATH=/rrcms` it mounts its own router at that path and needs the
> prefix to arrive intact. Its block must be `proxy_pass http://127.0.0.1:3100;`
> with **no trailing slash**. Copy the neighbouring pattern and every page 404s.

**PM2, not systemd.** The server runs `pm2-railway.service`; RR-CMS becomes a
fourth PM2 process on port 3100 rather than the only systemd unit on the box.
`deploy/rrcms.service` still ships for anyone standing it up elsewhere.

**The kit is now written for that machine, not for a generic one:**
`deploy/ecosystem.config.js` (PM2, with `max_restarts` set so a process that is
correctly refusing to start does not become a restart loop nobody reads),
`deploy/nginx-rrcms-location.conf` (the block to paste into the existing
`crtms.in` server, with the trailing-slash trap spelled out at the top), and
`deploy/GO-LIVE.md` rewritten around real paths, real ports and the real state of
that server — including that **nothing on it is backed up**, which is Part 0.
The posters are Part 8, deliberately last: everything else is reversible in an
afternoon and paper on a wall at four running rooms is not.

**The server as it stands (31.08.2026):** Ubuntu, nginx 1.24.0, Node 24.14.1,
**MySQL 8.0.46** — not MariaDB, which is what this project's own checks run
against, and which has already caught two faults that only a real MySQL refuses.
48 GB disk with 32 GB free. `client_max_body_size 50M` already set on the
`crtms.in` server, which covers phone photographs. Certbot holds the certificate
for `crtms.in`, so a path costs nothing and a subdomain would need a new one.

> **NOTHING ON THAT SERVER IS BACKED UP.** `/etc/cron.d/` carries certbot,
> e2scrub and sysstat and no `mysqldump` anywhere. bbtro — 153 tables, CRTMS and
> three applications — has no database backup at all. This is not an RR-CMS
> problem and it exists today whether or not RR-CMS ever ships, but it is the
> largest single risk on the box and it should be fixed before a fourth
> application is added to what would be lost.

## Decisions the Railway has to take

**What clause B1 means, given that meals are served on demand (21.08.2026).**
The Railway has confirmed the running rooms keep **no fixed meal timings** —
crew eat when they wake and food is served on demand. B1 penalises *failure to
prepare and serve food in time* at ₹200 per case, and with no scheduled window
there is nothing for "in time" to be measured against. Either the tender means
the wait after a man asks — in which case somebody has to start timing it, and
the register has to be told what an acceptable wait is — or B1 in practice means
food not being available at all, which the crew feedback and the complaint book
already catch. **Until this is read against the tender's own words, no timing
check should be built**: a schedule invented to make a flag work would produce
deficiencies against the contractor that the contract does not support.

**The identity card, and who makes it (21.08.2026).** An officer has said the
**contractor** will make cards for his own staff and supply them, rather than
RR-CMS printing them. Parked until that is confirmed. Two things wait on it:
whether the ID card screen stays at all, and the **staff code format** — the
application generates `CS00064` while the pilot loader generated `RR019-00063`,
and both are in the table today. The format is worth settling only once it is
known whether the number appears on a card the Railway issues or one the
contractor prints.

**Who may register and check a CCTV camera.** *Raised at stage 17.* Registering
a camera and recording a check are both open to the contractor's supervisor and
the RR In-charge, on the reasoning that the contractor installs and the site
verifies. Taking a camera off the register is already the Railway's alone. If
the Railway would rather the check itself were its own — the state of the
cameras being evidence against the contractor — that is one permission line.

**Who may supply the photograph on an identity card.** *Raised at stage 10b.*
Today the contractor's supervisor and the RR In-charge may both take or upload
it. The question is whether a photograph going onto a Railway identity card
should originate with the contractor at all, or be taken by the Railway, or be
taken by the contractor and confirmed by the RR In-charge. Left as it stands
pending the Railway's view.

**Whether the divisional officer may attach a document.** *Raised at stage 11.*
The officer may approve screening but cannot attach a document to a staff
record. So a police verification handed over during an inspection has to go back
to the site to be lodged. That may be right — the contractor supplies, the
Railway verifies — or it may be an obstruction. Easy to change either way.

---

## Work deferred, with the reason

**The meals register — walked at stage 24, left as it stands, three faults on
record.** It does the thing that matters: one tick per man per service, so a
monthly meal count stops being a figure the contractor supplies and nobody can
check. What it does not yet do:

1. **`meal_services.taken_at` is not the time the man was served.** It is set to
   `NOW()` when the tick is made, which is what `recorded_at` already holds — so
   the column duplicates its neighbour and adds nothing. Worse, a register filled
   this morning for yesterday's meals writes today's timestamp onto yesterday's
   `service_date`: a timestamp that contradicts its own date. This is the same
   shape as `staff.photo_file_id` (dropped in 030) and `feedback_coverage` — a
   column that looks like a fact and is not one. It should either hold the real
   service time or be removed. **One line either way; deliberately not fixed
   without deciding which.**

2. **Clause B1 has nothing behind it. CORRECTED 21.08.2026 — it could have.**
   *Failure to prepare and serve food in time*, ₹200 per case. This entry first
   said B1 could not mean "late against a schedule" because the running rooms
   keep no fixed meal timings. **Reading the tender itself showed that wrong.**
   Schedule B, section C sets out: breakfast **07:00–10:30**, lunch
   **11:00–15:00**, dinner **19:00–23:00**; lunch or dinner outside those hours
   **within 30 minutes of the order**; a parcel **within 45 minutes of the
   order**. So the on-demand answer was right about *when* food is available and
   the tender adds the thing that makes B1 measurable: **a clock on the wait.**
   The Railway has decided not to record order times — thirty timings a day from
   a man already keeping five registers, and a figure nobody really took is
   worse than none. So B1 stays a review-screen tick, **now by choice rather
   than for want of a rule.** If it is ever to be enforced, what has to start is
   the bearer noting the time the man asked, and the honest scope is the one the
   tender puts a number on: outside the standard windows, and every parcel.

3. **Nothing reconciles the register against the contractor's claim.** The
   module's stated purpose is to make the monthly count checkable, and it stops
   one step short: the contractor's claimed figure is never entered beside what
   the register holds, so nobody is shown the difference. Left undone on purpose
   — the billing count officially lives in RRMS, and putting a second claimed
   figure into RR-CMS needs the RRMS boundary settled first (see P8).

Also true, and not a fault: the list of people to tick is built from the call
book, so a crew who rested without being called must be added by name. Occupancy
is RRMS's register, not this one.

**The five half-built parts of the schema are done** — bills, staff grading, the
joint asset register, vendor approval, and the weekly and monthly deficiency
clauses. Built at stage 18; see AUDIT.md, Part Four. The remaining gaps against
the contract are listed in AUDIT.md Part Two, the largest being the daily
cleaning record and the wages/EPF/ESIC register.

**Reworking the call book.** *Raised 19.08.2026.* It is the register the whole
clause C5 case rests on, and it is to be gone through properly rather than
patched further. The train lookup landed at stage 16; the rest — bed allotment
against the entry, the crew's signature, the booked-on-duty time the tender
turns on, and what a whole shift's calls should look like on one screen — is to
be worked out together before anything more is built into it.

**Narrowing who may record a linen stock count.** *Decided 19.08.2026, to be
done later.* Today the contractor's supervisor and the RR In-charge both hold
`stay.manage` and either may record a count. That is deliberate while the
opening stock is being established, because the contractor is the one who can
actually count what is in the almirah and the Railway has no figures at all.
Once the stock is on record, counting becomes the RR In-charge's alone: the
linen is the Railway's property and "45 unaccounted" is a figure that may end in
a recovery from the contractor's bill, so he should not be the one writing it.
One line in the route when the time comes — `requirePermission('stay.manage')`
becomes a Railway-side permission.


**The penalty and bill computation.** Held back since stage 6 because the
penalty schedule is still under review. Every deficiency, shortfall and man-day
is being captured; no rupee figure is computed or printed anywhere. When the
schedule is settled the amounts are worked out from records that already exist,
and nothing has to be re-entered.

**Bulk import of staff rosters.** The four pilot sites were loaded from a JSON
file that can be edited by hand. A proper import screen becomes worthwhile at
the point a whole division comes on, not before.

**A screen for linking typed crew to the staff master.** *Raised at stage 13.*
Train managers are recorded by name with their CMS number where it is known.
Those numbers accumulate, and the day the traffic branch has a master on CRTMS
they can be matched to it. The `crew.link` permission exists and is granted to
the RR In-charge and the divisional officer; the screen that would use it does
not yet, because there is nothing to link to. Worth building when there is.

---

## The order to take the deferred work in

Agreed 19.08.2026: all of it will be touched. This is the sequence, once the
four rooms are actually running.

1. **The call book**, worked out together before anything more is built into
   it. It is the register the contractual case rests on and it deserves an hour
   of the Railway's time, not another patch.
2. ~~The CCTV register~~ — built at stage 17.
3. ~~The non-approved laundry rule~~ — built at stage 17.
4. **Narrowing the linen stock count** to the Railway, once opening stock is in.
5. **The penalty and bill computation**, when the schedule is settled — this
   one is gated on the Railway, not on the software.
6. **Bulk roster import** and **crew linking**, when a whole division comes on
   and when the traffic branch has a master respectively.

Which leaves the call book as the only substantial thing waiting on us, and it
is waiting on a conversation rather than on time.

---

## The IGP contract, received 02.09.2026

`GEM-511687722391404-28082026.pdf` — the executed GeM contract for **IGP**,
handed over by the officer. 108 pages.

| | |
|---|---|
| Contract | GEMC-511687722391404 · bid GEM/2026/B/7412878 · generated 28.08.2026 |
| Contractor | PRABHAKAR ENTERPRISE · GSTIN 24AMTPS4727K1ZC · UDYAM-GJ-06-0008530 · Ankleshwar, Bharuch |
| Period | **10.09.2026 to 09.09.2028** |
| Value | Rs 8,08,52,475.88 including all duties and taxes |
| EMD | Rs 5,89,900 · ePBG 5% for 30 months · SBI |
| Buyer | Sr. DEE/TRSO/CSMT, Mumbai Division · billed monthly |

**Prabhakar Enterprises holds BOTH ROHA and IGP** — confirmed by the officer
02.09.2026. The pilot loader had them at ROHA only and had Oriental Security
Services at IGP. **Corrected in the data on 02.09.2026** — `data/pilot/contractors.json`
now carries PRE at both sites with the GSTIN, UDYAM number, phone and email off
the contract, so re-running the loader can no longer put the old firm back.
Oriental Security Services holds nothing and is stood down.

**The ROHA references inside this IGP contract are a typing error** — confirmed
by the officer, who is leaving them as they stand for now. Part-A (p.66) and the
price schedule (p.88) say IGP; the housekeeping row (p.67) and the whole of
Part-E on linen washing (pp.82–84) say ROHA, read as an annexure reused from the
ROHA tender. Recorded here because it is an executed contract and the mistake
now exists on paper: if a linen dispute at IGP is ever argued, Part-E names the
wrong running room.

**Two things this contract states that RR-CMS has no concept of** (p.58):
- *"The maximum applicable penalty for this work is 10% of contract value."* A
  CEILING on all penalties combined. RR-CMS records deficiencies and totals
  nothing, so nothing today would stop a schedule of deficiencies exceeding it.
  This has to be part of the penalty module whenever that is finally built.
- A performance-guarantee forfeiture ladder: penalties above 50% of the maximum
  forfeit 25% of the PG, above 75% forfeit 50%.

**The performance guarantee is stated twice, differently** — 5.00% in the GeM
header (pp.9, 15) and 3% of contract value in conditions clause 2.5 (p.58). With
the officer.

**The penalty schedule itself is NOT in this document.** It is a separate GeM
attachment, `Penalties:1775150840.pdf`. The 50 clauses seeded in
`db/seeds/02_deficiency_clauses.sql` came from the earlier tender paper, and
nobody has yet confirmed they are the schedule that was actually executed. **Ask
for that file.**

### What the contract supplies that the Railway previously owed

- **Manpower at IGP, as contracted:** Canteen Supervisor 2, Head Cook 3, Cooks
  15, Kitchen Helper 15, Table Boys 15, Utensil cleaner 15, Running room bearers
  15, Housekeeping 25, Security guards 2 — **107 posts**, for five blocks. Worth
  comparing against the sanctioned strength RR-CMS derived from the Schedule-A
  bands; a difference is a finding either way.
- **Linen quantities for two years:** bed sheet 365,000 · pillow cover 182,500 ·
  mosquito net 17,680 · curtain 12,000 · mattress cover 8,160 · woollen blanket
  4,000 · blanket cover 9,600.
- **Meals:** lunch, dinner and parcel 200 a day; breakfast and parcel 100 a day.
- **Annexure C, in full:** Times of India / Indian Express (English), Lokmat /
  Gavkari (Marathi), Navbharat / Maharashtra Times (Hindi) — one daily each, 90 a
  month; India Today (Hindi), monthly, 2 copies, 48 over two years. This is the
  Schedule D newspaper detail recorded as missing at stage 28.
- RO plants 500 LPH x1 and 250 LPH x1 · cots and mattresses 10 sets per six
  months · pest control every two months over approx 53,010 sq ft · foot massager
  2 · shoe polish machine 4 · profit 3.85% on the basic manpower rate · bonus
  8.33% capped at Rs 7,000 a month.

## IGP's establishment, from Part-A — recorded 02.09.2026

**RR-CMS held the wrong establishment for IGP, and it fed a contractual figure.**
Sanctioned strength is derived from Schedule-A's bed bands — right for a running
room whose contract nobody has read. IGP's has now been read, and Part-A
(pp. 66-67) states the establishment directly: **107 men a day across nine posts,
for the five blocks IGP is entered as.** The monthly certification pack computes
man-days *due* against man-days *present*, so a norm-derived "due" against a
contract that bought something else produces a shortfall figure that is wrong on
a document going to an officer.

`db/seed-igp-establishment.js` sets it, idempotently. The derived figure stays in
`norm_count`, `is_overridden` is set and `override_reason` names the contract, so
the difference is on the record rather than quietly replaced. The running room
page prints both columns and marks which posts the contract governs.

**Three posts had nowhere to sit, and one carried the wrong skill category**
(seed **12**):

| Contract Part-A | | What we held |
|---|---|---|
| Kitchen helper, 15, **semi-skilled** | new `kitchen_helper` | nearest was `asst_cook`, unskilled |
| Running room bearer, 15, unskilled | new `rr_bearer` | `table_boy` was named "Table Boy/Bearer" and stood for both cadres — 30 men on one post |
| Housekeeping staff, 25, unskilled | new `housekeeping` | `sweeper` is a Schedule-A post, not the same word |
| Table Boys, 15, **semi-skilled** | `table_boy` re-banded | we held them unskilled |

**Skill category is the minimum-wage band**, and the wage register records what
each man was paid. Holding a semi-skilled man as unskilled understates what he is
owed.

> **What the comparison then showed, and it is for the officer.** The executed
> contract is **below the Schedule-A norm on two posts** — Supervisor 2 against a
> norm of 3, Security Guard 2 against 3 — and **does not buy five posts the norm
> sanctions at all**: Manager 1, Asstt. Cook 9, **Call Boy 6**, Gardner 1,
> Sweeper 4. Sanctioned strength at IGP therefore reads 128 while the contract's
> Part-A total is 107, and those 21 posts will show as vacant for the life of the
> contract because nobody is engaged to fill them.
>
> The Call Boy line is the one to look at first: six sanctioned, none bought. The
> function is not abandoned — Part-A gives "serving of call book" to the Running
> room bearers — but the establishment and the contract disagree about who does
> it, and the call book is the register the contractual case rests on.
>
> Left exactly as they are. This is a question for the officer, not an error to
> be tidied away by a loader.

## Data the Railway still owes

For the four pilot running rooms — IGP, LNL, ROHA, JNPT:

- **The FSSAI licence for each of the four kitchens.** All four show as
  unlicensed. The IGP certificate was mentioned but has not arrived. Each Form C
  should stand in the name of the firm holding that site: **Prabhakar
  Enterprises at BOTH IGP and ROHA**, Piyush Traders at LNL.
  *Corrected 02.09.2026 — this line named Oriental Security Services at IGP,
  which was the pilot loader's figure and is wrong. The executed contract names
  PRABHAKAR ENTERPRISE. An FSSAI licence chased in the wrong firm's name is
  worthless, which is why this line is worth correcting rather than deleting.*
- **The agreements** — number, LOA date, period, security deposit and
  performance guarantee. All four carry `AGREEMENT-AWAITED/…` and an assumed
  2025–27 period. One search for `AGREEMENT-AWAITED` finds every record. Since
  stage 29 these can be typed in as they arrive, one site at a time, at
  `Contractors → Record an agreement` — the loader is no longer the only way.
- **JNPT's sanctioned beds, rooms and category**, and its contractor once the
  contract is finalised. The record is marked PROVISIONAL and its contractor is
  a named placeholder.
- **M/S Piyush Traders' address.**
- **The three lookup views on CRTMS, and their grants.** One step for the DBA,
  per division — crew, crew contact number, and trains. See `db/crtms/README.md`. Until it is done, every crew name is
  typed, and every train number too — which works, but throws away two
  identifications that already exist.
- **The Supervisor, Call Boy, Security Guard, Gardner and Sweeper rosters.** The
  three lists supplied are catering staff only; those posts are sanctioned at
  every one of these sites and show as vacant.
- **Joining dates, bank, EPF and ESIC particulars, and the six screening
  documents** for the 63 people loaded. They can now be entered on each person's
  record; none has been invented.

---

## Known constraints, not faults

**The camera needs HTTPS.** Browsers only permit camera access over HTTPS or on
the machine itself. Taking a photograph or photographing a document will be
refused the day this is reached over plain `http://` on the Railway network. The
control says so plainly rather than failing silently, and the file box still
works. An argument for TLS at deployment, which INSTALL.md already recommends.

**A typed crew name is not an identification.** *Raised at stage 13.* Where the
division staff master is wired up, a crew picked from it is linked by `hrms_id`
and the identification is exact. Everyone else — train managers, who are on the
traffic branch's books and not the running staff master; crew booked in from
other divisions and other railways — is a name somebody wrote at a counter, and
two different men called "S. Patil" without a CMS number will share one record.
The register marks every row with which of the two it is and the call book says
so on screen, so nothing is passed off as more than it is. The remedy is the
CMS number, which the running rooms should be asked to write.

**Bed allotment, the occupancy register and meal accounting stay with RRMS.**
Not duplicated here by design. Occupancy is typed in monthly where it is needed
for the feedback coverage floor.

---

## Stage 36 — the whole contract, in one pass

**02.09.2026.** The officer asked, for the fourth time, whether the new contract
was reflected on the site. Each earlier answer had fixed one table. That was the
wrong shape of answer, and the fault behind all four was one fault:

> **Every reference table in RR-CMS was seeded from the earlier, generic tender
> paper for Central Railway running rooms. The executed contract for a
> particular site is a different document with different numbers.**

Nothing showed as an error. Every page rendered, every figure was formatted, and
every one of them was the wrong figure for that running room.

### What the whole 108 pages were read against, and what changed

| Table | Generic paper | IGP's contract | Now |
|---|---|---|---|
| Contractor | Oriental Security Services | **Prabhakar Enterprise** | corrected in `contractors.json` |
| Agreement | `AGREEMENT-AWAITED/`, assumed 2025-27 | GEMC-511687722391404, **10.09.2026 – 09.09.2028** | entered, with value, ePBG, buyer, paying authority |
| Price schedule | nowhere to put it | 28 lines, Rs 8,08,52,475.88 | `contract_line_items`, shown on the agreement screen |
| Penalty clauses | 50, coded A1..M12 | **31, lettered (a) to (ee)** | both held; the contract's used at IGP |
| Cleaning schedule | 9 rows | **17 rows** | both held; the contract's used at IGP |
| Meal ceilings | 62.37 / 37.80 | **64.74 / 58.26** | both held; the contract's used at IGP from 10.09.2026 |
| Newspapers | "one popular Hindi newspaper" | **named titles**, India Today monthly | both held; the contract's used at IGP |
| Manpower | bed-band norm | 107 across nine posts | fixed at stage 35 |
| Linen | flat 48 hours | per-item delivery periods | fixed at stage 34 |

### The mechanism

Every one of those tables now carries a nullable `contract_id`. **NULL means the
fallback**, used at any running room whose own contract nobody has read; a value
means that contract says otherwise. `src/services/contract-terms.js` holds the
rule, and it is one rule:

> If a running room's contract has rows of its own in a table, **those rows are
> the whole answer** for that room. The generic rows are not merged in
> underneath. A contract that names 31 penalties names 31.

Consumables are the exception that proves it: a contract names its newspapers
and says nothing about dustbins, so the rule is applied **per category** there.

`deficiency_clauses.supersedes_code` handles the three places that raise a
deficiency against a clause code written into the code — intoxication as A3,
late wages as M5, the standing obligations as D3/D4/M12. At IGP, `A3` now
resolves to the contract's clause (b): Rs 500 per case, not the generic
Rs 1,000 per labour per case. Where the contract is silent — it says nothing
about late wages — the generic clause is used, and that is right rather than a
fallback: a site penalty list is not the whole of the contract conditions.

`test/contract-scoped.js` fails the build if any route reads one of these tables
without scoping it.

### Still open on this contract

- **Bed sheets: 365,000 or 365,200.** Table-A of Part-E says 365,200; the
  Schedule of Quantities (NS-20) and the GeM line item both say 365,000. RR-CMS
  holds the minority figure. **Two sources against one — for the officer.**
- **Annexure-A, the cleaning materials list, is not in the 108 pages.** Part-B
  prices "cleaning materials as per annexure-A"; the Annexure-A printed in the
  document is the Undertaking Certificate. **Ask the officer for it.**
- **NS-7 says "Running room bearer — 25 Nos. per day"** against a quantity of
  10,950, which is 15 a day. The scope table and the GeM line item both say 15.
  A typing error in an executed contract.
- **NS-12 places the RO plant "at LNL BVT & GHAT running room."** The GeM line
  item and the scope both say IGP. Another typing error.
- **Part-E is headed ROHA throughout.** Confirmed a typing error by the officer,
  left as it stands. If a linen dispute at IGP is ever argued, Part-E names the
  wrong running room.
- **Night-only posts.** The two security guards are night time only per the
  Schedule of Quantities. RR-CMS has no way to record a post as night-only.
- **PG 3% (clause 2.5, p.58) against ePBG 5% (pp. 9, 15).** Unresolved.
- **The PG forfeiture ladder** (2.4: penalties past 50% of the maximum forfeit
  25% of the PG, past 75% forfeit 50%) and the 10%-of-value additional PG have
  no home in the system.
- **Staff experience requirements** — Hotel Management degree with 3 years in a
  3-star hotel for the supervisor, 25% of staff with 3 years' railway
  experience, 50% with 2 years. Nothing records these against a man.
- **Approved food brands (clause 49) — HELD NOWHERE, to be built next.** The
  contract names eight food items and the brands allowed for each: Aata
  (Ashirvad, Patanjali, Silver Coin, Makhan Bhog, Fortune); Oil (Fortune
  Sunflower, Sunrise, Gold Winner, Dhara mustard, Patanjali mustard, NG Brand
  mustard); Masala (MDH, Everest, Goldi); Rice (Kohinoor, 45, India Gate,
  Fortune — basmati); Tea (Tata Tea, Taj Mahal, Red Label, Society); Coffee
  (Nescafe, Bru); Milk (Amul, Gokul, Varana); Curd (Varana, Amul Masti, Mother
  Dairy, Milky Mist).

  The raw-foodstuff quality register (stage 36) records the seal, the FSSAI mark
  and the crew signature, but takes the **brand as free text** — so the clause is
  half-provable: nothing on the screen knows what the contract allows. The shape
  to build is the one the asset catalogue already uses: the eight items and their
  brands seeded from this contract, a pick-list on the foodstuff screen with
  **"not on the approved list"** as an explicit, flagged choice, and the RR
  in-charge able to add a brand — because the clause itself says the list is
  *tentative* and "Railway can change at any time ... based on running staff
  feedback".

  Note for the officer: this clause inside IGP's contract reads "at all location
  of running rooms at **LNL**" — the same mis-typing family as the ROHA/LNL slips
  elsewhere in the document. Worth getting corrected on paper before a review
  turns it into an argument.
- **Two days' washed linen stock — BUILT, and worth knowing where.** Part-E
  clause vii: "Contractor will make a stock of washed linens for at least
  consumption of 02 days". The daily linen register tests it on every save —
  `MIN_SETS = 2` against the room's bed count, so 262 at IGP's 131 beds — and
  the day is marked met, not met, or **untested** where nothing was counted.
  Untested is not a pass: a condition nobody checked is not a condition met.
  Two things about it are a judgement, not a reading, and should be confirmed:
  it is tested on **bed sheets and pillow covers** only, the two items changed
  daily, where the clause says "washed linens" generally; and "consumption of
  02 days" is taken as two per bed rather than two per bed *occupied*.

- **The 3-day return rule sits alongside the per-item table, and nothing
  reconciles them.** Part-E clause vi: "The permissible duration for returning
  washed linens will be not more than 03 day from the last delivery." The
  registers flag on the per-item periods instead — bed sheet next day, blanket
  cover seven. For a bed sheet the item table is stricter; for a blanket cover
  the 3-day rule is stricter, so a blanket cover back on day 5 passes today and
  would breach clause vi. Two periods for one act is the contract's own
  ambiguity, not the system's, and which governs is an officer's ruling — but
  it should be ruled on before a review turns on it.

### NEXT TASK — a help section, per role

Asked for by the officer on 4 September, and the reason he gave is the one that
matters:

> "a help section for each user role. what to do where and how to do, where to
>  find what etc. now even i have to open many links to find which is where and
>  i asked you for some earlier."

**If the officer who commissioned the system cannot find a screen without
hunting, no supervisor at 44 running rooms will.** He has asked where things
are more than once in this build — where linen is received, what "issued today"
means, who can edit Part B — and each time the answer existed and the screen
did not give it.

What it has to be, and what it must not be:

- **Per role, not one manual.** A contractor's supervisor needs "how do I fill
  the cleaning register" and nothing about verifying a month. An RR in-charge
  needs the verification and the screening. A division officer needs the
  deficiency review and the monthly pack. Showing a man instructions for work
  he cannot do teaches him the system is not for him.
- **What to do, where, and in what order** — the day's work as a sequence, not
  an A-to-Z of features.
- **Findable from where the question arises.** A link on each screen to the
  part of the help that covers it, not a manual he has to search.
- **Written from the contract, not from the UI.** "Clause vii wants two days'
  washed linen; the daily register tests it on fresh in hand" is worth more
  than "click Save".
- **Not a document to maintain in parallel with the code.** Everything in it
  should be derivable from what the system already knows — the role's
  permissions, the section list, the contract terms already seeded. A help page
  that goes stale is worse than none, because it teaches people the wrong
  screen with authority.

Suggested shape: one page per role at `/help`, built from the role's own
permission set so it cannot describe a screen the reader has no access to, plus
a "what am I looking at" line available from every screen. To be designed with
the officer before building — the sequence of a supervisor's day is his
knowledge, not mine.

### A running room may stand in more than one building (stage 56)

Settled by the officer, and it turned on one sentence he added:

> "remember one kitchen may serve for all. and staff may be inter changed.
>  for igp rr this is actually happening."

Igatpuri is **five buildings and one running room**. Splitting it into five
running rooms was considered and rejected: it would mean five kitchens where
there is one, five food licences where the FSSAI certificate names one
premises, a staff list cut five ways for men who move between buildings daily,
and a sanctioned strength derived band by band that sums to about **80 where
the contract says 107** — the bands are not linear, so splitting the site loses
27 posts on paper that the contract plainly sanctions.

`running_room_blocks` is derived in `seed-pilot.js` from the merge register
itself, so there is no hand-kept second copy, and the seed **refuses** if the
blocks do not total the running room's own beds.

| running room | buildings |
|---|---|
| IGP, 131 beds | LP Mail 44 · LP Ghat 23 · LP Goods 22 · BSL Guard 26 · BB Guard 16 |
| LNL, 72 beds | BVT 42 · Ghat 30 |

**Per building:** assets, CCTV, pest control, the cleaning register, linen
issue and stock, complaints and inspections.
**At running-room level, unchanged:** kitchen, meals, the food licence, staff,
manpower, wages, bills, and deficiencies against the contract.

**Done so far — assets only.** The building bar, the filter, the "no building
recorded" count, and the building on the add and edit forms. A block id posted
from another running room is refused and falls back to NULL.

**All wired.** assets (56) · cleaning and the weekly day (61) · linen, the wash
and the stock (62) · complaints and inspections (63) · CCTV and pest control (64).

**Six unique keys had to be rebuilt on the way**, every one of which would have
failed silently: `cleaning_log`, `cleaning_weekly_day`, `linen_daily_item`,
`linen_stock`, `linen_daily`, `inspections`. Each was keyed one row per running
room, so two buildings recording the same thing on the same day collided and the
second overwrote the first. And in each case the naive fix — dropping `block_id`
into the key — is the NULL trap that cost this project two rounds at
`linen_schedule`. All six now key over a STORED `COALESCE(block_id,0)`.

The two engines refuse that arrangement from opposite sides, so every one of
those tables carries its block foreign key WITHOUT a delete action:

- MariaDB will not build a generated column reading a column that belongs to a
  `SET NULL` foreign key (error 1901), and will not take a generated column in
  a PRIMARY KEY at all — hence the surrogate id on `cleaning_weekly_day`.
- MySQL 8 will not allow `SET NULL` or `CASCADE` on a table carrying a STORED
  generated column (error 1215, first met at stage 36b).

Nothing is lost by it: a block is stood down, never deleted.

**One fault was only findable by walking it.** The inspection form's "already
filed today" guard sent the inspector to the report he had already written, so
at a four-building running room, inspecting the first building made the other
three unwalkable for the rest of the day — and the screen showed a finished
report as though that were the answer.

> **A TRAP WAITING IN THE LINEN STAGE.** `linen_daily_item` is keyed
> `(running_room_id, record_date, item_type)` and `linen_stock` on
> `(running_room_id, item_type, as_on_date)`. Adding `block_id` to those keys
> puts a **NULLABLE column in a UNIQUE key**, and MySQL treats two NULLs as
> different values — so `ON DUPLICATE KEY UPDATE` silently becomes INSERT and
> the register quietly triples, exactly as `linen_schedule` did before
> migration 043. Use the same remedy: a STORED generated column
> `AS (COALESCE(block_id,0))` in the key. This is written down here because it
> has already cost this project two rounds once.

### Stage 36b — the fault the fix walked into

Tying IGP's linen rows to its contract failed, and **printed nothing**. Two
silent failures stacked on each other:

1. **`linen_schedule` had 24 rows where it should have had 8.** Its unique key
   was `(item_type, contract_id)` with `contract_id` NULL on every row. **MySQL
   treats two NULLs as different values in a unique index**, so the seed's
   `ON DUPLICATE KEY UPDATE` never fired — every `node db/migrate.js seed` since
   stage 34 appended a fresh copy of all eight rows. Three seed runs, three
   copies.

2. **A `.catch()` in the seed script swallowed the resulting duplicate-key
   error** and printed a zero.

Neither had a visible symptom. The laundry screen builds its lookup keyed on
`item_type`, so three identical bed-sheet rows collapse into one correct answer,
and the delivery periods on screen were right the whole time.

**Migration 043** de-duplicates and re-keys on a stored generated column,
`AS (COALESCE(contract_id,0)) STORED`, so NULL can no longer mean "a value
unequal to itself". `bills.uq_bill` had the identical trap on
`running_room_id` — not yet sprung, because no bill has been entered — and is
fixed the same way.

**043 failed on the production server after passing here**, with
`Cannot add foreign key constraint` — error 1215, naming no statement. The cause
is narrow and worth recording: **adding a STORED generated column forces MySQL
to copy the table, and MySQL 8 will not put an `ON DELETE CASCADE` or
`ON DELETE SET NULL` foreign key on a table that carries one.** MariaDB accepts
both. So the migration now drops the affected constraints and rebuilds them
plain, and two behaviours change on purpose:

- deleting a contract that has linen rows is **refused** rather than silently
  taking the rows with it
- deleting a user account referenced by a bill is **refused** rather than
  blanking who checked or passed it

Both are the better half of the trade for a system whose purpose is evidence. A
contract here is stood down, never deleted; a user is deactivated, never
deleted. A DELETE that quietly removed a contract's transcribed terms would
destroy the record; one that is refused asks a question.

**The engine difference is why a real MySQL 8.0.46 now runs alongside MariaDB
for testing.** MySQL and MariaDB disagreed four times in one afternoon — where
`COMMENT` may sit on a generated column, whether `NOT NULL` is allowed there at
all, and twice on foreign keys — and each disagreement reached the production
server instead of being caught here. Migration 043 is verified on both.

**`tools/schema-check.mjs`** is the guard, and it runs against the real
database rather than parsing the migration files. The first attempt did parse
them, with a regular expression, and reported nine faults of which four were
multi-line ENUM columns it had misread. A check that cries wolf trains you to
skim past it. Four unique keys really do cover a nullable column **on purpose** —
the "unique when present" idiom — and the tool names each with its reason.

Neither MySQL nor MariaDB will take the same generated-column syntax: MySQL 8
accepts `NOT NULL` there, MariaDB rejects it outright, and they disagree about
where `COMMENT` may sit. The column is declared without either, and the tool
reads the generation expression instead of the nullability flag.

**IGP's linen now has its own seven rows** rather than riding the fallback. When
ROHA's contract arrives and its delivery periods differ, that fallback has to
change — and if IGP were still riding it, IGP's contractual terms would silently
change with it. That is the same fault this whole stage exists to close.

### Stage 36e — 87 beds that had quietly gone missing

Reported from the screen: the contractor page showed **IGP twice**, and the two
rooms totalled **108 beds**. Both were symptoms; one of them was serious.

**IGP was carrying 44 beds instead of 131, and LNL 42 instead of 72.**

The pilot merges Igatpuri's five register entries — LP Ghat, LP Mail, LP Goods,
BSL Guard, BB Guard — into one running room, and Lonavla's two. Two things had
to be true together for that to hold, and both quietly stopped being true:

1. `db/seeds/03_running_rooms.sql` carries the register's own figures and resets
   `total_beds` and `physical_rooms` on **every** `node db/migrate.js seed`. It
   always did.
2. `db/seed-pilot.js` looked the survivor up **by name** and skipped the merge
   entirely if a room already carried the merged name — which, after the first
   run, it always did.

So each seed run put IGP back to its 44-bed register entry, and the merge, seeing
a room called "IGP", declined to repair it. **Step 4 of the stage-36 install
reverted both sites and step 5 declined to fix them.** Nothing reported anything.

That figure is not cosmetic. Beds are the denominator of the 50% feedback floor,
the multiplier for linen per bed, and the input to the Schedule-A bed band. IGP
was reading against 44 beds and banding at 50 where it should band at 150.

**The fix:** merges are keyed on **register code**, which never moves, and are
**re-applied on every run** rather than skipped. Each merge now reports
`(REPAIRED — was …)` or `(unchanged)`, because a step that silently re-applies
the same figures is indistinguishable from one that has stopped running — which
is exactly how this hid.

The survivor's own contribution comes from `survivor_register` in
`data/pilot/sites.json`, not from the database: the merge writes the combined
total **into** the survivor, so re-summing its current row adds the parts to a
total that already contains them. A third run took IGP from 131 to **218**. If
`db/seeds/03` is ever corrected and `sites.json` is not, the loader now stops
rather than writing a stale total.

Both IGP-specific scripts also resolve the site by code `RR013`. Two register
entries are named "IGP" — RR013 in Mumbai division and RR020, a 67-bed entry in
Bhusawal — and the previous tie-break ("the one with more beds") would have
picked **the wrong division's running room** on any database where the merge had
reverted.

### And the duplicate row

`contract_running_rooms` held two links for the same contract and the same room:
one 2025-04-01 → today, one from the real contract start. The loader looked only
for an **open** link and inserted when it found none, so a closed link left a
second row behind. Two rows for one room under one agreement is not history — it
is noise. History is a link to a *different* contract, and that is kept.

The contractor screen selected the running room with **no filter on the link's
dates at all**, so both showed, with nothing to say which was which. It now shows
**one row per room per agreement**, carrying that link's own dates, the agreement
it belongs to, and that room's roll against its sanctioned strength — because a
contractor holding four rooms under one expiry date and one staff total tells an
officer nothing he can act on. Closed links are shown below the live ones under
*No longer held*. Header counts are over **distinct** rooms held today; counting
link rows had been double-counting IGP's beds.

### Still open

**The contract counts blocks; the system counts one room.** IGP's scope table
says *"2 per shift in each running room"* and *"1 no. for RR-3 and other one
RR-4"* — five or six blocks. RR-CMS holds one merged room of 131 beds. That has
not mattered yet. It starts mattering the moment anyone asks **which block was
short today**, because the answer exists in the contract and has nowhere to go
in the system.

### Stage 36i — the establishment is what the contract bought

The manpower table at IGP totalled **128**: the contract's 107 plus 21 posts the
tender's bed-band table gives a room this size and this contract does not buy —
Manager 1, Asstt. Cook 9, Call Boy 6, Gardner 1, Sweeper 4.

Two attempts were made to *explain* the 128 rather than fix it — a pair of
subtotal rows, then a paragraph naming the 21. Both failed, and the second was
worse than the first: the 21 was printed in the column headed **"This
contract"**, a figure for posts the contract does not buy under a heading saying
it does.

**The rule was already written down and simply had not been applied here:**

> If a running room's contract has rows of its own in a table, those rows are
> the whole answer for that room.

That rule governs penalty clauses, the cleaning schedule, meal rates, newspapers
and linen. Manpower is where it matters most — sanctioned strength is what a
shortfall is measured against on the monthly certification pack — and it was the
one table still adding the norm on top.

Posts outside the contract's Part-A are now **stood down to nil**, not deleted:
`norm_count` keeps what the bed-band table would have given and
`override_reason` records that this contract does not include the post. So the
question *"the norm wants six Call Boys and the contract bought none"* is still
answerable from the record — as a note under the table, not as a figure in the
establishment.

`db/seed-igp-establishment.js` now **exits non-zero** if the total does not equal
the contract's Part-A total. It cannot drift back quietly.

**IGP's establishment reads 107.**

### Stage 36k — a login that could see nothing, and said so as a permissions error

Signed in as the Contractor Supervisor, the cleaning register answered
**"Not permitted — that running room is outside your access."** He is the only
person the contract expects to fill it.

It was not a permissions fault. `contractor_sup` holds `rr.view` and
`stay.manage` and always did. **`db/create-user.js` set the role and left the
scope column NULL.**

A role decides what a user may DO; the scope column decides WHICH running rooms
he may do it to — `division_id`, `running_room_id` or `contractor_id`, depending
on the role's `scope_level`. With it NULL the scope subquery matched no room at
all, so every scoped account was born unusable: it logged in, the menu appeared
in full, and every page refused. Nothing said the account was broken, and the
refusal read like an application bug.

Three of the six roles were affected — divisional officer, RR In-charge,
contractor supervisor. **That is three of the five logins about to be handed out
for go-live.**

`create-user.js` now takes the scope as the thing an officer would actually
name, checks it against the register before writing, and refuses a scoped role
without one — printing the available codes rather than a usage line:

```
node db/create-user.js igp_cli rr_incharge    "IGP In-charge"        RR013
node db/create-user.js pre_sup contractor_sup "Prabhakar Supervisor" PRE
node db/create-user.js jayakumar div_officer  "Jayakumar"            BB
node db/create-user.js admin   sysadmin       "System Administrator"
```

A role that is Railway-wide takes no scope and refuses one, so
`... hq "Name" BB` can no longer make "BB" the password by accident.

And it **proves the account before reporting success**, by running the same
scope SQL the application uses and printing how many running rooms the new user
can actually see:

```
  user     pre_sup
  role     Contractor Supervisor
  scope    PRE — M/S Prabhakar Enterprises
  sees     2 running room(s)
```

`sees 0` prints a warning. "Created successfully" used to be true and useless at
the same time.


---

## `audit.view` is granted and nothing serves it

The audit trail is WRITTEN everywhere — every save carries who, what, before and
after — and there is no screen anywhere to read it on. `audit.view` is granted to
HQ and to the divisional officer and no route requires it.

`test/seed-permissions.js` checks that every declared permission is held by
somebody. It does not check that anything SERVES one, which is how this survived.
Worth adding to that test alongside a screen, whenever the screen is built.

Not needed before go-live. It becomes needed the first time a bill is disputed
and somebody asks who changed a figure and when — which the database can already
answer and no officer can.

## Is a washing centre approved for the division, or for one running room?

The officer's answer, 07.09.2026: *"separate for each running room. IGP has one
Roha has Another."*

`vendors.is_approved` is a single flag on the vendor. `running_room_vendors` says
which running room uses which vendor and from when, and carries no approval of
its own. So today a washing centre approved for IGP is approved everywhere.

It does not bite while each running room uses its own washing centre, which is
what the pilot looks like. It bites the moment one contractor puts the same
laundry behind two running rooms and the Railway has approved it for only one —
and clause C1, which reads that flag, would then say the linen was washed at an
approved place when for that running room it was not. That is the unsafe
direction.

To be decided with the Railway: whether approval is genuinely per running room
(in which case it belongs on `running_room_vendors`, with the C1 check reading
it there), or whether a vendor is approved once and merely ALLOTTED per running
room, which is what the schema says today.
