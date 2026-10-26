-- 08 — the cleaning schedule, from the tender
--
-- Source: "Improvement of Running Room Facilities", SCHEDULE C, the table
-- headed "Details of cleaning schedule for running room are given below", plus
-- one obligation from the SCOPE FOR CLEANING WORK that follows it.
--
-- The tender's table has five rows. Four are here. The fifth — pest control and
-- rodent treatment, monthly, by an expert agency — is deliberately NOT here: it
-- has had its own register since stage 6, with the operator, the licence and
-- the chemical used, and a second record of the same fact is how two registers
-- come to disagree.
--
-- Each round of a day is its own row, because the tender buys a NUMBER of
-- rounds at STATED hours and a day that should carry five rounds and carries
-- three has to say so by arithmetic. Clause A6 — poor cleaning against
-- schedule, Rs 1000 per day — is what this feeds.

INSERT INTO cleaning_schedule
  (code, area_name, frequency, round_no, window_from, window_to, sort_order, source_ref) VALUES

-- Twice a day. The tender: "From 6-00 AM to 10-00 AM" and "From 4-00 PM to
-- 08-00 PM".
('ROOMS-1','Open space, garden and outside compound; bed rooms, recreation hall and galleries',
 'twice_daily', 1, '06:00', '10:00', 10, 'Schedule C, cleaning schedule table'),
('ROOMS-2','Open space, garden and outside compound; bed rooms, recreation hall and galleries',
 'twice_daily', 2, '16:00', '20:00', 20, 'Schedule C, cleaning schedule table'),

-- Three times a day. The tender: "From 06-00 AM to 08-00 AM", "From 01-00 PM
-- to 03-00 PM", "From 06-00 PM to 08-00 PM".
('KITCHEN-1','Kitchen, kitchen store rooms, dining hall, bathrooms and lavatories with urinal',
 'thrice_daily', 1, '06:00', '08:00', 30, 'Schedule C, cleaning schedule table'),
('KITCHEN-2','Kitchen, kitchen store rooms, dining hall, bathrooms and lavatories with urinal',
 'thrice_daily', 2, '13:00', '15:00', 40, 'Schedule C, cleaning schedule table'),
('KITCHEN-3','Kitchen, kitchen store rooms, dining hall, bathrooms and lavatories with urinal',
 'thrice_daily', 3, '18:00', '20:00', 50, 'Schedule C, cleaning schedule table'),

-- Every Sunday, 08-00 to 12-00.
('FURNITURE','Racks, cupboards and furniture; windows and ventilators including grill and glass portions',
 'weekly_sunday', 1, '08:00', '12:00', 60, 'Schedule C, cleaning schedule table'),

-- Every second and fourth Sunday, 08-00 to 14-00.
('WALLS','Wall surfaces including complete removal of cobwebs, dusting and cleaning of ceilings',
 'sunday_2_4', 1, '08:00', '14:00', 70, 'Schedule C, cleaning schedule table'),

-- Not from the schedule table but from the scope that follows it, item viii:
-- "The wet and dry garbage should be collected separately in the big size
-- dustbin / drum by the contractor and disposed at least twice a day ... It
-- shall also be ensured that garbage shall not be kept overnight in the
-- premises." Twice a day with no hour stated, so no window is invented.
('GARBAGE-1','Wet and dry garbage collected separately and disposed away from the premises',
 'twice_daily', 1, NULL, NULL, 80, 'Schedule C, scope for cleaning work, item viii'),
('GARBAGE-2','Wet and dry garbage collected separately and disposed away from the premises',
 'twice_daily', 2, NULL, NULL, 90, 'Schedule C, scope for cleaning work, item viii')

ON DUPLICATE KEY UPDATE
  area_name = VALUES(area_name), frequency = VALUES(frequency), round_no = VALUES(round_no),
  window_from = VALUES(window_from), window_to = VALUES(window_to),
  sort_order = VALUES(sort_order), source_ref = VALUES(source_ref);
