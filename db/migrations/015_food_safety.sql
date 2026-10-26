-- 015_food_safety.sql
-- FSSAI compliance for running rooms that serve food.
--
-- Modelled on the Form C Central Licence actually issued for the Bhusawal
-- running room (licence 10025901000005, M/S ISF SERVICES, DO Railways).
--
-- Three facts drive the shape of these tables:
--
--   1. THE LICENCE IS PER-PREMISES, NOT PER-CONTRACTOR. Bhusawal's licence
--      names the running room as the authorised premises and the contractor
--      only as the licensee. A contractor running six rooms holds six
--      licences, and when a contract changes hands the incoming firm must
--      obtain its own. So the licence hangs off running_room_id, with
--      contractor_id recorded as the holder of the day.
--
--   2. VALIDITY IS A RANGE WITH A RENEWAL WINDOW, NOT A FLAG. FSSAI allows a
--      renewal application from 180 days before expiry, and late renewal up
--      to 180 days after expiry against penalty. Both windows are computed
--      from valid_upto rather than stored, so they cannot drift.
--
--   3. THE CONDITIONS OF LICENCE CREATE RECURRING DUTIES. The annual return
--      (1 April to 31 March, due by 31 May) and the six-monthly laboratory
--      test are the two that lapse quietly and are asked for first at
--      inspection. They get their own table so a due date can be computed.
--
-- Only rooms with has_meal_facility = 1 are in scope. A rest-only room is not
-- a food business and must not appear in the compliance count.

