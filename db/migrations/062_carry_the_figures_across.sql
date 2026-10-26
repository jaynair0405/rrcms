-- 062 — nothing recorded so far is lost
--
-- Every figure already on the daily register is carried into the two tables
-- that now hold it. Two kinds of figure are there and they are NOT the same
-- thing, which is the whole point of the change:
--
--   is_counted = 1   somebody counted the shelf. That is a count, and the
--                    latest one per item becomes the accepted baseline —
--                    because until today a saved count WAS the register's
--                    figure, and the screens must go on showing what they
--                    showed. Accepting it changes no number; it records the
--                    standing the figure already had.
--
--   is_counted = 0   the ledger's own arithmetic, saved. That is not a count
--                    and must not become one. Where an item has never been
--                    counted, the EARLIEST such figure is taken as the
--                    register's opening position and the book replays every
--                    movement since — which is exactly what the old screen
--                    was doing, one day at a time.
--
-- The old columns are left where they are. An applied migration is never
-- edited and a dropped column is never recovered; they stop being written and
-- the code stops reading them, which is reversible, and a column nobody reads
-- costs nothing. See AUDIT.md.

INSERT INTO linen_count (running_room_id, block_id, item_type, counted_on, quantity, note)
SELECT running_room_id, block_id, item_type, record_date, fresh_in_hand,
       'carried from the daily register — the counter''s name was never recorded there'
  FROM linen_daily_item
 WHERE is_counted = 1 AND fresh_in_hand IS NOT NULL;

INSERT INTO linen_shelf_baseline
       (running_room_id, block_id, item_type, as_on_date, quantity, source, from_count_id, note)
SELECT c.running_room_id, c.block_id, c.item_type, c.counted_on, c.quantity, 'count', c.id,
       'this count was already the register''s figure'
  FROM linen_count c
  JOIN (SELECT running_room_id, block_key, item_type, MAX(counted_on) AS d
          FROM linen_count GROUP BY running_room_id, block_key, item_type) m
    ON m.running_room_id = c.running_room_id AND m.block_key = c.block_key
   AND m.item_type = c.item_type AND m.d = c.counted_on;

UPDATE linen_count c
  JOIN linen_shelf_baseline b ON b.from_count_id = c.id
   SET c.accepted_on = c.counted_on, c.accepted_at = c.counted_at;

INSERT INTO linen_shelf_baseline
       (running_room_id, block_id, item_type, as_on_date, quantity, source, note)
SELECT i.running_room_id, i.block_id, i.item_type, i.record_date, i.fresh_in_hand, 'opening',
       'the register''s opening figure — never counted, carried so the book has a start'
  FROM linen_daily_item i
  JOIN (SELECT running_room_id, block_key, item_type, MIN(record_date) AS d
          FROM linen_daily_item WHERE fresh_in_hand IS NOT NULL
         GROUP BY running_room_id, block_key, item_type) m
    ON m.running_room_id = i.running_room_id AND m.block_key = i.block_key
   AND m.item_type = i.item_type AND m.d = i.record_date
 WHERE i.fresh_in_hand IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM linen_count c
                    WHERE c.running_room_id = i.running_room_id
                      AND c.block_key = i.block_key AND c.item_type = i.item_type);
