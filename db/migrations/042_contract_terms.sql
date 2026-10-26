-- 042_contract_terms.sql
--
-- WHAT THIS FIXES, AND WHY IT IS ONE MIGRATION AND NOT SIX
--
-- Every reference table in RR-CMS -- penalty clauses, cleaning schedule,
-- consumables, meal rates -- was seeded from the EARLIER, GENERIC tender paper
-- for Central Railway running rooms. The executed contract for IGP
-- (GEMC-511687722391404, 28.08.2026) is a different document with different
-- numbers, and where the two differ the executed contract governs at IGP.
--
-- Reading that PDF one question at a time produced one fix at a time: linen at
-- stage 34, designations and establishment at stage 35. That was the wrong
-- shape of answer. This migration gives EVERY reference table the same
-- mechanism the linen schedule already had -- a nullable contract_id, where
-- NULL means "the fallback, used where nobody has read that site's contract"
-- and a value means "this contract says otherwise" -- so the remaining tables
-- can be corrected as data rather than as more migrations.
--
-- THE RULE THE ROUTES FOLLOW: if a running room's contract has rows of its own
-- in a table, those rows are the whole answer for that room. The NULL rows are
-- not merged in underneath. A contract that names 31 penalties names 31, not 31
-- plus whatever the generic paper had.
--
-- Nothing here computes an amount. Rates and values are recorded and printed
-- beside what they refer to, exactly as before.

-- ---------------------------------------------------------------- contractors
-- The firm's statutory identity. The FSSAI licence for a kitchen is issued to
-- the licensee named on it, and a licence in another firm's name is a finding,
-- so the GSTIN and UDYAM number are worth holding beside the name.
-- `gst_no` and `email` already exist from migration 003 and are used as they
-- stand. Only the MSME registration is new -- the contract prints it beside the
-- GSTIN and it is how a firm's MSE status is checked.
ALTER TABLE contractors
  ADD COLUMN udyam_no VARCHAR(30) NULL AFTER gst_no;

-- ------------------------------------------------------------------ contracts
-- Facts printed on the face of the contract that had nowhere to sit. The ePBG
-- percentage matters beyond record-keeping: clause 2.4 forfeits a quarter of
-- the guarantee once penalties pass half the ceiling and half of it past three
-- quarters, so the percentage is the first term in an arithmetic the officer
-- will one day have to do.
ALTER TABLE contracts
  ADD COLUMN bid_no           VARCHAR(60)   NULL AFTER agreement_no,
  ADD COLUMN epbg_percent     DECIMAL(5,2)  NULL AFTER performance_guarantee,
  ADD COLUMN advisory_bank    VARCHAR(120)  NULL AFTER epbg_percent,
  ADD COLUMN buyer_office     VARCHAR(200)  NULL AFTER advisory_bank,
  ADD COLUMN paying_authority VARCHAR(120)  NULL AFTER buyer_office,
  ADD COLUMN billing_cycle    VARCHAR(30)   NULL AFTER paying_authority,
  ADD COLUMN source_ref       VARCHAR(160)  NULL AFTER remarks;

