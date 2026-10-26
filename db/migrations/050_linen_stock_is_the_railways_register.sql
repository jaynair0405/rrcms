-- 050 — the linen stock page stops re-typing what other registers already know
--
-- WHAT WAS WRONG
--
-- The page held five figures per item and three of them belonged elsewhere:
--
--   issued_by_railway   nothing else records what the Railway gave. Its own.
--   condemned           a write-off happens nowhere else. Its own.
--   lost_damaged        same. Its own.
--   at_laundry          the LAUNDRY REGISTER knows this — consignments sent
--                       less consignments returned, per item, per vendor.
--   in_service          the DAILY REGISTER knows this — issued and not yet
--                       sent to be washed.
--
-- So two numbers were typed here that another screen computes from actual
-- events, filled by the same man, with nothing to say which was right on the
-- day they disagreed. Found by the officer reading the screen: "at linen stock
-- also we have 'At laundry'. how do we plan this? take count from sent to wash
-- in linen page? the field is still editable. so mismatch possible?"
--
-- It is exactly the fault migration 032 was written to remove from the daily
-- register — one fact, one writer — and it survived in the column next door.
--
-- AND A POOL WAS MISSING ALTOGETHER
--
-- Linen at a running room sits in one of four places: fresh on the shelf, in
-- use on the beds, at the wash, or written off. The page had no column for the
-- shelf at all, so "held" was in_service + at_laundry and the washed stock the
-- contract's clause vii actually turns on was not in the arithmetic.
--
--   issued by Railway − written off
--       = fresh on shelf + in use + at laundry + unaccounted
--
-- Three of those four now come from the registers that own them. Only the
-- Railway's issue and its write-offs are typed, because only they have no
-- other home. `unaccounted` is then a real finding rather than the residue of
-- numbers somebody re-typed.
--
-- THE COLUMNS ARE KEPT, NOT DROPPED. They hold counts taken under the old
-- screen and those were honest observations on the day. Dropping them would
-- destroy a record to tidy a schema. They are renamed so that nothing reads
-- them by their old names by accident, and so a query that wants the history
-- has to say out loud that it is asking for a superseded figure.

ALTER TABLE linen_stock
  CHANGE COLUMN in_service was_typed_in_service SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CHANGE COLUMN at_laundry was_typed_at_laundry SMALLINT UNSIGNED NOT NULL DEFAULT 0;

-- A write-off is an event with a date, not a running total that gets re-typed.
-- The old rows carried a cumulative figure as at a count date, which cannot say
-- WHEN eleven sheets were condemned or WHY, and cannot be corrected without
-- rewriting history. New write-offs are recorded one at a time.
CREATE TABLE linen_written_off (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  item_type         ENUM('bedsheet','pillow_cover','mosquito_net','blanket',
                         'curtain','other','mattress_cover','blanket_cover') NOT NULL,
  written_off_on    DATE NOT NULL,
  quantity          SMALLINT UNSIGNED NOT NULL,
  reason            ENUM('condemned','lost','damaged') NOT NULL,
  -- WHERE IT WAS when it went. A sheet torn at the laundry never was on the
  -- shelf; one taken off a bed never was either. Without this the write-off
  -- cannot be subtracted from the right pool, and the officer asked precisely
  -- this: "Lost or damaged in linen stock page. this will curtail the fresh
  -- stock in linen page?" It does only if it was fresh stock at the time.
  from_pool         ENUM('shelf','in_use','at_laundry','unknown') NOT NULL DEFAULT 'unknown',
  authority         VARCHAR(160) NULL,
  remarks           VARCHAR(300) NULL,
  recorded_by       BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lwo_rr_item (running_room_id, item_type, written_off_on),
  CONSTRAINT fk_lwo_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_lwo_user FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOTE ON `||`. It was written with `||` for concatenation first. In MySQL 8
-- and in MariaDB's default mode `||` is OR, not concatenation: the statement
-- runs, the remark column receives a 0 or a 1, and nothing complains. CONCAT()
-- means the same thing under every sql_mode. Same family as the ENUM COMMENT
-- and the cascading foreign key: it ran here and would not have run there.
-- The write-offs already recorded, carried across as one event apiece dated at
-- the count they were last stated on. The pool is unknown, honestly: the old
-- screen never asked.
INSERT INTO linen_written_off
  (running_room_id, item_type, written_off_on, quantity, reason, from_pool, remarks)
SELECT s.running_room_id, s.item_type, s.as_on_date, s.condemned, 'condemned', 'unknown',
       CONCAT('carried from the stock count of ', s.as_on_date)
FROM linen_stock s
WHERE s.condemned > 0
  AND s.as_on_date = (SELECT MAX(x.as_on_date) FROM linen_stock x
                       WHERE x.running_room_id = s.running_room_id AND x.item_type = s.item_type);

INSERT INTO linen_written_off
  (running_room_id, item_type, written_off_on, quantity, reason, from_pool, remarks)
SELECT s.running_room_id, s.item_type, s.as_on_date, s.lost_damaged, 'lost', 'unknown',
       CONCAT('carried from the stock count of ', s.as_on_date)
FROM linen_stock s
WHERE s.lost_damaged > 0
  AND s.as_on_date = (SELECT MAX(x.as_on_date) FROM linen_stock x
                       WHERE x.running_room_id = s.running_room_id AND x.item_type = s.item_type);
