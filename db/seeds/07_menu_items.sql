-- 07 — Table A and Table B, from the tender
--
-- Source: "Improvement of Running Room Facilities", SCHEDULE B, sections A and
-- B. Transcribed as printed, including the tender's own spelling and its own
-- inconsistencies. Two things are deliberately NOT tidied here:
--
--   * Table B prints "Parathas" as its fifth line and "Paratha" as its
--     twentieth. That may be a slip in the document or it may be two different
--     things. It is the Railway's list to correct, not ours to quietly merge —
--     a rate board with an item silently removed is a rate board the contractor
--     can be overcharged against without recourse.
--
--   * NO RATE IS SEEDED FOR ANY TABLE-B ITEM. The tender's "Cost in Rs."
--     column is blank: the rates "shall be fixed by Railways ... on the basis
--     of no-profit, no-loss" and displayed on the rate board. They are data the
--     division owes. Inventing plausible figures here would put numbers on a
--     wall poster that no order supports, and clause B6 — overcharging — would
--     then be tested against a price nobody set.
--
-- Table A's rates ARE known and are already seeded in 06_meal_rates.sql:
-- Rs 69.30 full / Rs 62.37 subsidy for a meal, Rs 42.00 / Rs 37.80 for
-- breakfast, both including 5% GST.
--
-- Idempotent: re-running updates the wording and leaves everything else.

INSERT INTO menu_items (code, schedule_table, name, contents, unit, applies_to, sort_order, source_ref) VALUES

-- ------------------------------------------------------------------ Table A
-- The quantities are the tender's own, and it calls them approximate. They are
-- still the only quantity a "serving less quantity" case under B6 can be made
-- against, so they are held word for word.
('A-VEG-PLATE','A','Veg. Rice Plate',
 'Three Parathas or Five fulkas, one full katori sabji (200 gms approx. with gravy), one katori dry sabji (100 grams approx), one full katori dal (200 gms approx.), one full plate rice (150 gms approx.), one roasted papad, pickle, curd (100 gm), kosambir/green salad containing onion, kakidi, lemon, tomato etc. (Weekly Menu will be decided.)',
 'plate','any',10,'Schedule B, Table-A'),

('A-EGG-PLATE','A','Egg Curry Rice Plate',
 'Three Parathas or Five fulkas, one plate rice (150 gms approx.), Eggs curry 200 gms approx. with two boiled eggs, one roasted papad and green salad onion, kakidi, lemon, tomato etc.',
 'plate','any',20,'Schedule B, Table-A'),

('A-BREAKFAST','A','Breakfast (veg & non-veg)',
 'Veg — Two parotha of aloo/cabbage/methi/Palak OR 2 Masala Dosa with Chutney and Sambhar OR One plate Sheera + One plate Upma OR One plate Poha + One plate Sheera (150 gms plate) OR Four idlis + Two medu vada with sambhar and chutney OR 4 Puri + 150 gm Sabzi, + 200 ml Milk along with Tea/Coffee (Weekly Menu will be decided). Non-veg — two parotha/bread with double egg omelet + 200 ml milk along with Tea/Coffee.',
 'plate','breakfast',30,'Schedule B, Table-A'),

-- ------------------------------------------------------------------ Table B
-- "Optional items on Extra payment". Twenty-three lines as printed. The rate
-- column is blank in the tender and stays blank here.
('B-TEA-ORD',      'B','Tea (Ordinary 1:1 milk-water)', NULL,'100 ml','any', 100,'Schedule B, Table-B'),
('B-TEA-SPL',      'B','Special Tea (with full milk)',  NULL,'100 ml','any', 110,'Schedule B, Table-B'),
('B-MILK',         'B','Milk (pure milk with sugar)',   NULL,'200 ml','any', 120,'Schedule B, Table-B'),
('B-COFFEE',       'B','Coffee (prepared with pure milk)',NULL,'100 ml','any',130,'Schedule B, Table-B'),
('B-PARATHAS',     'B','Parathas',                      NULL,NULL,'any',      140,'Schedule B, Table-B'),
('B-FULKA',        'B','Fulka',                         NULL,NULL,'any',      150,'Schedule B, Table-B'),
('B-DAL-FULL',     'B','Standard Dal per bowl (full)',  NULL,'200 ml','any',  160,'Schedule B, Table-B'),
('B-DAL-HALF',     'B','Standard Dal per bowl (half)',  NULL,'100 ml','any',  170,'Schedule B, Table-B'),
('B-RICE',         'B','Rice per bowl',                 NULL,'150 gms','any', 180,'Schedule B, Table-B'),
('B-SABJI-W-FULL', 'B','Vegetable curry (wet) / sabji bowl (full)',NULL,'200 ml','any',190,'Schedule B, Table-B'),
('B-SABJI-W-HALF', 'B','Vegetable curry (wet) / sabji bowl (half)',NULL,'100 ml','any',200,'Schedule B, Table-B'),
('B-SABJI-D-FULL', 'B','Dry sabji (full bowl)',         NULL,'200 gms','any', 210,'Schedule B, Table-B'),
('B-SABJI-D-HALF', 'B','Dry sabji (half bowl)',         NULL,'100 gms','any', 220,'Schedule B, Table-B'),
('B-EGG2-CURRY',   'B','Double Egg with separate curry',NULL,'200 ml','any',  230,'Schedule B, Table-B'),
('B-EGG1-CURRY',   'B','Single Egg with separate curry',NULL,'100 ml','any',  240,'Schedule B, Table-B'),
('B-EGG2-BHURJI',  'B','Double Egg Bhurji',             NULL,NULL,'any',      250,'Schedule B, Table-B'),
('B-EGG2-OMELET',  'B','Double Egg Omelet',             NULL,NULL,'any',      260,'Schedule B, Table-B'),
('B-EGG1-BHURJI',  'B','Single Egg Bhurji',             NULL,NULL,'any',      270,'Schedule B, Table-B'),
('B-EGG1-OMELET',  'B','Single Egg Omelet',             NULL,NULL,'any',      280,'Schedule B, Table-B'),
-- The tender's twentieth line, printed singular where its fifth is plural.
-- Kept as its own item; see the note at the head of this file.
('B-PARATHA',      'B','Paratha',                       NULL,NULL,'any',      290,'Schedule B, Table-B'),
('B-MASKA-SLICE',  'B','Maska slice (pair)',            NULL,NULL,'any',      300,'Schedule B, Table-B'),
('B-CURD',         'B','Curd',                          NULL,'100 gm','any',  310,'Schedule B, Table-B'),
('B-FRUITS',       'B','Seasonal Fruits',               NULL,NULL,'any',      320,'Schedule B, Table-B')

ON DUPLICATE KEY UPDATE
  name = VALUES(name), contents = VALUES(contents), unit = VALUES(unit),
  applies_to = VALUES(applies_to), sort_order = VALUES(sort_order),
  source_ref = VALUES(source_ref);
