-- 052 — what a building IS, as against what is in it
--
-- The Igatpuri inventory counts bathrooms, toilets and kitchens alongside water
-- coolers and fans, and the officer settled where each belongs:
--
--   "Bathrooms (16), Toilets (22) and the kitchen rooms — as building facts,
--    not assets."
--
-- He is right, and the reason is contractual rather than tidy-minded. The asset
-- register exists for General Instruction 1's joint accountal of Railway movable
-- items and fixed fittings, and clause A10 provides for RECOVERY when one goes
-- missing. A water cooler can go missing. A bathroom cannot. Putting rooms on
-- that register would mean a recovery clause pointing at masonry, and a count of
-- "assets" that no joint check could ever verify by looking.
--
-- So they are held here, on the building, where they describe the premises the
-- contractor is cleaning — which is also what the cleaning schedule is priced
-- against, and what the pest-control clause's 53,010 square feet covers.
--
-- ON KITCHENS. The sheet counts five and the officer says one cooks; the rest
-- serve or reheat. That is why `kitchens` counts rooms and `cooks_here` marks
-- the one that cooks: meals, the FSSAI licence and the raw-foodstuff register
-- stay at Igatpuri level because there is one kitchen in the sense that
-- matters, while the building still gets to say it has a kitchen room in it.
-- Recording five kitchens with no such distinction would have quietly argued
-- for five food licences.

ALTER TABLE running_room_blocks
  ADD COLUMN kitchens      SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER female_rooms,
  ADD COLUMN cooks_here    TINYINT(1) NOT NULL DEFAULT 0 AFTER kitchens,
  ADD COLUMN bathrooms     SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER cooks_here,
  ADD COLUMN toilets       SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER bathrooms,
  -- When these figures were last counted, and by what paper. A count with no
  -- date is not evidence of anything: the Igatpuri figures were taken sixteen
  -- months before the contract starts, and whoever reads them later has to be
  -- able to see that for himself.
  ADD COLUMN facts_as_on   DATE NULL AFTER toilets,
  ADD COLUMN facts_source  VARCHAR(160) NULL AFTER facts_as_on;
