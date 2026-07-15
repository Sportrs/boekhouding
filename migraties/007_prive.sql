-- =====================================================================
--  MIGRATIE 007 — Privéboekhouding (los van de BV)
--  Persoonlijke rekeningen, bankimport, categorieën, en een register
--  van nog te ontvangen (vorderingen) / te betalen (schulden) bedragen.
--  Bedragen als DECIMAL(14,2); transactiebedrag is ONDERTEKEND
--  (+ = bij/inkomst, − = af/uitgave).
-- =====================================================================

CREATE TABLE IF NOT EXISTS prive_rekeningen (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  naam          VARCHAR(120) NOT NULL,
  soort         VARCHAR(20)  NOT NULL DEFAULT 'bank',   -- bank|spaar|contant|bezitting|overig
  iban          VARCHAR(40)  NULL,
  beginsaldo    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  aandeel       DECIMAL(5,2) NOT NULL DEFAULT 100.00,   -- jouw % (gedeelde rekening = bv. 50)
  volgorde      INT NOT NULL DEFAULT 0,
  aangemaakt_op DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prive_categorieen (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  naam  VARCHAR(80) NOT NULL,
  soort VARCHAR(10) NOT NULL DEFAULT 'uitgave',         -- inkomst|uitgave
  PRIMARY KEY (id),
  UNIQUE KEY uq_prive_cat (naam)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prive_transacties (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  rekening_id        INT UNSIGNED NOT NULL,
  datum              DATE NOT NULL,
  bedrag             DECIMAL(14,2) NOT NULL,            -- ondertekend: + bij, − af
  tegenrekening_iban VARCHAR(40)  NULL,
  tegenrekening_naam VARCHAR(180) NULL,
  omschrijving       VARCHAR(255) NULL,
  categorie_id       INT UNSIGNED NULL,
  hash               CHAR(40) NULL,
  ruw                TEXT NULL,
  aangemaakt_op      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prive_tx_hash (hash),
  KEY idx_prive_tx_rek (rekening_id),
  KEY idx_prive_tx_datum (datum),
  CONSTRAINT fk_prive_tx_rek FOREIGN KEY (rekening_id) REFERENCES prive_rekeningen(id) ON DELETE CASCADE,
  CONSTRAINT fk_prive_tx_cat FOREIGN KEY (categorie_id) REFERENCES prive_categorieen(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prive_regels (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  zoekterm     VARCHAR(120) NOT NULL,                   -- komt voor in naam/omschrijving
  categorie_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_prive_regel_cat FOREIGN KEY (categorie_id) REFERENCES prive_categorieen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prive_posten (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  naam          VARCHAR(160) NOT NULL,
  soort         VARCHAR(12) NOT NULL DEFAULT 'vordering', -- vordering (te ontvangen) | schuld (te betalen)
  bedrag        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tegenpartij   VARCHAR(160) NULL,
  datum         DATE NULL,
  vervaldatum   DATE NULL,
  status        VARCHAR(12) NOT NULL DEFAULT 'open',     -- open | afgehandeld
  toelichting   VARCHAR(255) NULL,
  aangemaakt_op DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Handige startcategorieën (mag je aanpassen/verwijderen)
INSERT IGNORE INTO prive_categorieen (naam, soort) VALUES
  ('Salaris / inkomen', 'inkomst'),
  ('Overige inkomsten', 'inkomst'),
  ('Boodschappen', 'uitgave'),
  ('Wonen / hypotheek / huur', 'uitgave'),
  ('Nutsvoorzieningen (gas/water/licht)', 'uitgave'),
  ('Verzekeringen', 'uitgave'),
  ('Vervoer / auto', 'uitgave'),
  ('Zorg', 'uitgave'),
  ('Abonnementen', 'uitgave'),
  ('Vrije tijd / uit eten', 'uitgave'),
  ('Sparen / beleggen', 'uitgave'),
  ('Belastingen', 'uitgave'),
  ('Overig', 'uitgave');
