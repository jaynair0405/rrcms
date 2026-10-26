-- 060 — the shelf figure stops being two things at once
--
-- WHAT WENT WRONG, STATED ONCE AND PROPERLY. `linen_daily_item.fresh_in_hand`
-- has been asked to be a running balance and a physical count at the same
-- time. Every fault found in the linen register this week is that one seam:
--
--   linen came back from the wash after a count was saved   (migration 057)
--   linen went to the wash from the shelf                   (migration 058)
--   linen was condemned off the shelf                       (migration 059)
--   linen was issued after a count was saved                (never fixed)
--
-- Each was patched where it showed. None could be the last, because they are
-- not four faults. A count is true at a moment and immediately begins to age;
-- a balance is true continuously and is never observed. Writing both into one
-- column means every movement recorded after the column was last written is
-- either lost or has to be chased with another patch.
--
-- THE MODEL THAT REPLACES IT, chosen by the officer:
--
--   THE BOOK FIGURE IS COMPUTED, ALWAYS. Nobody types it. It is the last
--   accepted position, plus everything that has arrived since, less everything
--   that has left. It is never stale, because it is never stored.
--
--   A COUNT IS EVIDENCE, NOT A FIGURE. Somebody stands at the shelf and says
--   what is there. That is recorded as its own dated fact, against its own
--   name, and compared with the book. The difference is a DISCREPANCY, and a
--   discrepancy is the most useful thing this register can produce: it is
--   linen that moved without being written down.
--
--   ACCEPTING A COUNT IS A DELIBERATE ACT. It sets a new baseline, so the book
--   starts again from what was seen rather than from what was inferred. It
--   belongs to the Railway, not to the contractor whose stock is being judged.
--
-- This migration builds the baseline. 061 builds the count. 062 carries the
-- figures already recorded into both, so nothing recorded so far is lost.

CREATE TABLE linen_shelf_baseline (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id  SMALLINT UNSIGNED NOT NULL,
  block_id         SMALLINT UNSIGNED NULL,
  item_type        ENUM('bedsheet','pillow_cover','mosquito_net','blanket','curtain',
                        'other','mattress_cover','blanket_cover') NOT NULL,
  -- THE POSITION AT THE CLOSE OF THIS DAY. Movements are counted from the day
  -- AFTER. The convention matters and is printed on the screen: a count is the
  -- shelf as it stands when the day's issues have been written down.
  as_on_date       DATE NOT NULL,
  quantity         SMALLINT UNSIGNED NOT NULL,
  -- Where the position came from. 'count' is a count somebody accepted;
  -- 'opening' is the figure a running room starts its register with, before
  -- anybody has counted anything.
  source           ENUM('count','opening') NOT NULL DEFAULT 'count',
  from_count_id    INT UNSIGNED NULL,
  note             VARCHAR(300) NULL,
  set_by           BIGINT UNSIGNED NULL,
  -- MILLISECONDS, NOT SECONDS. This stamp is compared with the stamp on
  -- every movement to see whether a settled day has been written to since it
  -- was settled (migration 063). At one-second resolution a correction made
  -- in the same second as the acceptance compares as NOT LATER and the
  -- warning is not raised -- a one-second blind spot that fails silently, in
  -- the unsafe direction, which is the exact shape of every fault this
  -- rebuild exists to remove.
  set_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- A UNIQUE KEY OVER A NULLABLE COLUMN IS NOT UNIQUE, and forty-three of the
  -- forty-five running rooms are one building and carry NULL here. Same remedy
  -- as migrations 043 and 053 through 057.
  block_key        SMALLINT UNSIGNED AS (COALESCE(block_id,0)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lsb (running_room_id, block_key, item_type, as_on_date),
  KEY ix_lsb_look (running_room_id, item_type, as_on_date),
  CONSTRAINT fk_lsb_rr FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  -- No delete action: MariaDB refuses a generated column that reads a column
  -- belonging to a SET NULL foreign key, and MySQL 8 refuses SET NULL on a
  -- table carrying a STORED generated column. One remedy satisfies both.
  CONSTRAINT fk_lsb_block FOREIGN KEY (block_id) REFERENCES running_room_blocks (id),
  CONSTRAINT fk_lsb_user FOREIGN KEY (set_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
