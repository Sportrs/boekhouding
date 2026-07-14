import { Router } from 'express';
import { prisma } from '../db.js';
import { round2 } from '../lib/accounting.js';

export const transactionsRouter = Router();

// Alle transacties, optioneel gefilterd op datum. Nieuwste eerst.
transactionsRouter.get('/', async (req, res) => {
  const { from, to } = req.query;
  const where: Record<string, unknown> = {};
  if (typeof from === 'string' || typeof to === 'string') {
    const datum: Record<string, string> = {};
    if (typeof from === 'string') datum.gte = from;
    if (typeof to === 'string') datum.lte = to;
    where.datum = datum;
  }
  const transacties = await prisma.transaction.findMany({
    where,
    include: { regels: true },
    orderBy: [{ datum: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(transacties);
});

interface BoekingPayload {
  datum: string;
  omschrijving: string;
  factuurNummer?: string;
  type: 'inkoop' | 'verkoop';
  bedragExBTW: number;
  btwPercentage: number; // 21 | 9 | 0
  grootboekrekening: string; // kosten- of omzetrekening
  betaalRekening: string; // typisch bank
}

// Nieuwe transactie boeken.
// Ondersteunt zowel een hoog-niveau boeking (inkoop/verkoop) als losse regels.
transactionsRouter.post('/', async (req, res) => {
  const body = req.body ?? {};

  // --- Modus 1: kant-en-klare journaalregels ---
  if (Array.isArray(body.regels)) {
    return boekRegels(req, res);
  }

  // --- Modus 2: hoog-niveau inkoop/verkoop boeking ---
  const p = body as BoekingPayload;
  if (!p.datum || !/^\d{4}-\d{2}-\d{2}$/.test(p.datum)) {
    return res.status(400).json({ error: 'Geldige datum (YYYY-MM-DD) is verplicht' });
  }
  if (!p.omschrijving?.trim()) {
    return res.status(400).json({ error: 'Omschrijving is verplicht' });
  }
  if (p.type !== 'inkoop' && p.type !== 'verkoop') {
    return res.status(400).json({ error: 'Type moet "inkoop" of "verkoop" zijn' });
  }
  const bedragExBTW = round2(Number(p.bedragExBTW));
  if (!(bedragExBTW > 0)) {
    return res.status(400).json({ error: 'Bedrag excl. BTW moet groter dan 0 zijn' });
  }
  const pct = Number(p.btwPercentage);
  if (![21, 9, 0].includes(pct)) {
    return res.status(400).json({ error: 'BTW-percentage moet 21, 9 of 0 zijn' });
  }
  if (!p.grootboekrekening || !p.betaalRekening) {
    return res.status(400).json({ error: 'Grootboekrekening en betaalrekening zijn verplicht' });
  }

  // Controleer of de rekeningen bestaan.
  const nummers = [p.grootboekrekening, p.betaalRekening];
  const gevonden = await prisma.account.findMany({ where: { nummer: { in: nummers } } });
  if (gevonden.length !== 2) {
    return res.status(400).json({ error: 'Onbekende grootboek- of betaalrekening' });
  }

  const btwBedrag = round2((bedragExBTW * pct) / 100);
  const totaal = round2(bedragExBTW + btwBedrag);
  const btwCode = String(pct);

  const regels: { rekening: string; debet: number; credit: number }[] = [];
  let btwRichting: 'vordering' | 'afdracht';

  if (p.type === 'inkoop') {
    // DR kosten (excl), DR 1810 BTW te vorderen, CR bank (totaal)
    regels.push({ rekening: p.grootboekrekening, debet: bedragExBTW, credit: 0 });
    if (btwBedrag > 0) regels.push({ rekening: '1810', debet: btwBedrag, credit: 0 });
    regels.push({ rekening: p.betaalRekening, debet: 0, credit: totaal });
    btwRichting = 'vordering';
  } else {
    // DR bank (totaal), CR omzet (excl), CR 1910 BTW te betalen
    regels.push({ rekening: p.betaalRekening, debet: totaal, credit: 0 });
    regels.push({ rekening: p.grootboekrekening, debet: 0, credit: bedragExBTW });
    if (btwBedrag > 0) regels.push({ rekening: '1910', debet: 0, credit: btwBedrag });
    btwRichting = 'afdracht';
  }

  const transactie = await prisma.transaction.create({
    data: {
      datum: p.datum,
      omschrijving: p.omschrijving.trim(),
      factuurNummer: p.factuurNummer?.trim() || null,
      btwGrondslag: bedragExBTW,
      btwBedrag,
      btwCode,
      btwRichting,
      regels: { create: regels },
    },
    include: { regels: true },
  });

  res.status(201).json(transactie);
});

// Boekt losse journaalregels (geavanceerde modus). Debet moet gelijk zijn aan credit.
async function boekRegels(req: import('express').Request, res: import('express').Response) {
  const { datum, omschrijving, factuurNummer, regels } = req.body ?? {};
  if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return res.status(400).json({ error: 'Geldige datum (YYYY-MM-DD) is verplicht' });
  }
  if (!omschrijving?.trim()) {
    return res.status(400).json({ error: 'Omschrijving is verplicht' });
  }
  if (!Array.isArray(regels) || regels.length < 2) {
    return res.status(400).json({ error: 'Minimaal 2 journaalregels vereist' });
  }

  const genormaliseerd = regels.map((r: any) => ({
    rekening: String(r.rekening),
    debet: round2(Number(r.debet) || 0),
    credit: round2(Number(r.credit) || 0),
  }));

  const totaalDebet = round2(genormaliseerd.reduce((s, r) => s + r.debet, 0));
  const totaalCredit = round2(genormaliseerd.reduce((s, r) => s + r.credit, 0));
  if (Math.abs(totaalDebet - totaalCredit) > 0.005) {
    return res.status(400).json({ error: 'Debet en credit zijn niet in balans' });
  }

  const transactie = await prisma.transaction.create({
    data: {
      datum,
      omschrijving: omschrijving.trim(),
      factuurNummer: factuurNummer?.trim() || null,
      regels: { create: genormaliseerd },
    },
    include: { regels: true },
  });
  res.status(201).json(transactie);
}

// Transactie verwijderen.
transactionsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const bestaat = await prisma.transaction.findUnique({ where: { id } });
  if (!bestaat) return res.status(404).json({ error: 'Transactie niet gevonden' });
  await prisma.transaction.delete({ where: { id } }); // regels cascaderen mee
  res.json({ ok: true });
});
