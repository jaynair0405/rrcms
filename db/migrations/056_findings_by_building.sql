-- 056 — a finding says where it was found
--
-- An inspector standing in the BB Guard block writes down what he found THERE.
-- "Somewhere in Igatpuri" is not evidence, and a deficiency raised from it
-- cannot be answered by the contractor or verified by anybody afterwards.
-- Likewise a crew complaint about a bathroom: the man who has to go and look
-- at it needs to know which building to walk to.
--
-- `block_id` went on to both tables at stage 56. complaints needs nothing more
-- — it has no unique key and every complaint is its own event.
--
-- INSPECTIONS DO NEED MORE, and the reason is the same one that has now caught
-- five tables:
--
--   UNIQUE KEY uq_insp_daily (running_room_id, inspection_date, inspection_type)
--
-- One daily joint inspection per running room per day. Inspect LP Mail and
-- then LP Ghat on the same morning and the second OVERWRITES the first — two
-- buildings walked, one record kept, and nothing anywhere saying so.
--
-- The key goes over a STORED COALESCE(block_id, 0) column, as at migrations
-- 043, 053, 054 and 055. The foreign key comes off and goes back without a
-- delete action, because MariaDB will not build a generated column that reads
-- a column belonging to a SET NULL foreign key and MySQL 8 will not allow SET
-- NULL on a table carrying a stored generated column. A block is stood down,
-- never deleted, so nothing is lost by it.
--
-- THE BUILDING IS OPTIONAL ON BOTH, and that is a deliberate difference from
-- the cleaning and linen registers, where it is required. A round is done in
-- one building and linen sits on one shelf, so those cannot be recorded
-- without saying which. An inspection may genuinely cover the whole of
-- Igatpuri, and a complaint may be about the kitchen that serves all four.
-- Forcing a building there would make somebody pick one falsely.

SET @s := IF((SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = 'inspections'
                 AND constraint_name = 'fk_insp_block') > 0,
  'ALTER TABLE inspections DROP FOREIGN KEY fk_insp_block', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'inspections'
                 AND column_name = 'block_key') = 0,
  'ALTER TABLE inspections ADD COLUMN block_key SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
               WHERE table_schema = DATABASE() AND table_name = 'inspections'
                 AND index_name = 'uq_insp_daily' AND column_name = 'block_key') = 0,
  'ALTER TABLE inspections DROP INDEX uq_insp_daily,
     ADD UNIQUE KEY uq_insp_daily (running_room_id, block_key, inspection_date, inspection_type)',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = 'inspections'
                 AND constraint_name = 'fk_insp_block') = 0,
  'ALTER TABLE inspections ADD CONSTRAINT fk_insp_block
     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
