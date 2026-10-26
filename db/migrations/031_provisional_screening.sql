-- 031 — provisional admission
--
-- THE PROBLEM THIS SOLVES
--
-- On the day RR-CMS is switched on at a running room, every man on the
-- contractor's roster is `pending`, because RR-CMS has never seen him. The
-- muster refuses to mark a pending man present — correctly, because the tender
-- does not permit an unscreened man to work — and so no muster can be filed at
-- all on day one, at any site.
--
-- But those men are working TODAY. The Railway has, in the real world, let them
-- in. `pending` here is an artefact of a three-day-old system, not a finding
-- that anybody is unscreened.
--
-- The two obvious answers are both wrong:
--
--   Bulk-approve them. The record would then say the Railway screened 63 men on
--   one afternoon. It did not. Screening is the control that keeps an
--   unverified man out of a running room, and a control that can be satisfied
--   by one click on go-live day is not a control.
--
--   Refuse everybody until the six documents arrive. Strictly right, and it
--   means the muster is not kept at all for the weeks that takes. A register
--   nobody keeps proves nothing, and the Railway loses the whole period.
--
-- So: a fourth status that says what is actually true.
--
--   provisional — admitted to work because he was already working when this
--                 system arrived. May be marked present. NOT screened, and
--                 flagged as not screened everywhere he appears, with a count
--                 of how many remain, until the Railway works through them.
--
-- Nothing is laundered. An inspector reading the register a year later sees
-- exactly which men were verified and which were let through on the strength of
-- already being there — which is the honest account of what happened.

ALTER TABLE staff
  MODIFY COLUMN screening_status
    ENUM('pending','provisional','approved','rejected','withdrawn')
    NOT NULL DEFAULT 'pending';

-- Why a man was admitted provisionally, and when. Kept separate from
-- `rejection_reason`, which belongs to a refusal.
ALTER TABLE staff
  ADD COLUMN provisional_note VARCHAR(300) NULL AFTER rejection_reason,
  ADD COLUMN provisional_on   DATE NULL AFTER provisional_note;

-- Admitting men provisionally is the Railway's act, not the contractor's — the
-- same hands that do the screening proper. No new permission: `staff.screen`
-- already means "decide whether this man may work here", and that is exactly
-- what this is.
