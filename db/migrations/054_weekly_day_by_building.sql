-- 054 — one weekly day PER BUILDING, not per running room
--
-- Migration 053 put `block_id` and `block_key` on cleaning_weekly_day and
-- stopped one step short: its primary key was still
--
--   PRIMARY KEY (running_room_id, schedule_id)
--
-- so Igatpuri could hold ONE day for "wash the curtains" across all four
-- buildings. Setting LP Ghat's day to Tuesday would have moved TM-BB to
-- Tuesday as well, silently, because they are the same row.
--
-- Same fault as 053's, one table along. Worth saying why it was missed: 053
-- gave cleaning_log both the column and the key that uses it, and gave this
-- table only the column. A column added without the key that uses it looks
-- finished and is not.
--
-- AND THE OBVIOUS SHAPE IS REFUSED BY THE ENGINE. Adding block_key to the
-- primary key gives
--
--   ERROR: Primary key cannot be defined upon a generated column
--
-- on MariaDB. So the table gets a surrogate id for its primary key and the
-- real rule becomes a UNIQUE key, which both engines accept over a STORED
-- generated column -- 053 does exactly that on cleaning_log. The rule enforced
-- is identical; only which index carries it changes.

ALTER TABLE cleaning_weekly_day
  DROP PRIMARY KEY,
  ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
  ADD UNIQUE KEY uq_cwd (running_room_id, block_key, schedule_id);
