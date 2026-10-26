-- 053 — the cleaning register is kept building by building
--
-- Igatpuri's rounds are done in four buildings some distance apart, and a
-- missed round should be traceable to a place. `block_id` went on to
-- cleaning_log at stage 56; this makes it usable, because the unique key would
-- otherwise have destroyed the data quietly.
--
-- THE KEY WAS THE WHOLE PROBLEM
--
--   UNIQUE KEY uq_cleanlog (running_room_id, work_date, schedule_id)
--
-- One row per running room, per day, per task. Four buildings doing round-1
-- bathroom cleaning on the same morning are four rows that all collide on that
-- key: the second building's entry would have OVERWRITTEN the first's, and the
-- screen would show one round done where four were.
--
-- AND THE OBVIOUS FIX IS A TRAP THIS PROJECT HAS ALREADY FALLEN INTO. Adding
-- `block_id` to the key puts a NULLABLE column in a UNIQUE index, and MySQL
-- treats two NULLs as different values -- so for the forty-three running rooms
-- that are one building and record NULL, the key would stop working at all:
-- ON DUPLICATE KEY UPDATE silently becomes INSERT and the register grows a
-- fresh copy of every round on every save. That is what happened to
-- linen_schedule before migration 043, where three seed runs left three copies
-- of all eight rows and nothing on any screen looked wrong.
--
-- So the key is taken over a STORED generated column. COALESCE(...,0) turns
-- "no building" into a value equal to itself, and uniqueness holds for one
-- building and four alike.
--
-- THE TWO ENGINES DISAGREE ABOUT THIS, IN OPPOSITE DIRECTIONS.
--
--   MariaDB refuses a generated column that reads a column belonging to a
--   foreign key with ON DELETE SET NULL:
--       ERROR 1901: Function or expression 'block_id' cannot be used in the
--       GENERATED ALWAYS AS clause of `block_key`
--
--   MySQL 8 refuses ON DELETE SET NULL or CASCADE on a table that carries a
--   STORED generated column at all (error 1215, met at stage 36b).
--
-- One remedy satisfies both: the foreign key stands without a delete action.
-- Nothing is lost by it. A block is STOOD DOWN, never deleted -- seed-pilot
-- sets is_active = 0 for a building no longer on the register precisely so
-- that its cleaning rounds survive -- so the delete action was protecting
-- against something that does not happen, at the cost of a fix that does.
--
-- Every statement is guarded, so a half-applied run can be finished by running
-- it again rather than by hand. Stage 36b's migration taught that.

SET @has := (SELECT COUNT(*) FROM information_schema.table_constraints
              WHERE table_schema = DATABASE() AND table_name = 'cleaning_log'
                AND constraint_name = 'fk_clog_block');
SET @s := IF(@has > 0, 'ALTER TABLE cleaning_log DROP FOREIGN KEY fk_clog_block', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'cleaning_log'
                AND column_name = 'block_key');
SET @s := IF(@has = 0,
  'ALTER TABLE cleaning_log ADD COLUMN block_key SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @has := (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = 'cleaning_log'
                AND index_name = 'uq_cleanlog' AND column_name = 'block_key');
SET @s := IF(@has = 0,
  'ALTER TABLE cleaning_log DROP INDEX uq_cleanlog,
     ADD UNIQUE KEY uq_cleanlog (running_room_id, block_key, work_date, schedule_id)',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @has := (SELECT COUNT(*) FROM information_schema.table_constraints
              WHERE table_schema = DATABASE() AND table_name = 'cleaning_log'
                AND constraint_name = 'fk_clog_block');
SET @s := IF(@has = 0,
  'ALTER TABLE cleaning_log ADD CONSTRAINT fk_clog_block
     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id)',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- THE WEEKLY DAY, LIKEWISE. A running room set its own day for a weekly item
-- at stage 46 because "each RR may do it on different day". Buildings twenty
-- minutes apart, worked by men who move between them, are no more likely to
-- share a day than two running rooms are.
SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'cleaning_weekly_day'
                AND column_name = 'block_id');
SET @s := IF(@has = 0,
  'ALTER TABLE cleaning_weekly_day ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'cleaning_weekly_day'
                AND column_name = 'block_key');
SET @s := IF(@has = 0,
  'ALTER TABLE cleaning_weekly_day ADD COLUMN block_key SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @has := (SELECT COUNT(*) FROM information_schema.table_constraints
              WHERE table_schema = DATABASE() AND table_name = 'cleaning_weekly_day'
                AND constraint_name = 'fk_cwd_block');
SET @s := IF(@has = 0,
  'ALTER TABLE cleaning_weekly_day ADD CONSTRAINT fk_cwd_block
     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id)',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
