-- 010_compliance.sql
-- Deficiency schedule, daily joint checklist, inspections and recorded
-- deficiencies.
--
-- DEFERRED BY DESIGN: no monetary column appears anywhere in this migration.
-- Rates live on deficiency_clauses as reference data but are never applied.
-- When the penalty schedule under review is finalised, migration 013 adds the
-- computation, reading the rows captured here. Nothing needs re-entry.

CREATE TABLE deficiency_clauses (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clause_code         VARCHAR(10)  NOT NULL,
  group_code          ENUM('A','B','C','D','M','G') NOT NULL,
  group_name          VARCHAR(80)  NOT NULL,
  description         VARCHAR(400) NOT NULL,
  rate                DECIMAL(12,2) NULL,
  unit                VARCHAR(120) NULL,
  frequency           ENUM('daily','weekly','monthly','one_time') NOT NULL,
  is_formula          TINYINT(1) NOT NULL DEFAULT 0,
  formula_note        VARCHAR(300) NULL,
  in_daily_checklist  TINYINT(1) NOT NULL DEFAULT 0,
  applies_to_meals    TINYINT(1) NOT NULL DEFAULT 0,
  effective_from      DATE NOT NULL,
  effective_to        DATE NULL,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clause_code_from (clause_code, effective_from),
  KEY ix_clause_group (group_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspections (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  inspection_date     DATE NOT NULL,
  inspection_type     ENUM('daily_joint','scheduled','surprise','higher_official') NOT NULL,
  inspected_by        BIGINT UNSIGNED NULL,
  inspector_name      VARCHAR(150) NULL,
  contractor_rep_name VARCHAR(150) NULL,
  items_checked       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deficiency_count    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  result              ENUM('compliant','minor_deficiencies','major_deficiencies') NULL,
  railway_sign_file_id    BIGINT UNSIGNED NULL,
  contractor_sign_file_id BIGINT UNSIGNED NULL,
  submitted_at        DATETIME NULL,
  remarks             TEXT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_insp_daily (running_room_id, inspection_date, inspection_type),
  KEY ix_insp_date (inspection_date),
  CONSTRAINT fk_insp_rr    FOREIGN KEY (running_room_id)         REFERENCES running_rooms (id),
  CONSTRAINT fk_insp_user  FOREIGN KEY (inspected_by)            REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_insp_rsign FOREIGN KEY (railway_sign_file_id)    REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_insp_csign FOREIGN KEY (contractor_sign_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspection_items (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_id       BIGINT UNSIGNED NOT NULL,
  clause_id           SMALLINT UNSIGNED NOT NULL,
  status              ENUM('complied','not_complied','not_applicable') NOT NULL DEFAULT 'complied',
  quantity            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  observation         VARCHAR(500) NULL,
  evidence_file_id    BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inspitem (inspection_id, clause_id),
  KEY ix_inspitem_status (status),
  CONSTRAINT fk_ii_insp   FOREIGN KEY (inspection_id)    REFERENCES inspections (id) ON DELETE CASCADE,
  CONSTRAINT fk_ii_clause FOREIGN KEY (clause_id)        REFERENCES deficiency_clauses (id),
  CONSTRAINT fk_ii_file   FOREIGN KEY (evidence_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The single place a confirmed deficiency lives, whatever surfaced it.
-- This is the table the future penalty engine reads.
CREATE TABLE deficiencies (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  clause_id           SMALLINT UNSIGNED NOT NULL,
  occurred_on         DATE NOT NULL,
  quantity            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  source              ENUM('inspection','daily_checklist','feedback','complaint','supervisor','review') NOT NULL,
  source_ref_table    VARCHAR(40) NULL,
  source_ref_id       BIGINT UNSIGNED NULL,
  description         VARCHAR(500) NULL,
  evidence_file_id    BIGINT UNSIGNED NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  recorded_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status              ENUM('open','rectified','closed','withdrawn') NOT NULL DEFAULT 'open',
  rectified_on        DATE NULL,
  closure_remarks     VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY ix_def_rr_date (running_room_id, occurred_on),
  KEY ix_def_clause (clause_id),
  KEY ix_def_source (source_ref_table, source_ref_id),
  KEY ix_def_status (status),
  CONSTRAINT fk_def_rr     FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id),
  CONSTRAINT fk_def_clause FOREIGN KEY (clause_id)        REFERENCES deficiency_clauses (id),
  CONSTRAINT fk_def_file   FOREIGN KEY (evidence_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_def_user   FOREIGN KEY (recorded_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
