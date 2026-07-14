-- =====================================================================
--  MIGRATIE 004 — Bank-/kasrekening markeren
--  Markeer welke grootboekrekeningen liquide middelen (bank/kas) zijn,
--  zodat het banksaldo, de bankimport en "betaald via" die herkennen —
--  ook als de naam geen "bank" bevat (bv. "Liquide middelen (bunq)").
-- =====================================================================

ALTER TABLE rekeningen ADD COLUMN is_bank TINYINT(1) NOT NULL DEFAULT 0;

-- Bestaande liquide-middelen-rekeningen alvast markeren op naam.
UPDATE rekeningen SET is_bank = 1
 WHERE type = 'actief'
   AND (naam LIKE '%bank%' OR naam LIKE '%bunq%' OR naam LIKE '%ING%'
        OR naam LIKE '%liquide%' OR naam LIKE '%kas%' OR naam LIKE '%giro%');
