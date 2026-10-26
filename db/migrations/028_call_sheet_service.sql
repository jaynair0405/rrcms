-- 028 — mail and goods are two different sheets
--
-- A goods running room has no business being shown the mail links. Its crews
-- are called for goods workings that are on no timetable at all, so a
-- pre-filled list of mail trains is not merely useless there — it is a screen
-- full of rows nobody will ever tick, which is how a register stops being read.
--
-- So the sheet carries a service, and the room remembers which one it opens on.
-- Both tabs exist everywhere: a goods room that has to call a mail crew one
-- day must still be able to record it. Hiding the tab would make the day
-- something unusual happens the day the register cannot hold it.

ALTER TABLE call_sheet_trains
  ADD COLUMN service ENUM('mail','goods') NOT NULL DEFAULT 'mail' AFTER direction;

ALTER TABLE call_book_calls
  ADD COLUMN service ENUM('mail','goods') NOT NULL DEFAULT 'mail' AFTER working_date;

-- Which tab this running room opens on. NULL means mail, which is the ordinary
-- case; a goods-only room is marked once and never has to click again.
ALTER TABLE running_rooms
  ADD COLUMN call_sheet_default ENUM('mail','goods') NULL AFTER has_meal_facility;

-- A goods sheet is not "a mail sheet with the trains removed". There is nothing
-- to pre-fill, by the nature of the working, so the rows are blank and the
-- bearer writes what the lobby gives him.
CREATE INDEX ix_cst_rr_service ON call_sheet_trains (running_room_id, service, sign_on_time);
CREATE INDEX ix_cbc_day_service ON call_book_calls (running_room_id, working_date, service);
