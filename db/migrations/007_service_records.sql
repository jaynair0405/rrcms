-- 007_service_records.sql
--
-- SCOPE BOUNDARY WITH RRMS
-- ------------------------
-- Railways already runs RRMS as the official system of record for:
--     * the occupancy register (arrival, bed allotment, checkout)
--     * meal and subsidy accounting
-- RR-CMS does NOT duplicate either. There is no stays table, no bed inventory
-- and no meal transaction table here.
--
-- What RR-CMS records is the SERVICE the contractor delivers, which RRMS does
-- not hold: call book timing, linen handling, complaints and crew feedback.
-- These are the facts the contract is judged on.
--
-- RR-CMS has no access to RRMS data. Anything that needs an occupant count --
-- principally the tender's minimum-50%-of-occupants feedback floor -- is
-- entered monthly by the RR In-charge into occupancy_monthly. The source
-- column is there so a file import or an API feed can supersede manual entry
-- later without a schema change.

-- Crew are not imported from anywhere. A row appears the first time someone
-- identifies themselves at a QR feedback form or is named on a call book entry.
CREATE TABLE crew (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  crew_id_no          VARCHAR(20)  NULL,
  full_name           VARCHAR(150) NOT NULL,
  designation         VARCHAR(80)  NULL,
  headquarters        VARCHAR(60)  NULL,
  division_id         SMALLINT UNSIGNED NULL,
  phone               VARCHAR(20)  NULL,
  is_female           TINYINT(1) NOT NULL DEFAULT 0,
  first_seen_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crew_idno (crew_id_no),
  KEY ix_crew_name (full_name),
  CONSTRAINT fk_crew_div FOREIGN KEY (division_id) REFERENCES divisions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The denominator for the 50% feedback floor, and the only occupancy figure
-- RR-CMS holds. One row per running room per month.
CREATE TABLE occupancy_monthly (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  period_month        DATE NOT NULL,
  occupants_total     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  crew_days           SMALLINT UNSIGNED NULL,
  peak_occupancy      SMALLINT UNSIGNED NULL,
  source              ENUM('manual','rrms_export','rrms_api') NOT NULL DEFAULT 'manual',
  source_reference    VARCHAR(120) NULL,
  entered_by          BIGINT UNSIGNED NULL,
  entered_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_by         BIGINT UNSIGNED NULL,
  verified_at         DATETIME NULL,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_occmonth (running_room_id, period_month),
  KEY ix_occ_period (period_month),
  CONSTRAINT fk_occ_rr    FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_occ_user  FOREIGN KEY (entered_by)      REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_occ_verif FOREIGN KEY (verified_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Call book service. Individual events, because the timing is what clause C5
-- turns on ("failure to serve call book in time, resulting crew late on duty").
-- RRMS does not hold this. The crew member is identified by whatever the call
-- boy records; crew_id is linked opportunistically when it matches.
CREATE TABLE call_book (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  crew_id             INT UNSIGNED NULL,
  crew_name           VARCHAR(150) NULL,
  bed_no              VARCHAR(12) NULL,
  call_for_train      VARCHAR(12) NULL,
  call_received_at    DATETIME NOT NULL,
  booked_on_duty_at   DATETIME NULL,
  served_at           DATETIME NULL,
  served_by_staff_id  INT UNSIGNED NULL,
  acknowledged        TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_at     DATETIME NULL,
  ack_signature_file_id BIGINT UNSIGNED NULL,
  delay_minutes       INT GENERATED ALWAYS AS
                        (TIMESTAMPDIFF(MINUTE, call_received_at, served_at)) STORED,
  crew_reported_late  TINYINT(1) NOT NULL DEFAULT 0,
  remarks             VARCHAR(300) NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_call_rr_time (running_room_id, call_received_at),
  KEY ix_call_delay (delay_minutes),
  KEY ix_call_crew (crew_id),
  CONSTRAINT fk_call_rr    FOREIGN KEY (running_room_id)       REFERENCES running_rooms (id),
  CONSTRAINT fk_call_crew  FOREIGN KEY (crew_id)               REFERENCES crew (id) ON DELETE SET NULL,
  CONSTRAINT fk_call_staff FOREIGN KEY (served_by_staff_id)    REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT fk_call_sign  FOREIGN KEY (ack_signature_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_call_user  FOREIGN KEY (recorded_by)           REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Linen handling, recorded as a daily aggregate per running room rather than
-- per occupant -- per-occupant issue is a function of the occupancy register,
-- which is RRMS's job. What matters contractually is whether fresh linen was
-- available and whether the wash cycle happened.
CREATE TABLE linen_daily (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  record_date         DATE NOT NULL,
  bedsheets_issued    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  pillow_covers_issued SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  mosquito_nets_issued SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  blankets_issued     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  soiled_sent_to_wash SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  fresh_received      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  fresh_stock_in_hand SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  min_stock_met       TINYINT(1) NOT NULL DEFAULT 1,
  used_linen_reported SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  recorded_by         BIGINT UNSIGNED NULL,
  verified_by         BIGINT UNSIGNED NULL,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_linenday (running_room_id, record_date),
  KEY ix_linenday_date (record_date),
  CONSTRAINT fk_lday_rr    FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_lday_user  FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_lday_verif FOREIGN KEY (verified_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE complaints (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  source              ENUM('complaint_book','qr','verbal','inspection','cms') NOT NULL,
  raised_by_crew_id   INT UNSIGNED NULL,
  raised_by_name      VARCHAR(150) NULL,
  raised_at           DATETIME NOT NULL,
  category            VARCHAR(60) NULL,
  description         TEXT NOT NULL,
  severity            ENUM('normal','major','critical') NOT NULL DEFAULT 'normal',
  status              ENUM('open','under_action','closed','rejected') NOT NULL DEFAULT 'open',
  assigned_to         BIGINT UNSIGNED NULL,
  closed_at           DATETIME NULL,
  closed_by           BIGINT UNSIGNED NULL,
  closure_remarks     VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY ix_comp_rr_status (running_room_id, status),
  KEY ix_comp_raised (raised_at),
  CONSTRAINT fk_comp_rr   FOREIGN KEY (running_room_id)   REFERENCES running_rooms (id),
  CONSTRAINT fk_comp_crew FOREIGN KEY (raised_by_crew_id) REFERENCES crew (id) ON DELETE SET NULL,
  CONSTRAINT fk_comp_asgn FOREIGN KEY (assigned_to)       REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_comp_clos FOREIGN KEY (closed_by)         REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
