-- 13 — the asset catalogue.
--
-- "What it is" on the asset register was a free-text box, and a register where
-- one man types "Cot" and the next types "Cott" cannot be counted. See
-- migration 047 for why a fixed dropdown was the wrong answer and a catalogue
-- that grows is the right one.
--
-- EVERY NAME HERE IS ONE THE DOCUMENTS THEMSELVES USE. The Part-C lines name
-- what the contract buys; the rest are the things the cleaning schedule and the
-- penalty clauses require the contractor to clean, maintain or repair, which is
-- the tender stating that a running room has them. Nothing is invented: a name
-- nobody has written down is a name the In-charge adds on the day he receives
-- the thing, and it joins this list from there.
--
-- `match_key` is the name reduced to letters and digits in lower case. That is
-- what UNIQUE is built on, so "Water cooler", "water-cooler" and "Water Cooler "
-- cannot become three entries.

INSERT INTO asset_items (name, match_key, category, source_ref) VALUES
  -- Part-C of the contract: what it actually buys.
  ('RO plant 500 LPH',      'roplant500lph',    'Drinking water', 'GEMC-511687722391404 Part-C, NS-12'),
  ('RO plant 250 LPH',      'roplant250lph',    'Drinking water', 'GEMC-511687722391404 Part-C, NS-12'),
  ('Cot',                   'cot',              'Bedding',        'GEMC-511687722391404 Part-C, NS-13'),
  ('Mattress',              'mattress',         'Bedding',        'GEMC-511687722391404 Part-C, NS-14'),
  ('Foot massager',         'footmassager',     'Crew amenity',   'GEMC-511687722391404 Part-C, NS-16'),
  ('Shoe polish machine',   'shoepolishmachine','Crew amenity',   'GEMC-511687722391404 Part-C, NS-17'),

  -- Named in the cleaning schedule: the tender requires them to be cleaned,
  -- which is the tender saying a running room has them.
  ('Geyser',                'geyser',           'Electrical',     'Part-B cleaning schedule, row 9'),
  ('Water cooler',          'watercooler',      'Drinking water',  'Part-B cleaning schedule, rows 10 and 12'),
  ('Ceiling fan',           'ceilingfan',       'Electrical',     'Part-B cleaning schedule, row 9'),
  ('Fan regulator',         'fanregulator',     'Electrical',     'Part-B cleaning schedule, row 9'),
  ('Exhaust fan',           'exhaustfan',       'Electrical',     'Part-B cleaning schedule, row 9'),
  ('Tube light',            'tubelight',        'Electrical',     'Part-B cleaning schedule, row 9'),
  ('Night lamp',            'nightlamp',        'Electrical',     'Part-B cleaning schedule, row 9'),
  ('Switch board',          'switchboard',      'Electrical',     'Part-B cleaning schedule, row 9'),
  ('Electric chimney',      'electricchimney',  'Kitchen',        'Part-B cleaning schedule, row 9'),
  ('Hot box',               'hotbox',           'Kitchen',        'Part-B cleaning schedule, row 9'),
  ('Fly catcher',           'flycatcher',       'Kitchen',        'Part-B cleaning schedule, row 9'),
  ('Wall clock',            'wallclock',        'Fittings',       'Part-B cleaning schedule, row 11'),
  ('Steel locker',          'steellocker',      'Furniture',      'Part-B cleaning schedule, row 7'),
  ('Wooden cupboard',       'woodencupboard',   'Furniture',      'Part-B cleaning schedule, row 7'),
  ('Multi steel chair',     'multisteelchair',  'Furniture',      'Part-B cleaning schedule, row 7'),
  ('Centre table',          'centretable',      'Furniture',      'Part-B cleaning schedule, row 7'),
  ('Wooden stand',          'woodenstand',      'Furniture',      'Part-B cleaning schedule, row 7'),
  ('Notice board',          'noticeboard',      'Furniture',      'Part-B cleaning schedule, row 7'),
  ('Table cum locker',      'tablecumlocker',   'Furniture',      'Part-B cleaning schedule, row 7'),
  ('Dining table',          'diningtable',      'Furniture',      'Part-B cleaning schedule, row 6'),

  -- Named in the penalty clauses: a thing the contract fines him for not
  -- repairing is a thing the running room has.
  ('Bio-digester',          'biodigester',      'Sanitation',     'GEMC-511687722391404 section 4, clause (j)')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), source_ref = VALUES(source_ref);

-- Assets already on the register are linked to the catalogue where the name
-- matches. Anything typed before this existed keeps its own name and simply has
-- no catalogue entry, which is honest: nobody chose it from a list.
UPDATE assets a
  JOIN asset_items i
    ON i.match_key = LOWER(REGEXP_REPLACE(a.name, '[^A-Za-z0-9]', ''))
   SET a.item_id = i.id
 WHERE a.item_id IS NULL;
