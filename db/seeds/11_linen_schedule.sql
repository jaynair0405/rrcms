-- The linen schedule, transcribed from the executed GeM contract for IGP,
-- GEMC-511687722391404, pages 83 and 84.
--
-- `contract_id` is NULL on every row: these are the terms applied wherever a
-- site's own contract has not been read in, which today is every running room.
-- When LNL's, ROHA's or JNPT's contracts arrive and differ, they get their own
-- rows against their contract id and these stay as the fallback.
--
-- DELIVERY PERIOD is the one the laundry register runs on. The earlier tender
-- paper gave a flat 48 hours for everything and the register applied it; the
-- executed contract does not, and the difference runs both ways.
--
-- RECOVERY RATE is copied off page 84 and multiplied by nothing, here or
-- anywhere. A shortfall of eleven bed sheets is eleven bed sheets at Rs 170 a
-- unit; what is actually recovered from the bill is the officer's act.
INSERT INTO linen_schedule
  (item_type, contract_id, name, delivery_days, wash_frequency, per_bed,
   recovery_rate, schedule_qty, source_ref, sort_order)
VALUES
  ('bedsheet',       NULL, 'Bed sheet',       1, 'Each occupant',    2, 170.00, 365200,
   'GEMC-511687722391404 pp.83-84', 10),
  ('pillow_cover',   NULL, 'Pillow cover',    1, 'Each occupant',    1,  45.00, 182500,
   'GEMC-511687722391404 pp.83-84', 20),
  ('mosquito_net',   NULL, 'Mosquito net',    1, 'Once in a week',   1, 170.00,  17680,
   'GEMC-511687722391404 pp.83-84', 30),
  ('curtain',        NULL, 'Curtain',         3, 'Every 15 days', NULL, 450.00,  12000,
   'GEMC-511687722391404 pp.83-84 — per running room, not per bed', 40),
  ('mattress_cover', NULL, 'Mattress cover',  3, 'Every 15 days',    1, 400.00,   8160,
   'GEMC-511687722391404 pp.83-84', 50),
  ('blanket',        NULL, 'Woollen blanket', 3, 'Every month',      1, 397.00,   4000,
   'GEMC-511687722391404 pp.83-84', 60),
  ('blanket_cover',  NULL, 'Blanket cover',   7, 'Every 15 days',    1, 230.00,   9600,
   'GEMC-511687722391404 pp.83-84', 70),
  -- Anything the register has to record that the contract does not name. No
  -- delivery period, because inventing one would be the system making up a
  -- contractual term.
  ('other',          NULL, 'Other linen',  NULL, NULL,            NULL,   NULL,   NULL,
   'not named in the contract', 80)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), delivery_days = VALUES(delivery_days),
  wash_frequency = VALUES(wash_frequency), per_bed = VALUES(per_bed),
  recovery_rate = VALUES(recovery_rate), schedule_qty = VALUES(schedule_qty),
  source_ref = VALUES(source_ref), sort_order = VALUES(sort_order);
