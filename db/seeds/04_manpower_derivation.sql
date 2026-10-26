-- 04_manpower_derivation.sql
-- Derives the effective sanctioned strength for every running room from the
-- Schedule-A norms, applying two rules that the tender implies but does not
-- tabulate:
--
--   1. A running room with no meal facility carries no kitchen crew.
--      11 of the 44 sites serve no subsidised meals, so Head Cook, Cooks,
--      Assistant Cooks, Bearers and Utensil Washers are sanctioned at zero.
--
--   2. Schedule-A's smallest band is 50 beds, but 27 sites are smaller —
--      down to 15 beds. The band-50 row is scaled pro-rata with a per-role
--      floor, which the tender permits: "Above numbers are indicative.
--      Numbers of workers may increase/decrease depending upon the local
--      conditions of running room."
--
-- is_scaled is stored so the arithmetic stays visible to an RR In-charge who
-- has to justify the figure, and is_overridden lets a divisional officer
-- depart from it with a recorded reason.

INSERT INTO running_room_manpower
  (running_room_id, designation_id, band_beds, norm_count, sanctioned_count,
   is_scaled, is_overridden, effective_from)
SELECT
  rr.id,
  d.id,
  b.band_beds,
  n.sanctioned_count AS norm_count,
  CASE
    WHEN rr.has_meal_facility = 0 AND d.is_kitchen_role = 1 THEN 0
    WHEN n.sanctioned_count = 0                             THEN 0
    WHEN rr.total_beds >= 50                                THEN n.sanctioned_count
    ELSE GREATEST(d.min_per_site,
                  ROUND(n.sanctioned_count * rr.total_beds / 50))
  END AS sanctioned_count,
  CASE WHEN rr.total_beds < 50 THEN 1 ELSE 0 END AS is_scaled,
  0,
  '2026-01-01'
FROM running_rooms rr
JOIN (
  SELECT id AS rr_id,
         CASE WHEN total_beds <  50 THEN 50
              WHEN total_beds <= 110 THEN 100
              WHEN total_beds <= 160 THEN 150
              WHEN total_beds <= 210 THEN 200
              ELSE 250 END AS band_beds
  FROM running_rooms
) b ON b.rr_id = rr.id
JOIN designations d
  ON d.is_active = 1
JOIN manpower_norms n
  ON n.band_beds = b.band_beds AND n.designation_id = d.id AND n.effective_to IS NULL
ON DUPLICATE KEY UPDATE
  band_beds        = VALUES(band_beds),
  norm_count       = VALUES(norm_count),
  sanctioned_count = VALUES(sanctioned_count),
  is_scaled        = VALUES(is_scaled);
