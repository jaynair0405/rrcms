-- 032 — the linen register becomes item-wise
--
-- WHAT WAS WRONG
--
-- `linen_daily` counted issues per item — bedsheets, pillow covers, mosquito
-- nets, blankets — and then counted the wash cycle and the stock as three
-- single numbers for everything together:
--
--   soiled_sent_to_wash   80
--   fresh_received        75
--   fresh_stock_in_hand  120
--
-- Found by the running room supervisor's own question on first reading the
-- screen: "for fresh received, which item?" There is no answer. The column
-- cannot say.
--
-- That is not untidiness. Two contractual things rest on it and neither can
-- stand:
--
--   Schedule C requires a minimum of two sets of washed linen — bedsheets and
--   pillow covers, named — readily available at all times. "120 in hand" could
--   be 120 blankets and not one bedsheet. The condition is uncheckable.
--
--   Washing is paid by item type, with curtains counted at the mosquito-net
--   rate. A single "sent to wash" figure can neither support a washing bill nor
--   dispute one.
--
-- AND THERE WAS A SECOND RECORD OF THE SAME FACT
--
-- `laundry_dispatch` has recorded the wash cycle properly since stage 11: per
-- item, per vendor, with quantity sent, quantity returned, the return date, the
-- invoice number and the quality check. So making the daily register item-wise
-- for sent and received would have produced two item-wise records of one event,
-- filled by the same man, in two screens, with nothing to say which was right
-- on the day they disagreed.
--
-- One fact, one writer. The split is by what the supervisor can actually see:
--
--   linen_daily_item   what he handled and what is on his shelf —
--                      issued today, fresh in hand now. Per item.
--   laundry_dispatch   what left the building and what came back — with the
--                      vendor and the invoice, because washing at an
--                      unapproved source is a clause C1 deficiency in itself.
--   linen_stock        the periodic full count behind both, unchanged.
--
-- The daily screen shows all three together and writes to the first two, so
-- the supervisor still does his day on one page.

-- Nothing is thrown away. Whatever was entered before this migration is kept
-- exactly as it was entered, aggregates and all, in case a figure is ever
-- questioned. It is read by nothing.
CREATE TABLE linen_daily_pre032 AS SELECT * FROM linen_daily;

CREATE TABLE linen_daily_item (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  record_date         DATE NOT NULL,
  item_type           ENUM('bedsheet','pillow_cover','mosquito_net','blanket','curtain','other') NOT NULL,
  -- NULL, not 0. An item the supervisor did not count is silence; zero is the
  -- statement "there were none", and the register must be able to tell them
  -- apart. Same rule as linen_stock.
  issued              SMALLINT UNSIGNED NULL,
  fresh_in_hand       SMALLINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ldi (running_room_id, record_date, item_type),
  KEY ix_ldi_date (record_date),
  CONSTRAINT fk_ldi_rr FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The four issue counts carry across unchanged — they were already per item.
INSERT INTO linen_daily_item (running_room_id, record_date, item_type, issued)
  SELECT running_room_id, record_date, 'bedsheet',     bedsheets_issued     FROM linen_daily
  UNION ALL
  SELECT running_room_id, record_date, 'pillow_cover', pillow_covers_issued FROM linen_daily
  UNION ALL
  SELECT running_room_id, record_date, 'mosquito_net', mosquito_nets_issued FROM linen_daily
  UNION ALL
  SELECT running_room_id, record_date, 'blanket',      blankets_issued      FROM linen_daily;

-- The three aggregates cannot be carried across, because splitting one number
-- into five would be inventing four figures nobody counted. They stay in
-- linen_daily_pre032 and go no further.
ALTER TABLE linen_daily
  DROP COLUMN bedsheets_issued,
  DROP COLUMN pillow_covers_issued,
  DROP COLUMN mosquito_nets_issued,
  DROP COLUMN blankets_issued,
  DROP COLUMN soiled_sent_to_wash,
  DROP COLUMN fresh_received,
  DROP COLUMN fresh_stock_in_hand;

-- `min_stock_met` stays, but stops being something anybody types. It used to be
-- set to "stock >= bedsheets issued", which is not a condition the tender
-- contains. It is now derived on save from the item rows against Schedule C:
-- two sets of bedsheets and two sets of pillow covers per sanctioned bed. The
-- basis is printed on the screen next to the result so that a supervisor who
-- knows the clause to mean something else can say so, rather than a red flag
-- appearing with no arithmetic behind it.
ALTER TABLE linen_daily
  MODIFY COLUMN min_stock_met TINYINT(1) NULL DEFAULT NULL;
