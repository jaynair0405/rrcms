-- 018_crew_from_staff_master.sql
--
-- Links the call book's crew register to the division's own staff master, the
-- one CRTMS already maintains, without copying it and without reaching into it
-- more deeply than a running room needs.
--
-- Three facts shaped this:
--
--   1. The master holds Aadhaar and PAN numbers, caste, date of birth, blood
--      group, identification marks and home addresses. None of that has any
--      business at a running room counter at four in the morning, and a
--      contractor's supervisor must not be able to reach it at all. RR-CMS
--      therefore reads a NARROW VIEW, not the table. See db/crtms/README.md;
--      the view and the grant are the DBA's work, not this migration's.
--
--   2. The master covers one division. A running room takes crew booked from
--      other divisions and off other railways, and train managers are not on
--      it at all. So a typed name is not a fallback to be designed out later --
--      it is permanent, and the register has to say plainly which rows are
--      verified against a master and which are somebody's handwriting.
--
--   3. The two databases must stay separable. No foreign key crosses between
--      them. The crew row keeps its own copy of the name and the number, so
--      a call book written in 2026 still reads correctly in 2031 after the man
--      has retired and left the master, and so RR-CMS keeps working if CRTMS
--      moves to another server.

-- Which schema on this MySQL instance holds a division's staff master. NULL
-- means that division has no master wired up, and every crew name there is
-- typed -- which is the correct behaviour for a division not yet on CRTMS,
-- not an error.
ALTER TABLE divisions
  ADD COLUMN crtms_schema VARCHAR(64) NULL
    COMMENT 'MySQL schema holding this division staff master, e.g. bbtro. NULL = no lookup.'
    AFTER name;

-- hrms_id is the master's own primary key. It is the link, and it is UNIQUE,
-- so one railway servant cannot end up as two crew rows.
--
-- source is the honest part. A row picked from the master is an identification;
-- a row typed at a counter is a name somebody wrote, and a clause C5 delay
-- attributed to it should be read with that in mind.
ALTER TABLE crew
  ADD COLUMN hrms_id VARCHAR(10) NULL AFTER id,
  ADD COLUMN source ENUM('div_master','typed','qr') NOT NULL DEFAULT 'typed' AFTER crew_id_no,
  ADD COLUMN last_synced_at DATETIME NULL
    COMMENT 'When name, designation and headquarters were last refreshed from the master',
  ADD COLUMN linked_by BIGINT UNSIGNED NULL
    COMMENT 'Who attached this row to a master record, where that was done by hand',
  ADD COLUMN linked_at DATETIME NULL,
  ADD UNIQUE KEY uq_crew_hrms (hrms_id),
  ADD KEY ix_crew_source (source),
  ADD CONSTRAINT fk_crew_linkedby FOREIGN KEY (linked_by) REFERENCES users (id) ON DELETE SET NULL;

-- Seeing a crew member's mobile number is a separate matter from recording his
-- call. The Railway's own officer may need to ring a man who has not turned up;
-- a contractor's employee must not be handed a searchable directory of the
-- division's running staff. Hence its own permission, granted narrowly.
INSERT INTO permissions (code, description) VALUES
  ('crew.contact', 'See a crew member''s CUG or mobile number'),
  ('crew.link',    'Attach a typed crew name to the division staff master')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('hq',          'crew.contact'),
  ('div_officer', 'crew.contact'),
  ('div_officer', 'crew.link'),
  ('rr_incharge', 'crew.contact'),
  ('rr_incharge', 'crew.link'),
  ('sysadmin',    'crew.contact')
  -- contractor_sup deliberately absent from both.
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
