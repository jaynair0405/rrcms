-- 047_asset_catalogue.sql
--
-- WHAT AN ASSET IS CALLED IS NOT A FREE-TEXT FIELD.
--
-- "What it is" was a plain text box. One In-charge types "Cot", another types
-- "Cott", a third types "Cots" -- and the register holds three different assets
-- that are the same thing. Every count over that register is then wrong, and
-- wrong quietly: a three-monthly joint check would report two cots short at a
-- room that has them all, and a shortfall against a contract line would be
-- argued from a spelling mistake.
--
-- A fixed dropdown was the obvious answer and the wrong one. A running room
-- acquires things nobody listed -- a second geyser, a water cooler replaced by a
-- different model -- and a list that cannot grow makes the man on the site
-- stuff a real asset into the nearest wrong name, which corrupts the count in
-- the other direction.
--
-- So: a CATALOGUE that grows. He picks from the list; if the thing is not on it
-- he types it once and it JOINS the list, so the second person to receive one
-- picks it rather than spelling it again. Names are matched case- and
-- space-insensitively before a new one is created, so "cot", "Cot " and "COT"
-- cannot become three entries.
CREATE TABLE asset_items (
  id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120) NOT NULL,
  -- The name reduced to letters and digits, lower case. This is what UNIQUE is
  -- built on: utf8mb4_unicode_ci already ignores case, but not the trailing
  -- space or the hyphen that makes "Water-cooler" a second water cooler.
  match_key     VARCHAR(120) NOT NULL,
  category      VARCHAR(80) NULL,
  source_ref    VARCHAR(160) NULL COMMENT 'where the name comes from, if a document names it',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_by    BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_item (match_key),
  CONSTRAINT fk_ai_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing rows keep their typed name; item_id is filled where it matches the
-- catalogue. The name column stays because it is what every screen already
-- prints, and because an asset should still read correctly if its catalogue
-- entry is ever renamed.
ALTER TABLE assets
  ADD COLUMN item_id SMALLINT UNSIGNED NULL AFTER name,
  ADD KEY ix_assets_item (item_id),
  ADD CONSTRAINT fk_assets_item FOREIGN KEY (item_id) REFERENCES asset_items (id);
