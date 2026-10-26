-- 016_staff_joining_optional.sql
-- Allow a contract worker to exist on the register without a date of joining.
--
-- Migration 005 made date_of_joining NOT NULL, which is right for a person
-- being added through the screen: the officer entering a new worker knows when
-- he started, and the field is required on that form.
--
-- It is wrong for the case that actually arises first. When a running room is
-- brought onto the system, the Railway holds a roster of people already
-- working there -- a list of names and posts, typed by the contractor, with no
-- dates on it at all. Refusing that list until every joining date is chased
-- would mean the register stays empty and the system stays unused; inventing
-- the dates would put a figure on screen that no one can vouch for and that
-- would later be relied on for man-days and EPF liability.
--
-- So the column becomes nullable, and a missing joining date is treated the
-- same way as a missing police verification: recorded as absent, visible on
-- the screen, and something the site is asked to supply. The form still
-- requires it, because someone adding a person today has no excuse.

ALTER TABLE staff
  MODIFY date_of_joining DATE NULL
    COMMENT 'NULL only for staff loaded from a legacy roster; the entry form requires it';
