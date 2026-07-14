-- =====================================================================
--  BV BOEKHOUDING — MySQL schema
--  Stack: PHP REST API op cPanel + MySQL, vanilla-JS frontend.
--  A2/LiteSpeed: geen ENUM (VARCHAR + app-validatie), utf8mb4_unicode_ci,
--  InnoDB + FK's, bedragen als DECIMAL(12,2).
--  Importeer via phpMyAdmin (cPanel) in je database.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Grootboekrekeningen
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rekeningen (
  id            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  nummer        VARCHAR(20)    NOT NULL,
  naam          VARCHAR(160)   NOT NULL,
  type          VARCHAR(20)    NOT NULL,                 -- actief|passief|kosten|opbrengsten
  systeem       TINYINT(1)     NOT NULL DEFAULT 0,       -- 1 = niet verwijderbaar (BTW)
  is_bank       TINYINT(1)     NOT NULL DEFAULT 0,       -- 1 = bank-/kasrekening (liquide middelen)
  opening_saldo DECIMAL(12,2)  NOT NULL DEFAULT 0.00,    -- natural balance
  PRIMARY KEY (id),
  UNIQUE KEY uq_rek_nummer (nummer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Transacties (journaalposten)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacties (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  datum          DATE          NOT NULL,
  omschrijving   VARCHAR(255)  NOT NULL,
  factuur_nummer VARCHAR(80)   NULL,
  btw_grondslag  DECIMAL(12,2) NULL,
  btw_bedrag     DECIMAL(12,2) NULL,
  btw_code       VARCHAR(5)    NULL,                     -- 21|9|0
  btw_richting   VARCHAR(12)   NULL,                     -- vordering|afdracht
  aangemaakt_op  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tx_datum (datum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Journaalregels (debet/credit per rekening)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactie_regels (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  transactie_id INT UNSIGNED  NOT NULL,
  rekening      VARCHAR(20)   NOT NULL,
  debet         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  credit        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  KEY idx_regel_tx (transactie_id),
  KEY idx_regel_rek (rekening),
  CONSTRAINT fk_regel_tx FOREIGN KEY (transactie_id)
    REFERENCES transacties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Instellingen (key-value)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS instellingen (
  sleutel VARCHAR(60) NOT NULL,
  waarde  TEXT        NOT NULL,
  PRIMARY KEY (sleutel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Vergelijkende jaarcijfers (uit geïmporteerde jaarrekeningen)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Toelichtingen: verloopschema's per post + deelnemingen (met status)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS toelichtingen (
  id             INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  jaar           SMALLINT UNSIGNED  NOT NULL,
  soort          VARCHAR(20)        NOT NULL,   -- verloop | deelneming
  rekeningnummer VARCHAR(20)        NULL,
  post           VARCHAR(200)       NOT NULL,
  label          VARCHAR(160)       NOT NULL,
  bedrag         DECIMAL(14,2)      NULL,
  tekst          VARCHAR(255)       NULL,
  volgorde       INT                NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_toel (soort, post, jaar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Leveranciers + bankimport (MT940) + afletteren
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leveranciers (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  naam               VARCHAR(160)  NOT NULL,
  zoekterm           VARCHAR(160)  NULL,
  land               VARCHAR(60)   NULL,
  btw_regime         VARCHAR(20)   NOT NULL DEFAULT '21',
  standaard_rekening VARCHAR(20)   NULL,
  iban               VARCHAR(40)   NULL,
  aangemaakt_op      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lev_naam (naam)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS banktransacties (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  datum              DATE          NOT NULL,
  bedrag             DECIMAL(12,2) NOT NULL,
  afbij              VARCHAR(3)    NOT NULL,
  tegenrekening_iban VARCHAR(40)   NULL,
  tegenrekening_naam VARCHAR(160)  NULL,
  omschrijving       VARCHAR(500)  NULL,
  code               VARCHAR(6)    NULL,
  ruw                TEXT          NULL,
  hash               CHAR(40)      NOT NULL,
  status             VARCHAR(20)   NOT NULL DEFAULT 'open',
  transactie_id      INT UNSIGNED  NULL,
  leverancier_id     INT UNSIGNED  NULL,
  aangemaakt_op      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bank_hash (hash),
  KEY idx_bank_status (status),
  KEY idx_bank_datum (datum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Systeemrekeningen (BTW) — worden ook door de app geborgd
-- ---------------------------------------------------------------------
INSERT IGNORE INTO rekeningen (nummer, naam, type, systeem, opening_saldo) VALUES
  ('1810', 'BTW te vorderen', 'actief',  1, 0.00),
  ('1910', 'BTW te betalen',  'passief', 1, 0.00);

SET FOREIGN_KEY_CHECKS = 1;
