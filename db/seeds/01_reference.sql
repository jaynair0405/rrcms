-- 01_reference.sql
-- Reference data that comes straight from the tender and the CR organisation.
-- Safe to re-run: every insert is idempotent on its natural key.

-- ---------- roles & permissions ----------
INSERT INTO roles (code,name,description,scope_level) VALUES
  ('hq','HQ / PCEE Office','View-all across Central Railway','cr'),
  ('div_officer','Sr. DEE (TRO) / DME (O&C)','Divisional officer — inspects, approves, passes bills','division'),
  ('rr_incharge','RR In-charge / CLI','Running room level operations and joint checklist','running_room'),
  -- Posted to ONE running room, like the RR In-charge, not to every site his
  -- firm holds. Prabhakar Enterprises holds IGP and ROHA, 100 km apart, and one
  -- supervisor cannot be at both. See migration 044.
  ('contractor_sup','Contractor Supervisor','Contractor side — muster, documents, replies','running_room'),
  ('crew','Running Staff','Submits feedback, views own stays','self'),
  ('sysadmin','System Administrator','Masters, roles, schedule versions','cr')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

INSERT INTO permissions (code,description) VALUES
  ('rr.view','View running rooms'),
  ('rr.edit','Create and edit running rooms'),
  ('contract.view','View contracts'),
  ('contract.edit','Create and edit contracts'),
  ('staff.view','View contract staff'),
  ('staff.edit','Add and edit contract staff'),
  ('staff.screen','Approve or reject staff screening'),
  -- SCREENING AND ADMISSION ARE TWO DIFFERENT ACTS, held by two different men.
  --
  -- APPROVING says the Railway has looked at a man and his papers and permits
  -- him to work. That is the control which keeps an unverified person out of a
  -- railway kitchen, and it stays with the divisional officer.
  --
  -- ADMITTING PROVISIONALLY says something weaker and quite different: this man
  -- is ALREADY WORKING, and what is missing is not his fitness but this
  -- system's knowledge of it. It is reversible, it is flagged on every screen he
  -- appears on, and it clears nothing.
  --
  -- Until now both were `staff.screen` and both were the Sr. DEE's alone, so on
  -- the day a running room is switched on its whole roster waited for a
  -- divisional officer before a single muster could be filed -- and the RR
  -- In-charge, the Railway's own man standing at the site looking at the men,
  -- could do nothing. The officer's decision, 07.09.2026: the CLI admits, the
  -- Sr. DEE approves.
  ('staff.admit','Admit a man provisionally so the register can be kept'),
  ('muster.mark','Mark daily muster'),
  ('muster.countersign','Counter-sign daily muster'),
  ('stay.manage','Allot beds, check crew in and out'),
  ('meal.record','Record meals against a stay'),
  ('feedback.view','View crew feedback'),
  ('feedback.submit','Submit crew feedback'),
  ('feedback.close','Close or action a feedback item'),
  ('inspection.create','Record an inspection or daily checklist'),
  ('inspection.sign','Sign a joint inspection report'),
  ('deficiency.record','Record a deficiency'),
  ('deficiency.close','Close a deficiency'),
  ('bill.prepare','Prepare a monthly bill'),
  ('bill.pass','Pass a bill for payment'),
  ('master.edit','Edit master data including the deficiency schedule'),
  -- The menu is not the contractor's to settle alone and not the Railway's to
  -- write for him. Schedule B splits it: the contractor PREPARES the week under
  -- `stay.manage`, which he already holds, and the Railway AGREES it. The rate
  -- board is the Railway's alone, because the tender says the cost of extra
  -- items "shall be fixed by Railways ... on the basis of no-profit, no-loss".
  ('menu.manage','Agree the weekly menu and fix the rate board'),
  -- ---------------------------------------------------------------------
  -- DECLARED IN MIGRATIONS UNTIL 28.08.2026, AND THEREFORE HELD BY NOBODY.
  --
  -- Each of these was created in the migration that added its screen, and
  -- granted there with a join against `roles`. Migrations run BEFORE seeds, so
  -- on a fresh install `roles` is empty at that moment: the permission row was
  -- written, the grant matched nothing, MySQL raised no error, and the screen
  -- became unreachable by every role in the system. On a database that had
  -- already been seeded once the same statement worked, which is why it went
  -- unnoticed for nine permissions and nine screens.
  --
  -- Found on the first real install when the sysadmin could not open the user
  -- admin screen — the one screen needed to give the other three running rooms
  -- their in-charge and supervisor logins.
  --
  -- The rule this settles: A PERMISSION IS DECLARED HERE, NEVER IN A MIGRATION.
  ('user.manage','Create users, set their role and scope, reset passwords'),
  ('crew.contact','See a crew member''s CUG or mobile number'),
  ('crew.link','Attach a typed crew name to the division staff master'),
  ('cctv.record','Register a camera and record a CCTV check'),
  ('vendor.approve','Approve, inspect or blacklist a washing centre or pest control operator'),
  ('asset.manage','Add a Railway or contractor asset to a running room register'),
  ('staff.grade','Record a monthly grading and a retain / monitor / replace recommendation'),
  ('feedback.enter','Key in the signed physical feedback register'),
  ('callsheet.manage','Maintain the running room''s list of trains for the call sheet'),
  -- Cleaning is recorded by the contractor's men under `stay.manage` and
  -- verified by the Railway. A cleaning record the contractor fills and nobody
  -- confirms is the contractor marking his own work — the same reason the
  -- muster is counter-signed and the weekly menu is agreed.
  ('cleaning.verify','Verify a day of the cleaning record'),
  -- The shelf figure is the book's, computed and never typed. A COUNT is
  -- somebody standing at the shelf saying what is there, and ACCEPTING one is
  -- what makes it the position the book carries forward. The contractor's
  -- supervisor counts -- it is his stock and his job. The Railway accepts,
  -- because a contractor who could accept his own count of his own shelf
  -- would be settling the two-days'-stock condition by writing a number.
  ('linen.accept','Accept a count of the linen shelf as the new book position'),
  -- Wages are paid by the contractor, so his supervisor records them; the
  -- Railway confirms it saw the jointly signed payment sheet. Clause M5 turns
  -- on the date wages were actually paid and on the number of men, so both are
  -- facts somebody has to put his name to.
  ('wages.view','View the wages, EPF, ESIC, bonus and Shramik Kalyan register'),
  ('wages.record','Record the month''s wage payments and statutory returns'),
  ('wages.verify','Confirm the Railway has seen the month''s payment sheet'),
  -- An incident is recorded by whoever is at the site when it happens — the
  -- contractor's supervisor as readily as the RR In-charge, because a fire at
  -- two in the morning must not wait for the right person to be on duty.
  -- Closing one is the Railway's act alone: a contractor who could close a
  -- theft or a death in his own running room is marking his own homework on
  -- the one register where that matters most.
  ('incident.record','Record a fire, theft, accident or other incident'),
  ('incident.close','Close or set an incident under enquiry'),
  -- The standing obligations — the PC, the biometric, the bond, the
  -- extinguishers. The contractor's supervisor records what he has put in
  -- place; the Railway can correct it. One permission, because unlike the
  -- incident register there is nothing here to close.
  ('compliance.record','Record where a running room stands on the standing obligations'),
  -- The monthly occupant count, read off the RRMS register or the manual one.
  -- It is the DENOMINATOR of the 50% feedback floor, so it decides whether the
  -- three grading clauses can be levied at all — which is exactly why the
  -- CONTRACTOR'S SUPERVISOR IS NOT GIVEN IT. A contractor who could set the
  -- denominator of his own grading penalty could switch that penalty off by
  -- entering a large number, and nothing on the screen would look wrong.
  ('occupancy.record','Enter the monthly occupant count for a running room'),
  ('report.export','Export reports'),
  ('audit.view','View the audit trail')
