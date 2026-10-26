-- 004_designations_manpower.sql
-- Schedule-A designations, the tender's manpower matrix, and the effective
-- sanctioned strength per running room.

CREATE TABLE designations (
  id                  TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(30)  NOT NULL,
  name                VARCHAR(80)  NOT NULL,
  skill_category      ENUM('skilled','semi_skilled','unskilled') NOT NULL,
  is_kitchen_role     TINYINT(1) NOT NULL DEFAULT 0,
  requires_qualification TINYINT(1) NOT NULL DEFAULT 0,
  qualification_note  VARCHAR(200) NULL,
  min_per_site        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sort_order          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_designations_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The Schedule-A matrix exactly as tendered: bands of 50/100/150/200/250 beds.
-- Held as data so a revised tender changes rows, not code.
CREATE TABLE manpower_norms (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  band_beds           SMALLINT UNSIGNED NOT NULL,
  designation_id      TINYINT UNSIGNED NOT NULL,
  sanctioned_count    TINYINT UNSIGNED NOT NULL,
  effective_from      DATE NOT NULL DEFAULT '2026-01-01',
  effective_to        DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_norm_band_desig (band_beds, designation_id, effective_from),
  CONSTRAINT fk_norm_desig FOREIGN KEY (designation_id) REFERENCES designations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Effective sanction per running room. Schedule-A's smallest band is 50 beds,
-- but many sites are smaller, so the norm is scaled pro-rata with a floor per
-- role. is_scaled / override_reason keep that visible and defensible rather
-- than hiding the arithmetic in application code.
CREATE TABLE running_room_manpower (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  designation_id      TINYINT UNSIGNED NOT NULL,
  band_beds           SMALLINT UNSIGNED NOT NULL,
  norm_count          TINYINT UNSIGNED NOT NULL,
  sanctioned_count    TINYINT UNSIGNED NOT NULL,
  is_scaled           TINYINT(1) NOT NULL DEFAULT 0,
  is_overridden       TINYINT(1) NOT NULL DEFAULT 0,
  override_reason     VARCHAR(300) NULL,
  approved_by         BIGINT UNSIGNED NULL,
  approved_on         DATE NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rrm (running_room_id, designation_id, effective_from),
  CONSTRAINT fk_rrm_rr    FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_rrm_desig FOREIGN KEY (designation_id) REFERENCES designations (id),
  CONSTRAINT fk_rrm_appr  FOREIGN KEY (approved_by)    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