-- ------------------------------------------------------- contract_line_items
-- The price schedule, one row per line, as printed.
--
-- Without this there is nothing to check a monthly bill against. The contract
-- buys 28 separately priced things; the bill claims against them; and until now
-- RR-CMS held not one of the 28.
--
-- `amount` is what the schedule shows. Several lines show 0.01 because GeM
-- carries their value inside the manpower and meal lines instead. That is
-- recorded as it stands. Guessing what those lines are "really" worth would be
-- the system inventing a contractual figure.
--
-- NOTHING MULTIPLIES THESE. quantity x rate is not computed, here or on any
-- screen, for the same reason no penalty amount is computed anywhere in RR-CMS.
CREATE TABLE contract_line_items (
  id                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id       INT UNSIGNED NOT NULL,
  item_code         VARCHAR(12)  NOT NULL COMMENT 'NS-1 .. NS-27, as the schedule numbers them',
  part_code         VARCHAR(4)   NULL     COMMENT 'A .. F, the schedule part',
  part_name         VARCHAR(120) NULL,
  description       VARCHAR(400) NOT NULL,
  unit              VARCHAR(30)  NULL,
  schedule_qty      DECIMAL(14,2) NULL    COMMENT 'quantity for the whole contract period',
  rate              DECIMAL(14,2) NULL    COMMENT 'per unit, where the schedule prints one',
  amount            DECIMAL(16,2) NULL    COMMENT 'as printed; 0.01 where GeM carries the value elsewhere',
  designation_code  VARCHAR(30)  NULL     COMMENT 'set where the line buys a post, so the roll can be read against it',
  daily_strength    SMALLINT UNSIGNED NULL COMMENT 'men per day, where the line buys manpower',
  remarks           VARCHAR(400) NULL,
  source_ref        VARCHAR(160) NULL,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cli (contract_id, item_code, description(120)),
  KEY ix_cli_contract (contract_id, sort_order),
  CONSTRAINT fk_cli_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------- deficiency_clauses
-- A contract's own penalty schedule.
--
-- The IGP contract letters its penalties (a) to (ee) and the generic paper
-- codes them A1..M12. They are not the same list and several collide outright:
-- the generic paper fines short deployment Rs 500 per person per day, the
-- contract Rs 1000 per person per SHIFT plus that day's minimum wages.
--
-- 'P' is added to group_code for a contract's own schedule. Contract clause
-- codes are prefixed with the site ('IGP-a') so they cannot collide with the
-- generic codes under a case-insensitive unique key -- 'a' and 'A' are the same
-- string to MySQL.
ALTER TABLE deficiency_clauses
  MODIFY COLUMN group_code ENUM('A','B','C','D','M','G','P') NOT NULL,
  MODIFY COLUMN clause_code VARCHAR(16) NOT NULL,
  ADD COLUMN contract_id INT UNSIGNED NULL AFTER id,
  -- Which generic clause this contract clause stands in place of.
  --
  -- Three places in the system raise a deficiency against a clause code written
  -- into the CODE -- intoxication as A3, late wages as M5, the compliance items
  -- as D3/D4/M12. At a running room whose contract has its own schedule, A3 is
  -- the wrong clause and the wrong rate: the generic paper fines intoxication
  -- Rs 1,000 per labour per case, IGP's contract Rs 500 per case. Naming the
  -- code a contract clause replaces lets those three call sites ask for "the
  -- clause that governs intoxication HERE" instead of asking for A3.
  --
  -- Where a contract is silent -- IGP's says nothing about late wages -- the
  -- generic clause is used, which is right: the site penalty list is not the
  -- whole of the contract conditions.
  ADD COLUMN supersedes_code VARCHAR(16) NULL AFTER contract_id,
  ADD COLUMN source_ref  VARCHAR(160) NULL AFTER effective_to,
  ADD KEY ix_defclause_supersedes (supersedes_code),
  ADD KEY ix_defclause_contract (contract_id),
  ADD CONSTRAINT fk_defclause_contract FOREIGN KEY (contract_id) REFERENCES contracts (id);

-- ------------------------------------------------------- cleaning_schedule
-- The IGP contract's cleaning table is 17 rows against the generic paper's 9,
-- and it states frequencies the ENUM could not hold: "Continuous", "Once in
-- Day", "On need basis", "Once in Week", "Before and generally after every
-- meal", "Morning & Evening".
--
-- `on_need` deserves a note. A row that is due "on need" can never be overdue,
-- so the register must not colour it red for a day nobody cleaned the dining
-- tables. The route treats it as recordable but never outstanding.
ALTER TABLE cleaning_schedule
  MODIFY COLUMN frequency ENUM('twice_daily','thrice_daily','weekly_sunday','sunday_2_4',
                               'monthly','continuous','once_daily','weekly','on_need',
                               'per_meal','morning_evening') NOT NULL,
  MODIFY COLUMN code VARCHAR(60) NOT NULL,
  ADD COLUMN contract_id INT UNSIGNED NULL AFTER id,
  ADD KEY ix_cleansched_contract (contract_id),
  ADD CONSTRAINT fk_cleansched_contract FOREIGN KEY (contract_id) REFERENCES contracts (id);

-- ------------------------------------------------------- consumable_items
-- The contract names its newspapers -- Times of India or Indian Express, Lokmat
-- or Gavkari, Navbharat or Maharashtra Times -- and makes India Today MONTHLY,
-- two copies, where the generic paper had it weekly. It names no Marathi
-- magazine at all. Clause D2 fines short supply at twice the cost of what was
-- not supplied, so which publication is owed is not a detail.
-- `category` is what makes "the contract wins" work on a table where the
-- contract replaces PART of the list and not all of it. IGP's contract names
-- its newspapers and says nothing about dustbins and buckets. So the rule is
-- applied per category: within a category the contract has spoken about, its
-- rows are the whole answer; categories it is silent on keep the generic rows.
ALTER TABLE consumable_items
  ADD COLUMN contract_id  INT UNSIGNED NULL AFTER id,
  ADD COLUMN category     VARCHAR(30) NULL
    COMMENT 'press, sanitary, fittings - the unit at which a contract replaces' AFTER schedule_code,
  ADD COLUMN qty_per_unit DECIMAL(10,2) NULL
    COMMENT 'how many per supply period, where the contract states a number' AFTER supply_frequency,
  ADD COLUMN source_ref   VARCHAR(160) NULL,
  ADD KEY ix_consumable_contract (contract_id),
  ADD CONSTRAINT fk_consumable_contract FOREIGN KEY (contract_id) REFERENCES contracts (id);

-- -------------------------------------------------------------- meal_rates
-- The contract sets the Railway's share at Rs 64.74 for lunch, dinner or parcel
-- and Rs 58.26 for breakfast or parcel -- "or 90% of the accepted cost,
-- whichever is less". RR-CMS was showing 62.37 and 37.80 from a divisional
-- control board that predates the contract.
--
-- `is_ceiling` records that these are a maximum and not a price. `cap_note`
-- carries the 90% rule in the contract's own words, because a ceiling stated
-- without its second limb is not the term the contract wrote.
ALTER TABLE meal_rates
  ADD COLUMN contract_id INT UNSIGNED NULL AFTER id,
  ADD COLUMN is_ceiling  TINYINT(1) NOT NULL DEFAULT 0 AFTER full_rate,
  ADD COLUMN cap_note    VARCHAR(200) NULL AFTER is_ceiling,
  ADD KEY ix_mealrate_contract (contract_id),
  ADD CONSTRAINT fk_mealrate_contract FOREIGN KEY (contract_id) REFERENCES contracts (id);

-- ------------------------------------------------------------ running_rooms
-- The cleanable area. The contract prices pest control against it -- 53,010 sq
-- ft at IGP, 636,120 sq ft over two years at once in two months -- so a figure
-- that had been prose in a PDF is now a number a bill can be checked against.
ALTER TABLE running_rooms
  ADD COLUMN area_sqft INT UNSIGNED NULL AFTER total_beds;

-- The categories themselves are set in db/seeds/09, NOT here. Migrations run
-- before seeds, so at this point consumable_items is empty and an UPDATE would
-- match nothing -- which is exactly what happened the first time this was
-- written, and the generic newspapers went on showing at IGP beside the four
-- the contract names.
