-- 040 — the contractor's standing obligations. The remainder of audit item P14.
--
-- A scatter of small things the tender requires once, or on a cycle, and which
-- had no home anywhere: the PC and printer, the biometric system, the indemnity
-- bond, fire-extinguisher refilling, the uniform sample, emergency numbers at
-- reception, the single-use-plastic prohibition, the bed indication plate and
-- name board, training before deployment.
--
-- Two of them carry money and a clock:
--   D3  Rs 1,000 per WEEK — failure to provide the PC and computer-generated records
--   D4  Rs 1,000 per WEEK — failure to provide biometric attendance AFTER ONE MONTH
--   M12 fire extinguisher refilling — work executed elsewhere and 2x recovered
--
-- So this is not a page of ticks. A due date and a rate mean the same shape as
-- clause M5 on the wage register: state the weeks, offer the clause, compute no
-- money. The rest are ticks, and are honest about being ticks.
--
-- WHERE THE CLOCK STARTS. D4's "after one month" has to be one month after
-- something, and that something is the Letter of Acceptance — the authority the
-- contractor actually works under before the agreement is executed. At all four
-- pilot sites no LOA date is on record, so the due date is genuinely unknown and
-- the screen says so rather than inventing one. That is a second reason for the
-- officer to chase the LOA, and it is the honest state until he has.

-- The obligations themselves, seeded from the tender. A table rather than a
-- constant in the code, because the day the tender adds one this is a seed row.
CREATE TABLE compliance_items (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(30)  NOT NULL,
  name                VARCHAR(160) NOT NULL,
  detail              VARCHAR(500) NULL,
  -- The deficiency clause this obligation answers, where there is one. Most
  -- have none: an unlit name board is a thing to put right, not a penalty.
  clause_code         VARCHAR(10)  NULL,
  -- How the due date is worked out. `loa_plus_days` counts from the Letter of
  -- Acceptance, which is why an absent LOA date leaves the due date unknown
  -- rather than defaulting to today and manufacturing a breach.
  due_basis           ENUM('loa_plus_days','none','recurring_months') NOT NULL DEFAULT 'none',
  due_days            SMALLINT UNSIGNED NULL,
  recur_months        SMALLINT UNSIGNED NULL,
  source_ref          VARCHAR(120) NULL,
  sort_order          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_compliance_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Where each running room stands on each obligation. No row means nobody has
-- said anything — which, once a due date has passed, is exactly the state the
-- clause turns on, and is not the same as a row saying it was not done.
CREATE TABLE compliance_status (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  item_id             SMALLINT UNSIGNED NOT NULL,
  -- The date the obligation was met. For a recurring item this is the LAST
  -- time it was done, and the next falls due recur_months after it.
  met_on              DATE NULL,
  -- Recorded as NOT met, deliberately: a supervisor saying "there is no
  -- printer" is a different fact from nobody having looked.
  not_met             TINYINT(1) NOT NULL DEFAULT 0,
  reference_no        VARCHAR(120) NULL,
  file_id             BIGINT UNSIGNED NULL,
  remarks             VARCHAR(400) NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_compliance_status (running_room_id, item_id),
  CONSTRAINT fk_cs_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_cs_item FOREIGN KEY (item_id)         REFERENCES compliance_items (id),
  CONSTRAINT fk_cs_file FOREIGN KEY (file_id)         REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_cs_user FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The obligations are seeded in db/seeds/10_compliance_items.sql and the one
-- permission in db/seeds/01_reference.sql. Neither is written here: migrations
-- run before seeds, and a grant written in a migration matches nothing on a
-- fresh install.
