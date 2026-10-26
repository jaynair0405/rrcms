-- 09 — Schedule D, the consumables, newspapers and magazines
--
-- WHY THIS FILE EXISTS AT ALL
--
-- `consumable_items` was created at stage 6 and has a working screen that reads
-- it, and IT HAS NEVER BEEN SEEDED. Every item on the consumables page of the
-- demo comes from demo/data.js; on a real database the page is empty and always
-- has been. Found while looking for the newspapers and magazines under audit
-- item P14 — which turned out not to be missing from a list, because there was
-- no list.
--
-- This is the fourth appearance of one fault: a table laid down ahead of the
-- data that gives it meaning (feedback_coverage at stage 19, staff.photo_file_id
-- at stage 23, menu_items at stage 25, and now this). The demo hides it every
-- time, because the demo's stub always has something to return.
--
-- The list below is Schedule D as printed, in the tender's own order and its own
-- words. Quantities are NOT here: the tender gives them as "Actual Nos." and
-- "as per requirement", to be calculated per site from area, beds and condition.
-- Inventing a number would put a figure on a supply schedule that no document
-- supports.
--
-- Brands are only recorded where the tender names them. Clause D1 penalises
-- non-supply "as per scope"; D2 penalises short supply of newspapers and
-- magazines at twice the cost of what was not supplied — which is why the five
-- publications are items in their own right and not a line of prose.

INSERT INTO consumable_items
  (code, name, schedule_code, unit, supply_frequency, approved_brands, is_active) VALUES

-- Schedule D, items 1 to 6 — the fittings the running room is supplied with.
('SD01','Big dust bin, swivel type, 80 to 100 litres',            'D','nos','as_required',NULL,1),
('SD02','Plastic buckets 20 litres, for bathrooms',               'D','nos','as_required',NULL,1),
('SD03','Plastic buckets 5 litres, for lavatories',               'D','nos','as_required',NULL,1),
('SD04','Plastic mugs 1.5 litres, for bathrooms',                 'D','nos','as_required',NULL,1),
('SD05','Bathroom stools, 30 cm height',                          'D','nos','as_required',NULL,1),
('SD06','Dustbin small for bedrooms, 10 to 15 litres, foot operated','D','nos','as_required',NULL,1),

-- Items 7 to 11 — the reading matter for the recreation room. The tender:
-- "Contractor shall also arrange to provide Newspapers & Magazines in
-- recreation room of the running room for use of running room occupants. The
-- record of the newspaper & magazines shall be maintained for perusal to
-- railway representative."
('SD07','One popular Hindi newspaper',                            'D','copy','daily',NULL,1),
('SD08','One popular English newspaper',                          'D','copy','daily',NULL,1),
('SD09','One popular Marathi newspaper',                          'D','copy','daily',NULL,1),
('SD10','India Today (Hindi)',                                    'D','copy','weekly','India Today (Hindi) — each edition',1),
('SD11','One Marathi magazine',                                   'D','copy','weekly','Lokprabha or Chitralekha',1),

-- Items 12 and 13 — uniform and shoes. Supplied to the RR In-charge, who
-- distributes: "Uniform shall be supplied to RR incharge every 6 months, who
-- will in turn distribute the same to the staff. Shoes shall be supplied one
-- pair per staff per year."
('SD12','Uniform — two pairs for every running room staff',       'D','set','half_yearly','sample approved by the RR In-charge before use',1),
('SD13','Shoes — one pair for every staff',                       'D','pair','yearly',NULL,1),

-- Item 14 — cleaning material. The tender leaves the quantity to be estimated
-- per site: "Requirement should be calculated based on actual area, beds,
-- conditions of respective running room while preparing estimates."
('SD14','Cleaning material for kitchen, dining hall, bathroom, lavatory and running room area',
                                                                  'D','lot','monthly',
 'branded quality only; caustic soda, acid and bleaching powder are not to be used',1)

ON DUPLICATE KEY UPDATE
  name = VALUES(name), schedule_code = VALUES(schedule_code), unit = VALUES(unit),
  supply_frequency = VALUES(supply_frequency), approved_brands = VALUES(approved_brands);

-- CATEGORY: which rows an executed contract replaces, and which it leaves alone.
--
-- A site's own contract names its newspapers -- IGP's names four titles -- and
-- says nothing about dustbins and buckets. So "the contract wins" is applied per
-- category: within a category the contract has spoken about, its rows are the
-- whole answer for that running room; categories it is silent on keep these.
-- Without this the consumables page at IGP listed both lists at once.
UPDATE consumable_items SET category = 'press'
 WHERE code IN ('SD07','SD08','SD09','SD10','SD11');
UPDATE consumable_items SET category = 'fittings'
 WHERE code IN ('SD01','SD02','SD03','SD04','SD05','SD06');

-- SD14 joins them, and it is the reason this line was added. Until IGP's
-- Annexure-A arrived, SD14 -- "cleaning material ... lot ... monthly" -- was the
-- ONLY thing RR-CMS could say about cleaning materials, because the generic
-- tender leaves the quantity to be estimated per site. Annexure-A is that
-- estimate for IGP: 21 named items with quantities, packs and rates. With SD14
-- left uncategorised the consumables page at IGP would print both -- the 21
-- real items AND the one-line "lot" that stands in for them -- which is the
-- same fault the newspapers had before 'press' was set here.
--
-- Uniform and shoes (SD12, SD13) stay uncategorised on purpose. No contract has
-- spoken about them, so nothing should replace them anywhere.
UPDATE consumable_items SET category = 'cleaning'
 WHERE code = 'SD14';

