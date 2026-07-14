import { Router } from 'express';
import { prisma } from '../db.js';
import { getBoekjaar } from './settings.js';
import {
  berekenBalans,
  berekenWenV,
  berekenBtwAangifte,
  kwartaalGrenzen,
  saldiPerRekening,
  round2,
  type Account,
  type Transactie,
} from '../lib/accounting.js';

export const reportsRouter = Router();

async function laadData(): Promise<{ accounts: Account[]; transacties: Transactie[] }> {
  const [accounts, transacties] = await Promise.all([
    prisma.account.findMany({ orderBy: { nummer: 'asc' } }),
    prisma.transaction.findMany({ include: { regels: true } }),
  ]);
  return { accounts, transacties: transacties as unknown as Transactie[] };
}

// Balans per datum.
reportsRouter.get('/balans', async (req, res) => {
  const boekjaar = await getBoekjaar();
  const boekjaarStart = `${boekjaar}-01-01`;
  const date =
    typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : `${boekjaar}-12-31`;

  const { accounts, transacties } = await laadData();
  res.json(berekenBalans(accounts, transacties, date, boekjaarStart));
});

// Winst & verliesrekening.
reportsRouter.get('/wenV', async (req, res) => {
  const boekjaar = await getBoekjaar();
  const from =
    typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
      ? req.query.from
      : `${boekjaar}-01-01`;
  const to =
    typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
      ? req.query.to
      : `${boekjaar}-12-31`;

  const { accounts, transacties } = await laadData();
  res.json(berekenWenV(accounts, transacties, from, to));
});

// BTW-aangifte data.
reportsRouter.get('/btw', async (req, res) => {
  const boekjaar = await getBoekjaar();
  const quarter = Number(req.query.quarter);
  const year = Number(req.query.year) || Number(boekjaar);
  if (![1, 2, 3, 4].includes(quarter)) {
    return res.status(400).json({ error: 'quarter moet 1, 2, 3 of 4 zijn' });
  }

  const { transacties } = await laadData();
  res.json(berekenBtwAangifte(transacties, quarter, year));
});

// Dashboard-samenvatting.
reportsRouter.get('/dashboard', async (_req, res) => {
  const boekjaar = await getBoekjaar();
  const boekjaarStart = `${boekjaar}-01-01`;
  const boekjaarEind = `${boekjaar}-12-31`;
  const { accounts, transacties } = await laadData();

  const wenv = berekenWenV(accounts, transacties, boekjaarStart, boekjaarEind);

  // Banksaldo: som van saldi van actieve rekeningen waarvan de naam "bank" bevat,
  // of anders de eerste actieve rekening in de 1100-reeks.
  const saldi = saldiPerRekening(accounts, transacties, { to: boekjaarEind });
  const bankAccounts = accounts.filter(
    (a) => a.type === 'actief' && /bank/i.test(a.naam),
  );
  const banksaldo = round2(
    bankAccounts.reduce((s, a) => {
      const sr = saldi.find((x) => x.nummer === a.nummer);
      return s + (sr?.saldo ?? 0);
    }, 0),
  );

  // Huidig kwartaal (op basis van serverdatum, maar binnen het boekjaar).
  const nu = new Date();
  const kwartaal = Math.floor(nu.getMonth() / 3) + 1;
  const jaar = nu.getFullYear();
  const btw = berekenBtwAangifte(transacties, kwartaal, jaar);

  const recente = transacties
    .slice()
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0))
    .slice(0, 6);

  res.json({
    boekjaar,
    banksaldo,
    bankRekeningen: bankAccounts.map((a) => a.nummer),
    omzetBoekjaar: wenv.totaalOpbrengsten,
    kostenBoekjaar: wenv.totaalKosten,
    resultaatBoekjaar: wenv.resultaat,
    huidigKwartaal: { kwartaal, jaar, saldo: btw.saldo },
    recenteBoekingen: recente,
  });
});

// Handige helper voor de frontend: de kwartaalgrenzen (voor labels).
reportsRouter.get('/kwartaal', (req, res) => {
  const quarter = Number(req.query.quarter);
  const year = Number(req.query.year);
  if (![1, 2, 3, 4].includes(quarter) || !year) {
    return res.status(400).json({ error: 'quarter (1-4) en year vereist' });
  }
  res.json(kwartaalGrenzen(quarter, year));
});
