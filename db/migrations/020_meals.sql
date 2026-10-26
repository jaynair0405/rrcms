-- 020_meals.sql
--
-- Meals actually served, one tick per crew per service.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
--
-- This is not meal accounting. RRMS owns the money side, and the certificate
-- module already says so. What the Railway has never had is the primary record
-- underneath it: which crew ate, at which service, on which day, at which room.
-- Without that, a monthly meal count is a number the contractor supplies and
-- nobody can check.
--
-- So: a row is a fact -- this man took this meal here on this date. One row per
-- crew per service per day, enforced by the unique key, because a man cannot
-- take breakfast twice and a duplicated tick would inflate the count.
--
-- NO RUPEE FIGURE IS COMPUTED ANYWHERE, here or in the screens. The Schedule B
-- ceilings are carried in meal_rates below because they are contract facts
-- worth holding beside the counts, and because they were on record before this
-- table existed. They are printed for reference and multiplied by nothing. When
-- the schedule is finally settled the amounts come out of counts that already
-- exist, and nothing has to be re-entered.

CREATE TABLE meal_services (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  service_date      DATE NOT NULL,
  meal_type         ENUM('breakfast','lunch','dinner') NOT NULL,
  crew_id           INT UNSIGNED NOT NULL,
  -- Kept beside crew_id for the same reason the call book keeps it: the record
  -- must still read correctly in five years, after the man has retired and left
  -- the division's staff master.
  crew_name         VARCHAR(150) NULL,
  taken_at          DATETIME NULL,
  recorded_by       BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  remarks           VARCHAR(200) NULL,
  PRIMARY KEY (id),
  -- A man cannot take breakfast twice. Two ticks would be two meals billed.
  UNIQUE KEY uq_meal (running_room_id, service_date, meal_type, crew_id),
  KEY ix_meal_date (service_date),
  KEY ix_meal_crew (crew_id),
  CONSTRAINT fk_meal_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_crew FOREIGN KEY (crew_id)         REFERENCES crew (id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_user FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The Schedule B ceilings. Dated, because they change and last year's count has
-- to keep last year's rate. `source_ref` is there so a disputed figure is
-- settled by reading the document rather than by arguing about the screen.
CREATE TABLE meal_rates (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  meal_type         ENUM('breakfast','lunch','dinner') NOT NULL,
  effective_from    DATE NOT NULL,
  subsidised_rate   DECIMAL(8,2) NULL COMMENT 'The ceiling on the Railway share',
  full_rate         DECIMAL(8,2) NULL COMMENT 'The ceiling on the full charge',
  source_ref        VARCHAR(160) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mealrate (meal_type, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
