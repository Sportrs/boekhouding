-- =====================================================================
--  MIGRATIE 011 — Categorie "Inkomstenbelasting" (privé)
--  Voor voorlopige + definitieve aanslagen. Betalingen én teruggaven boek je
--  in deze uitgave-categorie; teruggaven worden automatisch verrekend met de
--  betaalde bedragen (je ziet netto wat je écht kwijt bent). Draai eenmalig.
-- =====================================================================

INSERT IGNORE INTO prive_categorieen (naam, soort) VALUES
  ('Inkomstenbelasting', 'uitgave');
