-- 064 — the cleaning materials Annexure-A actually buys
--
-- WHY
--
-- `consumable_items` was built for a schedule that gave no numbers. The tender's
-- Schedule D says "Requirement should be calculated based on actual area, beds,
-- conditions of respective running room", so seed 09 deliberately loaded the
-- list WITHOUT quantities -- putting a figure on a supply schedule that no
-- document supported would have been an invention.
--
-- IGP's Annexure-A is that calculation, done and signed. It is a priced sheet:
-- 21 items, a quantity for the whole two years, a pack size, a rate, and for
-- every single line a rate reference -- a GeM product ID or a Railway purchase
-- order with its date. The columns below are the ones the sheet has and the
-- table did not.
--
-- WHY PACK SIZE IS A COLUMN AND NOT PART OF THE NAME
--
-- The sheet's own Unit column and its quantity column disagree on two lines.
-- Naphthalene balls: Unit reads KG, but 96 over two years against 20 kg a month
-- only works if 96 counts 5-kg PACKS. Hydrochloric acid: the item is named
-- "1 kg" and the pack column says 2 kg, and only 2 kg reconciles 360 units with
-- 30 kg a month. A quantity is meaningless until the pack it is counted in is
-- recorded beside it, so the pack is a column of its own and the check that the
-- three figures agree runs in the loader.
--
-- WHY THE RATE IS HERE WHEN NO CLAUSE FINES ON IT
--
-- Clause pb is a flat Rs 1000 per day for consumables not deposited in the
-- store in the first week of the month -- it does not price what was short. The
-- rate is carried because the sheet is what the money was sanctioned against
-- (Rs 25,31,088 for two years) and because a rate with no reference beside it is
-- a number nobody can defend at an audit. `rate_ref` is that reference, in the
-- sheet's own words.
--
-- WHY THE NOTE IS NOT PART OF source_ref
--
-- The first cut of this put the departure note on the end of `source_ref`, which
-- is VARCHAR(160). The provenance alone -- contract number, date, annexure,
-- e-office file -- runs to 93 characters, so every note was chopped mid-word and
-- the consumables page printed "only the 2 kg pack reconciles 360 with". A note
-- explaining a correction is worth having only if it can be read to the end, and
-- two different facts sharing one column is the fault this project keeps meeting
-- in other clothes. `contract_note` is that second fact, in a column of its own.

ALTER TABLE consumable_items
  ADD COLUMN pack_size    VARCHAR(40) NULL
    COMMENT 'the pack the item is bought in -- 25 kg, 500 ml, 1 set'
    AFTER unit,
  ADD COLUMN qty_contract DECIMAL(12,2) NULL
    COMMENT 'quantity for the whole contract period, in the unit named'
    AFTER qty_per_unit,
  ADD COLUMN rate         DECIMAL(10,2) NULL
    COMMENT 'sanctioned rate per unit'
    AFTER qty_contract,
  ADD COLUMN rate_ref     VARCHAR(200) NULL
    COMMENT 'where the rate comes from -- GeM product ID, or Railway P.O. and date'
    AFTER rate,
  ADD COLUMN contract_note VARCHAR(300) NULL
    COMMENT 'what the source document itself says, where this row departs from it'
    AFTER rate_ref;
