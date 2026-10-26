-- 033 — the menu card, the rate board, and the weekly menu
--
-- WHAT WAS MISSING, AND WHY IT WAS MISSED
--
-- Stage 6 wrote into the reference seed: "there is no menu or rate board here.
-- Meal and subsidy accounting is maintained in RRMS ... RR-CMS records food
-- QUALITY, not meal transactions."
--
-- That is right about transactions and wrong about the menu. A menu is not an
-- accounting artefact. It is the contractor's obligation about what he must
-- cook, in what quantity, and what he may charge for anything extra — and the
-- Railway's obligation to fix those rates and have them displayed. RRMS bills
-- the subsidy; it does not hold what the tender says a dinner must contain.
-- The RRMS boundary was stretched over something on the wrong side of it.
--
-- The cost of the omission is clause B6 — overcharging of food items or serving
-- less quantity, Rs 500 per case. Neither half of it can be tested without an
-- approved rate and an approved quantity, so B6 has been a tick on the review
-- screen with nothing behind it since stage 10.
--
-- WHAT THE TENDER ACTUALLY SAYS  (Schedule B, read 21.08.2026)
--
--   Table A   Three items, each with its contents stated by weight: Veg Rice
--             Plate, Egg Curry Rice Plate, and Breakfast (veg & non-veg). The
--             quantities are "approximate", and the cost "is fixed and cannot
--             be reduced, if any staff takes less quantity of any item".
--             Rates already held in meal_rates since stage 20 — Rs 69.30 full
--             and Rs 62.37 subsidy for a meal, Rs 42.00 and Rs 37.80 for
--             breakfast, both including 5% GST.
--
--   Table B   Twenty-three printed lines of optional extras — AND THE COST
--             COLUMN IS BLANK IN THE TENDER. The rates "shall be fixed by
--             Railways ... on the basis of no-profit, no-loss" and displayed.
--             They are therefore data the division owes, not something the
--             document gives. See menu_item_rates below: a rate that has not
--             been fixed has NO ROW, and the screen says it is owed rather
--             than showing a zero.
--
--   The rules Contractor prepares the menu "in consultation with Railway's
--             representative & Display on Kitchen Board on daily basis";
--             breakfast items "should not be repeated on subsequent day in the
--             week"; "two seasonal vegetable dishes have to be served in each
--             meal ... one of the vegetable dish is dry and the other one is
--             with curry".
--
--   The ceiling  Not more than three subsidised meals per man in a 24-hour stay
--             (R.B. 2006/M(L)/467/2), and "the parcel meal for consumption
--             en-route will be additional to the ceiling".

-- ---------------------------------------------------------------- the parcel
-- Our meal types have been breakfast, lunch and dinner since stage 20. The
-- tender names a fourth, and puts it OUTSIDE the three-meal ceiling. Without
-- this value a parcel meal either goes unrecorded or is booked as a lunch,
-- and in the second case the ceiling arithmetic is wrong for the man who took
-- it. The unique key on meal_services already allows one of each type per day,
-- so adding 'parcel' gives exactly what the Railway Board letter describes:
-- three subsidised meals, plus a parcel that does not count against them.
ALTER TABLE meal_services
  MODIFY COLUMN meal_type ENUM('breakfast','lunch','dinner','parcel') NOT NULL;
ALTER TABLE meal_rates
  MODIFY COLUMN meal_type ENUM('breakfast','lunch','dinner','parcel') NOT NULL;

