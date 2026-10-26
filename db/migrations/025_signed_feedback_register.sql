-- 025_signed_feedback_register.sql
--
-- The physical feedback register, signed by the occupant.
--
-- The tender is explicit and says it twice. Penalty Note (p.30): feedback and
-- grading on cleanliness, linen washing and food quality "shall be taken from
-- EACH occupant EVERY MONTH on a physical feedback register duly signed by the
-- occupant and kept on record", and the penalty rests on the average from a
-- minimum of 50% of occupants. General Instruction 32 (p.26): "daily feedback
-- register should be maintained."
--
-- Everything RR-CMS held was a QR submission: anonymous by default, unsigned,
-- and keyed by nobody. If a contractor disputed a grading deduction and asked
-- to see the signed register the contract requires, the Railway would have
-- produced a list of web form entries. That is a weaker answer than the tender
-- contemplates and it is the deduction that would suffer for it.
--
-- So a feedback row can now carry the page it came from and the scan of that
-- page, and the coverage figure counts the signed entries separately — because
-- the 50% floor the penalty clause names is a floor of SIGNED occupant
-- feedback, not of anything that arrived.

ALTER TABLE feedback
  -- The scanned page of the register. Many entries share one page, which is how
  -- the register actually looks: a sheet with ten signatures on it.
  ADD COLUMN signature_file_id BIGINT UNSIGNED NULL AFTER comments,
  ADD COLUMN register_page_no  VARCHAR(20) NULL AFTER signature_file_id,
  -- Who keyed it in. A QR submission has nobody behind it and this stays NULL;
  -- a register entry has an officer, and that is part of what makes it evidence.
  ADD COLUMN entered_by        BIGINT UNSIGNED NULL,
  ADD COLUMN entered_at        DATETIME NULL,
  ADD KEY ix_fb_signed (running_room_id, channel, submitted_at),
  ADD CONSTRAINT fk_fb_sign FOREIGN KEY (signature_file_id) REFERENCES files (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_fb_enter FOREIGN KEY (entered_by) REFERENCES users (id) ON DELETE SET NULL;

-- Coverage is now two numbers, not one. `feedback_received` stays as it was —
-- everything received, which is the useful operational figure — and the signed
-- count sits beside it, because that is the one the penalty clause turns on.
ALTER TABLE feedback_coverage
  ADD COLUMN signed_received SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER feedback_received,
  ADD COLUMN signed_pct      DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER coverage_pct,
  ADD COLUMN meets_signed_floor TINYINT(1) NOT NULL DEFAULT 0 AFTER meets_floor;

-- Keying the register is the running room's work and the Railway's evidence, so
-- the RR In-charge and the divisional officer may do it. The contractor's
-- supervisor may not: he is the party the grading is against, and a rating he
-- typed himself from a page he holds is not an occupant's signature.
INSERT INTO permissions (code, description) VALUES
  ('feedback.enter', 'Key in the signed physical feedback register')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('rr_incharge', 'feedback.enter'),
  ('div_officer', 'feedback.enter')
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
