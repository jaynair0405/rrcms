-- 063 — when a day that has been settled is changed afterwards
--
-- THE LAST SEAM IN THE LINEN STORY, closed rather than patched.
--
-- Accepting a count fixes the shelf position at the close of a day. Everything
-- after that day is applied to it, which is the whole point. But a day that has
-- been settled can still be CHANGED afterwards: an issue figure corrected the
-- following morning, a dispatch entered late, a challan found in a drawer. The
-- accepted position was struck against a record that no longer exists, and
-- nothing about it looks wrong.
--
-- That is the same shape as every fault found in this register: a figure that
-- was true when it was written and became untrue without saying so. It cannot
-- be fixed by recomputing -- the count was of a shelf, on a day, and no
-- arithmetic can decide whether the correction was already in the man's count.
-- It can only be DETECTED and shown, and the officer told that the position he
-- accepted rests on a record that has since moved.
--
-- Detecting it needs one thing these two tables do not have: when the row was
-- last written. A date says which day the linen moved; it says nothing about
-- when somebody wrote it down, and the difference between those two is exactly
-- what this is about.
--
-- The other three registers already carry it: linen_written_off.recorded_at,
-- linen_stock.updated_at, and linen_count.counted_at.

ALTER TABLE linen_daily_item
  ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
             ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE laundry_dispatch
  ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
             ON UPDATE CURRENT_TIMESTAMP(3);

-- Every row already on record gets the moment this migration runs, which is
-- the honest answer: nobody knows when they were written, and dating them now
-- means no baseline accepted BEFORE today can be trusted to have been struck
-- against them. Since no baseline has ever been accepted before today, that
-- costs nothing and states the truth.
