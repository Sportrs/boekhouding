-- =====================================================================
--  MIGRATIE 009 — Neutrale (overboekings)categorieën in de privéboekhouding
--  Sommige bij-/afschrijvingen zijn geen echt inkomen of uitgave, maar een
--  verschuiving van eigen vermogen: overboeking van spaarrekening, opname uit
--  een bouwdepot, RC-opname uit de BV, of een ontvangen/verstrekte lening.
--  Categorieën met soort 'neutraal' tellen NIET mee in inkomsten/uitgaven,
--  maar werken je banksaldo wel gewoon bij. Draai eenmalig via phpMyAdmin.
--  (De kolom `soort` is al VARCHAR, dus er is geen schemawijziging nodig.)
-- =====================================================================

INSERT IGNORE INTO prive_categorieen (naam, soort) VALUES
  ('Overboeking eigen rekening', 'neutraal'),
  ('Opname bouwdepot', 'neutraal'),
  ('Opname rekening-courant BV', 'neutraal'),
  ('Ontvangen / verstrekte lening', 'neutraal'),
  ('Sparen storten / opnemen', 'neutraal');
