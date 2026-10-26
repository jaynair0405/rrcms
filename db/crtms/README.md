# Reading the division staff master

RR-CMS can offer a crew member's name back to whoever is writing the call book,
instead of having it typed afresh at four in the morning. It does that by
reading the staff master CRTMS already maintains — `bbtro.div_staff_master` for
Mumbai division.

This folder holds the one piece of work that is the DBA's, not the
application's.

---

## What has to be done, once per division

1. Run `v_rr_crew_lookup.sql` on the CRTMS schema for that division, changing
   the `USE bbtro;` line if it is another division. It creates three views.

2. Grant RR-CMS's database account SELECT on those views — **and on nothing
   else in that schema**:

   ```sql
   GRANT SELECT ON bbtro.v_rr_crew_lookup  TO 'rrcms_app'@'127.0.0.1';
   GRANT SELECT ON bbtro.v_rr_crew_contact TO 'rrcms_app'@'127.0.0.1';
   GRANT SELECT ON bbtro.v_rr_train_lookup TO 'rrcms_app'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```

3. Tell RR-CMS which schema belongs to which division:

   ```sql
   UPDATE divisions SET crtms_schema = 'bbtro' WHERE code = 'BB';
   ```

That is all. Nothing is copied, nothing is scheduled, and there is no import to
keep running.

---

## What RR-CMS can and cannot see

`div_staff_master` holds Aadhaar and PAN numbers, caste, date of birth, blood
group, identification marks, marital status, addresses and email. **RR-CMS is
given no way to read any of it.** The lookup view exposes seven columns:

| Column | Why a running room needs it |
|---|---|
| `hrms_id` | The link. Never displayed. |
| `cms_id` | The number a crew member quotes and the running rooms already write |
| `full_name` | To offer the name back |
| `designation_code`, `designation_name` | To tell an ALP from an LPG of the same name |
| `hq_station` | To tell two men of the same name apart |
| `office_code` | Same |

The contact view exposes `hrms_id` and one telephone number, separately, so the
grant can be withheld. Within RR-CMS the number is shown only to a user holding
`crew.contact` — HQ, the divisional officer and the RR In-charge. A
contractor's supervisor never sees it, by permission and not by politeness: he
must not be handed a searchable directory of the division's running staff.

Only running staff appear — ALP, LPS, LPG, LPP, LPM, LP Ghat, Motorman — and
only while Active and not past retirement.

The third view, `v_rr_train_lookup`, offers the division's train master
(`div_trains`) to the call book's train box: number, name, type, direction, run
days and the two stations it runs between. Nothing about loco links, crew
assignment or the working timetable crosses. A train on no master — a special,
a one-off working — is typed as it stands and the box says so, because the call
book may never be blocked for want of a lookup.

---

## If this is not set up

Nothing breaks. `crtms_schema` stays NULL for that division, no lookup is
attempted, and every crew name is typed — which is exactly right for a division
not yet on CRTMS. The running room is never blocked from recording a call
because a man is not in a master.

---

## Train managers, and crew from elsewhere

Neither is in `div_staff_master`, and this is not a gap to be closed later:

- **Train managers** belong to the traffic branch and are not on the running
  staff master at all. They are typed, with a box for the CMS number where it
  is known. Those numbers accumulate, so that the day a traffic master exists
  the rows can be matched to it.
- **Crew from other divisions and other railways** use these rooms constantly —
  IGP and LNL especially. One division's master can never cover them.

RR-CMS marks every crew row with where it came from: `div_master` for a man
picked from the master, `typed` for a name somebody wrote. The call book shows
the distinction, because a clause C5 delay attributed to a typed name is a
weaker record than one attributed to an HRMS identity, and an officer reading it
is entitled to know which he has.

---

## A warning about `designations`

Both databases have a table called `designations` and they mean opposite
things. In CRTMS it is LP, ALP, Motorman. In RR-CMS it is Cook, Asstt. Cook,
Bearer — the contractor's sanctioned posts. Every cross-schema query must name
its schema, and the two databases must never be merged into one.
