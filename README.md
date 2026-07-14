# BV Boekhouding

Zelfgebouwde, dubbelboekhoudkundige webapp voor een Nederlandse BV. Boekt inkoop- en
verkoopfacturen, leest PDF-facturen automatisch uit via de Anthropic API, genereert per
kwartaal een BTW-aangifte en toont jaarlijks een balans en winst- & verliesrekening.

## Stack

Zelfde opzet als Tournada/Commentada — draait op standaard cPanel-hosting:

- **Backend:** PHP (PDO) — één `api.php` + `includes/`
- **Database:** MySQL (utf8mb4, InnoDB)
- **Frontend:** vanilla JS + HTML + CSS (`index.html`, `assets/`) — géén build
- **AI:** Anthropic Messages API via cURL (`includes/ai.php`), model `claude-haiku-4-5-20251001`
- **Auth:** single-user, PHP-sessie met wachtwoord uit `config.php`
- **Deploy:** cPanel Git Version Control → `.cpanel.yml` kopieert naar `~/public_html`

## Bestanden

```
boekhouding/
├── index.html              # de app (frontend shell)
├── api.php                 # JSON-API (dispatch op ?actie=)
├── config_example.php      # template → kopieer naar config.php (server-only)
├── includes/
│   ├── auth.php            # sessie-login
│   ├── ai.php              # PDF-factuur uitlezen via Anthropic (cURL)
│   └── boekhouding.php     # saldi, balans, W&V, BTW
├── assets/
│   ├── app.js              # frontend-logica
│   ├── app.css             # donker thema
│   └── favicon.svg
├── boekhouding_schema.sql  # MySQL-schema (importeer via phpMyAdmin)
├── .htaccess
└── .cpanel.yml             # deploy naar public_html
```

## Live zetten

Zie **[DEPLOY.md](./DEPLOY.md)** voor de stap-voor-stap cPanel-handleiding. Kort:

1. Maak in cPanel een **MySQL-database + gebruiker** en importeer `boekhouding_schema.sql` (phpMyAdmin).
2. Kopieer `config_example.php` → **`config.php`** in `public_html` en vul DB-gegevens,
   `ADMIN_WACHTWOORD` en `ANTHROPIC_API_KEY` in.
3. **Git Version Control** → clone `github.com/Sportrs/boekhouding` → **Deploy HEAD Commit**.
4. Open het (sub)domein en log in.

Updates: `git push` → in cPanel *Update from Remote* + *Deploy HEAD Commit*.

## Boekhoudlogica

- Elke transactie: journaalregels waarbij **totaal debet = totaal credit**.
- **Inkoop:** DR kostenrekening (excl.) · DR 1810 BTW te vorderen · CR bank (incl.)
- **Verkoop:** DR bank (incl.) · CR omzetrekening (excl.) · CR 1910 BTW te betalen
- Saldi (natural balance): actief/kosten `opening + Σdebet − Σcredit`; passief/opbrengsten `opening + Σcredit − Σdebet`.
- BTW-aangifte per kwartaal (1a/1b + voorbelasting 5b); balans en W&V per boekjaar.

Systeemrekeningen `1810`/`1910` worden automatisch geborgd en zijn niet verwijderbaar.
