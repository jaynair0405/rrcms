-- 024_bill_documents_eleven.sql
--
-- Payment Terms clause 5 lists ELEVEN documents without which a bill is not
-- passed. `bill_documents.doc_type` was written from memory of that list and
-- carried ten values, and the mapping was lossy in a way that mattered:
--
--   - item (2), "list of staff employed for the billing period, salary paid
--     through bank and bank details", had NO value at all;
--   - items (4) and (5) — the proof that EPF and ESI contributions were
--     submitted to the departments — were conflated with item (6), the
--     receipts and challans. They are different pieces of paper and an
--     accounts office asks for both.
--
-- A checklist that does not match the document the officer is holding is a
-- checklist he stops using. The enum is therefore rewritten to the tender's own
-- eleven, in the tender's own order, keeping the four values that already
-- matched.
--
-- No rows exist yet — the table has never had a route — so this is a rewrite
-- rather than a migration of data. Written as an explicit list so that the day
-- it is not empty, this file fails loudly instead of truncating silently.

ALTER TABLE bill_documents
  MODIFY doc_type ENUM(
    'work_certified',      -- (1)  work carried out, certified by consignee and contractor
    'staff_list_bank',     -- (2)  staff employed in the period, salary through bank, bank details
    'wages_proof',         -- (3)  salaries paid as per applicable minimum wages
    'epf_contribution',    -- (4)  EPF contribution submitted to the EPF department
    'esic_contribution',   -- (5)  ESI contribution paid to ESIC
    'epf_esic_challans',   -- (6)  receipts and challans of EPF and ESIC
    'bonus_proof',         -- (7)  bonus paid to labourers
    'attendance_sheet',    -- (8)  attendance sheet, jointly signed
    'gst_challan',         -- (9)  GST challan of the previous month
    'other_records',       -- (10) other necessary documents per the scope of work
    'shramik_kalyan'       -- (11) Shramik Kalyan Portal update proof, Annexure 'D'
  ) NOT NULL;
