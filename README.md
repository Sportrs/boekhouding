# BV Boekhouding

Zelfgebouwde, dubbelboekhoudkundige webapp voor een Nederlandse BV. Boekt inkoop- en
verkoopfacturen, leest PDF-facturen automatisch uit via de Anthropic API, genereert per
kwartaal een BTW-aangifte en toont jaarlijks een balans en winst- & verliesrekening.

## Stack

- **Backend:** Node.js + Express + TypeScript (via `tsx`)
- **Database:** SQLite via Prisma
- **Frontend:** React + Vite + Tailwind CSS v4
- **AI:** Anthropic Messages API (`claude-haiku-4-5-20251001`) voor PDF-uitlezen
- **Auth:** single-user, ondertekende sessiecookie (wachtwoord via `ADMIN_PASSWORD`)

## Aan de slag

```bash
# 1. Configuratie
cp .env.example .env      # vul ADMIN_PASSWORD, SESSION_SECRET en (optioneel) ANTHROPIC_API_KEY in

# 2. Dependencies + database
npm install               # draait automatisch `prisma generate`
npm run db:push           # maakt de SQLite-database en tabellen aan

# 3. Ontwikkelen (server op :3000, Vite op :5173)
npm run dev
```

Open daarna <http://localhost:5173> en log in met het wachtwoord uit `ADMIN_PASSWORD`.

De Anthropic API-sleutel kan via `.env` (`ANTHROPIC_API_KEY`) of via **Instellingen** in de app.

## Productie

```bash
npm run build             # bouwt frontend (dist/client) én server-bundle (dist/server/index.cjs)
NODE_ENV=production npm start   # draait app.cjs; Express serveert API + frontend op $PORT (of 3000)
```

Eén Node-proces serveert alles (API + statische frontend). `app.cjs` is het CommonJS-
startpunt (voor Phusion Passenger op cPanel). Zet in productie `NODE_ENV=production` en
een sterk `SESSION_SECRET`.

## Deployen naar Hosting.com (cPanel) via Git

Zie **[DEPLOY.md](./DEPLOY.md)** voor de volledige stap-voor-stap handleiding:
GitHub → cPanel *Git Version Control* → *Setup Node.js App* (Passenger draait `app.cjs`),
met een `.cpanel.yml` die bij elke deploy automatisch installeert, bouwt, het
databaseschema bijwerkt en de app herstart.

## Boekhoudlogica

- Elke transactie bestaat uit journaalregels waarbij **totaal debet = totaal credit**.
- **Inkoopfactuur:** DR kostenrekening (excl.) · DR 1810 BTW te vorderen · CR bank (incl.)
- **Verkoopfactuur:** DR bank (incl.) · CR omzetrekening (excl.) · CR 1910 BTW te betalen
- Saldi (natural balance):
  - actief/kosten: `openingSaldo + Σdebet − Σcredit`
  - passief/opbrengsten: `openingSaldo + Σcredit − Σdebet`
- BTW-aangifte per kwartaal (rubrieken 1a/1b + voorbelasting 5b).
- Balans en W&V per boekjaar; controle `Σ activa = Σ passiva + resultaat`.

De systeemrekeningen `1810 BTW te vorderen` en `1910 BTW te betalen` worden automatisch
aangemaakt en zijn niet verwijderbaar.

## Niet in scope

Multi-user, crediteurenadministratie/openstaande posten, bankimport (CAMT.053/MT940),
vennootschapsbelasting, officieel jaarverslag conform Boek 2 BW.
