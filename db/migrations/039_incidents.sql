-- 039 — the security and incident register. The first half of audit item P14.
--
-- Fire, theft, miscreant activity, accident, death, intoxication. Nothing in
-- RR-CMS records any of them today, and this is the one gap where having no
-- record at all is itself the danger: an officer asked what happened at a site
-- six months ago has nowhere to look, and the contractor has nothing to show
-- either. A register that is empty because nothing happened and a register that
-- is empty because nobody wrote anything down look identical, which is why the
-- screen counts and reports them apart, as everywhere else here.
--
-- WHAT THIS REGISTER IS NOT. Most of what it records carries no penalty. A fire
-- or a theft is an event the Railway must know about, not a deficiency, and
-- nothing here raises one. The single exception is clause A3 — Rs 1,000 per
-- labour per case where CONTRACTOR labour is found intoxicated. Intoxication of
-- RUNNING STAFF is the same word and an entirely different matter: it is a crew
-- discipline question for the lobby and the controller, and no contractor
-- penalty whatever follows from it. Conflating the two would put a penalty on a
-- contractor for something a driver did, so the register keeps them apart by
-- construction: `involves` says whose man it was, and A3 is offered only for
-- one value of it.
CREATE TABLE incidents (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,

  occurred_on         DATE NOT NULL,
  occurred_at         TIME NULL,
  -- When the Railway was told. The gap between this and occurred_on is the
  -- finding an officer looks for first, so it is a recorded date and not a
  -- flag. NULL means nobody has said, which after a death is its own answer.
  reported_on         DATE NULL,

  incident_type       ENUM('fire','theft','miscreant','accident','death',
                           'intoxication','security_lapse','other') NOT NULL,
  severity            ENUM('minor','serious','grave') NULL,

  summary             VARCHAR(300) NOT NULL,
  detail              TEXT NULL,

  -- Whose man, if a person is at the centre of it. This is the column clause A3
  -- turns on and the reason the register cannot be flattened into free text.
  involves            ENUM('contractor_staff','running_staff','occupant',
                           'outsider','nobody') NOT NULL DEFAULT 'nobody',
  staff_id            INT UNSIGNED NULL,
  persons_affected    VARCHAR(400) NULL,

  immediate_action    VARCHAR(600) NULL,
  evidence_file_id    BIGINT UNSIGNED NULL,

  status              ENUM('open','under_enquiry','closed') NOT NULL DEFAULT 'open',
  closed_on           DATE NULL,
  closed_by           BIGINT UNSIGNED NULL,
  closure_remarks     VARCHAR(600) NULL,

  recorded_by         BIGINT UNSIGNED NULL,
  recorded_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ix_inc_rr_date (running_room_id, occurred_on),
  KEY ix_inc_status (status),
  KEY ix_inc_type (incident_type),
  CONSTRAINT fk_inc_rr     FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id),
  CONSTRAINT fk_inc_staff  FOREIGN KEY (staff_id)         REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT fk_inc_file   FOREIGN KEY (evidence_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_inc_closer FOREIGN KEY (closed_by)        REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_inc_rec    FOREIGN KEY (recorded_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who was told, when, and under what reference. A child table rather than a row
-- of booleans, because the question at an enquiry is never "was the police
-- informed" but "when, by whom, and what is the FIR number" — and because the
-- day a seventh authority is added to the list this is a form change and not a
-- migration.
CREATE TABLE incident_notifications (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  incident_id         BIGINT UNSIGNED NOT NULL,
  authority           ENUM('police','rpf','fire_service','medical',
                           'division_control','railway_officer') NOT NULL,
  informed_on         DATE NULL,
  informed_at         TIME NULL,
  reference_no        VARCHAR(80) NULL,      -- FIR number, station diary entry, message number
  remarks             VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inc_authority (incident_id, authority),
  CONSTRAINT fk_incn_incident FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The two permissions this screen needs are declared and granted in
-- db/seeds/01_reference.sql, NOT here. Migrations run before seeds, so a grant
-- written in a migration joins against an empty roles table on a fresh install
-- and silently inserts nothing. test/seed-permissions.js refuses to let that
-- happen again.
