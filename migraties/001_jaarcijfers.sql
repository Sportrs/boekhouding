-- =====================================================================
--  MIGRATIE 001 — Fase 1: meerjarige basis
--  Voer eenmalig uit via phpMyAdmin op de bestaande database.
--  Voegt de tabel `jaarcijfers` toe (vergelijkende balans + W&V per jaar,
--  uit geïmporteerde jaarrekeningen). Beginbalansen gaan naar
--  rekeningen.opening_saldo (bestaande kolom) — geen wijziging nodig daar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS jaarcijfers (
  id             INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  jaar           SMALLINT UNSIGNED  NOT NULL,
  soort          VARCHAR(10)        NOT NULL,   -- balans | wenv
  sectie         VARCHAR(20)        NOT NULL,   -- activa | passiva | opbrengsten | kosten
  omschrijving   VARCHAR(200)       NOT NULL,
  rekeningnummer VARCHAR(20)        NULL,
  bedrag         DECIMAL(14,2)      NOT NULL DEFAULT 0.00,
  volgorde       INT                NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_jc_jaar (jaar, soort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
