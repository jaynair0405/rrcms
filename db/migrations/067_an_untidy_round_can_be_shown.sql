-- 067 — a round marked NOT DONE can carry a photograph
--
-- WHY, AND WHY ONLY ON A ROUND THAT WAS NOT DONE
--
-- The officer asked for "the photo upload feature of the defective asset or
-- untidy room". The defect went in at 066; this is the untidy room.
--
-- The obvious version -- a photograph on every round, as proof the work was
-- done -- was costed before it was built, and the numbers refused it. IGP runs
-- 25 rounds a day in each of 4 buildings, so 100 rounds a day:
--
--     every round photographed   73,000 photographs   214 GB over two years
--     across all 44 running rooms                     about 9 TB
--     only rounds NOT done (say 4 a day)  2,920       8.6 GB
--
-- The evidential argument points the same way and is the better reason. A
-- photograph of a clean floor proves a floor was clean at some moment. It does
-- not prove the round happened, at the hour it was due, by the man rostered for
-- it -- which is what the register is actually for. A photograph of an untidy
-- room proves a specific breach at a specific hour, and that is the thing an
-- officer needs when the contractor says it was fine.
--
-- Ruled by the officer on 10.09.2026: per round, only when the round is marked
-- not done, and never required.
--
-- NEVER REQUIRED, and the route does not enforce it either. A file box on a
-- hundred rows a day, demanded, would stop the register being filled at all,
-- and a register nobody fills is worse than one without photographs. The
-- supervisor is day shift and fills in rounds he walked hours earlier; the
-- picture may be on his phone or may not exist.
--
-- The column is left in place if the round is later corrected to `done`. What
-- was photographed at the time is a fact about that moment, and a correction is
-- a later fact -- deleting the first to record the second would lose the reason
-- the correction was needed.

ALTER TABLE cleaning_log
  ADD COLUMN photo_file_id BIGINT UNSIGNED NULL
    COMMENT 'the round as it was found, where it was not done'
    AFTER remarks,
  ADD CONSTRAINT fk_cl_photo FOREIGN KEY (photo_file_id) REFERENCES files (id) ON DELETE SET NULL;
