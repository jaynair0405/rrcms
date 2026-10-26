-- 011_facility.sql
-- Linen and laundry, consumables, assets, pest control and kitchen compliance.

CREATE TABLE vendors (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_type         ENUM('laundry','pest_control','other') NOT NULL,
  name                VARCHAR(180) NOT NULL,
  address             VARCHAR(400) NULL,
  gst_no              VARCHAR(20)  NULL,
  licence_no          VARCHAR(60)  NULL,
  licence_valid_till  DATE NULL,
  approved_on         DATE NULL,
  approved_by         BIGINT UNSIGNED NULL,
  is_approved         TINYINT(1) NOT NULL DEFAULT 0,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY ix_vendor_type (vendor_type, is_approved),
  CONSTRAINT fk_vendor_user FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE running_room_vendors (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  vendor_id           SMALLINT UNSIGNED NOT NULL,
  service_type        ENUM('laundry','pest_control','other') NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE NULL,
  PRIMARY KEY (id),
  KEY ix_rrv_rr (running_room_id, service_type),
  CONSTRAINT fk_rrv_rr     FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_rrv_vendor FOREIGN KEY (vendor_id)       REFERENCES vendors (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE linen_stock (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  item_type           ENUM('bedsheet','pillow_cover','mosquito_net','blanket','curtain','other') NOT NULL,
  issued_by_railway   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  in_service          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  at_laundry          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  condemned           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  lost_damaged        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  as_on_date          DATE NOT NULL,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_linenstock (running_room_id, item_type, as_on_date),
  CONSTRAINT fk_lstock_rr FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Washing from a non-approved source is a deficiency, so the invoice proof
-- is part of the record rather than a filing-cabinet afterthought.
CREATE TABLE laundry_dispatch (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  vendor_id           SMALLINT UNSIGNED NULL,
  dispatch_date       DATE NOT NULL,
  item_type           ENUM('bedsheet','pillow_cover','mosquito_net','blanket','curtain','other') NOT NULL,
  quantity_sent       SMALLINT UNSIGNED NOT NULL,
  quantity_returned   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  returned_on         DATE NULL,
  invoice_no          VARCHAR(60) NULL,
  invoice_file_id     BIGINT UNSIGNED NULL,
  quality_ok          TINYINT(1) NULL,
  quality_remarks     VARCHAR(300) NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_laundry_rr_date (running_room_id, dispatch_date),
  CONSTRAINT fk_laundry_rr     FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_laundry_vendor FOREIGN KEY (vendor_id)       REFERENCES vendors (id) ON DELETE SET NULL,
  CONSTRAINT fk_laundry_file   FOREIGN KEY (invoice_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_laundry_user   FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consumable_items (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(30)  NOT NULL,
  name                VARCHAR(180) NOT NULL,
  schedule_code       ENUM('C','D') NOT NULL DEFAULT 'D',
  unit                VARCHAR(30)  NOT NULL DEFAULT 'nos',
  supply_frequency    ENUM('daily','weekly','fortnightly','monthly','half_yearly','yearly','as_required') NOT NULL,
  approved_brands     VARCHAR(300) NULL,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_consumable_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consumable_issues (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  consumable_item_id  SMALLINT UNSIGNED NOT NULL,
  due_date            DATE NOT NULL,
  supplied_on         DATE NULL,
  quantity_due        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  quantity_supplied   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  brand_supplied      VARCHAR(120) NULL,
  acknowledged_by     BIGINT UNSIGNED NULL,
  shortfall_days      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_cissue_rr_due (running_room_id, due_date),
  CONSTRAINT fk_cissue_rr   FOREIGN KEY (running_room_id)    REFERENCES running_rooms (id),
  CONSTRAINT fk_cissue_item FOREIGN KEY (consumable_item_id) REFERENCES consumable_items (id),
  CONSTRAINT fk_cissue_user FOREIGN KEY (acknowledged_by)    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assets (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  asset_code          VARCHAR(40)  NULL,
  name                VARCHAR(180) NOT NULL,
  category            VARCHAR(80)  NULL,
  owned_by            ENUM('railway','contractor') NOT NULL,
  quantity            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  condition_status    ENUM('good','serviceable','defective','condemned') NOT NULL DEFAULT 'good',
  handed_over_on      DATE NULL,
  joint_note_file_id  BIGINT UNSIGNED NULL,
  returned_on         DATE NULL,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_assets_rr (running_room_id, owned_by),
  CONSTRAINT fk_assets_rr   FOREIGN KEY (running_room_id)    REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_assets_file FOREIGN KEY (joint_note_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24-hour rectification clock from the tender.
CREATE TABLE asset_breakdowns (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id            INT UNSIGNED NOT NULL,
  reported_at         DATETIME NOT NULL,
  reported_by         BIGINT UNSIGNED NULL,
  description         VARCHAR(400) NOT NULL,
  rectified_at        DATETIME NULL,
  hours_to_rectify    INT GENERATED ALWAYS AS
                        (TIMESTAMPDIFF(HOUR, reported_at, rectified_at)) STORED,
  status              ENUM('open','rectified','replaced','condemned') NOT NULL DEFAULT 'open',
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_abd_asset (asset_id, status),
  KEY ix_abd_hours (hours_to_rectify),
  CONSTRAINT fk_abd_asset FOREIGN KEY (asset_id)    REFERENCES assets (id) ON DELETE CASCADE,
  CONSTRAINT fk_abd_user  FOREIGN KEY (reported_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pest_control_log (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  vendor_id           SMALLINT UNSIGNED NULL,
  treatment_type      ENUM('rodent','insecticide','flying_insect','bed_bug','fumigation') NOT NULL,
  scheduled_on        DATE NOT NULL,
  performed_on        DATE NULL,
  notice_given_on     DATE NULL,
  areas_covered       VARCHAR(400) NULL,
  chemical_used       VARCHAR(200) NULL,
  certificate_file_id BIGINT UNSIGNED NULL,
  delay_days          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_pest_rr_sched (running_room_id, scheduled_on),
  CONSTRAINT fk_pest_rr     FOREIGN KEY (running_room_id)     REFERENCES running_rooms (id),
  CONSTRAINT fk_pest_vendor FOREIGN KEY (vendor_id)           REFERENCES vendors (id) ON DELETE SET NULL,
  CONSTRAINT fk_pest_file   FOREIGN KEY (certificate_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recurring kitchen obligations: FSSAI licence, 15-day grocery stock, 24-hour
-- perishables, LPG spares, 6-monthly gas pipe, water quality.
CREATE TABLE kitchen_compliance (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  check_type          ENUM('fssai_licence','grocery_stock','perishables','approved_brands',
                           'lpg_spare','gas_pipe','utensil_segregation','water_quality') NOT NULL,
  as_on_date          DATE NOT NULL,
  status              ENUM('compliant','shortfall','not_applicable') NOT NULL,
  detail              VARCHAR(300) NULL,
  valid_till          DATE NULL,
  evidence_file_id    BIGINT UNSIGNED NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kc (running_room_id, check_type, as_on_date),
  CONSTRAINT fk_kc_rr   FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_kc_file FOREIGN KEY (evidence_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_kc_user FOREIGN KEY (recorded_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