CREATE TABLE food_licences (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  contractor_id       SMALLINT UNSIGNED NULL,
  licence_number      VARCHAR(20)  NOT NULL,
  licensee_name       VARCHAR(200) NOT NULL,
  premises_address    VARCHAR(400) NULL,
  kind_of_business    VARCHAR(120) NOT NULL DEFAULT 'Food Services - Restaurants',
  licence_category    VARCHAR(120) NOT NULL DEFAULT 'Central License - Indian Railways',
  issuing_authority   VARCHAR(120) NULL,
  issued_on           DATE NULL,
  valid_from          DATE NOT NULL,
  valid_upto          DATE NOT NULL,
  -- FoSCoS reports its own status; a suspended licence is still within its
  -- dates but the food business must stop, so this cannot be inferred.
  status              ENUM('issued','suspended','cancelled','surrendered','expired')
                        NOT NULL DEFAULT 'issued',
  -- Condition 4: at least one technical person supervising the production
  -- process, holding a qualifying degree or diploma. Recorded as free text
  -- because the person is often the contractor's, not on the Railway's roll.
  tech_person_name    VARCHAR(150) NULL,
  tech_person_qual    VARCHAR(150) NULL,
  tech_person_mobile  VARCHAR(15)  NULL,
  -- The Form IX person responsible for complying with the licence conditions.
  form_ix_name        VARCHAR(150) NULL,
  form_ix_mobile      VARCHAR(15)  NULL,
  certificate_file_id BIGINT UNSIGNED NULL,
  remarks             VARCHAR(500) NULL,
  -- 1 for the licence in force, NULL for every superseded one. NULL rather
  -- than 0 because MySQL lets NULL repeat inside a unique key, and a room
  -- accumulates any number of superseded licences over the years.
  is_current          TINYINT(1) NULL DEFAULT 1,
  recorded_by         BIGINT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One licence in force per room; the history behind it is unbounded.
  UNIQUE KEY uq_fl_current (running_room_id, is_current),
  KEY ix_fl_number (licence_number),
  KEY ix_fl_expiry (valid_upto),
  CONSTRAINT fk_fl_rr   FOREIGN KEY (running_room_id)     REFERENCES running_rooms (id),
  CONSTRAINT fk_fl_ct   FOREIGN KEY (contractor_id)       REFERENCES contractors (id),
  CONSTRAINT fk_fl_file FOREIGN KEY (certificate_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_fl_user FOREIGN KEY (recorded_by)         REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The recurring duties. period_label is what the officer recognises
-- ("2025-26", "Apr-Sep 2025"); due_on is what the dashboard sorts on.
CREATE TABLE food_licence_returns (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  licence_id          BIGINT UNSIGNED NULL,
  obligation          ENUM('annual_return','lab_test','medical_checkup','pest_control','water_test')
                        NOT NULL,
  period_label        VARCHAR(30)  NOT NULL,
  due_on              DATE NOT NULL,
  completed_on        DATE NULL,
  reference_no        VARCHAR(80)  NULL,
  -- For a lab test: the NABL-accredited or FSSAI-recognised laboratory.
  agency_name         VARCHAR(200) NULL,
  result_summary      VARCHAR(400) NULL,
  document_file_id    BIGINT UNSIGNED NULL,
  recorded_by         BIGINT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_flr (running_room_id, obligation, period_label),
  KEY ix_flr_due (due_on, completed_on),
  CONSTRAINT fk_flr_rr   FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id),
  CONSTRAINT fk_flr_lic  FOREIGN KEY (licence_id)       REFERENCES food_licences (id) ON DELETE SET NULL,
  CONSTRAINT fk_flr_file FOREIGN KEY (document_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_flr_user FOREIGN KEY (recorded_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The hygiene inspection checklist, kept separate from the contract
-- deficiency schedule in migration 010. The two answer different questions:
-- that one asks whether the contractor earned his money, this one asks
-- whether the kitchen would survive a visit from the Designated Officer.
CREATE TABLE food_check_items (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_code           VARCHAR(12)  NOT NULL,
  section             ENUM('licence','premises','equipment','personnel','storage',
                           'preparation','water','waste','records','display') NOT NULL,
  section_name        VARCHAR(80)  NOT NULL,
  description         VARCHAR(400) NOT NULL,
  -- Where the requirement comes from, so an argument at the site can be
  -- settled by pointing at the source rather than at the software.
  source_ref          VARCHAR(120) NULL,
  is_critical         TINYINT(1) NOT NULL DEFAULT 0,
  sort_order          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fci_code (item_code),
  KEY ix_fci_section (section, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE food_inspections (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id     SMALLINT UNSIGNED NOT NULL,
  licence_id          BIGINT UNSIGNED NULL,
  inspection_date     DATE NOT NULL,
  inspected_by        BIGINT UNSIGNED NULL,
  inspector_name      VARCHAR(150) NULL,
  contractor_rep_name VARCHAR(150) NULL,
  items_checked       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  items_failed        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  critical_failed     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- A single critical failure is enough to make the visit unsatisfactory,
  -- however well the rest scored. The route computes this, not the operator.
  result              ENUM('satisfactory','needs_improvement','unsatisfactory') NULL,
  remarks             TEXT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fi (running_room_id, inspection_date),
  KEY ix_fi_date (inspection_date),
  CONSTRAINT fk_fi_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id),
  CONSTRAINT fk_fi_lic  FOREIGN KEY (licence_id)      REFERENCES food_licences (id) ON DELETE SET NULL,
  CONSTRAINT fk_fi_user FOREIGN KEY (inspected_by)    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE food_inspection_items (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_id       BIGINT UNSIGNED NOT NULL,
  item_id             SMALLINT UNSIGNED NOT NULL,
  status              ENUM('complied','not_complied','not_applicable') NOT NULL DEFAULT 'complied',
  observation         VARCHAR(500) NULL,
  evidence_file_id    BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fii (inspection_id, item_id),
  CONSTRAINT fk_fii_insp FOREIGN KEY (inspection_id)    REFERENCES food_inspections (id) ON DELETE CASCADE,
  CONSTRAINT fk_fii_item FOREIGN KEY (item_id)          REFERENCES food_check_items (id),
  CONSTRAINT fk_fii_file FOREIGN KEY (evidence_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions and role grants for this module live in
-- db/seeds/05_food_check_items.sql, alongside every other grant: on a fresh
-- install the migrations run before the roles exist, so a grant written here
-- would silently match no rows.
