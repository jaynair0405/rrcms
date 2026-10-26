-- 041 — the linen schedule as the executed contract actually states it.
--
-- Two faults and two absences, all found in the GeM contract for IGP
-- (GEMC-511687722391404, pp. 83-84) on 02.09.2026.
--
-- THE REGISTER WAS APPLYING THE WRONG RULE. Clause C6 as written in the earlier
-- tender paper gave a flat 48 hours for the return of washed linen, and the
-- laundry screen flagged every consignment on that one rule. The executed
-- contract gives a DELIVERY PERIOD PER ITEM:
--
--     Bed sheet, pillow cover, mosquito net   next day
--     Curtain, mattress cover, woollen blanket   3 days
--     Blanket cover                              7 days
--
-- So the register was wrong in both directions at once. A bed sheet two days
-- late passed silently — the flat rule fires only after two whole days — while
-- a blanket cover was called a breach four days before the contract says it is
-- one. Neither error is visible on the screen; both would have been argued at a
-- review from a register that looked authoritative.
--
-- AND TWO ITEMS DID NOT EXIST. The contract names seven; the enum carried five
-- and an 'other'. Mattress cover and blanket cover had nowhere to be recorded,
-- and 'blanket' was doing duty for the woollen blanket while its cover — a
-- separate item, separately priced, separately scheduled — had none.
--
-- The delivery periods, the washing frequency and the recovery rates are
-- therefore a SEEDED MASTER rather than constants in the code, so that the day a
-- running room's contract differs the answer is a row and not a release.

-- Widening an ENUM by APPENDING is metadata-only and does not rewrite the table.
-- The new values go at the end for that reason, not in tidy order.
ALTER TABLE linen_stock
  MODIFY item_type ENUM('bedsheet','pillow_cover','mosquito_net','blanket',
                        'curtain','other','mattress_cover','blanket_cover') NOT NULL;
ALTER TABLE laundry_dispatch
  MODIFY item_type ENUM('bedsheet','pillow_cover','mosquito_net','blanket',
                        'curtain','other','mattress_cover','blanket_cover') NOT NULL;
ALTER TABLE linen_daily_item
  MODIFY item_type ENUM('bedsheet','pillow_cover','mosquito_net','blanket',
                        'curtain','other','mattress_cover','blanket_cover') NOT NULL;

-- What the contract says about each item. One row per item, seeded from the
-- executed contract; `contract_id` NULL means "the rule we apply where a site's
-- own contract has not been read in", which is every site but IGP today.
CREATE TABLE linen_schedule (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_type           ENUM('bedsheet','pillow_cover','mosquito_net','blanket',
                           'curtain','other','mattress_cover','blanket_cover') NOT NULL,
  contract_id         INT UNSIGNED NULL,
  name                VARCHAR(80) NOT NULL,

  -- The clock the laundry register runs on. Days from dispatch within which the
  -- washed item must come back. NULL means the contract sets no period for it.
  delivery_days       TINYINT UNSIGNED NULL,

  -- How often the item is to be washed, in the contract's own words. Recorded
  -- as text because the contract states it in words — "each occupant", "once in
  -- a week" — and turning that into a number here would be inventing precision
  -- the paper does not have.
  wash_frequency      VARCHAR(80) NULL,
  per_bed             SMALLINT UNSIGNED NULL,   -- 2 bed sheets, 1 pillow cover

  -- Recovery rate for a lost or damaged item, per unit, as the contract prints
  -- it. A FACT COPIED OFF THE PAPER. Nothing multiplies it: a shortfall of
  -- eleven bed sheets is shown as eleven, beside Rs 170 a unit, and what the
  -- Railway recovers is the officer's act on the bill.
  recovery_rate       DECIMAL(10,2) NULL,

  -- Schedule quantity for the contract period, where the contract gives one.
  schedule_qty        INT UNSIGNED NULL,
  source_ref          VARCHAR(120) NULL,
  sort_order          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_linen_schedule (item_type, contract_id),
  CONSTRAINT fk_lsch_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The rows are in db/seeds/11_linen_schedule.sql. Not here: migrations run
-- before seeds, and a seed can be re-run when the paper is corrected.
