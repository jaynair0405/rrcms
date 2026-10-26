-- 061 — a count of the shelf, recorded as what it is
--
-- A count is an observation: a man, a date, a shelf, a number. It is not the
-- register's opinion of what should be there, and it does not become the
-- register's figure merely by being written down. It is compared with the book
-- and the difference is kept.
--
-- WHY THE BOOK FIGURE AT THE TIME IS NOT STORED HERE. It would go stale the
-- moment anything was corrected — a dispatch entered a day late, an issue
-- figure fixed at noon — and a stored discrepancy that no longer follows from
-- the record is worse than none. The book is recomputed whenever the
-- discrepancy is shown, from the same rows the screen shows beside it.
--
-- ACCEPTED, and by whom. Accepting is what makes a count the new baseline. It
-- is separate because the count is the contractor's supervisor doing his job
-- and the acceptance is the Railway agreeing that the shelf is what he says —
-- the same division as the counter-signed muster and the verified cleaning
-- round, for the same reason.

CREATE TABLE linen_count (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id  SMALLINT UNSIGNED NOT NULL,
  block_id         SMALLINT UNSIGNED NULL,
  item_type        ENUM('bedsheet','pillow_cover','mosquito_net','blanket','curtain',
                        'other','mattress_cover','blanket_cover') NOT NULL,
  counted_on       DATE NOT NULL,
  quantity         SMALLINT UNSIGNED NOT NULL,
  note             VARCHAR(300) NULL,
  counted_by       BIGINT UNSIGNED NULL,
  counted_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  accepted_on      DATE NULL,
  accepted_by      BIGINT UNSIGNED NULL,
  accepted_at      TIMESTAMP(3) NULL DEFAULT NULL,
  block_key        SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED,
  PRIMARY KEY (id),
  -- One count of one item on one day at one shelf. Counting twice in a day is
  -- correcting the count, not taking a second one.
  UNIQUE KEY uq_lct (running_room_id, block_key, item_type, counted_on),
  KEY ix_lct_look (running_room_id, item_type, counted_on),
  CONSTRAINT fk_lct_rr FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_lct_block FOREIGN KEY (block_id) REFERENCES running_room_blocks (id),
  CONSTRAINT fk_lct_by FOREIGN KEY (counted_by) REFERENCES users (id),
  CONSTRAINT fk_lct_acc FOREIGN KEY (accepted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE linen_shelf_baseline
  ADD CONSTRAINT fk_lsb_count FOREIGN KEY (from_count_id) REFERENCES linen_count (id);
