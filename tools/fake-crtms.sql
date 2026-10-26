-- fake-crtms.sql — FOR TESTING ONLY. Never run this on a Railway server.
--
-- Stands up a schema shaped exactly like the one RR-CMS will read on
-- crtms.in — the two views over div_staff_master — filled with obviously
-- invented people. It exists so the cross-schema lookup can be proved end to
-- end on a development machine without a copy of the division's real staff
-- master, which carries Aadhaar and PAN numbers and has no business being
-- copied anywhere.
--
-- Every name below is fictional and every CMS number is in a block that does
-- not exist. If one of these ever appears on a real screen, something has gone
-- badly wrong and you have found it.

DROP DATABASE IF EXISTS crtms_fake;
CREATE DATABASE crtms_fake CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE crtms_fake;

-- Same two views RR-CMS is granted on the real thing. Tables, not views, here:
-- what matters for the test is the shape and the name, not how they are built.
CREATE TABLE v_rr_crew_lookup (
  hrms_id          VARCHAR(10) NOT NULL,
  cms_id           VARCHAR(15) NULL,
  full_name        VARCHAR(100) NOT NULL,
  designation_code VARCHAR(10) NULL,
  designation_name VARCHAR(50) NULL,
  hq_station       VARCHAR(50) NULL,
  office_code      VARCHAR(15) NULL,
  PRIMARY KEY (hrms_id)
);

CREATE TABLE v_rr_crew_contact (
  hrms_id        VARCHAR(10) NOT NULL,
  contact_number VARCHAR(15) NULL,
  PRIMARY KEY (hrms_id)
);

INSERT INTO v_rr_crew_lookup VALUES
  ('TESTAA','TEST0001','ANANT DESHMUKH',   'LPG','Loco Pilot Goods',     'KYN-ML','KYN-ML'),
  ('TESTAB','TEST0002','BHASKAR RANE',     'ALP','Assistant Loco Pilot', 'KYN-ML','KYN-ML'),
  ('TESTAC','TEST0003','CHANDRAKANT MORE', 'LPS','Loco Pilot Shunting',  'PNVL-ML','PNVL-ML'),
  ('TESTAD','TEST0004','DEEPAK SAWANT',    'LPM','Loco Pilot Mail',      'IGP-ML','IGP-ML'),
  ('TESTAE','TEST0005','ANANT DESHPANDE',  'ALP','Assistant Loco Pilot', 'LNL-ML','LNL-ML');

CREATE TABLE v_rr_train_lookup (
  train_no     VARCHAR(10) NOT NULL,
  train_name   VARCHAR(120) NULL,
  train_type   VARCHAR(20) NULL,
  direction    VARCHAR(4) NULL,
  run_days     VARCHAR(20) NULL,
  from_station VARCHAR(10) NULL,
  to_station   VARCHAR(10) NULL,
  PRIMARY KEY (train_no)
);

INSERT INTO v_rr_train_lookup VALUES
  ('91001','Deccan Test Express','Express','UP','Daily','CSMT','PUNE'),
  ('91002','Deccan Test Express','Express','DN','Daily','PUNE','CSMT'),
  ('91011','Konkan Test Mail','Mail','UP','Daily','CSMT','ROHA'),
  ('91021','Ghat Test Passenger','Passenger','UP','XSUN','IGP','MMR');

INSERT INTO v_rr_crew_contact VALUES
  ('TESTAA','9000000001'), ('TESTAB','9000000002'), ('TESTAC','9000000003'),
  ('TESTAD','9000000004'), ('TESTAE','9000000005');
