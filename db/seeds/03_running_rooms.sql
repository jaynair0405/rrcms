-- 03_running_rooms.sql
-- The 44 Central Railway running rooms with outsourced housekeeping,
-- from the TRO dashboard register. Bed counts, categories, meal facility,
-- AC status and female accommodation are REAL. Everything else in the
-- database is generated sample data.
--
-- ref_crews_per_day  = crews served in a day (throughput; may exceed beds)
-- ref_peak_occupancy = maximum concurrent occupants (the capacity constraint)

INSERT INTO running_rooms
  (code, name, station_code, division_id, control_dept_id, category,
   physical_rooms, total_beds, female_rooms, ref_crews_per_day, ref_peak_occupancy,
   has_meal_facility, has_housekeeping, ac_status, ac_remarks, status)
VALUES
  ('RR001','CSMT','CSMT',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',48,198,1,198,198,0,1,'working',NULL,'operational'),
  ('RR002','CLA (NCS)','CLA (NCS)',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',18,36,0,36,36,0,1,'working',NULL,'operational'),
  ('RR003','SNPD (Old)','SNPD (Old)',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'C',2,24,0,14,14,0,1,'working',NULL,'operational'),
  ('RR004','SNPD (New)','SNPD (New)',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',12,24,0,24,24,0,1,'working',NULL,'operational'),
  ('RR005','PNVL -Sub PF','PNVL -Sub PF',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',3,26,0,26,26,0,1,'working',NULL,'operational'),
  ('RR006','PNVL -Sub (Yard)','PNVL -Sub (Y',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',8,24,1,24,24,0,1,'working',NULL,'operational'),
  ('RR007','PNVL -Gds','PNVL -Gds',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',4,58,1,55,58,0,1,'working',NULL,'operational'),
  ('RR008','TNA(Stn)','TNA(Stn)',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',8,32,0,34,34,0,1,'working',NULL,'operational'),
  ('RR009','KALVA','KALVA',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',6,30,0,24,24,0,1,'working',NULL,'operational'),
  ('RR010','KYN','KYN',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',10,74,0,74,74,0,1,'working',NULL,'operational'),
  ('RR011','THK','THK',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'C',10,20,0,20,20,0,1,'working',NULL,'operational'),
  ('RR012','IGP - LP Ghat','IGP - LP Gha',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',4,23,0,22,23,1,1,'working',NULL,'operational'),
  ('RR013','IGP - LP Mail','IGP - LP Mai',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',6,44,1,78,44,1,1,'working',NULL,'operational'),
  ('RR014','IGP - LP Goods','IGP - LP Goo',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',5,22,1,22,22,1,1,'working',NULL,'operational'),
  ('RR015','IGP - BSL Gaurd','IGP - BSL Ga',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',5,26,0,26,26,1,1,'working',NULL,'operational'),
  ('RR016','IGP - BB Gaurd','IGP - BB Gau',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',5,16,0,36,16,1,1,'working',NULL,'operational'),
  ('RR017','LNL -Ghat','LNL -Ghat',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',5,30,1,30,30,1,1,'working',NULL,'operational'),
  ('RR018','LNL -BVT','LNL -BVT',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',9,42,1,37,42,1,1,'working',NULL,'operational'),
  ('RR019','ROHA','ROHA',(SELECT id FROM divisions WHERE code='BB'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',8,64,1,64,80,1,1,'working',NULL,'operational'),
  ('RR020','IGP','IGP',(SELECT id FROM divisions WHERE code='BSL'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',15,67,1,94,60,1,1,'working',NULL,'operational'),
  ('RR021','MMR','MMR',(SELECT id FROM divisions WHERE code='BSL'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',16,96,1,152,89,1,1,'working',NULL,'operational'),
  ('RR022','NGN','NGN',(SELECT id FROM divisions WHERE code='BSL'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',15,79,1,96,48,1,1,'working',NULL,'operational'),
  ('RR023','BSL','BSL',(SELECT id FROM divisions WHERE code='BSL'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',125,250,6,284,187,1,1,'working',NULL,'operational'),
  ('RR024','BD','BD',(SELECT id FROM divisions WHERE code='BSL'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',25,152,2,255,151,1,1,'working',NULL,'operational'),
  ('RR025','KNW','KNW',(SELECT id FROM divisions WHERE code='BSL'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',24,92,2,105,86,1,1,'working',NULL,'operational'),
  ('RR026','NGP','NGP',(SELECT id FROM divisions WHERE code='NGP'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',18,63,2,95,55,1,1,'working',NULL,'operational'),
  ('RR027','AMF','AMF',(SELECT id FROM divisions WHERE code='NGP'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',7,48,1,71,46,1,1,'working',NULL,'operational'),
  ('RR028','BPQ (OLD)','BPQ (OLD)',(SELECT id FROM divisions WHERE code='NGP'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',17,119,0,155,119,1,1,'working',NULL,'operational'),
  ('RR029','BPQ (NEW)','BPQ (NEW)',(SELECT id FROM divisions WHERE code='NGP'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',14,117,1,145,110,1,1,'working',NULL,'operational'),
  ('RR030','MJRI','MJRI',(SELECT id FROM divisions WHERE code='NGP'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',6,35,0,55,35,1,1,'working',NULL,'operational'),
  ('RR031','GGS','GGS',(SELECT id FROM divisions WHERE code='NGP'),(SELECT id FROM control_departments WHERE code='ELECT'),'C',4,16,0,20,16,1,1,'working',NULL,'operational'),
  ('RR032','WR','WR',(SELECT id FROM divisions WHERE code='NGP'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',13,26,1,45,26,1,1,'working',NULL,'operational'),
  ('RR033','DD','DD',(SELECT id FROM divisions WHERE code='PA'),(SELECT id FROM control_departments WHERE code='MECH'),'A',7,40,1,72,40,1,1,'working',NULL,'operational'),
  ('RR034','GPR','GPR',(SELECT id FROM divisions WHERE code='PA'),(SELECT id FROM control_departments WHERE code='MECH'),'B',10,39,1,29,26,1,1,'working',NULL,'operational'),
  ('RR035','KOP','KOP',(SELECT id FROM divisions WHERE code='PA'),(SELECT id FROM control_departments WHERE code='MECH'),'B',5,24,1,24,18,1,1,'working',NULL,'operational'),
  ('RR036','MRJ','MRJ',(SELECT id FROM divisions WHERE code='PA'),(SELECT id FROM control_departments WHERE code='MECH'),'A',17,69,1,97,67,1,1,'working',NULL,'operational'),
  ('RR037','PA (STN)','PA (STN)',(SELECT id FROM divisions WHERE code='PA'),(SELECT id FROM control_departments WHERE code='MECH'),'A',37,207,2,460,160,1,1,'working',NULL,'operational'),
  ('RR038','PB','PB',(SELECT id FROM divisions WHERE code='PA'),(SELECT id FROM control_departments WHERE code='MECH'),'B',6,28,0,24,22,1,1,'working',NULL,'operational'),
  ('RR039','STR','STR',(SELECT id FROM divisions WHERE code='PA'),(SELECT id FROM control_departments WHERE code='MECH'),'B',5,23,1,27,18,1,1,'working',NULL,'operational'),
  ('RR040','WD','WD',(SELECT id FROM divisions WHERE code='SUR'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',15,121,1,165,90,1,1,'working',NULL,'operational'),
  ('RR041','SUR','SUR',(SELECT id FROM divisions WHERE code='SUR'),(SELECT id FROM control_departments WHERE code='ELECT'),'A',8,77,1,110,77,1,1,'working',NULL,'operational'),
  ('RR042','KWV','KWV',(SELECT id FROM divisions WHERE code='SUR'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',2,15,0,29,15,1,1,'partial','Provided in 2 rooms','operational'),
  ('RR043','LUR','LUR',(SELECT id FROM divisions WHERE code='SUR'),(SELECT id FROM control_departments WHERE code='ELECT'),'B',9,37,1,50,37,1,1,'working',NULL,'operational'),
  ('RR044','KLBG','KLBG',(SELECT id FROM divisions WHERE code='SUR'),(SELECT id FROM control_departments WHERE code='ELECT'),'C',8,22,1,18,11,1,1,'working',NULL,'operational')
ON DUPLICATE KEY UPDATE
  physical_rooms=VALUES(physical_rooms), total_beds=VALUES(total_beds),
  female_rooms=VALUES(female_rooms), ref_crews_per_day=VALUES(ref_crews_per_day),
  ref_peak_occupancy=VALUES(ref_peak_occupancy), has_meal_facility=VALUES(has_meal_facility),
  category=VALUES(category), ac_status=VALUES(ac_status);
