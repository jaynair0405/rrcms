-- 009_feedback.sql
-- Crew feedback, coverage against the 50% floor, and monthly grading averages.
--
-- Feedback is NOT linked to a stay record. The occupancy register lives in RRMS
-- and RR-CMS has no access to it, so a feedback row stands on its own: the
-- running room, the date, and whatever the crew member chooses to identify
-- themselves as at the QR form. Coverage is measured against the occupant count
-- entered monthly in occupancy_monthly.
--
-- The grading rows are computed and stored now so that when the penalty module
-- is switched on it has real history to work from, not a blank slate.

CREATE TABLE feedback (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  crew_id             INT UNSIGNED NULL,
  crew_name           VARCHAR(150) NULL,
  crew_id_entered     VARCHAR(20)  NULL,
  stay_date           DATE NULL,
  submitted_at        DATETIME NOT NULL,
  channel             ENUM('qr_room','qr_dining','checkout_register','mobile_app','other') NOT NULL,

  -- 1.0 to 5.0. rating_food is NULL where the running room serves no meals.
  rating_cleanliness  DECIMAL(3,2) NULL,
  rating_food         DECIMAL(3,2) NULL,
  rating_linen        DECIMAL(3,2) NULL,
  rating_behaviour    DECIMAL(3,2) NULL,
  rating_overall      DECIMAL(3,2) NULL,

  comments            TEXT NULL,
  named_staff_id      INT UNSIGNED NULL,
  is_anonymous        TINYINT(1) NOT NULL DEFAULT 0,
  severity            ENUM('normal','major','critical') NOT NULL DEFAULT 'normal',
  status              ENUM('open','under_action','closed') NOT NULL DEFAULT 'closed',
  closed_by           BIGINT UNSIGNED NULL,
  closed_at           DATETIME NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_fb_rr_time (running_room_id, submitted_at),
  KEY ix_fb_staff (named_staff_id),
  KEY ix_fb_status (status),
  CONSTRAINT fk_fb_rr    FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_fb_crew  FOREIGN KEY (crew_id)         REFERENCES crew (id) ON DELETE SET NULL,
  CONSTRAINT fk_fb_staff FOREIGN KEY (named_staff_id)  REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT fk_fb_user  FOREIGN KEY (closed_by)       REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_fb_clean CHECK (rating_cleanliness IS NULL OR rating_cleanliness BETWEEN 0 AND 5),
  CONSTRAINT ck_fb_food  CHECK (rating_food        IS NULL OR rating_food        BETWEEN 0 AND 5),
  CONSTRAINT ck_fb_linen CHECK (rating_linen       IS NULL OR rating_linen       BETWEEN 0 AND 5),
  CONSTRAINT ck_fb_behav CHECK (rating_behaviour   IS NULL OR rating_behaviour   BETWEEN 0 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feedback_photos (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  feedback_id         BIGINT UNSIGNED NOT NULL,
  file_id             BIGINT UNSIGNED NOT NULL,
  caption             VARCHAR(200) NULL,
  PRIMARY KEY (id),
  KEY ix_fbp_feedback (feedback_id),
  CONSTRAINT fk_fbp_fb   FOREIGN KEY (feedback_id) REFERENCES feedback (id) ON DELETE CASCADE,
  CONSTRAINT fk_fbp_file FOREIGN KEY (file_id)     REFERENCES files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Coverage against the tender's minimum-50%-of-occupants floor. Below the floor
-- the grading penalty is not leviable at all, so this is a first-class record.
CREATE TABLE feedback_coverage (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  period_month        DATE NOT NULL,
  occupants_total     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  feedback_received   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  coverage_pct        DECIMAL(5,2) NOT NULL DEFAULT 0,
  meets_floor         TINYINT(1) NOT NULL DEFAULT 0,
  computed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fbcov (running_room_id, period_month),
  CONSTRAINT fk_fbcov_rr FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Monthly average per grading head, with the banded R value the tender defines:
--   4.01-5 -> 5 | 3.01-4 -> 4 | 2.01-3 -> 3 | 1.01-2 -> 2 | 0-1 -> 0
-- The amount is deliberately NOT stored here; it arrives with the penalty
-- migration once the schedule under review is finalised.
CREATE TABLE monthly_grading (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  period_month        DATE NOT NULL,
  head                ENUM('cleanliness','food','linen') NOT NULL,
  avg_rating          DECIMAL(3,2) NOT NULL,
  sample_size         SMALLINT UNSIGNED NOT NULL,
  r_value             TINYINT UNSIGNED NOT NULL,
  coverage_met        TINYINT(1) NOT NULL DEFAULT 0,
  computed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grading (running_room_id, period_month, head),
  KEY ix_grading_month (period_month),
  CONSTRAINT fk_grading_rr FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT ck_grading_r  CHECK (r_value IN (0,2,3,4,5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-staff rating rolled up from feedback that names them, plus the joint
-- Railway/contractor evaluation. Drives the retain and replace lists.
CREATE TABLE staff_ratings (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_id            INT UNSIGNED NOT NULL,
  period_month        DATE NOT NULL,
  occupant_avg        DECIMAL(3,2) NULL,
  occupant_count      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  joint_eval_score    DECIMAL(3,2) NULL,
  attendance_pct      DECIMAL(5,2) NULL,
  recommendation      ENUM('retain','monitor','replace') NULL,
  evaluated_by        BIGINT UNSIGNED NULL,
  evaluated_on        DATE NULL,
  remarks             VARCHAR(400) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staffrating (staff_id, period_month),
  KEY ix_staffrating_reco (recommendation),
  CONSTRAINT fk_srate_staff FOREIGN KEY (staff_id)    REFERENCES staff (id) ON DELETE CASCADE,
  CONSTRAINT fk_srate_user  FOREIGN KEY (evaluated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
