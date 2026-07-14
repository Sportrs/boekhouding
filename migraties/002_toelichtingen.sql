-- =====================================================================
--  MIGRATIE 002 — Toelichtingen (verloopschema's + deelnemingen)
--  Voer eenmalig uit via phpMyAdmin. Slaat per post/jaar het verloop op
--  (Stand 1-1 + mutaties -> Stand 31-12) en de deelnemingen met status,
--  zoals in de toelichting van de jaarrekening.
-- =====================================================================

CREATE TABLE IF NOT EXISTS toelichtingen (
  id             INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  jaar           SMALLINT UNSIGNED  NOT NULL,
  soort          VARCHAR(20)        NOT NULL,   -- verloop | deelneming
  rekeningnummer VARCHAR(20)        NULL,
  post           VARCHAR(200)       NOT NULL,   -- postnaam (bv 'Inventaris', 'ClubCows B.V.')
  label          VARCHAR(160)       NOT NULL,   -- mutatielabel of 'aandeel'/'status'
  bedrag         DECIMAL(14,2)      NULL,       -- NULL voor tekstregels (status/aandeel)
  tekst          VARCHAR(255)       NULL,       -- vrije tekst (status, aandeel %)
  volgorde       INT                NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_toel (soort, post, jaar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
