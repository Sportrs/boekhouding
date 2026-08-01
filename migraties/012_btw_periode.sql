-- =====================================================================
--  MIGRATIE 012 — BTW in een ander kwartaal meenemen
--
--  Een factuur die je te laat terugvindt (bv. een maartfactuur die je pas
--  in augustus boekt) hoort met zijn eigen factuurdatum in het journaal —
--  anders klopt je grootboek niet. Maar de aangifte over dat kwartaal is
--  dan allang gedaan, dus de BTW moet mee in een LATERE aangifte.
--
--  btw_periode is een datum in het kwartaal waarin de BTW moet meetellen.
--  Leeg (NULL) = gewoon het kwartaal van de boekingsdatum, zoals altijd.
--  De boeking zelf, het grootboek en de jaarrekening blijven op datum.
-- =====================================================================

ALTER TABLE transacties ADD COLUMN btw_periode DATE NULL AFTER datum;
