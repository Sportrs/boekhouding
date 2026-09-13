-- ---------------------------------------------------------------------
-- 012 — Afschriftsaldi bewaren bij de bankimport
--
-- Een MT940-bestand draagt zijn eigen begin- en eindsaldo (:60F: / :62F:).
-- Die gooide de import weg, waardoor er geen harde controle bestond op de
-- vraag "kent mijn grootboek alles wat er over de rekening ging?". Nu wel:
-- het eindsaldo van het laatste afschrift moet gelijk zijn aan het saldo van
-- je bankrekeningen op die datum.
--
-- Een ING-CSV bevat geen saldi; zo'n import laat hier gewoon niets achter.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_afschriften (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  iban            VARCHAR(40)   NULL,
  van             DATE          NULL,          -- eerste regel in het bestand
  tot             DATE          NULL,          -- laatste regel in het bestand
  beginsaldo      DECIMAL(12,2) NULL,
  eindsaldo       DECIMAL(12,2) NULL,
  formaat         VARCHAR(20)   NOT NULL,
  geimporteerd_op DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_afschrift (iban, van, tot),
  KEY idx_afschrift_tot (tot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
