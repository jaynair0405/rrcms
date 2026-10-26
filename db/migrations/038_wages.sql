-- 038 — the wages, EPF, ESIC, bonus and Shramik Kalyan register. Audit item P7.
--
-- Until now nothing in RR-CMS recorded that a labourer was paid, when, or how
-- much. The muster proved a man was present; no register anywhere proved he was
-- paid for being there. That is the largest remaining gap against the contract,
-- and it is the one an officer is most often asked about at a review:
--
--   Labour compliance (2)  the verified payment sheet
--   Labour compliance (3)  the monthly EPF and ESIC statement
--   Payment Terms 5(2)     the staff list with salary paid through bank
--   Payment Terms 5(3)     salaries paid as per the applicable minimum wages
--   Payment Terms 5(4)(5)  EPF and ESI contributions reaching the departments
--   Payment Terms 5(7)     bonus paid to labourers
--   Payment Terms 5(11)    the Shramik Kalyan Portal update, Annexure 'D'
--   Clause M5              Rs 100 per staff per DAY where wages are not paid
--                          by the 10th of the following month
--
-- M5 is the reason this is three tables rather than one. The penalty turns on a
-- date and a head-count, so the date wages were actually paid and the men they
-- were paid to both have to be recorded facts, not a total somebody typed.
--
-- NO RUPEE FIGURE IS COMPUTED ANYWHERE HERE, as nowhere else in this system.
-- The screen states that wages for July were paid on the 18th, eight days after
-- the due date, to fourteen men. Turning that into money is the officer's act,
-- through the deficiency register, against the schedule rate.

-- The month, per running room. One row whether fourteen men were paid or none:
-- a month with no row at all is a month nobody has answered for, and that is
-- exactly what the register has to be able to show.
CREATE TABLE wage_months (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  -- Always the first day of the month. A DATE rather than a CHAR(7) so that
  -- "the 10th of the following month" is arithmetic and not string surgery.
  wage_month          DATE NOT NULL,
  -- NULL is not "no". NULL means nobody has said yet, and once the 10th has
  -- passed that silence is itself the M5 state.
  paid_on             DATE NULL,
  payment_mode        ENUM('bank','cash','mixed') NULL,
  -- The jointly signed payment sheet — Labour compliance (2).
  sheet_file_id       BIGINT UNSIGNED NULL,
  remarks             VARCHAR(500) NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  recorded_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- The contractor records; the Railway confirms it saw the sheet. A payment
  -- register the contractor fills and nobody checks is the contractor marking
  -- his own homework, which is the same argument as the cleaning record.
  verified_by         BIGINT UNSIGNED NULL,
  verified_at         DATETIME NULL,
  verify_remarks      VARCHAR(400) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wage_month (running_room_id, wage_month),
  KEY ix_wage_paid (paid_on),
  CONSTRAINT fk_wm_rr       FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_wm_sheet    FOREIGN KEY (sheet_file_id)   REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_wm_recorder FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_wm_verifier FOREIGN KEY (verified_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One line per man per month. This is Payment Terms 5(2) — the staff list with
-- salary paid through bank — and it is the only shape that answers the question
-- a dispute is ever actually about, which is about ONE man.
--
-- Every figure is NULL-able and NULL means silence. A man with no row was not
-- written down; a man with a row and no amount was written down and the amount
-- was not stated. An amount of 0 says he was paid nothing, which is a finding.
-- Three different things, and an officer reading this a year later has to be
-- able to tell them apart.
CREATE TABLE wage_payments (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wage_month_id       INT UNSIGNED NOT NULL,
  staff_id            INT UNSIGNED NOT NULL,
  days_paid           SMALLINT UNSIGNED NULL,
  amount_paid         DECIMAL(12,2) NULL,
  paid_through        ENUM('bank','cash') NULL,
  bank_ref            VARCHAR(60) NULL,
  -- A man paid late when the rest were paid on time is his own fact.
  paid_on             DATE NULL,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wage_payment (wage_month_id, staff_id),
  KEY ix_wp_staff (staff_id),
  CONSTRAINT fk_wp_month FOREIGN KEY (wage_month_id) REFERENCES wage_months (id) ON DELETE CASCADE,
  CONSTRAINT fk_wp_staff FOREIGN KEY (staff_id)      REFERENCES staff (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The four statutory returns for the month. A child table rather than sixteen
-- columns on the month, because they are the same shape as each other — a date,
-- a reference, an amount, a piece of paper — and because the day a fifth return
-- is added to the tender this is a seed row and not a migration.
CREATE TABLE wage_returns (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wage_month_id       INT UNSIGNED NOT NULL,
  return_type         ENUM('epf','esic','bonus','shramik_kalyan') NOT NULL,
  paid_on             DATE NULL,
  reference_no        VARCHAR(80) NULL,
  amount              DECIMAL(14,2) NULL,
  file_id             BIGINT UNSIGNED NULL,
  remarks             VARCHAR(300) NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  recorded_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wage_return (wage_month_id, return_type),
  CONSTRAINT fk_wr_month FOREIGN KEY (wage_month_id) REFERENCES wage_months (id) ON DELETE CASCADE,
  CONSTRAINT fk_wr_file  FOREIGN KEY (file_id)       REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_wr_user  FOREIGN KEY (recorded_by)   REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The three permissions this screen needs are declared and granted in
-- db/seeds/01_reference.sql, NOT here. Migrations run before seeds, so a grant
-- written in a migration joins against a roles table that does not yet exist on
-- a fresh install and silently inserts nothing. That fault hid nine screens
-- from every role once; test/seed-permissions.js now refuses to let it recur.
