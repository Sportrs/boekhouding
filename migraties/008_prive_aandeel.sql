-- =====================================================================
--  MIGRATIE 008 — Aandeel op privérekeningen
--  Voor gedeelde rekeningen (bv. een gezamenlijke kinderrekening op 50%).
--  Het aandeel bepaalt hoeveel van het saldo/de mutaties als "van jou"
--  meetelt in je vermogen en uitgavenoverzicht. Draai eenmalig.
--  (Verse installaties hebben deze kolom al via 007.)
-- =====================================================================

ALTER TABLE prive_rekeningen
  ADD COLUMN IF NOT EXISTS aandeel DECIMAL(5,2) NOT NULL DEFAULT 100.00 AFTER beginsaldo;
