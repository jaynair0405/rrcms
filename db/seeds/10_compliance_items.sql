-- Schedule obligations that are neither daily records nor monthly returns: the
-- things the contractor must have in place and keep in place. Transcribed from
-- the tender, with the clause each answers where one exists.
--
-- Most carry NO clause. An unlit name board or a missing emergency-number board
-- is a thing to put right, not a penalty, and pretending otherwise would make
-- the compliance page read like an accusation sheet.
--
-- Quantities and hours are deliberately absent where the tender does not give
-- them. `due_basis = 'loa_plus_days'` counts from the Letter of Acceptance, so
-- a site with no LOA date on record has no due date rather than a made-up one.
INSERT INTO compliance_items
  (code, name, detail, clause_code, due_basis, due_days, recur_months, source_ref, sort_order)
VALUES
  ('PC_PRINTER','Computer and printer at the running room',
   'A PC unit with a printer so that records are computer-generated rather than handwritten.',
   'D3','loa_plus_days',30,NULL,'Schedule D / clause D3',10),

  ('BIOMETRIC','Biometric attendance system',
   'Installed and working, so attendance is machine-recorded. The tender allows one month from acceptance.',
   'D4','loa_plus_days',30,NULL,'Schedule D / clause D4',20),

  ('INDEMNITY_BOND','Indemnity bond executed',
   'Executed and lodged with the Railway.',
   NULL,'loa_plus_days',30,NULL,'General conditions',30),

  ('UNIFORM_SAMPLE','Uniform sample approved',
   'A sample set produced and approved by the Railway before issue to the staff.',
   NULL,'loa_plus_days',30,NULL,'General conditions',40),

  ('FIRE_EXT','Fire extinguishers refilled',
   'Refilled and in date. Where it is not done the Railway may have the work executed elsewhere and recover twice the expenditure.',
   'M12','recurring_months',NULL,12,'Schedule M / clause M12',50),

  ('EMERGENCY_NOS','Emergency numbers displayed at reception',
   'Fire, police, ambulance, the RR In-charge and the controller, legible at the reception counter.',
   NULL,'none',NULL,NULL,'General conditions',60),

  ('NO_PLASTIC','Single-use plastic not in use',
   'Prohibited throughout the running room, kitchen included.',
   NULL,'none',NULL,NULL,'General conditions',70),

  ('BED_PLATE','Bed indication plates and name board',
   'Every bed numbered and the running room name board in place.',
   NULL,'none',NULL,NULL,'General conditions',80),

  ('STAFF_TRAINING','Staff trained before deployment',
   'Training given before a man is put on duty, not after.',
   NULL,'none',NULL,NULL,'General conditions',90)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), detail = VALUES(detail), clause_code = VALUES(clause_code),
  due_basis = VALUES(due_basis), due_days = VALUES(due_days),
  recur_months = VALUES(recur_months), source_ref = VALUES(source_ref),
  sort_order = VALUES(sort_order);
