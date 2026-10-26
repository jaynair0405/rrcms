-- 013_certificates.sql
-- The monthly certification pack.
--
-- This is the sheet the RR In-charge signs and the Sr. DEE (TRO) counter-signs,
-- and which travels with the contractor's bill. It carries only what RR-CMS
-- owns: manpower and attendance, service quality as rated by occupants, the
-- deficiencies raised, the inspections done and the facility obligations. It
-- carries no rate, no meal quantity (RRMS owns that) and no deduction.
--
-- Why the figures are stored rather than recomputed: once a certificate is
-- signed it must not change. A deficiency closed next week, a late feedback
-- submission, a corrected muster — all of those would silently rewrite a signed
-- document if the page recomputed from the live tables every time. So the
-- figures are frozen into this row at the moment the certificate is generated,
-- and regenerating is an explicit act that is only allowed while it is a draft.

CREATE TABLE monthly_certificates (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id       SMALLINT UNSIGNED NOT NULL,
  period_month          DATE NOT NULL,
  contract_id           INT UNSIGNED NULL,

  -- manpower and attendance
  days_in_month         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  days_marked           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  days_countersigned    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sanctioned_strength   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  on_roll_strength      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  man_days_due          INT UNSIGNED NOT NULL DEFAULT 0,
  man_days_present      INT UNSIGNED NOT NULL DEFAULT 0,
  unscreened_count      SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- service quality, from the occupant feedback the tender requires
  occupants_total       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  feedback_received     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  coverage_pct          DECIMAL(5,2) NOT NULL DEFAULT 0,
  meets_floor           TINYINT(1) NOT NULL DEFAULT 0,
  rating_cleanliness    DECIMAL(3,2) NULL,
  rating_food           DECIMAL(3,2) NULL,
  rating_linen          DECIMAL(3,2) NULL,
  r_min                 TINYINT UNSIGNED NULL,

  -- compliance
  inspections_done      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  inspections_compliant SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deficiencies_raised   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deficiencies_open     SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- facility obligations
  laundry_no_invoice    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  consumable_short      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  asset_faults_overdue  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kitchen_shortfalls    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  pest_overdue          SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- No monetary column of any kind. The bill amount, the Schedule-B meal
  -- quantity and the penalty deduction all live outside this table.

  status                ENUM('draft','certified','countersigned','returned') NOT NULL DEFAULT 'draft',
  generated_by          BIGINT UNSIGNED NULL,
  generated_at          DATETIME NULL,
  certified_by          BIGINT UNSIGNED NULL,
  certified_at          DATETIME NULL,
  countersigned_by      BIGINT UNSIGNED NULL,
  countersigned_at      DATETIME NULL,
  returned_reason       VARCHAR(400) NULL,
  remarks               VARCHAR(1000) NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cert (running_room_id, period_month),
  KEY ix_cert_period (period_month, status),
  CONSTRAINT fk_cert_rr        FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_cert_contract  FOREIGN KEY (contract_id)      REFERENCES contracts (id) ON DELETE SET NULL,
  CONSTRAINT fk_cert_gen       FOREIGN KEY (generated_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_cert_certifier FOREIGN KEY (certified_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_cert_counter   FOREIGN KEY (countersigned_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The deficiency list printed on the certificate is frozen with it, because a
-- deficiency closed after signing must not disappear from a signed document.
CREATE TABLE certificate_deficiencies (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  certificate_id      INT UNSIGNED NOT NULL,
  deficiency_id       BIGINT UNSIGNED NULL,
  clause_code         VARCHAR(10)  NOT NULL,
  group_name          VARCHAR(80)  NOT NULL,
  description         VARCHAR(500) NOT NULL,
  occurred_on         DATE NOT NULL,
  quantity            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  unit                VARCHAR(120) NULL,
  status_at_signing   VARCHAR(20)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_certdef (certificate_id),
  CONSTRAINT fk_certdef_cert FOREIGN KEY (certificate_id) REFERENCES monthly_certificates (id) ON DELETE CASCADE,
  CONSTRAINT fk_certdef_def  FOREIGN KEY (deficiency_id)  REFERENCES deficiencies (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The RR In-charge prepares and certifies the pack; the divisional officer
-- counter-signs it. That grant lives in db/seeds/01_reference.sql, not here:
-- roles and permissions are seeded after the migrations run, so a grant written
-- as a migration would match nothing and silently do nothing.
