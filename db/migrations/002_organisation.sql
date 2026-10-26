-- 002_organisation.sql
-- Divisions, controlling departments, running rooms and their bed inventory.
-- Running room attributes mirror the TRO dashboard register.

CREATE TABLE divisions (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(8)   NOT NULL,
  name            VARCHAR(80)  NOT NULL,
  hq_station      VARCHAR(80)  NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_divisions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Running rooms sit under Electrical, Mechanical or Operating. This decides
-- who the Railway counter-signatory is, so it is a lookup rather than free text.
CREATE TABLE control_departments (
  id              TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(20)  NOT NULL,
  name            VARCHAR(80)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ctrl_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE running_rooms (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(16)  NOT NULL,
  name                VARCHAR(120) NOT NULL,
  station_code        VARCHAR(12)  NULL,
  division_id         SMALLINT UNSIGNED NOT NULL,
  control_dept_id     TINYINT UNSIGNED NOT NULL,
  category            ENUM('A','B','C') NOT NULL,

  physical_rooms      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total_beds          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  female_rooms        SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- Two distinct measures, never conflated:
  --   ref_crews_per_day  = throughput; beds turn over, so this may exceed total_beds
  --   ref_peak_occupancy = maximum concurrent occupants; this is the capacity constraint
  -- Both are baseline figures carried over from the TRO register. Once stays
  -- data accumulates the live values are computed and these become historical.
  ref_crews_per_day   SMALLINT UNSIGNED NULL,
  ref_peak_occupancy  SMALLINT UNSIGNED NULL,

  has_meal_facility   TINYINT(1) NOT NULL DEFAULT 0,
  has_housekeeping    TINYINT(1) NOT NULL DEFAULT 1,
  ac_status           ENUM('working','partial','not_working','none') NOT NULL DEFAULT 'working',
  ac_remarks          VARCHAR(180) NULL,

  status              ENUM('operational','closed','under_renovation') NOT NULL DEFAULT 'operational',
  remarks             VARCHAR(500) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rr_code (code),
  KEY ix_rr_division (division_id),
  KEY ix_rr_category (category),
  CONSTRAINT fk_rr_division  FOREIGN KEY (division_id)     REFERENCES divisions (id),
  CONSTRAINT fk_rr_ctrl      FOREIGN KEY (control_dept_id) REFERENCES control_departments (id),
  CONSTRAINT ck_rr_female    CHECK (female_rooms <= physical_rooms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOTE: there is no beds table. Bed inventory and allotment belong to RRMS,
-- the official Railway occupancy system. RR-CMS records total_beds only as a
-- capacity attribute of the running room, for manpower norms and reporting.

ALTER TABLE users
  ADD CONSTRAINT fk_users_division FOREIGN KEY (division_id)     REFERENCES divisions (id),
  ADD CONSTRAINT fk_users_rr       FOREIGN KEY (running_room_id) REFERENCES running_rooms (id);
