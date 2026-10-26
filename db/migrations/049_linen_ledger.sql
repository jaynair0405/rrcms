-- 049 — fresh linen stock becomes a ledger that is periodically counted
--
-- WHAT WAS WRONG
--
-- "Fresh in hand" was typed every day, and the figure offered as a starting
-- point was YESTERDAY'S RAW FIGURE — not adjusted for anything that happened
-- since. So the supervisor was handed a number he knew to be stale and had to
-- redo the arithmetic in his head, every day, at every running room. Found by
-- the officer on first reading the screen: "why should fresh in hand be filled
-- every day? it should be autofilled and deducted every time issue is made,
-- and added up when a lot is received after washing."
--
-- He is right about the ledger. Fresh stock moves in exactly two ways:
--
--     yesterday's fresh  −  issued today  +  washed linen back today
--
-- Soiled linen going TO the wash does not reduce it; dirty linen was never
-- fresh stock. Both movements are already on record — issues on this register,
-- returns on the laundry record — so the figure can be computed and was not.
--
-- WHY IT IS NOT SIMPLY COMPUTED AND LEFT AT THAT
--
-- Part-E clause vii penalises the contractor for failing to hold two days'
-- consumption of washed linen. If the figure that clause turns on is
-- arithmetic, the contractor answers "your arithmetic is wrong" and the
-- Railway has nothing to reply with. A count answers it: a man stood at the
-- shelf and counted. And a pure running balance never self-corrects — one
-- unrecorded issue in September quietly poisons every figure until March, and
-- nothing on the screen ever looks wrong.
--
-- So: a ledger for every ordinary day, a physical count at an interval, and
-- the DIFFERENCE BETWEEN THEM kept rather than thrown away. That difference is
-- the most useful number on the page — it is linen that moved without being
-- written down, and it is invisible to a pure count and to a pure ledger
-- alike. Neither figure is derived from the other at read time: what the
-- ledger said, and what the man counted, are two facts, and a row that
-- overwrote one with the other could never show the gap.
--
-- WEEKLY. The count is due every seven days, the officer's decision. The
-- screen says how long it has been and flags a room running on arithmetic
-- alone. "Never counted" is not a pass.

ALTER TABLE linen_daily_item
  -- What the ledger said this figure should be, at the moment it was saved.
  -- NULL where there was no previous figure to carry from, which is the honest
  -- answer at a room's first ever entry.
  ADD COLUMN computed_in_hand SMALLINT UNSIGNED NULL AFTER fresh_in_hand,
  -- Whether fresh_in_hand is a count or the ledger's figure accepted. The
  -- supervisor states it; the system never infers it from the numbers being
  -- equal, because a count that agrees with the ledger is the most valuable
  -- count there is and must not be recorded as though nobody counted.
  ADD COLUMN is_counted TINYINT(1) NOT NULL DEFAULT 0 AFTER computed_in_hand;

-- Existing rows were typed by hand under the old screen, so they ARE counts.
-- Marking them computed would claim a ledger that did not exist.
UPDATE linen_daily_item SET is_counted = 1 WHERE fresh_in_hand IS NOT NULL;

-- "When was this last actually counted" is asked on every page load, per item.
CREATE INDEX ix_ldi_counted ON linen_daily_item (running_room_id, item_type, is_counted, record_date);
