-- 046_weekly_day.sql
--
-- WHICH DAY A WEEKLY CLEANING ITEM FALLS ON, PER RUNNING ROOM.
--
-- The contract says "Once in Week" for three items -- electrical fittings, wall
-- clocks, and the wire mesh and pelmets -- and names no day. RR-CMS had to pick
-- one to know when the row is due, and picked Monday for every running room.
--
-- That was a guess wearing the clothes of a rule. Running rooms are hundreds of
-- kilometres apart with their own crew rosters and their own quiet days, and the
-- day the weekly work actually happens is settled at the site. A register that
-- calls Wednesday's work late because the system assumed Monday is a register
-- that produces false findings.
--
-- So the day is a fact about the RUNNING ROOM, not about the contract: two sites
-- under one agreement may differ, and each item may differ from the next -- the
-- electrical fittings on the day the electrician comes, the wall clocks on any
-- other. Keyed on both, with Monday as the fallback where nobody has said.
--
-- ONLY items the contract leaves open are settable. `weekly_sunday` and
-- `sunday_2_4` name their day in the tender itself, and those are not the
-- running room's to move.
CREATE TABLE cleaning_weekly_day (
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  schedule_id       SMALLINT UNSIGNED NOT NULL,
  -- 0 = Sunday .. 6 = Saturday, the same numbering JavaScript's getUTCDay uses,
  -- so the register and the code that reads it cannot drift apart.
  weekday           TINYINT UNSIGNED NOT NULL,
  set_by            BIGINT UNSIGNED NULL,
  set_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (running_room_id, schedule_id),
  CONSTRAINT ck_cwd_day CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT fk_cwd_rr    FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_cwd_sched FOREIGN KEY (schedule_id)     REFERENCES cleaning_schedule (id) ON DELETE CASCADE,
  CONSTRAINT fk_cwd_user  FOREIGN KEY (set_by)          REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
