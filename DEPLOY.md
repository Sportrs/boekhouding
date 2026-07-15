# Deployen naar Hosting.com (cPanel) via Git

Zelfde flow als Sportrs / Tournada / Commentada: **PHP + MySQL**, gedeployed door
`.cpanel.yml` dat de bestanden naar `~/public_html` kopieert. Geen Node, geen build,
geen "Setup Node.js App".

> **Deed je al "Setup Node.js App" voor dit project?** Verwijder die Node-applicatie
> weer — die is voor deze PHP-versie niet nodig.

---

## Stap 1 — MySQL-database aanmaken

1. cPanel → **MySQL® Databases** (of **MySQL Database Wizard**).
2. Maak een database (bijv. `xxx_boekhouding`), een gebruiker en een sterk wachtwoord.
3. Koppel de gebruiker aan de database met **ALL PRIVILEGES**.
4. Noteer databasenaam, gebruikersnaam en wachtwoord — die komen in `config.php`.

## Stap 2 — Schema importeren

1. cPanel → **phpMyAdmin** → kies je nieuwe database links.
2. Tab **Import** → kies `boekhouding_schema.sql` uit deze repo → **Go**.
3. Je hebt nu de tabellen `rekeningen`, `transacties`, `transactie_regels`,
   `instellingen` + de twee BTW-systeemrekeningen.

## Stap 3 — Repo klonen (Git Version Control)

1. cPanel → **Git Version Control** → **Create** → *Clone a Repository*.
2. **Clone URL**:
   - Publiek: `https://github.com/Sportrs/boekhouding.git`
   - Privé: gebruik een token (`https://<TOKEN>@github.com/Sportrs/boekhouding.git`) of
     de cPanel-SSH-sleutel als deploy key.
3. Kies een **Repository Path** (bijv. `repositories/boekhouding`). Dit is de plek waar
   de code staat — **niet** de webroot; `.cpanel.yml` kopieert vandaaruit naar `public_html`.

## Stap 4 — `config.php` op de server

De app draait in de submap **`/boekhouding`** van je web-root, dus `config.php` hoort in
`~/public_html/boekhouding/`. Doe dit ná de eerste deploy (stap 5), want dan bestaat die
map. Het snelst: kopieer het meegedeployde `config_example.php` → `config.php` en vul in.

cPanel → **File Manager** → in `public_html/boekhouding`:
- kopieer `config_example.php` → `config.php` (of maak `config.php` met onderstaande inhoud), en zet erin:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'xxx_boekhouding');
define('DB_USER', 'xxx_boekh');
define('DB_PASS', 'jouw-db-wachtwoord');
define('ADMIN_WACHTWOORD', 'een-sterk-wachtwoord');
define('ANTHROPIC_API_KEY', 'sk-ant-...');   // of leeg + later via Instellingen
define('BOEKHOUDING_AI_MODEL', 'claude-haiku-4-5-20251001');
```

> `config.php` staat in `.gitignore` en wordt door deploys **nooit** overschreven.
> De rest van `config_example.php` (de `db()`/helper-functies) hoeft niet mee — die
> zitten al in het gekopieerde `config_example.php`; maak `config.php` gewoon als een
> volledige kopie en pas alleen de `define(...)`-regels bovenaan aan.

## Stap 5 — Deployen

cPanel → **Git Version Control** → bij de repo op **Manage** → tab **Pull or Deploy**:
- **Update from Remote** (haalt commits op)
- **Deploy HEAD Commit** (voert `.cpanel.yml` uit → kopieert naar `public_html/boekhouding/`)

Doe daarna stap 4 (`config.php` in `public_html/boekhouding/`) en open dan
**`https://jouwdomein.nl/boekhouding/`** (mét afsluitende slash). Log in met `ADMIN_WACHTWOORD`.

> **Andere web-root?** `.cpanel.yml` gaat uit van `$HOME/public_html`. Draait je domein
> op een addon-domein of subdomein met een eigen document-root (zie cPanel → **Domains**),
> pas dan `export DOCROOT=$HOME/public_html` in `.cpanel.yml` aan naar die map.

---

## Updates live zetten

1. Lokaal: `git add -A && git commit -m "..." && git push`
2. cPanel → Git Version Control → **Update from Remote** → **Deploy HEAD Commit**

Klaar — `config.php` en je data blijven staan.

### Database-migraties

Nieuwe features kunnen tabellen toevoegen. Draai bij zo'n update eenmalig het
bijbehorende script uit `migraties/` via **phpMyAdmin → Import** op je database.
Reeds gedraaide migraties zijn idempotent (`CREATE TABLE IF NOT EXISTS`), dus
opnieuw draaien kan geen kwaad.

- `migraties/001_jaarcijfers.sql` — tabel `jaarcijfers` (voor de jaarrekening-import).
- `migraties/002_toelichtingen.sql` — tabel `toelichtingen` (verloopschema's + deelnemingen).
- `migraties/003_bank_leveranciers.sql` — tabellen `leveranciers` + `banktransacties` (MT940-import & afletteren).
- `migraties/004_is_bank.sql` — kolom `is_bank` op rekeningen (markeert bank-/kasrekeningen).
- `migraties/005_deelnemingen.sql` — tabel `deelnemingen` (zelf bij te houden register; boekwaarde uit de gekoppelde grootboekrekening).
- `migraties/006_ib.sql` — tabel `ib_gegevens` (privé-inkomstenbelasting, invoer per jaar).
- `migraties/007_prive.sql` — tabellen `prive_rekeningen`, `prive_transacties`, `prive_categorieen`, `prive_regels`, `prive_posten` (privéboekhouding: bankimport, categorieën, vermogen, te ontvangen/betalen).
- `migraties/008_prive_aandeel.sql` — kolom `aandeel` op `prive_rekeningen` (voor gedeelde rekeningen, bv. 50%).
- `migraties/009_prive_neutraal.sql` — neutrale (overboekings)categorieën; deze tellen niet mee als inkomst/uitgave.
- `migraties/010_prive_koppel.sql` — kolom `koppel_id` op `prive_transacties` (overboekingen tussen eigen rekeningen: beide kanten gekoppeld).

---

## Problemen oplossen

| Symptoom | Oplossing |
|---|---|
| Wit scherm / 500 | Klopt `config.php` (DB-gegevens)? Bekijk `error_log` in de webroot. |
| "Serverfout" bij inloggen | DB-verbinding faalt of schema niet geïmporteerd (stap 2). |
| Inloggen weigert | `ADMIN_WACHTWOORD` in `config.php` moet gezet zijn (niet `CHANGE_ME`). |
| Factuur-uitlezen: "Geen API-sleutel" | Vul `ANTHROPIC_API_KEY` in `config.php` of via **Instellingen**. |
| PDF-upload faalt (413) | Grote PDF botst met `LimitRequestBody`/`post_max_size`. Verklein de PDF of verhoog de PHP-limiet. |
| Assets/API 404 | Draait de app in een submap i.p.v. (sub)domein-root? Gebruik een eigen docroot. |
