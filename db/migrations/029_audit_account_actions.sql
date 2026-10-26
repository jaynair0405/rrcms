-- 029 — the audit log could not record account events
--
-- `audit_log.action` was an ENUM of seven values written at stage 1, before the
-- account screens existed. Five of the actions the application actually records
-- were not among them:
--
--     password_change   a user setting their own password
--     password_reset    an administrator resetting somebody else's
--     unlock            an administrator clearing a lockout
--     activate          an account switched on
--     deactivate        an account switched off
--
-- MySQL answers an out-of-range ENUM with "Data truncated for column 'action'",
-- the audit service catches it and warns — because an audit write must never be
-- the reason an operation fails — and the event is lost.
--
-- Every one of those five is an ACCOUNT SECURITY EVENT, which is the category
-- an audit trail exists for above all others. The first real password change on
-- the first real installation went unrecorded, which is exactly how this was
-- found: on a live database, on the first login, by the log line nobody was
-- meant to have to read.
--
-- The demo never caught it because its stub accepts any string. That is now
-- three classes of fault the stub cannot see — enum ranges, column widths and
-- foreign keys — and it is why a stage is not finished until it has run against
-- a real MySQL.
--
-- Widening an ENUM is metadata-only when the new values are APPENDED, so this
-- does not rewrite the table.

ALTER TABLE audit_log
  MODIFY COLUMN action ENUM(
    'insert','update','delete','login','logout','export','sign',
    'password_change','password_reset','unlock','activate','deactivate'
  ) NOT NULL;