ON DUPLICATE KEY UPDATE description=VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.code, p.code) IN (
  ('hq','rr.view'),
  ('hq','contract.view'),
  ('hq','wages.view'),
  ('hq','staff.view'),
  ('hq','feedback.view'),
  ('hq','report.export'),
  ('hq','audit.view'),
  ('hq','crew.contact'),
  ('div_officer','rr.view'),
  ('div_officer','rr.edit'),
  ('div_officer','contract.view'),
  ('div_officer','contract.edit'),
  ('div_officer','staff.view'),
  ('div_officer','staff.screen'),
  ('div_officer','muster.countersign'),
  ('div_officer','feedback.view'),
  ('div_officer','feedback.close'),
  ('div_officer','inspection.create'),
  ('div_officer','inspection.sign'),
  ('div_officer','deficiency.record'),
  ('div_officer','deficiency.close'),
  ('div_officer','bill.prepare'),
  ('div_officer','bill.pass'),
  ('div_officer','menu.manage'),
  ('div_officer','crew.contact'),
  ('div_officer','crew.link'),
  ('div_officer','cctv.record'),
  ('div_officer','vendor.approve'),
  ('div_officer','asset.manage'),
  ('div_officer','staff.admit'),
  ('div_officer','staff.grade'),
  ('div_officer','feedback.enter'),
  ('div_officer','callsheet.manage'),
  ('div_officer','cleaning.verify'),
  ('div_officer','linen.accept'),
  ('div_officer','wages.view'),
  ('div_officer','wages.record'),
  ('div_officer','wages.verify'),
  ('div_officer','incident.record'),
  ('div_officer','incident.close'),
  ('div_officer','compliance.record'),
  ('div_officer','occupancy.record'),
  ('div_officer','report.export'),
  ('div_officer','audit.view'),
  ('rr_incharge','rr.view'),
  ('rr_incharge','staff.view'),
  ('rr_incharge','muster.countersign'),
  ('rr_incharge','stay.manage'),
  ('rr_incharge','meal.record'),
  ('rr_incharge','feedback.view'),
  ('rr_incharge','feedback.close'),
  ('rr_incharge','inspection.create'),
  ('rr_incharge','inspection.sign'),
  ('rr_incharge','deficiency.record'),
  ('rr_incharge','menu.manage'),
  ('rr_incharge','crew.contact'),
  ('rr_incharge','crew.link'),
  ('rr_incharge','cctv.record'),
  ('rr_incharge','asset.manage'),
  ('rr_incharge','staff.admit'),
  ('rr_incharge','staff.grade'),
  ('rr_incharge','feedback.enter'),
  ('rr_incharge','callsheet.manage'),
  ('rr_incharge','cleaning.verify'),
  ('rr_incharge','linen.accept'),
  ('rr_incharge','wages.view'),
  ('rr_incharge','wages.verify'),
  ('rr_incharge','incident.record'),
  ('rr_incharge','incident.close'),
  ('rr_incharge','compliance.record'),
  ('rr_incharge','occupancy.record'),
  ('rr_incharge','report.export'),
  -- Prepares and certifies the monthly certification pack; the divisional
  -- officer counter-signs it (bill.pass).
  ('rr_incharge','bill.prepare'),
  -- May enter contract staff and their documents as well as the contractor's
  -- own supervisor. A site should not stall because the contractor's man
  -- cannot get to a computer. Screening still belongs to the divisional
  -- officer, so this does not let the running room clear its own people.
  ('rr_incharge','staff.edit'),
  ('contractor_sup','rr.view'),
  ('contractor_sup','staff.view'),
  ('contractor_sup','staff.edit'),
  ('contractor_sup','muster.mark'),
  ('contractor_sup','stay.manage'),
  ('contractor_sup','meal.record'),
  ('contractor_sup','cctv.record'),
  ('contractor_sup','wages.view'),
  ('contractor_sup','wages.record'),
  ('contractor_sup','incident.record'),
  ('contractor_sup','compliance.record'),
  ('crew','feedback.submit'),
  ('sysadmin','master.edit'),
  ('sysadmin','menu.manage'),
  -- The user admin screen. Nobody else: an officer who could create accounts
  -- could create one for himself with a wider scope than his own, which makes
  -- his own scope decorative.
  ('sysadmin','user.manage'),
  ('sysadmin','crew.contact'),
  ('sysadmin','vendor.approve'),
  ('sysadmin','asset.manage'),
  ('sysadmin','callsheet.manage'),
  ('sysadmin','cleaning.verify'),
  ('sysadmin','linen.accept'),
  ('sysadmin','wages.view'),
  ('sysadmin','wages.record'),
  ('sysadmin','wages.verify'),
  ('sysadmin','incident.record'),
  ('sysadmin','incident.close'),
  ('sysadmin','compliance.record'),
  ('sysadmin','occupancy.record'),
  ('sysadmin','rr.view'),
  ('sysadmin','rr.edit'),
  ('sysadmin','contract.view'),
  ('sysadmin','contract.edit'),
  ('sysadmin','staff.view'),
  ('sysadmin','audit.view'),
  ('sysadmin','report.export'),
  ('sysadmin','feedback.view')
)
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id);

