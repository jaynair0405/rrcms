-- 012_bills.sql
-- Monthly bill assembly.
--
-- deduction_amount exists and is always 0 in this build. The penalty module
-- (migration 013, once the schedule is finalised) is what ever writes to it.

CREATE TABLE bills (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id         INT UNSIGNED NOT NULL,
  running_room_id     SMALLINT UNSIGNED NULL,
  period_month        DATE NOT NULL,
  bill_no             VARCHAR(60) NULL,
  submitted_on        DATE NULL,
  due_on              DATE NULL,

  gross_schedule_a    DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- Schedule B (subsidised meals) is billed on RRMS meal records. RR-CMS does
  -- not compute the quantity; the figure is entered from the RRMS statement and
  -- the reference is kept for audit.
  gross_schedule_b    DECIMAL(14,2) NOT NULL DEFAULT 0,
  schedule_b_source_ref VARCHAR(120) NULL,
  gross_schedule_c    DECIMAL(14,2) NOT NULL DEFAULT 0,
  gross_schedule_d    DECIMAL(14,2) NOT NULL DEFAULT 0,
  gross_total         DECIMAL(14,2) NOT NULL DEFAULT 0,

  -- Always 0 until the penalty module is enabled.
  deduction_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  deduction_note      VARCHAR(300) NULL,
  net_payable         DECIMAL(14,2) NOT NULL DEFAULT 0,

  status              ENUM('draft','submitted','under_check','passed','paid','returned') NOT NULL DEFAULT 'draft',
  checked_by          BIGINT UNSIGNED NULL,
  passed_by           BIGINT UNSIGNED NULL,
  passed_on           DATE NULL,
  paid_on             DATE NULL,
  remarks             VARCHAR(500) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bill (contract_id, running_room_id, period_month),
  KEY ix_bill_period (period_month, status),
  CONSTRAINT fk_bill_contract FOREIGN KEY (contract_id)     REFERENCES contracts (id),
  CONSTRAINT fk_bill_rr       FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_bill_checker  FOREIGN KEY (checked_by)      REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_bill_passer   FOREIGN KEY (passed_by)       REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The tender's bill-passing checklist: attendance sheet, wage proof, EPF and
-- ESIC challans, bonus, GST challan, ShramikKalyan update.
CREATE TABLE bill_documents (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  bill_id             INT UNSIGNED NOT NULL,
  doc_type            ENUM('attendance_sheet','wage_payment_proof','epf_challan','esic_challan',
                           'bonus_proof','gst_challan','shramik_kalyan','work_certificate',
                           'consumable_record','other') NOT NULL,
  is_received         TINYINT(1) NOT NULL DEFAULT 0,
  received_on         DATE NULL,
  file_id             BIGINT UNSIGNED NULL,
  verified_by         BIGINT UNSIGNED NULL,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billdoc (bill_id, doc_type),
  CONSTRAINT fk_bd_bill FOREIGN KEY (bill_id)     REFERENCES bills (id) ON DELETE CASCADE,
  CONSTRAINT fk_bd_file FOREIGN KEY (file_id)     REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_bd_user FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
