-- 14_asset_items_igp.sql
-- Items the Igatpuri inventory holds that the catalogue did not.
--
-- The catalogue was written from the tender's own supply schedule, so it knows
-- what the CONTRACTOR must provide and not what the Railway already owns. The
-- inventory of 21 May 2025 counts six kinds of thing the list had no word for —
-- and a register that cannot name a thing gets it typed in free-hand, which is
-- the fault the catalogue was built to stop.
--
-- The RO plants are the plainest case: the catalogue had 250 and 500 LPH,
-- because those are the sizes the tender prices. Igatpuri has two of 1000 and
-- one of 100. Without these rows the man entering them would have picked "RO
-- plant 500 LPH" as the nearest thing on the list, and the register would say
-- something untrue about equipment the Railway is accountable for.
--
-- match_key is the name reduced to letters and digits, lower case, so
-- "Air conditioner", "air-conditioner" and "Air Conditioner " cannot become
-- three entries. Same rule as seed 13.

INSERT INTO asset_items (name, match_key, category, source_ref, is_active) VALUES
  ('Refrigerator',      'refrigerator',    'Kitchen',        'IGP inventory 21.05.2025', 1),
  ('Water filter',      'waterfilter',     'Drinking water', 'IGP inventory 21.05.2025', 1),
  ('RO plant 100 LPH',  'roplant100lph',   'Drinking water', 'IGP inventory 21.05.2025', 1),
  ('RO plant 1000 LPH', 'roplant1000lph',  'Drinking water', 'IGP inventory 21.05.2025', 1),
  ('Air conditioner',   'airconditioner',  'Electrical',     'IGP inventory 21.05.2025', 1),
  ('Fire extinguisher', 'fireextinguisher','Safety',         'IGP inventory 21.05.2025', 1)
ON DUPLICATE KEY UPDATE
  category = VALUES(category), source_ref = VALUES(source_ref), is_active = 1;
