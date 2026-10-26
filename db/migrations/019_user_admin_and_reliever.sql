-- 019_user_admin_and_reliever.sql
--
-- Three unrelated things that all had to be settled before the four Mumbai
-- rooms could be handed to the people who will actually use them.

-- ---------------------------------------------------------------- user admin
-- Creating an account and setting its scope was a SQL statement until now. The
-- role says what a person may do; the division, running room or contractor says
-- which records he may touch, and that second half is the whole of row-level
-- access control. It does not belong in a terminal.
INSERT INTO permissions (code, description) VALUES
  ('user.manage', 'Create users, set their role and scope, reset passwords')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('sysadmin', 'user.manage')
  -- Nobody else. An officer who could create accounts could create one for
  -- himself with a wider scope than his own, which makes his own scope
  -- decorative.
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- ----------------------------------------------------------------- reliever
-- A day marked *Reliever* means "he worked today, covering a post other than
-- his own". Until now it did not say WHOSE post, so the arithmetic could not
-- tell a covered absence from an uncovered one -- the shortfall read the same
-- either way, and a man could be shown as relieving nobody at all.
--
-- The Railway's decision (18.08.2026) is that a reliever must come from the
-- roster of that running room. A substitute sent in from outside cannot be
-- marked at all: an unscreened person working in a railway kitchen is the
-- breach screening exists to prevent, and the honest remedy is to get him
-- screened, not to record him as though he were somebody else.
ALTER TABLE attendance_daily
  -- INT UNSIGNED, matching staff.id. A BIGINT here fails the foreign key with
  -- MySQL's unhelpful errno 150.
  ADD COLUMN relieved_staff_id INT UNSIGNED NULL
    COMMENT 'Whose post this man covered. Required when status = reliever.'
    AFTER status,
  ADD KEY ix_att_relieved (relieved_staff_id),
  ADD CONSTRAINT fk_att_relieved FOREIGN KEY (relieved_staff_id)
    REFERENCES staff (id) ON DELETE SET NULL;

-- ------------------------------------------------------------- linen stock
-- linen_stock has existed since stage 6 and has never had a screen, so no
-- figure has ever been entered into it. Nothing to alter -- the table is right
-- as it stands -- but the running room needs to be able to say when a count was
-- taken and by whom, which it could not.
ALTER TABLE linen_stock
  ADD COLUMN counted_by BIGINT UNSIGNED NULL AFTER as_on_date,
  ADD COLUMN remarks VARCHAR(300) NULL AFTER counted_by,
  ADD CONSTRAINT fk_lstock_user FOREIGN KEY (counted_by) REFERENCES users (id) ON DELETE SET NULL;
