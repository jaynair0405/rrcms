-- 026 — the call book as it actually works
--
-- What happens at a running room:
--
--   The Jr Crew Controller in the lobby telephones the running room and gives
--   ONE train, the sign-on time, and the names of the men booked for it — the
--   LP and the ALP, sometimes a guard. The bearer writes that on ONE line of
--   the manual call book, goes to the beds, wakes the men, hands over the book
--   and takes their acknowledgement. He then repeats the acknowledgement back
--   to the lobby. The crew sign on and work the train.
--
-- The old schema recorded one row per man with no notion of the call. That
-- made the bearer enter the same call twice and, worse, left the Railway
-- unable to see that the LP was woken and the ALP was not — which is precisely
-- the discrepancy Schedule A obliges the contractor to report:
--
--   "For any discrepancy regarding non acknowledgement of call by staff or
--    such staff is not available in the running room at the time of call
--    serving, crew booking lobby shall be advised immediately for suitable
--    action with time."
--
-- So: a call header, with the men as lines under it.

CREATE TABLE IF NOT EXISTS call_book_calls (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id       SMALLINT UNSIGNED NOT NULL,

  -- What the lobby gives.
  train_no              VARCHAR(12) NULL,
  train_name            VARCHAR(120) NULL,
  sign_on_at            DATETIME NULL,
  received_from         VARCHAR(120) NULL,   -- the Jr CC who rang
  lobby                 VARCHAR(60) NULL,    -- which lobby or CCOR

  -- When the lobby rang. Typed by the bearer, so `created_at` is kept beside
  -- it as the server's own record: a call entered long after it was received
  -- is visible as such instead of passing as contemporaneous.
  call_received_at      DATETIME NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Schedule A: "The acknowledgement of serving of call by respective crew
  -- shall be repeated to crew lobby." A step the system had nowhere to put.
  repeated_to_lobby_at  DATETIME NULL,
  repeated_to           VARCHAR(120) NULL,
  repeated_by           BIGINT UNSIGNED NULL,

  -- A call the lobby withdraws — train cancelled, crew changed — must be
  -- closed with a reason rather than deleted, or the trail goes with it.
  cancelled_at          DATETIME NULL,
  cancelled_reason      VARCHAR(200) NULL,

  remarks               VARCHAR(300) NULL,
  recorded_by           BIGINT UNSIGNED NULL,

  PRIMARY KEY (id),
  KEY ix_cbc_rr_time (running_room_id, call_received_at),
  KEY ix_cbc_train (train_no),
  CONSTRAINT fk_cbc_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_cbc_user FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_cbc_rpt  FOREIGN KEY (repeated_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- the lines

-- Each man called, under his call.
ALTER TABLE call_book
  ADD COLUMN call_id BIGINT UNSIGNED NULL AFTER running_room_id,
  ADD COLUMN crew_role VARCHAR(20) NULL AFTER crew_name;

-- The outcome, which was a single yes/no flag and had to be three states. A
-- man who refused and a man who was not in the running room are different
-- facts with different consequences, and both are the contractor's to report.
ALTER TABLE call_book
  ADD COLUMN ack_outcome ENUM('pending','acknowledged','refused','not_present')
      NOT NULL DEFAULT 'pending' AFTER acknowledged,
  ADD COLUMN ack_method ENUM('tap','signature','paper') NULL AFTER ack_outcome;

-- `acknowledged_at` can be typed. `ack_recorded_at` cannot: it is stamped by
-- the server the moment the crew touches the screen at the bed. That is the
-- one time in this whole record that nobody can write at leisure, and it is
-- the time Schedule C item 6 turns on.
ALTER TABLE call_book
  ADD COLUMN ack_recorded_at DATETIME NULL AFTER acknowledged_at;

-- The advice to the lobby, per man, because it is the individual man who was
-- absent or who refused.
ALTER TABLE call_book
  ADD COLUMN lobby_advised_at DATETIME NULL,
  ADD COLUMN lobby_advised_to VARCHAR(120) NULL;

ALTER TABLE call_book
  ADD KEY ix_call_callid (call_id),
  ADD KEY ix_call_outcome (ack_outcome),
  ADD CONSTRAINT fk_call_call FOREIGN KEY (call_id)
      REFERENCES call_book_calls (id) ON DELETE CASCADE;

-- --------------------------------------------------- existing rows, if any

-- Every row already recorded becomes a call of one man, so nothing that was
-- entered before this change disappears from the register or the reports.
INSERT INTO call_book_calls
  (running_room_id, train_no, call_received_at, created_at, recorded_by)
SELECT cb.running_room_id, cb.call_for_train, cb.call_received_at,
       cb.call_received_at, cb.recorded_by
  FROM call_book cb
 WHERE cb.call_id IS NULL;

UPDATE call_book cb
  JOIN call_book_calls c
    ON c.running_room_id = cb.running_room_id
   AND c.call_received_at = cb.call_received_at
   AND (c.train_no <=> cb.call_for_train)
   SET cb.call_id = c.id
 WHERE cb.call_id IS NULL;

-- The old flag carried forward into the new three-state column.
UPDATE call_book SET ack_outcome = 'acknowledged', ack_method = 'paper'
 WHERE acknowledged = 1 AND ack_outcome = 'pending';
