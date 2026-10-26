-- 006_attendance.sql
-- Digital muster. Biometric is Phase 2; the `source` column is how it arrives
-- later without any screen or table change.

CREATE TABLE attendance_daily (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  staff_id            INT UNSIGNED NOT NULL,
  attendance_date     DATE NOT NULL,
  shift               ENUM('general','morning','evening','night') NOT NULL DEFAULT 'general',
  status              ENUM('present','absent','leave','weekly_off','reliever') NOT NULL,
  in_time             TIME NULL,
  out_time            TIME NULL,
  source              ENUM('manual','biometric','import') NOT NULL DEFAULT 'manual',
  marked_by           BIGINT UNSIGNED NULL,
  marked_at           DATETIME NULL,
  countersigned_by    BIGINT UNSIGNED NULL,
  countersigned_at    DATETIME NULL,
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att_staff_date_shift (staff_id, attendance_date, shift),
  KEY ix_att_rr_date (running_room_id, attendance_date),
  CONSTRAINT fk_att_rr     FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id),
  CONSTRAINT fk_att_staff  FOREIGN KEY (staff_id)         REFERENCES staff (id) ON DELETE CASCADE,
  CONSTRAINT fk_att_marker FOREIGN KEY (marked_by)        REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_att_signer FOREIGN KEY (countersigned_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Materialised daily shortfall per designation. Recomputed nightly; kept as a
-- table rather than a view because the penalty module will later read it for a
-- date long past, when the underlying sanction may have changed.
CREATE TABLE deployment_daily (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  summary_date        DATE NOT NULL,
  designation_id      TINYINT UNSIGNED NOT NULL,
  sanctioned_count    TINYINT UNSIGNED NOT NULL,
  present_count       TINYINT UNSIGNED NOT NULL,
  shortfall_count     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  computed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dep (running_room_id, summary_date, designation_id),
  KEY ix_dep_date (summary_date),
  CONSTRAINT fk_dep_rr    FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_dep_desig FOREIGN KEY (designation_id)  REFERENCES designations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
