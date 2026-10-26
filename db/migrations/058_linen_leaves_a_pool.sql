-- 058 — linen that goes to the wash says where it came from
--
-- THE RULE THE WHOLE LINEN STORY RESTS ON, stated plainly at last: linen sits
-- in one of four places — fresh on the shelf, in use on the beds, at the wash,
-- written off — and EVERY MOVEMENT MUST SAY WHICH PLACE IT LEFT. A write-off
-- has said so since migration 050. A dispatch never has, and the shelf figure
-- has been changed by neither.
--
-- HOW IT SHOWED. The officer proposed his own test sequence and ran it:
--
--   Railway issues 600 · count 600 on the shelf · send 100 to the wash
--     → shelf still 600, wash 100, held 700 against 600 issued
--
-- The hundred were counted twice, on the shelf and at the wash at once. The
-- reconciliation caught it and said so — "100 more than issued, the room holds
-- more than the Railway's figure allows for" — which is the arithmetic working
-- and the model failing.
--
-- WHY IT WAS BUILT THAT WAY, AND WHY THAT WAS NOT ENOUGH. What goes to a
-- laundry is used linen stripped off beds; it was never on the fresh shelf, so
-- a dispatch rightly left the shelf figure alone. That holds for the ordinary
-- day — issue forty, strip forty, send forty — and it is why the sums have
-- closed in every test until this one. It stops holding the moment somebody
-- sends linen that was never issued: a bundle found soiled in the cupboard, a
-- fresh stack sent because the wash came early. Then the register counts it in
-- two places and calls the difference unaccounted.
--
-- The system could not tell the two apart because nobody had ever been asked.
-- Now the dispatch carries the answer, `used` by default because that is what
-- almost every dispatch is.

ALTER TABLE laundry_dispatch
  ADD COLUMN from_pool ENUM('used','shelf') NOT NULL DEFAULT 'used' AFTER item_type;

-- Every dispatch already on record is 'used', which the default gives. That is
-- not a guess dressed as a fact: until this column existed the screens could
-- only express a dispatch of used linen, so 'used' is what every one of them
-- meant.
