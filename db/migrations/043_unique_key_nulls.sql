-- 043_unique_key_nulls.sql
--
-- A UNIQUE KEY OVER A NULLABLE COLUMN IS NOT UNIQUE.
--
-- MySQL treats two NULLs as different values in a unique index. So
-- `UNIQUE KEY (item_type, contract_id)` does not stop a second 'bedsheet' row
-- with contract_id NULL -- and every INSERT ... ON DUPLICATE KEY UPDATE that
-- relies on that key silently becomes a plain INSERT.
--
-- WHAT THIS COST. db/seeds/11 is written to be re-run: it states the linen
-- schedule and updates it in place when the paper is corrected. It never
-- updated anything. Every `node db/migrate.js seed` since stage 34 added a
-- fresh copy of all eight rows. Three seed runs on the pilot database left
-- TWENTY-FOUR rows where there should have been eight.
--
-- Nothing broke, which is why it survived three stages. The laundry screen
-- builds a lookup keyed on item_type, so three identical bed-sheet rows
-- collapse into one correct answer and the delivery periods on screen were
-- right the whole time. It surfaced only when stage 36 tried to stamp
-- contract_id onto those rows, hit a duplicate key, and had the error swallowed
-- by a `.catch()` that turned it into a silent zero.
--
-- THE FIX is a stored generated column that folds NULL to 0, and a unique key
-- over that. NULL still means "the fallback, used where a site's own contract
-- has not been read in"; it simply can no longer mean "a value unequal to
-- itself". The column is derived by the database, so it cannot drift.
--
-- ---------------------------------------------------------------------------
-- WHY THE FOREIGN KEYS ARE DROPPED AND REBUILT, AND WHY ONE LOSES ITS CASCADE
--
-- Adding a STORED generated column forces MySQL to copy the table, and MySQL 8
-- will not put an ON DELETE CASCADE foreign key on a table that carries one. It
-- fails with "Cannot add foreign key constraint" -- error 1215, which names
-- nothing useful and points at no statement. MariaDB accepts it, so this
-- migration passed here and failed on the production server.
--
-- So fk_lsch_contract is rebuilt WITHOUT its cascade. That is a real change in
-- behaviour and worth stating plainly: deleting a contract that has linen rows
-- will now be REFUSED rather than silently taking the rows with it. For this
-- system that is the better of the two. A contract is never deleted here -- it
-- is stood down, and its rooms' links are closed by date, precisely so the
-- record of who was answerable last March survives. A DELETE that quietly
-- removed a contract's transcribed terms would destroy evidence; one that is
-- refused asks a question.
--
-- Neither engine takes the same generated-column syntax either. MySQL 8 accepts
-- NOT NULL there; MariaDB rejects it outright, and they disagree about where
-- COMMENT may sit. The columns are declared with neither, and
-- tools/schema-check.mjs reads the generation expression rather than the
-- nullability flag for exactly this reason.

--
-- ---------------------------------------------------------------------------
-- WHY EVERY STATEMENT BELOW IS GUARDED
--
-- The first version of this migration failed halfway on the production server:
-- the duplicate rows were deleted and an index was dropped before it stopped.
-- MySQL does not roll back DDL, so the database was left in a state that
-- neither the old file nor a naive corrected one could be run against -- the
-- corrected file would have failed on "index does not exist" and left it
-- stranded again.
--
-- So each step asks the catalogue whether it still has work to do. Every
-- statement here can be run against a clean database, a half-migrated one, or a
-- finished one, and reaches the same place. `DROP INDEX IF EXISTS` would say
-- this in one line, but MariaDB has it and MySQL 8 does not, so it is spelt out
-- through a prepared statement that both engines accept.

-- ---------------------------------------------------------- linen_schedule
-- Keep the earliest row of each (item, contract) and drop the copies. MIN(id)
-- rather than MAX so the row any earlier record might point at is the survivor.
DELETE ls FROM linen_schedule ls
JOIN (
  SELECT item_type, COALESCE(contract_id, 0) AS k, MIN(id) AS keep_id
  FROM linen_schedule GROUP BY item_type, COALESCE(contract_id, 0)
) g ON g.item_type = ls.item_type
   AND g.k = COALESCE(ls.contract_id, 0)
   AND ls.id > g.keep_id;

-- Drop the constraint, re-key, put the constraint back WITHOUT its cascade.
SET @a := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'linen_schedule'
             AND CONSTRAINT_NAME = 'fk_lsch_contract' AND CONSTRAINT_TYPE = 'FOREIGN KEY'),
       'ALTER TABLE linen_schedule DROP FOREIGN KEY fk_lsch_contract', 'DO 0'));
PREPARE sa FROM @a; EXECUTE sa; DEALLOCATE PREPARE sa;
SET @b := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'linen_schedule'
             AND INDEX_NAME = 'uq_linen_schedule'),
       'ALTER TABLE linen_schedule DROP INDEX uq_linen_schedule', 'DO 0'));
PREPARE sb FROM @b; EXECUTE sb; DEALLOCATE PREPARE sb;
SET @c := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'linen_schedule'
             AND COLUMN_NAME = 'contract_key'),
       'ALTER TABLE linen_schedule ADD COLUMN contract_key INT UNSIGNED AS (COALESCE(contract_id, 0)) STORED', 'DO 0'));
PREPARE sc FROM @c; EXECUTE sc; DEALLOCATE PREPARE sc;
SET @d := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'linen_schedule'
             AND INDEX_NAME = 'uq_linen_schedule'),
       'ALTER TABLE linen_schedule ADD UNIQUE KEY uq_linen_schedule (item_type, contract_key)', 'DO 0'));
