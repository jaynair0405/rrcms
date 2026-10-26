-- 06_meal_rates.sql
--
-- The Schedule B ceilings for a running room meal.
--
-- These figures did not come from the tender file loaded elsewhere in these
-- seeds. They come from the Indicative Special Conditions of Contract for
-- Running Rooms, Central Railway (L.326.OP.RR Lobby/08 dated 24.07.2026), by
-- way of a control board prepared in the division. They are entered here
-- because a count of meals is worth little without the rate beside it, and
-- because a figure held in one place can be corrected in one place.
--
-- NOTHING MULTIPLIES BY THESE. No screen computes an amount, and none will
-- until the penalty and payment schedule is settled. They are printed as
-- reference beside the counts, with their source, and that is all.
--
-- If the reference above turns out to be superseded, correct these two rows and
-- add a new effective_from rather than editing history -- last year's count
-- must keep last year's rate.

INSERT INTO meal_rates (meal_type, effective_from, subsidised_rate, full_rate, source_ref) VALUES
  ('breakfast', '2026-07-24', 37.80, 42.00,
   'Indicative SCC for Running Rooms, Central Railway — L.326.OP.RR Lobby/08 dated 24.07.2026'),
  ('lunch',     '2026-07-24', 62.37, 69.30,
   'Indicative SCC for Running Rooms, Central Railway — L.326.OP.RR Lobby/08 dated 24.07.2026'),
  ('dinner',    '2026-07-24', 62.37, 69.30,
   'Indicative SCC for Running Rooms, Central Railway — L.326.OP.RR Lobby/08 dated 24.07.2026')
ON DUPLICATE KEY UPDATE
  subsidised_rate = VALUES(subsidised_rate),
  full_rate       = VALUES(full_rate),
  source_ref      = VALUES(source_ref);
