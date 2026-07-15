-- =====================================================================
--  MIGRATIE 006 — Inkomstenbelasting (privé, DGA)
--  Bewaart per jaar de ingevoerde IB-gegevens (JSON). De berekening zelf
--  gebeurt in de app; dit is puur opslag van je invoer + gekozen tarieven.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ib_gegevens (
  jaar        SMALLINT UNSIGNED NOT NULL,
  gegevens    LONGTEXT NOT NULL,          -- JSON met invoer + tarieven
  bijgewerkt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (jaar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
