-- 05_food_check_items.sql
-- The food safety inspection checklist for a running room kitchen.
--
-- Every line traces to a source: a numbered Condition of Licence printed on
-- the Form C itself, Schedule 4 of the Food Safety and Standards (Licensing
-- and Registration of Food Businesses) Regulations 2011, or the FSS Act.
-- The source_ref column carries that citation so a disputed observation can
-- be settled by reading the licence rather than by arguing with the officer.
--
-- is_critical marks the items that make a visit unsatisfactory on their own.
-- These are deliberately few. A missing notice board is a lapse; serving from
-- an unlicensed kitchen, or an untraceable water supply, is a different order
-- of thing and the result should say so.

INSERT INTO food_check_items
  (item_code, section, section_name, description, source_ref, is_critical, sort_order) VALUES

-- Licence and standing -------------------------------------------------------
('FL-01','licence','Licence & standing',
 'A true copy of the licence in Form C is displayed at a prominent place in the premises',
 'Condition of Licence 1', 1, 10),
('FL-02','licence','Licence & standing',
 'The licence is within its validity period and not suspended or cancelled',
 'FSS Act 2006, s.31', 1, 20),
('FL-03','licence','Licence & standing',
 'Food prepared is confined to the product categories endorsed on the licence',
 'Condition of Licence 6', 0, 30),
('FL-04','licence','Licence & standing',
 'Any change in premises, activity or person in charge has been communicated to the licensing authority',
 'Condition of Licence 3', 0, 40),
('FL-05','licence','Licence & standing',
 'Access to the premises is given to the licensing authority or its authorised personnel on demand',
 'Condition of Licence 2', 0, 50),

-- Premises -------------------------------------------------------------------
('FP-01','premises','Premises & layout',
 'The kitchen is effectively separated from any privy, urinal, drain, sullage or store of waste matter',
 'Condition of Licence 10', 1, 60),
('FP-02','premises','Premises & layout',
 'Floors, walls and ceilings of the kitchen are sound, washable and free of flaking, seepage or grease build-up',
 'Schedule 4 Part II', 0, 70),
('FP-03','premises','Premises & layout',
 'Lighting and ventilation over working areas are adequate; exhaust is working and grease filters are clean',
 'Schedule 4 Part II', 0, 80),
('FP-04','premises','Premises & layout',
 'Windows, doors and openings are screened against flies, rodents and birds',
 'Schedule 4 Part II', 0, 90),
('FP-05','premises','Premises & layout',
 'A pest control record is maintained and treatment is current',
 'Schedule 4 Part II', 0, 100),

-- Equipment ------------------------------------------------------------------
('FE-01','equipment','Equipment & utensils',
 'Utensils and food contact surfaces are of non-toxic, non-corroding material and free of cracks or dents',
 'Schedule 4 Part II', 0, 110),
('FE-02','equipment','Equipment & utensils',
 'A cleaning schedule is followed for machines and equipment, including clean-in-place where applicable',
 'Condition of Licence 11', 0, 120),
('FE-03','equipment','Equipment & utensils',
 'Refrigerators and deep freezers are working, with a thermometer readable from outside',
 'Condition of Licence 13', 0, 130),
('FE-04','equipment','Equipment & utensils',
 'LPG cylinders are stored upright in a ventilated place away from the cooking range, with the hose within date',
 'Schedule 4 Part II / gas safety', 0, 140),

-- Personnel ------------------------------------------------------------------
('FH-01','personnel','Food handlers',
 'At least one technical person supervises the production process, holding a qualifying degree or diploma',
 'Condition of Licence 4', 1, 150),
('FH-02','personnel','Food handlers',
 'Every food handler holds a medical fitness certificate not older than one year',
 'Schedule 4 Part II', 1, 160),
('FH-03','personnel','Food handlers',
 'Food handlers are in clean uniform with head cover, and hands are clean with nails trimmed',
 'Schedule 4 Part II', 0, 170),
('FH-04','personnel','Food handlers',
 'No food handler with an open wound, boil, sore throat or gastro-intestinal complaint is on food duty',
 'Schedule 4 Part II', 1, 180),
('FH-05','personnel','Food handlers',
 'Hand wash facility with soap is provided at the entry to the food preparation area',
 'Schedule 4 Part II', 0, 190),
('FH-06','personnel','Food handlers',
 'At least one food handler has undergone FoSTaC training and the certificate is on record',
 'FSSAI FoSTaC order', 0, 200),

-- Storage --------------------------------------------------------------------
('FS-01','storage','Raw material & storage',
 'Raw material is bought only from licensed or registered vendors and the record is maintained',
 'Condition of Licence 14', 1, 210),
