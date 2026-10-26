-- 003_contractors_contracts.sql
-- Contractors, agreements, the running rooms each agreement covers, and the
-- Schedule A-D values that make up the monthly bill.

CREATE TABLE contractors (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(20)  NOT NULL,
  name                VARCHAR(180) NOT NULL,
  gst_no              VARCHAR(20)  NULL,
  pan_no              VARCHAR(12)  NULL,
  clra_reg_no         VARCHAR(50)  NULL,
  epf_reg_no          VARCHAR(50)  NULL,
  esic_reg_no         VARCHAR(50)  NULL,
  contact_person      VARCHAR(120) NULL,
  phone               VARCHAR(20)  NULL,
  email               VARCHAR(150) NULL,
  address             VARCHAR(400) NULL,
  is_blacklisted      TINYINT(1)   NOT NULL DEFAULT 0,
  blacklist_reason    VARCHAR(400) NULL,
  blacklisted_on      DATE NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_contractors_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contracts (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agreement_no        VARCHAR(80)  NOT NULL,
  contractor_id       SMALLINT UNSIGNED NOT NULL,
  division_id         SMALLINT UNSIGNED NOT NULL,
  loa_date            DATE NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  extended_to         DATE NULL,
  security_deposit    DECIMAL(14,2) NULL,
  performance_guarantee DECIMAL(14,2) NULL,
  total_value         DECIMAL(16,2) NULL,
  status              ENUM('draft','active','expired','terminated','extended') NOT NULL DEFAULT 'active',
  termination_reason  VARCHAR(400) NULL,
  remarks             VARCHAR(500) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_contracts_agreement (agreement_no),
  KEY ix_contracts_contractor (contractor_id),
  KEY ix_contracts_dates (start_date, end_date),
  CONSTRAINT fk_contracts_contractor FOREIGN KEY (contractor_id) REFERENCES contractors (id),
  CONSTRAINT fk_contracts_division   FOREIGN KEY (division_id)   REFERENCES divisions (id),
  CONSTRAINT ck_contracts_dates      CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One agreement can cover several running rooms, and a running room changes
-- contractor over time. The date range on this row is what resolves
-- "who was responsible for this running room on this date".
CREATE TABLE contract_running_rooms (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id         INT UNSIGNED NOT NULL,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE NULL,
  PRIMARY KEY (id),
  KEY ix_crr_rr_dates (running_room_id, effective_from, effective_to),
  CONSTRAINT fk_crr_contract FOREIGN KEY (contract_id)     REFERENCES contracts (id) ON DELETE CASCADE,
  CONSTRAINT fk_crr_rr       FOREIGN KEY (running_room_id) REFERENCES running_rooms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contract_schedule_values (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id         INT UNSIGNED NOT NULL,
  schedule_code       ENUM('A','B','C','D') NOT NULL,
  description         VARCHAR(200) NULL,
  amount              DECIMAL(16,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_csv_contract_schedule (contract_id, schedule_code),
  CONSTRAINT fk_csv_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD CONSTRAINT fk_users_contractor FOREIGN KEY (contractor_id) REFERENCES contractors (id);
