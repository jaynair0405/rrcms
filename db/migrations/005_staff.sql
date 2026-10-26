-- 005_staff.sql
-- Contract staff register, screening, documents, issues and replacements.

CREATE TABLE staff (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_code          VARCHAR(20)  NOT NULL,
  full_name           VARCHAR(150) NOT NULL,
  father_name         VARCHAR(150) NULL,
  date_of_birth       DATE NULL,
  gender              ENUM('M','F','O') NULL,
  phone               VARCHAR(20)  NULL,
  address             VARCHAR(400) NULL,
  photo_file_id       BIGINT UNSIGNED NULL,

  designation_id      TINYINT UNSIGNED NOT NULL,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  contractor_id       SMALLINT UNSIGNED NOT NULL,

  date_of_joining     DATE NOT NULL,
  date_of_leaving     DATE NULL,

  bank_account_no     VARCHAR(30) NULL,
  bank_ifsc           VARCHAR(15) NULL,
  epf_no              VARCHAR(30) NULL,
  esic_no             VARCHAR(30) NULL,

  -- Screening gate: an unapproved person must not be markable present.
  screening_status    ENUM('pending','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
  screened_by         BIGINT UNSIGNED NULL,
  screened_on         DATE NULL,
  rejection_reason    VARCHAR(400) NULL,

  id_card_no          VARCHAR(30) NULL,
  id_card_issued_on   DATE NULL,

  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_code (staff_code),
  KEY ix_staff_rr (running_room_id, is_active),
  KEY ix_staff_contractor (contractor_id),
  KEY ix_staff_screening (screening_status),
  CONSTRAINT fk_staff_desig      FOREIGN KEY (designation_id)  REFERENCES designations (id),
  CONSTRAINT fk_staff_rr         FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_staff_contractor FOREIGN KEY (contractor_id)   REFERENCES contractors (id),
  CONSTRAINT fk_staff_photo      FOREIGN KEY (photo_file_id)   REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_staff_screener   FOREIGN KEY (screened_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff_documents (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_id            INT UNSIGNED NOT NULL,
  doc_type            ENUM('photo_id','address_proof','police_verification','medical_fitness',
                           'qualification','bank_proof','epf_proof','esic_proof','other') NOT NULL,
  file_id             BIGINT UNSIGNED NULL,
  reference_no        VARCHAR(80) NULL,
  issued_on           DATE NULL,
  valid_till          DATE NULL,
  verified_by         BIGINT UNSIGNED NULL,
  verified_on         DATE NULL,
  remarks             VARCHAR(300) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_sdoc_staff (staff_id, doc_type),
  KEY ix_sdoc_expiry (valid_till),
  CONSTRAINT fk_sdoc_staff FOREIGN KEY (staff_id)    REFERENCES staff (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdoc_file  FOREIGN KEY (file_id)     REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_sdoc_user  FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2 uniform sets per 6 months, 1 pair of shoes per year, per the tender.
CREATE TABLE staff_issues (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_id            INT UNSIGNED NOT NULL,
  issue_type          ENUM('uniform','shoes','id_card','other') NOT NULL,
  quantity            TINYINT UNSIGNED NOT NULL DEFAULT 1,
  issued_on           DATE NOT NULL,
  due_next_on         DATE NULL,
  acknowledged        TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_on     DATE NULL,
  issued_by           BIGINT UNSIGNED NULL,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_sissue_staff (staff_id, issue_type),
  KEY ix_sissue_due (due_next_on),
  CONSTRAINT fk_sissue_staff FOREIGN KEY (staff_id)   REFERENCES staff (id) ON DELETE CASCADE,
  CONSTRAINT fk_sissue_user  FOREIGN KEY (issued_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff_replacements (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  outgoing_staff_id   INT UNSIGNED NULL,
  incoming_staff_id   INT UNSIGNED NULL,
  designation_id      TINYINT UNSIGNED NOT NULL,
  reason              VARCHAR(400) NOT NULL,
  railway_permission  TINYINT(1) NOT NULL DEFAULT 0,
  permitted_by        BIGINT UNSIGNED NULL,
  permitted_on        DATE NULL,
  effective_date      DATE NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_srep_rr_date (running_room_id, effective_date),
  CONSTRAINT fk_srep_rr   FOREIGN KEY (running_room_id)   REFERENCES running_rooms (id),
  CONSTRAINT fk_srep_out  FOREIGN KEY (outgoing_staff_id) REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT fk_srep_in   FOREIGN KEY (incoming_staff_id) REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT fk_srep_des  FOREIGN KEY (designation_id)    REFERENCES designations (id),
  CONSTRAINT fk_srep_user FOREIGN KEY (permitted_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
