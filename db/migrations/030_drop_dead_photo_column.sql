-- 030 — a column that was never written and never read
--
-- `staff.photo_file_id` was declared at stage 1 with a foreign key to `files`,
-- and in twenty-two stages nothing has ever written to it or read from it. The
-- photograph is held where it belongs: a `staff_documents` row with
-- `doc_type = 'photograph'`, which also carries who verified it and when, and
-- which the application replaces rather than duplicates when a new likeness is
-- taken.
--
-- Found on the first live install, by looking in the obvious place for a
-- photograph that had in fact saved correctly somewhere else.
--
-- WHY REMOVE IT RATHER THAN LEAVE IT
--
-- A dead column is not harmless. The next person to add anything touching a
-- staff photograph will see a column named `photo_file_id`, take it for the
-- place a photograph goes, and write there. The truth about a man's likeness
-- would then live in two places that disagree, and the screen showing the wrong
-- one would be nobody's obvious fault.
--
-- This is the same shape as the `feedback_coverage` fault at stage 19 — a table
-- read in seven places and written by none — inverted. Both come from schema
-- laid down ahead of the screens that were meant to use it.

SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE staff DROP FOREIGN KEY fk_staff_photo;
ALTER TABLE staff DROP COLUMN photo_file_id;
SET FOREIGN_KEY_CHECKS = 1;
