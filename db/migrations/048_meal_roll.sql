-- 048_meal_roll.sql
--
-- A MAN WHO WAS NOT CALLED, BUT WAS THERE.
--
-- The meals screen lists whoever the call book called that day, plus anyone who
-- already has a meal ticked. It also offers "Add a man who was not called" --
-- for a crew resting without a call, or a train manager -- and says in as many
-- words: "He appears on the list above; his meals are then ticked deliberately,
-- like everyone else's."
--
-- He did not appear. There was nowhere to record that he was present: not
-- called, so no call book row; no meal ticked yet, so no meal row; and the list
-- is built from exactly those two. The promise on the screen could not be kept
-- by the query behind it.
--
-- This is that missing fact, and only that: this man was at this running room on
-- this day, for meals, though nobody called him. It ticks nothing -- adding a
-- person must never assert that he ate.
CREATE TABLE meal_roll (
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  service_date      DATE NOT NULL,
  crew_id           INT UNSIGNED NOT NULL,
  added_by          BIGINT UNSIGNED NULL,
  added_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (running_room_id, service_date, crew_id),
  KEY ix_mroll_crew (crew_id),
  CONSTRAINT fk_mroll_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_mroll_crew FOREIGN KEY (crew_id)         REFERENCES crew (id) ON DELETE CASCADE,
  CONSTRAINT fk_mroll_user FOREIGN KEY (added_by)        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
