-- =====================================================================
--  MIGRATIE 003 — Bankimport (MT940) + leveranciers + afletteren
--  Voer eenmalig uit via phpMyAdmin.
-- =====================================================================

CREATE TABLE IF NOT EXISTS leveranciers (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  naam               VARCHAR(160)  NOT NULL,
  zoekterm           VARCHAR(160)  NULL,        -- tekst om in de bank-naam/omschrijving te herkennen
  land               VARCHAR(60)   NULL,
  btw_regime         VARCHAR(20)   NOT NULL DEFAULT '21',  -- 21 | 9 | 0 | geen (buitenland, geen NL BTW)
  standaard_rekening VARCHAR(20)   NULL,        -- default kostenrekening
  iban               VARCHAR(40)   NULL,
  aangemaakt_op      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lev_naam (naam)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS banktransacties (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  datum              DATE          NOT NULL,
  bedrag             DECIMAL(12,2) NOT NULL,     -- altijd positief
  afbij              VARCHAR(3)    NOT NULL,     -- af | bij
  tegenrekening_iban VARCHAR(40)   NULL,
  tegenrekening_naam VARCHAR(160)  NULL,
  omschrijving       VARCHAR(500)  NULL,
  code               VARCHAR(6)    NULL,
  ruw                TEXT          NULL,
  hash               CHAR(40)      NOT NULL,     -- dedup bij her-import
  status             VARCHAR(20)   NOT NULL DEFAULT 'open',  -- open | gekoppeld | genegeerd
  transactie_id      INT UNSIGNED  NULL,         -- gekoppelde boeking
  leverancier_id     INT UNSIGNED  NULL,
  aangemaakt_op      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bank_hash (hash),
  KEY idx_bank_status (status),
  KEY idx_bank_datum (datum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