('FS-02','storage','Raw material & storage',
 'No item on the shelf is past its use-by or best-before date',
 'Schedule 4 Part II', 1, 220),
('FS-03','storage','Raw material & storage',
 'Raw and cooked food are stored separately; vegetarian and non-vegetarian are kept apart',
 'Schedule 4 Part II', 0, 230),
('FS-04','storage','Raw material & storage',
 'Stock is on racks clear of the floor and the wall, and rotated first-in-first-out',
 'Schedule 4 Part II', 0, 240),
('FS-05','storage','Raw material & storage',
 'Edible oil, ghee and vanaspati are in labelled, packed containers as prescribed and not re-used repeatedly',
 'Other Condition 7', 0, 250),

-- Preparation and service ----------------------------------------------------
('FC-01','preparation','Preparation & service',
 'Cooked food is held above 60 C or below 5 C until served, and the temperature is recorded',
 'Condition of Licence 13', 1, 260),
('FC-02','preparation','Preparation & service',
 'Food is served within the safe holding period; leftovers are not re-served to crew',
 'Schedule 4 Part II', 1, 270),
('FC-03','preparation','Preparation & service',
 'Serving crockery, cutlery and trays are washed, sanitised and stored covered',
 'Schedule 4 Part II', 0, 280),
('FC-04','preparation','Preparation & service',
 'Food is transported to the rest area in covered, food-grade containers',
 'Condition of Licence 13', 0, 290),

-- Water ----------------------------------------------------------------------
('FW-01','water','Water & ice',
 'Water used in cooking and washing is of potable quality from a traceable source',
 'Schedule 4 Part II', 1, 300),
('FW-02','water','Water & ice',
 'A water test report from a NABL-accredited or FSSAI-recognised laboratory is available and current',
 'Condition of Licence 12', 0, 310),
('FW-03','water','Water & ice',
 'Storage tanks are covered and their cleaning record is maintained',
 'Schedule 4 Part II', 0, 320),

-- Waste ----------------------------------------------------------------------
('FD-01','waste','Waste & drainage',
 'Waste bins are covered, pedal-operated where provided, and emptied at the end of every shift',
 'Schedule 4 Part II', 0, 330),
('FD-02','waste','Waste & drainage',
 'Drains are covered, trapped and flowing; no stagnant water in or around the kitchen',
 'Schedule 4 Part II', 0, 340),
('FD-03','waste','Waste & drainage',
 'Used cooking oil is disposed of through an authorised channel and the record is kept',
 'FSSAI RUCO', 0, 350),

-- Records --------------------------------------------------------------------
('FR-01','records','Records & returns',
 'Daily records of production, raw material utilisation and issue are maintained',
 'Condition of Licence 8', 0, 360),
('FR-02','records','Records & returns',
 'The annual return for the year 1 April to 31 March has been furnished by 31 May',
 'Condition of Licence 5', 0, 370),
('FR-03','records','Records & returns',
 'Chemical and microbiological testing of food products has been done at least once in six months',
 'Condition of Licence 12', 1, 380),
('FR-04','records','Records & returns',
 'A food sample of each meal served is retained for the prescribed period',
 'Schedule 4 Part II', 0, 390),

-- Display --------------------------------------------------------------------
('FN-01','display','Notices & display',
 'A notice board lists the articles cooked in ghee, edible oil, vanaspati and other fats',
 'Other Condition 1', 0, 400),
('FN-02','display','Notices & display',
 'A notice board displays the nature of the cooked or prepared articles exposed for sale',
 'Other Condition 2', 0, 410),
('FN-03','display','Notices & display',
 'The menu and tariff approved by the Railway are displayed where the crew can read them',
 'Contract condition', 0, 420)

ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  source_ref  = VALUES(source_ref),
  is_critical = VALUES(is_critical),
  sort_order  = VALUES(sort_order);

-- ---------- permissions ----------
INSERT INTO permissions (code,description) VALUES
  ('fssai.view','View food safety licences and inspections'),
  ('fssai.edit','Record a food licence, renewal or periodic return'),
  ('fssai.inspect','Carry out a food safety inspection')
ON DUPLICATE KEY UPDATE description=VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('hq','fssai.view'),
  ('div_officer','fssai.view'),
  ('div_officer','fssai.edit'),
  ('div_officer','fssai.inspect'),
  ('rr_incharge','fssai.view'),
  ('rr_incharge','fssai.edit'),
  ('rr_incharge','fssai.inspect'),
  -- The contractor holds the licence, so he is the one who has the
  -- certificate and the lab report. He may lodge them; he may not inspect.
  ('contractor_sup','fssai.view'),
  ('contractor_sup','fssai.edit'),
  ('sysadmin','fssai.view')
)
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id);
