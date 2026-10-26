-- 035 — the Letter of Acceptance
--
-- Asked for by a divisional officer, 21.08.2026: the LOA is to be visible on
-- the dashboard.
--
-- WHAT WAS MISSING
--
-- `contracts` has carried `loa_date` since stage 3 and has never had the LOA's
-- NUMBER. A date on its own does not identify a letter: an officer checking
-- which agreement covers a running room, or an auditor asking what authority
-- the contractor is working under, needs the reference, and "the LOA dated
-- 14.03.2025" is not a reference anybody can look up.
--
-- The LOA and the agreement are two documents and the tender treats them as
-- two: the Letter of Acceptance is issued on acceptance of the tender, and the
-- agreement is executed afterwards. They have separate numbers and separate
-- dates, and a contract may be live on the LOA for weeks before the agreement
-- is signed — which is exactly the period an officer most needs to see.
ALTER TABLE contracts
  ADD COLUMN loa_no VARCHAR(80) NULL AFTER agreement_no;

-- Not added, deliberately: a place to attach the LOA document itself. That is
-- a contract-documents table and an upload screen, and it was offered and not
-- asked for. The column above is what the request needs.
