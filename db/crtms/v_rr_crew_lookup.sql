-- v_rr_crew_lookup.sql
--
-- RUN THIS ON THE CRTMS DATABASE, NOT ON RR-CMS.
-- It is the DBA's step, and it is the whole of what RR-CMS is permitted to see
-- of the division's staff master.
--
-- Substitute the schema name for the division being brought on. Mumbai is
-- `bbtro`; another division will have its own schema, and the value goes into
-- RR-CMS's divisions.crtms_schema so no code changes when it does.
--
-- WHY A VIEW AND NOT THE TABLE
--
-- div_staff_master carries Aadhaar and PAN numbers, caste, date of birth,
-- blood group, identification marks, marital status, home and present address,
-- and email. A running room needs a name, a CMS number and a designation, and
-- nothing else whatever. Granting RR-CMS SELECT on the table would mean the
-- protection was a line of application code -- one careless `SELECT *` in a
-- later stage and a contractor's supervisor is looking at a driver's Aadhaar
-- number on a screen at a railway station. Granting SELECT on this view means
-- the protection is in the database and holds even if the application is
-- wrong.
--
-- Caste in particular. It is in the master for reservation roster purposes and
-- has no conceivable use in a call book. It must not cross.

USE bbtro;

-- ---------------------------------------------------------------- the lookup
-- Everything the call book needs to identify a man, and not one column more.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW v_rr_crew_lookup AS
SELECT
  s.hrms_id                                   AS hrms_id,
  COALESCE(s.current_cms_id, s.original_cms_id) AS cms_id,
  s.name                                      AS full_name,
  -- Carried so the call book can offer only drivers in the Loco Pilot box and
  -- only assistants in the Assistant box. Filtering on the code alone cannot
  -- do that: LP and ALP are both "running staff" and both pass the WHERE
  -- below. Booking a cook as a driver was never possible; booking an ALP as
  -- the LP was, and that is a real keying error at four in the morning.
  s.designation_id                            AS designation_id,
  d.designation_code                          AS designation_code,
  d.designation_name                          AS designation_name,
  s.hq_station                                AS hq_station,
  s.current_office_code                       AS office_code
FROM div_staff_master s
LEFT JOIN designations d ON d.id = s.designation_id
WHERE s.status = 'Active'
  AND (s.retirement_date IS NULL OR s.retirement_date >= CURDATE())
  -- Running staff only. These are the people who actually occupy a running
  -- room. CLIs, office staff and supervisors are excluded so the list stays
  -- short and the wrong man is harder to pick.
  AND d.designation_code IN ('ALP','LPS','LPG','LPP','LPM','LPGHAT','MOTORMAN','LP');

-- --------------------------------------------------------------- the contact
-- Kept separate on purpose. A crew member's mobile number is not needed to
-- record that he was called; it is needed to chase a man who has not turned
-- up, which is the Railway's officer's job and not the contractor's. Splitting
-- it means the grant itself can be withheld, rather than relying on RR-CMS to
-- remember who is allowed to see it.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW v_rr_crew_contact AS
SELECT
  s.hrms_id                                    AS hrms_id,
  COALESCE(s.cug_number, s.phone_number)       AS contact_number
FROM div_staff_master s
WHERE s.status = 'Active';

-- ----------------------------------------------------------------- trains
-- The call book records which train a crew was called for. Typed at four in
-- the morning it becomes 12345, 1234, 12435 and "Mahanagari" for the same
-- service, and then no pattern of late calls can be attributed to a train at
-- all. CRTMS already holds the division's train master; this offers it back.
--
-- Only the number, the name and where it runs between. Nothing about crew
-- links, loco assignment or the working timetable crosses.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW v_rr_train_lookup AS
SELECT
  t.train_no      AS train_no,
  t.train_name    AS train_name,
  t.train_type    AS train_type,
  t.direction     AS direction,
  t.run_days      AS run_days,
  t.from_station  AS from_station,
  t.to_station    AS to_station
FROM div_trains t
WHERE t.is_active = 1;

-- ------------------------------------------------------------------- grants
-- Replace the account name and host with the ones RR-CMS actually connects as
-- (see DB_USER in its .env). SELECT on these three views only -- never on
-- div_staff_master or div_trains themselves.
--
--   GRANT SELECT ON bbtro.v_rr_crew_lookup  TO 'rrcms_app'@'127.0.0.1';
--   GRANT SELECT ON bbtro.v_rr_crew_contact TO 'rrcms_app'@'127.0.0.1';
--   GRANT SELECT ON bbtro.v_rr_train_lookup TO 'rrcms_app'@'127.0.0.1';
--   FLUSH PRIVILEGES;
--
-- To withhold contact numbers from RR-CMS altogether, simply do not run the
-- second grant. The application already treats the lookup as optional and will
-- carry on without it.
--
-- To check what was granted:
--   SHOW GRANTS FOR 'rrcms_app'@'127.0.0.1';