PREPARE sd FROM @d; EXECUTE sd; DEALLOCATE PREPARE sd;
SET @e := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'linen_schedule'
             AND CONSTRAINT_NAME = 'fk_lsch_contract' AND CONSTRAINT_TYPE = 'FOREIGN KEY'),
       'ALTER TABLE linen_schedule ADD CONSTRAINT fk_lsch_contract FOREIGN KEY (contract_id) REFERENCES contracts (id)', 'DO 0'));
PREPARE se FROM @e; EXECUTE se; DEALLOCATE PREPARE se;

-- ------------------------------------------------------------------- bills
-- The same trap, not yet sprung. `running_room_id` is nullable because a bill
-- may be raised against a contract as a whole rather than against one running
-- room, and two such bills for the same month would both have been accepted.
-- No bill has been entered yet, so this closes before it can cost anything --
-- the only difference between this table and the linen schedule above.
--
-- bills carries two ON DELETE SET NULL foreign keys, to the user who checked
-- and the user who passed the bill. MySQL 8 refuses those on a table with a
-- stored generated column for the same reason it refuses CASCADE, so both are
-- dropped and rebuilt plain. The effect: a user account referenced by a bill
-- can no longer be deleted outright. Users are deactivated in this system, not
-- deleted, and a bill that forgot who passed it is worse than a delete that is
-- refused.
DELETE b FROM bills b
JOIN (
  SELECT contract_id, COALESCE(running_room_id, 0) AS k, period_month, MIN(id) AS keep_id
  FROM bills GROUP BY contract_id, COALESCE(running_room_id, 0), period_month
) g ON g.contract_id = b.contract_id
   AND g.k = COALESCE(b.running_room_id, 0)
   AND g.period_month = b.period_month
   AND b.id > g.keep_id;

-- fk_bill_contract has been riding uq_bill's leftmost column, so the unique key
-- cannot be dropped until something else covers it.
SET @f := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND INDEX_NAME = 'ix_bill_contract'),
       'ALTER TABLE bills ADD KEY ix_bill_contract (contract_id)', 'DO 0'));
PREPARE sf FROM @f; EXECUTE sf; DEALLOCATE PREPARE sf;
SET @h := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND CONSTRAINT_NAME = 'fk_bill_checker' AND CONSTRAINT_TYPE = 'FOREIGN KEY'),
       'ALTER TABLE bills DROP FOREIGN KEY fk_bill_checker', 'DO 0'));
PREPARE sh FROM @h; EXECUTE sh; DEALLOCATE PREPARE sh;
SET @i := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND CONSTRAINT_NAME = 'fk_bill_passer' AND CONSTRAINT_TYPE = 'FOREIGN KEY'),
       'ALTER TABLE bills DROP FOREIGN KEY fk_bill_passer', 'DO 0'));
PREPARE si FROM @i; EXECUTE si; DEALLOCATE PREPARE si;
SET @j := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND INDEX_NAME = 'uq_bill'),
       'ALTER TABLE bills DROP INDEX uq_bill', 'DO 0'));
PREPARE sj FROM @j; EXECUTE sj; DEALLOCATE PREPARE sj;
SET @k := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND COLUMN_NAME = 'running_room_key'),
       'ALTER TABLE bills ADD COLUMN running_room_key SMALLINT UNSIGNED AS (COALESCE(running_room_id, 0)) STORED', 'DO 0'));
PREPARE sk FROM @k; EXECUTE sk; DEALLOCATE PREPARE sk;
SET @l := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND INDEX_NAME = 'uq_bill'),
       'ALTER TABLE bills ADD UNIQUE KEY uq_bill (contract_id, running_room_key, period_month)', 'DO 0'));
PREPARE sl FROM @l; EXECUTE sl; DEALLOCATE PREPARE sl;
SET @m := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND CONSTRAINT_NAME = 'fk_bill_checker' AND CONSTRAINT_TYPE = 'FOREIGN KEY'),
       'ALTER TABLE bills ADD CONSTRAINT fk_bill_checker FOREIGN KEY (checked_by) REFERENCES users (id)', 'DO 0'));
PREPARE sm FROM @m; EXECUTE sm; DEALLOCATE PREPARE sm;
SET @n := (SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'bills'
             AND CONSTRAINT_NAME = 'fk_bill_passer' AND CONSTRAINT_TYPE = 'FOREIGN KEY'),
       'ALTER TABLE bills ADD CONSTRAINT fk_bill_passer FOREIGN KEY (passed_by) REFERENCES users (id)', 'DO 0'));
PREPARE sn FROM @n; EXECUTE sn; DEALLOCATE PREPARE sn;

-- FOUR OTHER UNIQUE KEYS COVER A NULLABLE COLUMN AND ARE LEFT ALONE, because
-- there the nullability is the point -- the standard "unique when present, any
-- number of NULLs" idiom:
--
--   crew.uq_crew_idno (crew_id_no)      a crew member without an ID number must
--   crew.uq_crew_hrms (hrms_id)         not collide with every other one
--   food_licences.uq_fl_current         is_current is 1 for the licence in
--     (running_room_id, is_current)     force and NULL for every superseded
--                                       one, so the key allows one current
--                                       licence per room over unbounded history
--   call_book_calls.uk_cbc_day_slot     an ad-hoc call has no train slot and is
--     (.., .., sheet_train_id)          meant to escape one-row-per-slot
--
-- tools/schema-check.mjs lists those four by name with the reason, so they are
-- exempted in the open rather than by being forgotten.
