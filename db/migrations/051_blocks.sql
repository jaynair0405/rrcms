-- 051 — a running room may occupy more than one building
--
-- WHAT THE OFFICER SAID
--
--   "IGP has many RR. we see consolidated one? each rr is some distance apart.
--    each RR will have their own assets and facilities."
--
-- and then, decisively:
--
--   "remember one kitchen may serve for all. and staff may be inter changed.
--    for igp rr this is actually happening."
--
-- Those two facts together settle the shape. Igatpuri is FIVE BUILDINGS and
-- ONE RUNNING ROOM. The tender register lists it as five entries by crew type
-- — LP Mail, LP Ghat, LP Goods, BSL Guard, BB Guard — and the pilot merged
-- them into one 131-bed room, which is right: there is one contract, one
-- kitchen, one food licence, one pool of staff who work wherever they are
-- needed, and one sanctioned strength of 107 that the contract states as a
-- single figure.
--
-- Splitting it into five running rooms was considered and rejected. It would
-- have meant five kitchens where there is one, five food licences where the
-- FSSAI certificate names one premises, a staff list cut five ways for men who
-- move between buildings daily, and — worst — a sanctioned strength derived
-- band by band that sums to about 80 where the contract says 107. The bands
-- are not linear, so splitting the site loses 27 posts on paper that the
-- contract plainly sanctions.
--
-- WHAT IS ACTUALLY PER BUILDING
--
-- Only the things fixed in a place, or done in one:
--
--   assets, CCTV, pest control   a water cooler is IN a building; a man has to
--                                know which one to walk to
--   the cleaning register        rounds are done building by building, and a
--                                missed round should be traceable to a place
--   linen issue and stock        each building keeps its own linen
--   complaints and inspections   a finding should say where it was found
--
-- Everything else — kitchen, meals, the food licence, staff, manpower, wages,
-- bills, deficiencies against the contract — stays at Igatpuri level, because
-- that is where it actually happens.
--
-- THE COLUMN IS NULLABLE EVERYWHERE, and that is not laziness. Forty-three of
-- the forty-five running rooms are one building, and for them a block is
-- meaningless; NULL means "this running room, not any block of it". A record
-- made before the blocks were known also stays NULL rather than being assigned
-- to a building on a guess.

CREATE TABLE running_room_blocks (
  id                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  -- The tender register's own code for the entry this block came from, so a
  -- block can always be traced back to the paper it was listed on.
  code              VARCHAR(20) NOT NULL,
  name              VARCHAR(80) NOT NULL,
  -- What the register says the entry held. These sum to the running room's own
  -- figures; the seed refuses to write them if they do not.
  total_beds        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  physical_rooms    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  female_rooms      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- Roughly how far from the running room's main building, in km, where it is
  -- known. The officer's point was distance: "one RR is 100 km away from other
  -- and one supervisor cant do both" was about running rooms, but the same
  -- fact in miniature decides whether one man can cover two blocks in a shift.
  distance_km       DECIMAL(5,1) NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  remarks           VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_block_code (running_room_id, code),
  KEY ix_block_rr (running_room_id, is_active, sort_order),
  CONSTRAINT fk_block_rr FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ON DELETE SET NULL, deliberately. Removing a block from the register must
-- never take a year of cleaning rounds or a condemned-linen record with it.
-- The record survives, saying only that the building it names is no longer on
-- the register — which is the truth.
ALTER TABLE assets            ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_asset_block   FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE cctv_cameras      ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_cctv_block    FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE pest_control_log  ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_pest_block    FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE cleaning_log      ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_clog_block    FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE linen_daily_item  ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_ldi_block     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE linen_stock       ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_lstk_block    FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE linen_written_off ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_lwo_block     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE laundry_dispatch  ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_lnd_block     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE complaints        ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_cmp_block     FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
ALTER TABLE inspections       ADD COLUMN block_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD CONSTRAINT fk_insp_block    FOREIGN KEY (block_id) REFERENCES running_room_blocks (id) ON DELETE SET NULL;
