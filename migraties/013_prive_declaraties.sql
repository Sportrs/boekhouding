-- ---------------------------------------------------------------------
-- 013 — Declaraties (privé): kilometers en onkosten die je bij je
-- werkgever indient, met hun status.
--
-- Het bedrag wordt opgeslagen, ook bij type "kilometers" waar het uit
-- km × tarief volgt. Verandert de vergoeding per kilometer later, dan
-- mogen oude declaraties niet meeveranderen — die zijn immers al
-- ingediend of uitbetaald. km_tarief bewaart het tarief van het moment,
-- zodat op de regel zelf te zien is hoe het bedrag is opgebouwd.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prive_declaraties (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  datum         DATE          NOT NULL,
  type          VARCHAR(20)   NOT NULL DEFAULT 'kilometers', -- kilometers | parkeren | overig
  omschrijving  VARCHAR(255)  NOT NULL,
  km            DECIMAL(10,1) NULL,                          -- alleen bij type kilometers
  km_tarief     DECIMAL(6,3)  NULL,                          -- vergoeding per km op het moment van boeken
  bedrag        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status        VARCHAR(14)   NOT NULL DEFAULT 'nieuw',       -- nieuw | gedeclareerd | betaald
  aangemaakt_op DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_decl_datum (datum),
  KEY idx_decl_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vergoeding per kilometer (€). Aanpasbaar op de Declaraties-pagina.
INSERT IGNORE INTO instellingen (sleutel, waarde) VALUES ('km_vergoeding', '0.23');
