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

Maak in de **webroot** (`~/public_html`, of de docroot van je subdomein) het bestand
`config.php`. Het snelst: kopieer `config_example.php` (die wordt meegedeployed) en vul in.

cPanel → **File Manager** → in `public_html`:
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
- **Deploy HEAD Commit** (voert `.cpanel.yml` uit → kopieert naar `public_html`)

Open je (sub)domein → je ziet het inlogscherm. Log in met `ADMIN_WACHTWOORD`.

> **Subdomein?** Als de app op een subdomein draait, is de docroot niet
> `~/public_html` maar bijv. `~/boekhouding.jouwdomein.nl`. Pas dan de regel
> `export DOC=$HOME/public_html` in `.cpanel.yml` aan (en zet `config.php` in díe map).

---

## Updates live zetten

1. Lokaal: `git add -A && git commit -m "..." && git push`
2. cPanel → Git Version Control → **Update from Remote** → **Deploy HEAD Commit**

Klaar — `config.php` en je data blijven staan.

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
