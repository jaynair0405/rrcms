-- Designations the executed contract names and the Schedule-A list did not.
--
-- Read off Part-A of GEMC-511687722391404, pages 66-67. Three posts had nowhere
-- to sit, and one was carrying the wrong skill category:
--
--   Kitchen helper      15 Nos, SEMI-SKILLED. Nearest was `asst_cook`, which is
--                       unskilled. Different post, different wage band.
--   Running room bearer 15 Nos, unskilled. `table_boy` was named "Table
--                       Boy/Bearer" and was doing duty for both cadres — 30 men
--                       mapped onto one post.
--   Housekeeping staff  25 Nos, unskilled. `sweeper` is the Schedule-A post and
--                       is not the same word; the contract buys housekeeping.
--   Table Boy           15 Nos, and the contract calls them SEMI-SKILLED. We
--                       held them as unskilled.
--
-- SKILL CATEGORY IS NOT COSMETIC. It is the minimum-wage band, and the wage
-- register records what each man was paid. Holding a semi-skilled man as
-- unskilled understates what he is owed.
--
-- `asst_cook`, `sweeper`, `manager` and `gardner` are left exactly as they are.
-- They are Schedule-A posts, sanctioned at rooms whose contracts have not been
-- read in, and removing them would take the establishment away from 43 running
-- rooms to tidy up one.
INSERT INTO designations
  (code, name, skill_category, is_kitchen_role, requires_qualification, min_per_site, qualification_note, sort_order)
VALUES
  ('kitchen_helper','Kitchen Helper','semi_skilled',1,0,0,NULL,13),
  ('rr_bearer','Running Room Bearer','unskilled',0,0,0,NULL,14),
  ('housekeeping','Housekeeping Staff','unskilled',0,0,0,NULL,15)
ON DUPLICATE KEY UPDATE name=VALUES(name), skill_category=VALUES(skill_category),
  is_kitchen_role=VALUES(is_kitchen_role), sort_order=VALUES(sort_order);

-- The correction. Renamed as well as re-banded, because "Table Boy/Bearer" was
-- the name that let one post stand for two.
UPDATE designations
   SET name = 'Table Boy', skill_category = 'semi_skilled'
 WHERE code = 'table_boy';
