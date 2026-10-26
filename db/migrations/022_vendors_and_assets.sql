-- 022_vendors_and_assets.sql
--
-- Two of the five parts of the schema that were laid down early and never given
-- a way in. Both tables already existed and neither had a single INSERT
-- anywhere in the application, so they read as finished from the database and
-- were reachable from nothing.
--
-- What is added here is only what the screens genuinely need beyond what was
-- already there.

-- ------------------------------------------------------------------ vendors
--
-- The tender requires the laundry premises to be "inspected and approved by the
-- Railway at the beginning of the contract and from time to time thereafter"
-- (Sch-C part 2, clauses iii and viii), and a washing centre drawing repeated
-- complaints to be changed. `vendors.is_approved` existed and was read by the
-- laundry screen -- correctly counting a dispatch to an unapproved centre as a
-- clause C1 breach -- but nothing could ever set it.
--
-- Approval is not a flag, it is an event with a date and an officer behind it,
-- and withdrawing it is another. Both are recorded, and the flag is left as the
-- current state derived from them.
ALTER TABLE vendors
  ADD COLUMN blacklisted_on     DATE NULL AFTER is_approved,
  ADD COLUMN blacklist_reason   VARCHAR(300) NULL AFTER blacklisted_on,
  ADD COLUMN contact_person     VARCHAR(120) NULL AFTER address,
  ADD COLUMN phone              VARCHAR(20)  NULL AFTER contact_person,
  ADD COLUMN created_by         BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_vendor_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

-- The premises inspection itself. Separate from the approval, because the
-- tender asks for it "from time to time thereafter" -- an approval given in
-- 2025 is not evidence that the premises were fit in 2027.
CREATE TABLE vendor_inspections (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id         SMALLINT UNSIGNED NOT NULL,
  inspected_on      DATE NOT NULL,
  inspected_by      BIGINT UNSIGNED NULL,
  -- The officer's finding, in his words as well as as a verdict.
  result            ENUM('satisfactory','deficient','unfit') NOT NULL,
  observations      VARCHAR(1000) NULL,
  evidence_file_id  BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_vinsp_vendor (vendor_id, inspected_on),
  CONSTRAINT fk_vinsp_vendor FOREIGN KEY (vendor_id)        REFERENCES vendors (id) ON DELETE CASCADE,
  CONSTRAINT fk_vinsp_user   FOREIGN KEY (inspected_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_vinsp_file   FOREIGN KEY (evidence_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------- assets
--
-- General Instruction 1 requires a joint accountal record of Railway movable
-- items and fixed fittings, with copies held by the depot In-charge, the
-- Sr.DEE/TR office and the contractor. General Instruction 2 requires the items
-- to be JOINTLY INSPECTED EVERY THREE MONTHS, with the full cost of damaged or
-- short material recovered from the contractor at Railway purchasing cost.
--
-- `assets` held the handover date, the joint note and the return date and had
-- no way to create a row. The three-monthly check had no home at all -- so the
-- recovery that clause A10 provides for rested on nothing.
CREATE TABLE asset_checks (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  checked_on        DATE NOT NULL,
  checked_by        BIGINT UNSIGNED NULL,
  -- The contractor's man was there or the check is not joint, and a check that
  -- is not joint proves nothing against him. Named, not merely implied.
  contractor_rep    VARCHAR(150) NOT NULL,
  remarks           VARCHAR(500) NULL,
  note_file_id      BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_check (running_room_id, checked_on),
  CONSTRAINT fk_ac_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_user FOREIGN KEY (checked_by)      REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_ac_file FOREIGN KEY (note_file_id)    REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asset_check_items (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  check_id          INT UNSIGNED NOT NULL,
  asset_id          INT UNSIGNED NOT NULL,
  -- What was on the register, kept beside what was found, so the shortfall is
  -- a fact in the row rather than a subtraction somebody has to remember.
  quantity_expected SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  quantity_found    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  condition_status  ENUM('good','serviceable','defective','condemned','missing') NOT NULL DEFAULT 'good',
  remarks           VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aci (check_id, asset_id),
  CONSTRAINT fk_aci_check FOREIGN KEY (check_id) REFERENCES asset_checks (id) ON DELETE CASCADE,
  CONSTRAINT fk_aci_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Approving a washing centre or a pest operator is the Railway's act, and so is
-- taking a Railway asset onto or off the register. `contract.edit` is held by
-- the divisional officer and the administrator, and by nobody at the site.
-- The joint three-monthly check needs the site, so it rides on `rr.view` plus
-- the existing `deficiency.record`, which the RR In-charge holds.
INSERT INTO permissions (code, description) VALUES
  ('vendor.approve', 'Approve, inspect or blacklist a washing centre or pest control operator'),
  ('asset.manage',   'Add a Railway or contractor asset to a running room register')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('div_officer', 'vendor.approve'),
  ('div_officer', 'asset.manage'),
  ('sysadmin',    'vendor.approve'),
  ('sysadmin',    'asset.manage'),
  -- The RR In-charge may put a Railway asset on his own room's register; he
  -- may not approve a vendor.
  ('rr_incharge', 'asset.manage')
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
