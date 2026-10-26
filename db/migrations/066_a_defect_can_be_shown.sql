-- 066 — a reported defect can carry a photograph
--
-- WHY
--
-- Asked for by the officer on 09.09.2026, and his example was this one: "the
-- photo upload feature of the defective asset or untidy room".
--
-- The breakdown log already runs the tender's 24-hour rectification clock, and
-- until now the whole evidence for a defect was a line of typed text --
-- "geyser not heating in bath no. 3". That is enough to raise it and nothing
-- like enough to settle an argument about it. A photograph taken at the moment
-- of reporting says what a sentence cannot: which geyser, how bad, and that it
-- was in that state on that date.
--
-- WHY THE COLUMN IS ON THE BREAKDOWN AND NOT ON THE ASSET
--
-- `assets.joint_note_file_id` already exists and holds a different thing: the
-- handover note from when the Railway gave the asset over. An asset is handed
-- over once and breaks many times, so a photograph of the third failure has no
-- business overwriting the note from the first day. One column per fact.
--
-- NULLABLE, and it stays nullable. A defect reported without a photograph is
-- still a defect reported, and a supervisor who cannot photograph it at that
-- moment must not be prevented from recording it -- an unrecorded fault is
-- worse than an unillustrated one. Nothing here makes the photograph a
-- condition of the report.

ALTER TABLE asset_breakdowns
  ADD COLUMN photo_file_id BIGINT UNSIGNED NULL
    COMMENT 'the defect as it was when reported'
    AFTER description,
  ADD CONSTRAINT fk_abd_photo FOREIGN KEY (photo_file_id) REFERENCES files (id) ON DELETE SET NULL;
