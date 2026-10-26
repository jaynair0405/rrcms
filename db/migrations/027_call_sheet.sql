-- 027 — the call sheet
--
-- Modelled deliberately on the control office's own LPC daily sheet, because
-- that is the working the Railway already knows:
--
--   div_loco_link_master   a STATIC list — one row per train per sheet, with
--                          run_days, an event_time and a validity window.
--                          Nothing is stored per day until somebody types.
--   div_loco_link_log      the daily fact, upserted on (date, train, direction).
--   GET /today             filters the master by the date's day of week, sorts
--                          by time, and LEFT-joins the log.
--
-- Here the master is per running room, because which trains a crew is called
-- for at Igatpuri is a running-room fact: `call_sheet_trains`. The daily fact
-- is `call_book_calls`, already built at stage 20, now keyed to a working date
-- and to its sheet row.
--
-- Why a local list and not a live read of div_loco_link_master: RR-CMS is
-- granted div_trains and nothing else, and every extra cross-schema dependency
-- is a coupling that has to be maintained and a permission that has to be
-- justified. The list is SEEDED from the loco-link master by a one-time import
-- (db/import-call-sheet.js), which can be re-run when the timetable changes.
-- The Railway keeps its own copy, and RR-CMS keeps working if the control
-- office schema moves.

CREATE TABLE IF NOT EXISTS call_sheet_trains (
  id                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,

  train_no          VARCHAR(12) NOT NULL,
  train_name        VARCHAR(120) NULL,
  direction         ENUM('UP','DN','BYPASS','OTHER') NOT NULL DEFAULT 'OTHER',

  -- The time the crew is expected to sign on for this train at this station.
  -- Held as 'HH:MM' exactly as the loco-link master holds event_time -- a real
  -- TIME column invites arithmetic across midnight that nobody asked for.
  sign_on_time      CHAR(5) NULL,
  -- What the working timetable says the train reaches this station at, where
  -- it is known. Shown beside the sign-on time; never computed from.
  arrives_at        CHAR(5) NULL,
  from_station      VARCHAR(12) NULL,
  to_station        VARCHAR(12) NULL,

  -- 'DAILY' or a comma list, 1=Monday .. 7=Sunday. The loco-link master's own
  -- convention, so an operator reading both sees one thing.
  run_days          VARCHAR(20) NOT NULL DEFAULT 'DAILY',
  effective_from    DATE NULL,
  effective_until   DATE NULL,

  -- Where the row came from, which decides how much it can be trusted and
  -- who may change it.
  source            ENUM('imported','manual','learned') NOT NULL DEFAULT 'manual',
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  notes             VARCHAR(200) NULL,
  created_by        BIGINT UNSIGNED NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_cst_rr_train (running_room_id, train_no, direction),
  KEY ix_cst_rr_time (running_room_id, sign_on_time),
  CONSTRAINT fk_cst_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_cst_user FOREIGN KEY (created_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------- the daily fact, re-keyed

ALTER TABLE call_book_calls
  ADD COLUMN sheet_train_id SMALLINT UNSIGNED NULL AFTER running_room_id,
  ADD COLUMN working_date DATE NULL AFTER sheet_train_id;

UPDATE call_book_calls SET working_date = DATE(call_received_at) WHERE working_date IS NULL;

ALTER TABLE call_book_calls
  MODIFY COLUMN working_date DATE NOT NULL,
  -- The lobby has not rung yet on a sheet row the bearer is filling in
  -- advance, so this can no longer be NOT NULL.
  MODIFY COLUMN call_received_at DATETIME NULL;

-- Same on the line. A sheet row can carry the men the lobby named before the
-- call time is known, and refusing that would force the bearer to invent one --
-- which is the exact number a deduction under Schedule C item 6 rests on.
ALTER TABLE call_book
  MODIFY COLUMN call_received_at DATETIME NULL;

-- What a row saves itself against.
--
-- The loco-link log keys on (working_date, train_no, direction), and the first
-- version of this keyed the same way. That is WRONG here, and it took real data
-- to see why: a train genuinely can be called twice in one day at a running
-- room -- called, withdrawn by the lobby, called again for a changed crew. A
-- unique key on the train number would refuse the second call, which is a real
-- event the register must be able to hold.
--
-- So the key is the SHEET SLOT: one row of the room's train list, on one day,
-- is called once. Ad-hoc rows carry sheet_train_id = NULL and are exempt --
-- MySQL treats NULLs as distinct -- which is exactly what lets a goods working
-- or a special be entered as many times as it actually happened.
SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE call_book_calls
  ADD UNIQUE KEY uk_cbc_day_slot (running_room_id, working_date, sheet_train_id),
  ADD CONSTRAINT fk_cbc_sheet FOREIGN KEY (sheet_train_id)
      REFERENCES call_sheet_trains (id) ON DELETE SET NULL;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------- crew changes, kept

-- The lobby substitutes a man. The row must show who is booked NOW, and the
-- register must still show who was booked first -- otherwise a substitution
-- erases the only evidence of what the running room was originally asked to
-- do, which is the same failure as deleting a withdrawn call.
CREATE TABLE IF NOT EXISTS call_book_changes (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  call_id         BIGINT UNSIGNED NOT NULL,
  line_id         BIGINT UNSIGNED NULL,
  change_type     ENUM('crew_changed','crew_added','crew_removed','withdrawn') NOT NULL,
  was_crew_name   VARCHAR(150) NULL,
  now_crew_name   VARCHAR(150) NULL,
  reason          VARCHAR(200) NOT NULL,
  advised_by      VARCHAR(120) NULL,      -- who at the lobby said so
  changed_by      BIGINT UNSIGNED NULL,
  changed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cbch_call (call_id),
  CONSTRAINT fk_cbch_call FOREIGN KEY (call_id) REFERENCES call_book_calls (id) ON DELETE CASCADE,
  CONSTRAINT fk_cbch_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Keeping the room's own train list is the running room's business, not the
-- contractor's: a contractor who can edit which trains are expected can edit
-- away the evidence that one was never called.
INSERT INTO permissions (code, description) VALUES
  ('callsheet.manage', 'Maintain the running room''s list of trains for the call sheet')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE p.code = 'callsheet.manage' AND r.code IN ('rr_incharge','div_officer','sysadmin')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
