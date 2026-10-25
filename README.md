# BV Boekhouding

Zelfgebouwde, dubbelboekhoudkundige webapp voor een Nederlandse BV. Boekt inkoop- en
verkoopfacturen, leest PDF-facturen automatisch uit via de Anthropic API, genereert per
kwartaal een BTW-aangifte en toont jaarlijks een balans en winst- & verliesrekening.

## Stack

Draait lokaal op de Mac (sinds oktober 2026; daarvoor op cPanel-hosting):

- **Backend:** PHP (PDO) — één `api.php` + `includes/`
- **Database:** MariaDB/MySQL (utf8mb4, InnoDB), lokaal database `boekhouding`
- **Frontend:** vanilla JS + HTML + CSS (`index.html`, `assets/`) — géén build
- **AI:** Anthropic Messages API via cURL (`includes/ai.php`), model `claude-haiku-4-5-20251001`
- **Auth:** single-user, PHP-sessie met wachtwoord uit `config.php`
- **Starten:** `start.command` (backup naar Proton Drive + `php -S localhost:8000`)

## Bestanden

```
boekhouding/
├── index.html              # de app (frontend shell)
├── api.php                 # JSON-API (dispatch op ?actie=)
├── config_example.php      # template → kopieer naar config.php (niet in git)
├── includes/
│   ├── auth.php            # sessie-login
│   ├── ai.php              # PDF-factuur uitlezen via Anthropic (cURL)
│   └── boekhouding.php     # saldi, balans, W&V, BTW
├── assets/
│   ├── app.js              # frontend-logica
│   ├── app.css             # donker thema
│   └── favicon.svg
├── boekhouding_schema.sql  # schema voor een lege database
├── migraties/              # schemawijzigingen, één keer draaien
└── start.command           # backup + app starten
```

## Starten

Dubbelklik `start.command` in Finder (of `./start.command` in de terminal). Het script:

1. schrijft een export van de database naar Proton Drive → `Boekhouding/App-backups/`
   (de laatste 60 blijven staan);
2. start `php -S localhost:8000` en opent de browser.

Sluit het Terminal-venster om de app te stoppen. Mislukt de backup (draait MariaDB?
`brew services start mariadb`), dan wacht het script op Enter voordat de app start.

### Backup terugzetten

```
mysql -e "DROP DATABASE boekhouding; CREATE DATABASE boekhouding CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql boekhouding < ~/Library/CloudStorage/ProtonDrive-*-folder/Boekhouding/App-backups/boekhouding_<datum>.sql
```

### Opnieuw opzetten (nieuwe Mac)

1. `brew install php mariadb && brew services start mariadb`
2. Maak een database `boekhouding` + gebruiker en zet de nieuwste backup terug (zie hierboven).
3. Kopieer `config_example.php` → **`config.php`** en vul DB-gegevens,
   `ADMIN_WACHTWOORD` en `ANTHROPIC_API_KEY` in.
4. `./start.command`

## XAF-import (boekhouding van de accountant)

Op de **Import**-pagina kun je een **XAF-auditbestand** (XML Auditfile Financieel,
bv. uit Exact Online) uploaden. Dat vervangt de BV-administratie door het complete
rekeningschema, de beginbalans en alle journaalposten uit het bestand (standaard
t/m de dag vóór "jij boekt zelf vanaf"). Daarna kun je een jaarrekening-PDF met de
optie **"alleen vergelijkende cijfers"** importeren zonder de XAF-beginbalans te
overschrijven. De privéboekhouding heeft een eigen **"Schone lei"**-knop (tab
Privé → Rekeningen). Geen migratie nodig voor deze functies.

## Database-migraties

Nieuwe features kunnen tabellen toevoegen. Draai bij zo'n update eenmalig het
bijbehorende script uit `migraties/` op je database:
`mysql boekhouding < migraties/0xx_naam.sql`.
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
- `migraties/013_prive_declaraties.sql` — tabel `prive_declaraties` (privé → Declaraties: kilometers en onkosten die je bij je werkgever indient) + de instelling `km_vergoeding` (standaard € 0,23 per km).
- `migraties/012_bank_afschriften.sql` — tabel `bank_afschriften` (begin-/eindsaldo van een MT940-import; de Bank-pagina legt het eindsaldo naast je grootboek). Lees ná deze migratie je nieuwste `.sta` opnieuw in — dubbele regels worden overgeslagen, maar de saldi worden nu wél bewaard.
- `migraties/011_prive_ib_categorie.sql` — categorie "Inkomstenbelasting" (voorlopige + definitieve aanslag; teruggaven verrekenen met betalingen).

## Boekhoudlogica

- Elke transactie: journaalregels waarbij **totaal debet = totaal credit**.
- **Inkoop:** DR kostenrekening (excl.) · DR 1810 BTW te vorderen · CR bank (incl.)
- **Verkoop:** DR bank (incl.) · CR omzetrekening (excl.) · CR 1910 BTW te betalen
- Saldi (natural balance): actief/kosten `opening + Σdebet − Σcredit`; passief/opbrengsten `opening + Σcredit − Σdebet`.
- BTW-aangifte per kwartaal (1a/1b + voorbelasting 5b); balans en W&V per boekjaar.

Systeemrekeningen `1810`/`1910` worden automatisch geborgd en zijn niet verwijderbaar.

## Problemen oplossen

| Symptoom | Oplossing |
|---|---|
| Wit scherm / 500 | Klopt `config.php` (DB-gegevens)? Kijk in het Terminal-venster van `start.command`. |
| "Serverfout" bij inloggen | DB-verbinding faalt: draait MariaDB (`brew services list`)? |
| Inloggen weigert | `ADMIN_WACHTWOORD` in `config.php` moet gezet zijn (niet `CHANGE_ME`). |
| Factuur-uitlezen: "Geen API-sleutel" | Vul `ANTHROPIC_API_KEY` in `config.php` of via **Instellingen**. |
| PDF-upload faalt | Grote PDF botst met `post_max_size`/`upload_max_filesize` in `php.ini` (`php --ini`). |
