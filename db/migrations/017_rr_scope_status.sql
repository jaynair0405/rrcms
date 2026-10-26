-- 017_rr_scope_status.sql
-- A running room can be absent from the working screens for a reason other
-- than being shut.
--
-- The register holds all 44 sites of Central Railway. The pilot runs at four.
-- The other forty are neither closed nor under renovation -- they are open and
-- working, and simply not on the system yet. Calling them 'closed' would be a
-- lie printed on a register that officers read, and deleting them would throw
-- away the one piece of real data keyed from the tender.
--
-- So the status gains a value that says what is actually true. Every working
-- screen already filters on status = 'operational', so a site marked
-- not_in_scope disappears from the staff register, the muster, inspections,
-- food safety, certification and the reports -- while remaining visible, and
-- correctly described, in the register itself.
--
-- Bringing a division onto the system later is one UPDATE, not a re-keying.

ALTER TABLE running_rooms
  MODIFY status ENUM('operational','closed','under_renovation','not_in_scope')
    NOT NULL DEFAULT 'operational'
    COMMENT 'not_in_scope = open and working, but not yet carried on this system';