-- ---------- organisation ----------
INSERT INTO divisions (code,name,hq_station,sort_order) VALUES
  ('BB','Mumbai','CSMT',1),
  ('BSL','Bhusaval','Bhusaval',2),
  ('NGP','Nagpur','Nagpur',3),
  ('PA','Pune','Pune',4),
  ('SUR','Solapur','Solapur',5)
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO control_departments (code,name) VALUES
  ('ELECT','Electrical'),
  ('MECH','Mechanical'),
  ('SRDOM','Operating (Sr. DOM)')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ---------- Schedule-A designations ----------
INSERT INTO designations (code,name,skill_category,is_kitchen_role,requires_qualification,min_per_site,qualification_note,sort_order) VALUES
  ('manager','Manager','skilled',0,1,0,NULL,1),
  ('supervisor','Supervisor','skilled',0,1,3,NULL,2),
  ('head_cook','Head Cook','skilled',1,1,0,NULL,3),
  ('cook_veg','Cook (Veg)','semi_skilled',1,0,1,NULL,4),
  ('cook_nonveg','Cook (Non-Veg)','semi_skilled',1,0,0,NULL,5),
  ('asst_cook','Asstt. Cook','unskilled',1,0,1,NULL,6),
  ('table_boy','Table Boy/Bearer','unskilled',1,0,1,NULL,7),
  ('utensil_wash','Utensil Washing','unskilled',1,0,1,NULL,8),
  ('call_boy','Call Boy','unskilled',0,0,3,'Adequate knowledge of Hindi and Marathi',9),
  ('security','Security Guard','unskilled',0,0,0,NULL,10),
  ('gardner','Gardner','unskilled',0,0,0,NULL,11),
  ('sweeper','Sweeper','unskilled',0,0,1,NULL,12)
