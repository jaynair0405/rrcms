-- 037 — the contract period becomes optional.
--
-- start_date and end_date were NOT NULL from migration 003, on the reasonable
-- assumption that an agreement on the system is an agreement that has been
-- executed. The pilot proved otherwise: in August 2026 not one of the four
-- rooms had an agreement supplied at all. The contractors are working, the
-- rooms are occupied, and the only paper anybody has is the Letter of
-- Acceptance — which carries no period.
--
-- So the dashboard was already trying to report "the period" as a gap while
-- the table made that gap impossible to have. The officer needs to record what
-- he holds today (an LOA number and its date) and come back for the rest.
-- A NULL period is a real and common state, not a defect.
--
-- ck_contracts_dates survives untouched: in MySQL a CHECK is satisfied unless
-- it evaluates FALSE, and end_date >= start_date is UNKNOWN when either side
-- is NULL. An entered pair is still ordered; an absent one is simply absent.
ALTER TABLE contracts
  MODIFY start_date DATE NULL,
  MODIFY end_date   DATE NULL;