-- --------------------------------------------------------------- the master
-- Table A and Table B as printed. Held as data rather than in a view so the
-- menu card, the rate board and the weekly menu all read one list, and so a
-- revision is a row and not a deployment.
CREATE TABLE menu_items (
  id                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code              VARCHAR(30)  NOT NULL,
  schedule_table    ENUM('A','B') NOT NULL,
  name              VARCHAR(180) NOT NULL,
  -- Table A's stated contents, verbatim. This is the "approved quantity" half
  -- of clause B6 and it must read exactly as the tender reads.
  contents          TEXT NULL,
  -- '100 ml', '200 gms', 'plate'. Kept apart from the name so the rate board
  -- can print a quantity column and a rate against it.
  unit              VARCHAR(60)  NULL,
  applies_to        ENUM('breakfast','lunch','dinner','parcel','any') NOT NULL DEFAULT 'any',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  -- Where in the document this line comes from, so a disputed item is settled
  -- by reading the tender rather than by arguing about the screen.
  source_ref        VARCHAR(160) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_code (code),
  KEY ix_menu_table (schedule_table, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dated, because the tender says the rates are "subject to revision as it will
-- be decided by administration" — and last year's complaint has to be judged
-- against last year's rate board.
--
-- NO ROW MEANS NO RATE. A rate the Railway has not yet fixed is absent, never
-- zero: zero is a statement that the item is free, and on a rate board that is
-- a very different claim from "not yet decided".
CREATE TABLE menu_item_rates (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  menu_item_id      SMALLINT UNSIGNED NOT NULL,
  effective_from    DATE NOT NULL,
  rate              DECIMAL(8,2) NOT NULL,
  -- The order or letter that fixed it. The tender fixes no figure at all for
  -- Table B, so every rate here arrives from somewhere else and that somewhere
  -- has to be nameable.
  authority         VARCHAR(160) NULL,
  recorded_by       BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_rate (menu_item_id, effective_from),
  CONSTRAINT fk_mir_item FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_mir_user FOREIGN KEY (recorded_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------- the weekly menu
-- One plan per running room per week. The contractor prepares it; the Railway
-- agrees it. Both halves are on the record because the tender requires the
-- consultation, not merely the menu.
CREATE TABLE menu_plans (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  -- The Monday. One identity per week, so saving twice corrects rather than
  -- duplicates -- the same rule as the deficiency review.
  week_start        DATE NOT NULL,
  status            ENUM('draft','agreed') NOT NULL DEFAULT 'draft',
  prepared_by       BIGINT UNSIGNED NULL,
  agreed_by         BIGINT UNSIGNED NULL,
  agreed_on         DATE NULL,
  remarks           VARCHAR(300) NULL,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menuplan (running_room_id, week_start),
  CONSTRAINT fk_mp_rr      FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_prep    FOREIGN KEY (prepared_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_mp_agreed  FOREIGN KEY (agreed_by)       REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE menu_plan_days (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  menu_plan_id      INT UNSIGNED NOT NULL,
  -- 1 = Monday .. 7 = Sunday. ISO, so "the subsequent day in the week" is
  -- day + 1 and the no-repeat rule needs no calendar arithmetic.
  day_of_week       TINYINT UNSIGNED NOT NULL,
  meal_type         ENUM('breakfast','lunch','dinner') NOT NULL,
  -- What is actually being served. For breakfast this is one of the options
  -- Table A lists; for lunch and dinner it is the plate, which Table A fixes.
  main_item         VARCHAR(200) NULL,
  -- The tender: two seasonal vegetable dishes in every meal, one dry and one
  -- with curry. Two columns rather than one free-text line, because a rule
  -- that says "one of each" cannot be checked against a sentence.
  veg_dry           VARCHAR(120) NULL,
  veg_curry         VARCHAR(120) NULL,
  notes             VARCHAR(200) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mpd (menu_plan_id, day_of_week, meal_type),
  CONSTRAINT fk_mpd_plan FOREIGN KEY (menu_plan_id) REFERENCES menu_plans (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- who may act
--
-- The menu is not the contractor's to settle alone and not the Railway's to
-- write for him. The tender splits it, so the permissions split the same way:
-- the contractor's supervisor PREPARES a week's menu under `stay.manage`,
-- which he already holds; the Railway AGREES it, and the Railway alone fixes
-- the rate board, because "the cost of additional meal items ... shall be
-- fixed by Railways".
-- The permission itself and its grants live in db/seeds/01_reference.sql with
-- every other permission, NOT here.
--
-- Found by running the migrations against an empty database: migrations run
-- BEFORE seeds, so at this point in a fresh install the `roles` table does not
-- yet have a row in it. A grant written here as a join against `roles` silently
-- inserts nothing — no error, no warning — and the permission exists with
-- nobody holding it. On an installation that has already been seeded the same
-- statement works, so the fault would have shown up only on the next fresh
-- install, which is the worst possible time to find it.
--
-- Seeds are idempotent and always run, so the seed file is the one place a
-- permission should be declared.