ON DUPLICATE KEY UPDATE name=VALUES(name), skill_category=VALUES(skill_category);

-- ---------- Schedule-A manpower matrix ----------
INSERT INTO manpower_norms (band_beds, designation_id, sanctioned_count, effective_from)
SELECT band_beds, designation_id, sanctioned_count, effective_from FROM (
  SELECT 50 AS band_beds, id AS designation_id, 0 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='manager'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='supervisor'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 0 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='head_cook'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_veg'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 0 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_nonveg'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='asst_cook'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='table_boy'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='utensil_wash'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='call_boy'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 0 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='security'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='gardner'
UNION ALL
  SELECT 50 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='sweeper'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='manager'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='supervisor'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='head_cook'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_veg'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 2 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_nonveg'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='asst_cook'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='table_boy'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='utensil_wash'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 6 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='call_boy'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='security'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='gardner'
UNION ALL
  SELECT 100 AS band_beds, id AS designation_id, 4 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='sweeper'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='manager'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='supervisor'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='head_cook'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 6 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_veg'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_nonveg'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='asst_cook'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='table_boy'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='utensil_wash'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 6 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='call_boy'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='security'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='gardner'
UNION ALL
  SELECT 150 AS band_beds, id AS designation_id, 4 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='sweeper'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='manager'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='supervisor'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='head_cook'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 6 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_veg'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_nonveg'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='asst_cook'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='table_boy'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='utensil_wash'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 6 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='call_boy'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='security'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='gardner'
UNION ALL
  SELECT 200 AS band_beds, id AS designation_id, 5 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='sweeper'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='manager'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='supervisor'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='head_cook'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 6 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_veg'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='cook_nonveg'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='asst_cook'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 12 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='table_boy'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='utensil_wash'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 9 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='call_boy'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 3 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='security'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 1 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='gardner'
UNION ALL
  SELECT 250 AS band_beds, id AS designation_id, 6 AS sanctioned_count, '2026-01-01' AS effective_from FROM designations WHERE code='sweeper'
) AS m
ON DUPLICATE KEY UPDATE sanctioned_count=VALUES(sanctioned_count);

-- NOTE: there is no menu or rate board here. Meal and subsidy accounting is
-- maintained in RRMS, the official Railway system, and the tender bills
-- Schedule B on RRMS records. RR-CMS records food QUALITY (occupant grading
-- and kitchen-hygiene deficiencies), not meal transactions.
