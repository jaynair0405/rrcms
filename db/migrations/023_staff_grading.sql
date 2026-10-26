-- 023_staff_grading.sql
--
-- `staff_ratings` has existed since stage 5 with no route and no view, so the
-- Concept Note's two lists — "staff with good rating, helps in retaining the
-- staff" and "staff with bad rating, to be barred from hiring" — could not be
-- produced at all, and General Instruction 28's grading at checkout had nowhere
-- to go.
--
-- Grading is a joint act. The tender has it done by occupants at checkout and
-- "by Railway supervisors jointly with contractor supervisor", so both the
-- RR In-charge and the divisional officer may record it. The contractor's
-- supervisor may not: a recommendation to replace one of his own men, written
-- by him, is not an evaluation.
INSERT INTO permissions (code, description) VALUES
  ('staff.grade', 'Record a monthly grading and a retain / monitor / replace recommendation')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('rr_incharge', 'staff.grade'),
  ('div_officer', 'staff.grade')
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Which running room the grading was made at. `staff_ratings` keys on the
-- person, and a person belongs to a running room — but a man who moves between
-- sites during a contract would otherwise leave a history that cannot be read
-- by site, which is how the monthly pack reads everything else.
ALTER TABLE staff_ratings
  ADD COLUMN running_room_id SMALLINT UNSIGNED NULL AFTER staff_id,
  ADD KEY ix_srate_rr (running_room_id, period_month),
  ADD CONSTRAINT fk_srate_rr FOREIGN KEY (running_room_id)
    REFERENCES running_rooms (id) ON DELETE SET NULL;
