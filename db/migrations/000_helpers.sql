-- 000_helpers.sql
-- A plain numbers table. MySQL has no generate_series, and date spines --
-- finding the days a running room filed no joint checklist, for instance --
-- need one.
--
-- NOT NAMED seq_1_to_300. MariaDB ships a Sequence storage engine that
-- fabricates a virtual table of exactly that name in every database, so
-- CREATE TABLE seq_1_to_300 fails there with "table already exists" while
-- SHOW TABLES lists nothing -- on MySQL the same statement succeeds. Since
-- the Railway's server may be either, the helper carries a name neither
-- engine claims. Anything of the form seq_<from>_to_<to> is reserved.

CREATE TABLE number_series (
  n SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (n)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO number_series (n)
SELECT a.i + b.i*10 + c.i*100 + 1 AS n
FROM (SELECT 0 i UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
      UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a
CROSS JOIN (SELECT 0 i UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
      UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
CROSS JOIN (SELECT 0 i UNION SELECT 1 UNION SELECT 2) c
WHERE a.i + b.i*10 + c.i*100 + 1 <= 300;
