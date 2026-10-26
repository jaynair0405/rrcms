-- 065 — one contract clause may stand in place of more than one tender clause
--
-- WHY
--
-- `supersedes_code` was built as a single code because the first four mappings
-- were one-to-one: IGP's clause (b) replaces A3, (a) replaces A9, (bb) replaces
-- C6, (aa) replaces A4.
--
-- The food register broke that shape. The divisional tender penalises bad raw
-- material as TWO offences -- B2, poor quality, Rs 500, and B4, rotten or
-- spoilt, Rs 1,000. IGP's contract writes them as ONE, clause (t): "Non-branded
-- or non-Agmark grocery, edible oil, masalas, or decayed vegetables, eggs or
-- chicken in use", Rs 500 per case, the material to be disposed of on the spot.
-- Non-branded is B2's ground; decayed is B4's. Ruled by the officer on
-- 09.09.2026: at IGP both are clause (t).
--
-- One column holding one code could carry only one of the two, and the other
-- would have gone on quietly answering with the tender's Rs 1,000 -- a rate this
-- contract does not contain.
--
-- WHY A LIST RATHER THAN A SECOND ROW
--
-- The alternative was to seed clause (t) twice, once per code. That would put
-- the same contractual obligation in the table under two identities, and every
-- count of "how many clauses does this contract have" would then be wrong. The
-- contract has thirty-one clauses. It says so on its own pages.
--
-- WIDENED TO 64, not left at 16. "B2,B4" fits in 16 today; a clause replacing
-- four would not, and MySQL's answer to that is to truncate quietly and leave a
-- mapping that half works. The column is read by one query and the table holds
-- under a hundred rows, so the width costs nothing.

ALTER TABLE deficiency_clauses
  MODIFY COLUMN supersedes_code VARCHAR(64) NULL
    COMMENT 'comma-separated generic clause codes this contract clause replaces';
