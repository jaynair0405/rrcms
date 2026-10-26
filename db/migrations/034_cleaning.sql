-- 034 — the daily cleaning record
--
-- THE LARGEST CONTRACTUAL GAP IN THE APPLICATION, AND IT IS NOW CLOSED
--
-- Schedule C sets out a cleaning schedule by area, by frequency and by hour:
-- the bed rooms, recreation hall, galleries, open space and garden twice a day;
-- the kitchen, kitchen store, dining hall, bathrooms and lavatories three times
-- a day; racks, cupboards, furniture, windows, ventilators and glass every
-- Sunday; wall surfaces, cobwebs and ceilings on the second and fourth Sunday.
--
-- Clause A6 — POOR CLEANING AGAINST SCHEDULE, Rs 1000 per day — is the single
-- largest recurring penalty in Schedule A, and until this migration nothing in
-- RR-CMS recorded whether a single round of cleaning had happened. An inspector
-- asking "was the bathroom block cleaned on the 14th?" had nothing to read, and
-- an officer raising A6 had nothing but his own recollection to raise it on.
-- Equally, a contractor who HAD kept the schedule had no way to show it.
--
-- WHY A ROUND AND NOT A DAY
--
-- The obvious shape is one tick a day per area. The tender does not work that
-- way: it buys a NUMBER OF ROUNDS at STATED HOURS, and the kitchen block being
-- cleaned once on a day it should have been cleaned three times is exactly the
-- shortfall A6 names. So the unit of record is the ROUND — one row per area
-- group per scheduled round per day — and a day that should carry five rows and
-- carries three says so by arithmetic rather than by opinion.
--
-- The hours are kept too. A round done at 11:20 against a window that closed at
-- 10:00 happened, and the register says both things: it was done, and it was
-- late. Neither is hidden and neither is judged. RR-CMS records the fact; A6 is
-- raised, if it is raised, by the officer at the review.

-- The schedule itself, from Schedule C's own table. Held as rows rather than in
-- code because the tender says in terms that "the places, areas, scopes &
-- schedules of this work given are tentative & it may be increased / decreased
-- according to railway's requirement" — so a changed schedule has to be a row,
-- not a deployment.
CREATE TABLE cleaning_schedule (
  id                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code              VARCHAR(40) NOT NULL,
  area_name         VARCHAR(255) NOT NULL,
  -- How often the area is to be cleaned. `monthly` exists for completeness but
  -- is NOT used here: the pest control and rodent treatment row of the same
  -- table is a specialist agency's work and has had its own register since
  -- stage 6. Recording it twice would be two records of one fact.
  frequency         ENUM('twice_daily','thrice_daily','weekly_sunday','sunday_2_4','monthly') NOT NULL,
  -- Which round of the day this row is: 1, 2 or 3. A frequency alone cannot say
  -- that the second round was missed.
  round_no          TINYINT UNSIGNED NOT NULL DEFAULT 1,
  -- The window the tender gives, as clock times. NULL where the tender states
  -- an obligation without an hour.
  window_from       CHAR(5) NULL,
  window_to         CHAR(5) NULL,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  source_ref        VARCHAR(160) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cleansched (code),
  KEY ix_cleansched_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What actually happened, one row per round per day per running room.
--
-- A round with NO ROW is a round nobody has recorded. That is deliberately
-- distinct from a round recorded as not done: the first is silence and the
-- second is a statement, and an officer reading the register a month later must
-- be able to tell them apart. The screen counts both, separately.
CREATE TABLE cleaning_log (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  work_date         DATE NOT NULL,
  schedule_id       SMALLINT UNSIGNED NOT NULL,
  status            ENUM('done','not_done') NOT NULL,
  -- When the round actually finished. Kept because the tender buys the hours as
  -- well as the work, and because "done, but at midnight" is a different fact
  -- from "done".
  done_at           TIME NULL,
  -- Which of the contractor's men did it. Optional: on a busy morning the
  -- supervisor may honestly not know, and a name guessed is worse than none.
  done_by_staff_id  INT UNSIGNED NULL,
  -- Schedule C: "After completion of cleaning work of each schedule, room
  -- freshener shall be sprayed in rooms and hall". Part of the round, so it is
  -- recorded with the round. NULL means not stated.
  freshener         TINYINT(1) NULL,
  remarks           VARCHAR(300) NULL,
  recorded_by       BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cleanlog (running_room_id, work_date, schedule_id),
  KEY ix_cleanlog_date (work_date),
  CONSTRAINT fk_cl_rr    FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_sched FOREIGN KEY (schedule_id)      REFERENCES cleaning_schedule (id),
  CONSTRAINT fk_cl_staff FOREIGN KEY (done_by_staff_id) REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT fk_cl_user  FOREIGN KEY (recorded_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The Railway's confirmation of a day, kept apart from the rounds themselves.
--
-- A cleaning record filled by the contractor and confirmed by nobody is the
-- contractor marking his own work — which is the thing this application exists
-- to prevent. The same division of hands as the muster (marked by the
-- contractor, counter-signed by the Railway) and the weekly menu (prepared by
-- the contractor, agreed by the Railway).
CREATE TABLE cleaning_day (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  work_date         DATE NOT NULL,
  verified_by       BIGINT UNSIGNED NULL,
  verified_at       DATETIME NULL,
  -- What the Railway saw, in its own words. A verification with a remark
  -- against it is worth more at a review than a bare tick.
  verify_remarks    VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cleanday (running_room_id, work_date),
  CONSTRAINT fk_cd_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_cd_user FOREIGN KEY (verified_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The permission is declared in db/seeds/01_reference.sql with every other
-- permission — NOT here. Migrations run before seeds, so a grant written in a
-- migration as a join against `roles` silently inserts nothing on a fresh
-- install. See the note at the foot of migration 033, where that was found.
