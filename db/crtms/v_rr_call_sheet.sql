-- v_rr_call_sheet — the fourth and last view RR-CMS reads out of CRTMS.
--
-- Run this in the DIVISION schema (bbtro for Mumbai), by somebody who owns it.
--
-- WHAT IT IS FOR
--
-- The call sheet needs the trains a crew is actually CALLED FOR at a running
-- room, in time order. RR-CMS cannot work that out from `div_trains`: that
-- master is a flat list of the division's trains with no station, no timing and
-- no idea which of them ever reaches Igatpuri. The control office already knows,
-- because `div_loco_link_master` carries every train on every sheet with its
-- run days, and the section boundaries are precisely the three running rooms:
--   NE → IGP,   SE → LNL,   KR → ROHA.
--
-- WHICH DIRECTION A ROOM'S SHEET IS
--
-- This matters and is easy to get backwards. A crew works DOWN to Igatpuri, is
-- relieved there, walks to the running room and sleeps. When his turn comes he
-- is called for an UP train back towards Mumbai. So:
--
--   a room AT THE BOUNDARY (IGP, LNL, ROHA)  →  its call sheet is the UP trains
--   a room AT THE MUMBAI END (CSMT, LTT, PNVL, DR)  →  the DN trains
--
-- The arriving train is how the man got there; the departing train is what he
-- is called for. The view therefore hands over BOTH ends of every link, and
-- the importer picks the right one for each running room.
--
-- WHAT CROSSES, AND WHAT DOES NOT
--
-- A train number, a train name, a direction, the two end stations, the run
-- days, and the time the working timetable says it reaches that station.
-- Nothing about locos, sheds, links, mislinks, crew or the day's actual
-- working crosses. This view answers one question — "which trains, at which
-- station, on which days, at what time" — and nothing else.
--
-- HOW IT IS USED
--
-- It is read ONCE, by `node db/import-call-sheet.js`, which copies it into
-- RR-CMS's own `call_sheet_trains`. It is NOT read on every page. A running
-- room at four in the morning must not depend on the control office schema
-- being reachable, and the Railway must be able to correct its own list
-- without editing the control office's. Re-run the import when the timetable
-- changes.

CREATE OR REPLACE VIEW v_rr_call_sheet AS
SELECT
  -- Both ends of the Mumbai loco link. The importer matches a running room's
  -- station against these and takes the direction that is worked OUT of it.
  CASE m.section
    WHEN 'NE' THEN 'IGP'
    WHEN 'SE' THEN 'LNL'
    WHEN 'KR' THEN 'ROHA'
    ELSE NULL
  END                                        AS boundary_station,
  CASE m.sheet_source
    WHEN 'CSMT-UP' THEN 'CSMT'  WHEN 'CSMT-DN' THEN 'CSMT'
    WHEN 'LTT-UP'  THEN 'LTT'   WHEN 'LTT-DN'  THEN 'LTT'
    WHEN 'PNVL-UP' THEN 'PNVL'  WHEN 'PNVL-DN' THEN 'PNVL'
    WHEN 'DR-UP'   THEN 'DR'    WHEN 'DR-DN'   THEN 'DR'
    ELSE NULL
  END                                        AS terminal_station,
  m.train_no,
  COALESCE(t.train_name, m.train_name)       AS train_name,
  m.direction,
  m.section,
  m.from_station,
  m.to_station,
  m.run_days,
  -- The train's time at the Mumbai terminal, which is what the loco link sheet
  -- is ordered by. For a room at that end this is the departure to call for.
  m.event_time                               AS terminal_time,
  -- The working timetable's times at the boundary station. For a room there,
  -- the departure is what the crew is called for and the arrival is how the
  -- previous crew got in.
  DATE_FORMAT(b.departure_time, '%H:%i')     AS boundary_departs_at,
  DATE_FORMAT(b.arrival_time,   '%H:%i')     AS boundary_arrives_at,
  m.effective_from,
  m.effective_until
FROM div_loco_link_master m
LEFT JOIN div_trains t
       ON t.train_no = m.train_no
LEFT JOIN div_train_stops b
       ON b.train_id = t.train_id
      AND b.station_code = CASE m.section
            WHEN 'NE' THEN 'IGP' WHEN 'SE' THEN 'LNL' WHEN 'KR' THEN 'ROHA' ELSE NULL END
WHERE m.active = 1;

-- Grant it to the RR-CMS account and to nothing else. SELECT only; RR-CMS has
-- no business writing to the control office's tables and is not given the
-- ability to try.
--
--   GRANT SELECT ON bbtro.v_rr_call_sheet TO 'rrcms'@'localhost';
--   FLUSH PRIVILEGES;
--
-- To check what it will hand over before granting anything:
--
--   SELECT boundary_station, direction, COUNT(*) FROM v_rr_call_sheet
--    WHERE boundary_station IN ('IGP','LNL','ROHA')
--    GROUP BY boundary_station, direction;
--
-- For Igatpuri the row that matters is direction = 'UP': the train the rested
-- crew is called for. The DN rows are how he arrived.
