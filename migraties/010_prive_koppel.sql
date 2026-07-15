-- =====================================================================
--  MIGRATIE 010 — Overboekingen tussen eigen privérekeningen
--  Een overboeking (bv. maandelijks bedrag naar de gezamenlijke rekening, of
--  contant pinnen) heeft twee kanten: eraf op rekening A, erbij op rekening B.
--  `koppel_id` linkt de twee transactieregels aan elkaar. Draai eenmalig.
--  (Verse installaties hebben deze kolom al via 007.)
-- =====================================================================

ALTER TABLE prive_transacties
  ADD COLUMN IF NOT EXISTS koppel_id INT UNSIGNED NULL AFTER categorie_id;
