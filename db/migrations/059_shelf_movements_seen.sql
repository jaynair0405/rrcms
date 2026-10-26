-- 059 — the daily row remembers the two outward movements too
--
-- Migration 057 gave linen_daily_item `returns_seen`: how many pieces had come
-- back from the wash when the row was saved. Comparing it with the register now
-- says exactly what has arrived since, with no timestamps and no guessing at
-- what a count included.
--
-- Two movements go the other way and need the same treatment: linen sent to
-- the wash FROM THE SHELF, and linen written off FROM THE SHELF. Both leave the
-- shelf, both were leaving the shelf figure untouched, and both therefore
-- overstate what the running room holds — which hides a shortfall rather than
-- inventing one. That is the dangerous direction for this register to be wrong
-- in: an officer reads "accounted for" and it is not.
--
-- Same shape as 057 on purpose. One idea, three columns, and a prompt on the
-- screen that offers the corrected figure and leaves the saving to the man.

ALTER TABLE linen_daily_item
  ADD COLUMN shelf_sent_seen SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER returns_seen,
  ADD COLUMN shelf_off_seen  SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER shelf_sent_seen;
