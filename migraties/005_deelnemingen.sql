-- =====================================================================
--  MIGRATIE 005 — Deelnemingenregister (zelf bij te houden)
--  Voer eenmalig uit via phpMyAdmin. De boekwaarde komt uit de gekoppelde
--  grootboekrekening; mutaties (investering/afwaardering) boek je als memoriaal.
-- =====================================================================

CREATE TABLE IF NOT EXISTS deelnemingen (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  naam           VARCHAR(160) NOT NULL,
  rekeningnummer VARCHAR(20)  NULL,          -- gekoppelde grootboekrekening (fin. vaste activa)
  aandeel        VARCHAR(20)  NULL,          -- percentage of tekst
  land           VARCHAR(60)  NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'actief',  -- actief|opgeheven|failliet|verkocht
  opgericht      SMALLINT     NULL,
  beeindigd      SMALLINT     NULL,
  toelichting    VARCHAR(255) NULL,
  aangemaakt_op  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_deeln_naam (naam)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
