# Deployen naar Hosting.com (cPanel) via Git

Deze app draait op cPanel als een **Node.js-applicatie** (Phusion Passenger). De
frontend wordt gebouwd tot statische bestanden die Express zelf serveert, en de
data staat in een SQLite-bestand op de server. Je zet updates live door naar
GitHub te pushen en in cPanel te deployen.

> **Overzicht:** GitHub (`Sportrs/boekhouding`) → cPanel *Git Version Control*
> (clone + deploy) → cPanel *Setup Node.js App* (Passenger draait `app.cjs`).

---

## Belangrijk vooraf

- **Gebruik een (sub)domein-root**, geen submap. Kies als *Application URL* bijv.
  `boekhouding.jouwdomein.nl` of de root van een domein. De app gebruikt absolute
  paden (`/assets`, `/api`), dus een submap (`jouwdomein.nl/boekhouding`) werkt niet
  zonder aanpassing.
- **Node-versie 18 of hoger** (Node.js Selector in cPanel).
- **HTTPS/AutoSSL** aanzetten voor het (sub)domein — de sessiecookie is `secure` in
  productie.

---

## Stap 1 — Code staat op GitHub

De repo is `https://github.com/Sportrs/boekhouding`. Toekomstige wijzigingen:

```bash
git add -A
git commit -m "wijziging"
git push
```

---

## Stap 2 — Repo klonen in cPanel (Git Version Control)

1. cPanel → **Git Version Control** → **Create**.
2. Zet **Clone a Repository** aan.
3. **Clone URL**:
   - Publieke repo: `https://github.com/Sportrs/boekhouding.git`
   - Privé repo: gebruik een GitHub *Personal Access Token* in de URL,
     `https://<TOKEN>@github.com/Sportrs/boekhouding.git`, of voeg de SSH-sleutel van
     cPanel (Terminal: `cat ~/.ssh/id_*.pub`) toe als *Deploy key* op GitHub en gebruik
     `git@github.com:Sportrs/boekhouding.git`.
4. **Repository Path**: `boekhouding` (wordt `/home/JOUWUSER/boekhouding`).
5. **Create**. De code staat nu in die map.

---

## Stap 3 — Node.js App aanmaken

1. cPanel → **Setup Node.js App** → **Create Application**.
2. **Node.js version**: 20 (of 18+).
3. **Application mode**: Production.
4. **Application root**: `boekhouding` (exact dezelfde map als de repo-clone).
5. **Application URL**: je (sub)domein.
6. **Application startup file**: `app.cjs`
7. **Create**. Noteer bovenaan het `source ...activate`-commando (dat heb je zo nodig).

> De mapnaam `boekhouding` is belangrijk: het automatische deploy-script zoekt de
> virtualenv onder `~/nodevenv/boekhouding/...`.

---

## Stap 4 — `.env` aanmaken op de server

Maak in de app-root (`/home/JOUWUSER/boekhouding`) een bestand **`.env`** aan
(File Manager → +File, of Terminal). Zowel de app als de Prisma-CLI lezen dit:

```
DATABASE_URL="file:./boekhouding.db"
ANTHROPIC_API_KEY="sk-ant-...jouw-sleutel..."
ADMIN_PASSWORD="een-sterk-wachtwoord"
SESSION_SECRET="een-lange-willekeurige-string"
NODE_ENV="production"
```

`PORT` niet zetten — die levert Passenger zelf.
De API-sleutel kun je ook later in de app onder **Instellingen** invullen.

---

## Stap 5 — Eerste build en start

Open cPanel → **Terminal** en voer uit (vervang de eerste regel door het
`source ...activate`-commando uit stap 3):

```bash
source ~/nodevenv/boekhouding/*/bin/activate
cd ~/boekhouding
npm install
npm run build
npx prisma db push          # maakt de database + tabellen aan
```

Ga daarna terug naar **Setup Node.js App** en klik **Restart**.

Open je (sub)domein → je ziet het inlogscherm. Log in met `ADMIN_PASSWORD`.

---

## Stap 6 — Updates live zetten (de git-workflow)

Vanaf nu is live zetten een paar klikken:

1. Lokaal: `git push` naar GitHub.
2. cPanel → **Git Version Control** → bij de repo op **Manage** → tab **Pull or Deploy**:
   - **Update from Remote** (haalt de nieuwe commits op).
   - **Deploy HEAD Commit** (voert `.cpanel.yml` uit).

`.cpanel.yml` doet automatisch: virtualenv activeren → `npm install` → `npm run build`
→ `prisma db push` → Passenger herstarten (`tmp/restart.txt`).

> **Werkt de automatische deploy niet** (bijv. de virtualenv wordt niet gevonden op
> jouw host)? Doe stap 5 dan handmatig in de Terminal en herstart de app. De git-pull
> haalt de code binnen; alleen de build/herstart draai je dan zelf.

---

## Gegevens & back-ups

- De database is één bestand: `~/boekhouding/prisma/boekhouding.db`.
- Het staat in `.gitignore`, dus een deploy overschrijft je data **niet**.
- Back-up = dit bestand kopiëren (File Manager of `cp`). Bewaar het buiten de repo.

---

## Problemen oplossen

| Symptoom | Oplossing |
|---|---|
| 503 / "Application failed to start" | Bekijk het log in *Setup Node.js App*. Meestal ontbreekt de build (`npm run build`) of is `app.cjs` niet als startup file gezet. |
| Inloggen lukt niet / cookie blijft niet | Zorg dat HTTPS aan staat en `NODE_ENV=production` in `.env`. |
| PDF-upload faalt met 413 | Grote PDF's kunnen tegen Apache's `LimitRequestBody` aanlopen. Verlaag de PDF-grootte of vraag je host de limiet te verhogen. |
| Facturen-uitlezen geeft foutmelding over API-sleutel | Vul `ANTHROPIC_API_KEY` in `.env` in (of via Instellingen) en herstart. |
| Assets laden niet (404 op /assets/...) | De app staat waarschijnlijk in een submap. Gebruik een (sub)domein-root. |
