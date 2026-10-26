-- 045_roster_cleared.sql
--
-- A place to record that a running room's roster was cleared ON PURPOSE.
--
-- When a contract changes hands the men change with it, so db/clear-staff.js
-- empties the roster and db/seed-pilot.js must not put the old names back on
-- its next run. That is the same fault shape that cost 87 beds and IGP's
-- establishment earlier in this stage: a step that re-runs from a source which
-- does not know about a later correction.
--
-- The first attempt wrote the mark into `running_rooms.remarks`, and the merge
-- step in the very same loader overwrote remarks with its own sentence before
-- the roster step ever read it. A fact that another step is free to overwrite is
-- not a record of anything. It gets its own column.
ALTER TABLE running_rooms
  ADD COLUMN roster_cleared_on DATE NULL
  COMMENT 'Set by db/clear-staff.js. The pilot loader will not reload a roster cleared on purpose.';
