-- 036 — the raw-foodstuff quality register, and garden upkeep
--
-- Two named tender obligations that had nothing behind them: audit items P11
-- and P12.
--
-- ==========================================================================
-- P11 — THE RAW-FOODSTUFF QUALITY REGISTER
--
-- Schedule A, L.7, in the tender's own words:
--
--   "The quality of raw food stuff such as wheat flour, grains, pulses, eatable
--    oils etc shall be verified by obtaining the signature of available running
--    staff/Supervisors in the register after ascertaining quality /seal of the
--    eatables"
--
-- The kitchen page has carried an `approved_brands` tick since stage 6, and it
-- is not this. A tick says somebody believed the brands were right. The tender
-- asks for something quite different and much harder to wave away: the stuff
-- was looked at, the seal was examined, and THE CREW WHO WILL EAT IT SIGNED.
--
-- That is why this is three tables and not a column. The check is an event; the
-- items are what was examined at that event; the signatures are who stood there
-- and put their name to it. Flatten any of the three into the others and the
-- clause stops being provable.
--
-- ON THE SIGNATURE. What is recorded is the name, the designation and the time
-- — the same form the call book settled on at stage 20, where signature-on-glass
-- was designed for and deliberately left as a later option. A signature file may
-- be attached where a site has the means. What must NEVER happen is a register
-- that says a man signed when all that is known is that somebody ticked a box
-- on his behalf, so the signatory's name is required and stands on its own row.

CREATE TABLE foodstuff_checks (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  checked_on        DATE NOT NULL,
  checked_at        DATETIME NULL,
  -- Who conducted it for the Railway: the Health Inspector, the inspecting
  -- officer, or the running supervisor, all three of whom the tender names.
  conducted_by      VARCHAR(150) NULL,
  remarks           VARCHAR(300) NULL,
  recorded_by       BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_fsc_rr_date (running_room_id, checked_on),
  CONSTRAINT fk_fsc_rr   FOREIGN KEY (running_room_id) REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_fsc_user FOREIGN KEY (recorded_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE foodstuff_check_items (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  check_id          INT UNSIGNED NOT NULL,
  item              VARCHAR(160) NOT NULL,
  brand             VARCHAR(120) NULL,
  -- "after ascertaining quality /seal of the eatables". Two different things,
  -- so two columns: a sealed pack from an approved brand can still be past its
  -- date, and an opened one can be perfectly good.
  seal_intact       TINYINT(1) NULL,
  -- "Edible oils and spices used shall contain FSSAI Mark. Salt used shall be
  -- of iodized salt."
  fssai_mark        TINYINT(1) NULL,
  quality           ENUM('good','poor') NOT NULL,
  remarks           VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_fsci_check (check_id),
  CONSTRAINT fk_fsci_check FOREIGN KEY (check_id) REFERENCES foodstuff_checks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE foodstuff_check_signatures (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  check_id          INT UNSIGNED NOT NULL,
  -- Resolved to the crew record where the man is known to the division's staff
  -- master, so one man is one record across the call book, the meals register
  -- and this. Left null where a name was written and could not be resolved --
  -- and the register says as much rather than pretending.
  crew_id           INT UNSIGNED NULL,
  signatory_name    VARCHAR(150) NOT NULL,
  designation       VARCHAR(80)  NULL,
  signed_at         DATETIME NOT NULL,
  signature_file_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_fscs_check (check_id),
  CONSTRAINT fk_fscs_check FOREIGN KEY (check_id)          REFERENCES foodstuff_checks (id) ON DELETE CASCADE,
  CONSTRAINT fk_fscs_crew  FOREIGN KEY (crew_id)           REFERENCES crew (id)  ON DELETE SET NULL,
  CONSTRAINT fk_fscs_file  FOREIGN KEY (signature_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- P12 — UPKEEP AND MAINTENANCE OF GARDEN
--
-- The tender gives this its own heading and its own penalty: "Non maintenance
-- of open area and garden/lawn of the Running Room at desired level and as per
-- directions of Railways will attract penalty as per the penalty clause."
--
-- Four obligations, of which one is countable and dated and therefore worth
-- holding as more than a tick:
--
--   "To improve the scenario of the garden, contractor will provide 10 Nos.
--    plants in GAMLAS / Flower pots. (Pots will be made by Cement or Fiber with
--    minimum 18" dimension) IN EVERY SIX MONTH INTERVAL"
--
-- Ten plants, every six months, in pots of a stated material and size. That is
-- a supply with a due date, and the register carries the count so a shortfall
-- is arithmetic rather than opinion. The rest -- watering, trimming, fencing,
-- fertiliser and pesticide, lawn cutting -- are recurring work, recorded as
-- what was done on a date.
CREATE TABLE garden_upkeep (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  running_room_id   SMALLINT UNSIGNED NOT NULL,
  work_date         DATE NOT NULL,
  work_type         ENUM('lawn_cutting','trimming','watering','fertiliser','pesticide',
                         'fencing','gamla_supply','other') NOT NULL,
  -- Only meaningful for gamla_supply: how many pots of plants were delivered
  -- against the ten the tender requires each half year.
  plants_supplied   SMALLINT UNSIGNED NULL,
  pot_material      ENUM('cement','fibre','other') NULL,
  pot_size_inches   TINYINT UNSIGNED NULL,
  organic           TINYINT(1) NULL COMMENT 'the tender prefers organic fertiliser',
  detail            VARCHAR(300) NULL,
  done_by_staff_id  INT UNSIGNED NULL,
  recorded_by       BIGINT UNSIGNED NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_garden_rr_date (running_room_id, work_date),
  CONSTRAINT fk_gu_rr    FOREIGN KEY (running_room_id)  REFERENCES running_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_gu_staff FOREIGN KEY (done_by_staff_id) REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT fk_gu_user  FOREIGN KEY (recorded_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions are declared in db/seeds/01_reference.sql, never here. See the
-- note at the foot of migration 033 for what happens otherwise.
