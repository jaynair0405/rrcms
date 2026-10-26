-- 021_cctv.sql
--
-- The CCTV obligation.
--
-- The contract requires cameras covering the kitchen, the dining area, the
-- corridors and the entrance, with the recording retained. Nothing in RR-CMS
-- recorded any of it, so an obligation that is easy to check on the ground was
-- being checked nowhere and evidenced never.
--
-- Two tables, and the distinction between them is the point:
--
--   cctv_cameras  — what is installed. Changes rarely. A camera taken off the
--                   register is a contractual fact, so it is retired with a
--                   date and a reason rather than deleted.
--   cctv_checks   — what was found on a given day. Changes daily. A camera can
--                   be installed and dead, and only a check says which.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: it does not carry a stream URL and does
-- not embed a live picture. A URL that reaches a camera carries, in practice,
-- the credentials that reach it, and putting one in a contract-management
-- database would spread them to every officer with a login. Worse, a tile
-- showing a live picture invites the belief that the system is watching, when
-- all it can honestly say is what somebody last verified. This register records
-- verification. Watching is done at the running room.

CREATE TABLE cctv_cameras (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  -- The four the contract names, plus room for what a site actually has.
  zone              ENUM('kitchen','dining','corridor','entrance','store','other') NOT NULL,
  label             VARCHAR(80) NOT NULL COMMENT 'What the running room calls it, e.g. "Kitchen — over the range"',
  location_note     VARCHAR(200) NULL,
  installed_on      DATE NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  retired_on        DATE NULL,
  retired_reason    VARCHAR(200) NULL,
  added_by          BIGINT UNSIGNED NULL,
  added_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cctv_rr (running_room_id, is_active),
  KEY ix_cctv_zone (zone),
  CONSTRAINT fk_cctv_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_cctv_user FOREIGN KEY (added_by)        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cctv_checks (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  camera_id         INT UNSIGNED NOT NULL,
  checked_on        DATE NOT NULL,
  is_working        TINYINT(1) NOT NULL DEFAULT 1,
  -- A working camera recording nothing is the commoner failure and the one that
  -- matters after the event, so it is asked separately.
  recording_ok      TINYINT(1) NULL,
  -- How far back footage could actually be played, as seen. NULL means the
  -- officer did not look -- which is not the same as nil.
  footage_days_seen SMALLINT UNSIGNED NULL,
  checked_by        BIGINT UNSIGNED NULL,
  remarks           VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cctv_check (camera_id, checked_on),
  KEY ix_cctvchk_date (checked_on),
  CONSTRAINT fk_cctvchk_cam  FOREIGN KEY (camera_id)  REFERENCES cctv_cameras (id) ON DELETE CASCADE,
  CONSTRAINT fk_cctvchk_user FOREIGN KEY (checked_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recording a camera and checking it is running-room work, so it rides on the
-- permission the other daily registers use. Taking a camera OFF the register is
-- not: that is the contractor's coverage being reduced, and it needs the
-- Railway. `rr.edit` is held by the divisional officer and the administrator,
-- and by nobody at the site.
INSERT INTO permissions (code, description) VALUES
  ('cctv.record', 'Register a camera and record a CCTV check')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('rr_incharge',    'cctv.record'),
  ('contractor_sup', 'cctv.record'),
  ('div_officer',    'cctv.record')
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
