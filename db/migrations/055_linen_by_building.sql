-- 055 — the linen register is kept building by building
--
-- Each of Igatpuri's four buildings keeps its own linen, so the daily issue,
-- the shelf count, the Railway's issue figure and the write-offs are all facts
-- about a building. Three unique keys stand in the way, and every one of them
-- would have failed silently.
--
--   linen_daily_item  uq_ldi        (running_room_id, record_date, item_type)
--   linen_stock       uq_linenstock (running_room_id, item_type, as_on_date)
--   linen_daily       uq_linenday   (running_room_id, record_date)
--
-- One row per running room. Four buildings counting bed sheets on the same
-- morning are four rows colliding on one key: the second building's count
-- OVERWRITES the first's, and the screen shows one figure where four were
-- entered. The ledger built at stage 52 would then be worked out from a
-- number belonging to a different building.
--
-- AND THE OBVIOUS FIX IS THE TRAP WRITTEN INTO PENDING.md IN ADVANCE. Adding
-- block_id straight into these keys puts a NULLABLE column in a UNIQUE index.
-- MySQL treats two NULLs as unequal, so for the forty-three running rooms that
-- are one building the key would stop working entirely: ON DUPLICATE KEY
-- UPDATE becomes INSERT and the register grows a fresh copy of every row on
-- every save. linen_schedule did exactly that before migration 043 -- three
-- seed runs, three copies of all eight rows, nothing wrong on any screen.
--
-- So each key is taken over a STORED COALESCE(block_id, 0) column, as
-- migration 053 did for cleaning.
--
-- THE FOREIGN KEYS COME OFF AND GO BACK WITHOUT A DELETE ACTION, because the
-- two engines refuse the arrangement from opposite sides: MariaDB will not
-- build a generated column that reads a column belonging to a SET NULL foreign
-- key, and MySQL 8 will not allow SET NULL on a table carrying a STORED
-- generated column. Nothing is lost -- a block is stood down, never deleted.
--
-- linen_daily gains block_id here as well: it carries min_stock_met, and the
-- two-days'-consumption rule is 2 x THE BUILDING'S beds once the linen is the
-- building's. 2 x 44 at LP Mail is not 2 x 131.
--
-- Every statement is guarded so a half-applied run finishes by running again.

-- ---------------------------------------------------------- linen_daily_item
SET @s := IF((SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily_item'
                 AND constraint_name = 'fk_ldi_block') > 0,
  'ALTER TABLE linen_daily_item DROP FOREIGN KEY fk_ldi_block', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily_item'
                 AND column_name = 'block_key') = 0,
  'ALTER TABLE linen_daily_item ADD COLUMN block_key SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily_item'
                 AND index_name = 'uq_ldi' AND column_name = 'block_key') = 0,
  'ALTER TABLE linen_daily_item DROP INDEX uq_ldi,
     ADD UNIQUE KEY uq_ldi (running_room_id, block_key, record_date, item_type)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily_item'
                 AND constraint_name = 'fk_ldi_block') = 0,
  'ALTER TABLE linen_daily_item ADD CONSTRAINT fk_ldi_block
     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- --------------------------------------------------------------- linen_stock
SET @s := IF((SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = 'linen_stock'
                 AND constraint_name = 'fk_lstk_block') > 0,
  'ALTER TABLE linen_stock DROP FOREIGN KEY fk_lstk_block', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'linen_stock'
                 AND column_name = 'block_key') = 0,
  'ALTER TABLE linen_stock ADD COLUMN block_key SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
               WHERE table_schema = DATABASE() AND table_name = 'linen_stock'
                 AND index_name = 'uq_linenstock' AND column_name = 'block_key') = 0,
  'ALTER TABLE linen_stock DROP INDEX uq_linenstock,
     ADD UNIQUE KEY uq_linenstock (running_room_id, block_key, item_type, as_on_date)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = 'linen_stock'
                 AND constraint_name = 'fk_lstk_block') = 0,
  'ALTER TABLE linen_stock ADD CONSTRAINT fk_lstk_block
     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- --------------------------------------------------------------- linen_daily
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily'
                 AND column_name = 'block_id') = 0,
  'ALTER TABLE linen_daily ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily'
                 AND column_name = 'block_key') = 0,
  'ALTER TABLE linen_daily ADD COLUMN block_key SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED',
  'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily'
                 AND index_name = 'uq_linenday' AND column_name = 'block_key') = 0,
  'ALTER TABLE linen_daily DROP INDEX uq_linenday,
     ADD UNIQUE KEY uq_linenday (running_room_id, block_key, record_date)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = 'linen_daily'
                 AND constraint_name = 'fk_lday_block') = 0,
  'ALTER TABLE linen_daily ADD CONSTRAINT fk_lday_block
     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
