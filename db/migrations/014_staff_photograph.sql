-- 014_staff_photograph.sql
-- A passport photograph is a document in its own right, separate from a photo
-- ID: it is what goes on the identity card the tender requires every deployed
-- worker to carry. The enum had no place for it.
--
-- Note on identity documents: this build records WHICH document was produced
-- (photo_id) and its reference, and can hold a scan. It does not carry a
-- dedicated Aadhaar field, and no decision has been taken on whether Aadhaar
-- may be stored at all — that is open with the officials. Nothing here has to
-- change if the answer is no.

ALTER TABLE staff_documents
  MODIFY COLUMN doc_type ENUM('photograph','photo_id','address_proof','police_verification',
                              'medical_fitness','qualification','bank_proof','epf_proof',
                              'esic_proof','other') NOT NULL;
