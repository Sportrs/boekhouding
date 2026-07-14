import { Router } from 'express';
import { prisma } from '../db.js';

export const accountsRouter = Router();

const GELDIGE_TYPES = ['actief', 'passief', 'kosten', 'opbrengsten'];

// Alle rekeningen, gesorteerd op nummer.
accountsRouter.get('/', async (_req, res) => {
  const accounts = await prisma.account.findMany({ orderBy: { nummer: 'asc' } });
  res.json(accounts);
});

// Nieuwe rekening aanmaken.
accountsRouter.post('/', async (req, res) => {
  const { nummer, naam, type, openingSaldo } = req.body ?? {};
  if (typeof nummer !== 'string' || !nummer.trim()) {
    return res.status(400).json({ error: 'Rekeningnummer is verplicht' });
  }
  if (typeof naam !== 'string' || !naam.trim()) {
    return res.status(400).json({ error: 'Naam is verplicht' });
  }
  if (!GELDIGE_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Ongeldig type' });
  }

  const bestaat = await prisma.account.findUnique({ where: { nummer: nummer.trim() } });
  if (bestaat) {
    return res.status(409).json({ error: 'Er bestaat al een rekening met dit nummer' });
  }

  const account = await prisma.account.create({
    data: {
      nummer: nummer.trim(),
      naam: naam.trim(),
      type,
      systeem: false,
      openingSaldo: Number(openingSaldo) || 0,
    },
  });
  res.status(201).json(account);
});

// Rekening bewerken (naam, type, openingSaldo).
accountsRouter.put('/:nummer', async (req, res) => {
  const { nummer } = req.params;
  const account = await prisma.account.findUnique({ where: { nummer } });
  if (!account) return res.status(404).json({ error: 'Rekening niet gevonden' });

  const { naam, type, openingSaldo } = req.body ?? {};
  const data: Record<string, unknown> = {};

  if (typeof naam === 'string' && naam.trim()) data.naam = naam.trim();
  if (type !== undefined) {
    if (!GELDIGE_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Ongeldig type' });
    }
    // Systeem-rekeningen mogen niet van type wijzigen.
    if (account.systeem && type !== account.type) {
      return res.status(400).json({ error: 'Type van een systeemrekening kan niet wijzigen' });
    }
    data.type = type;
  }
  if (openingSaldo !== undefined) data.openingSaldo = Number(openingSaldo) || 0;

  const updated = await prisma.account.update({ where: { nummer }, data });
  res.json(updated);
});

// Rekening verwijderen (niet toegestaan bij systeemrekening of als er boekingen op staan).
accountsRouter.delete('/:nummer', async (req, res) => {
  const { nummer } = req.params;
  const account = await prisma.account.findUnique({ where: { nummer } });
  if (!account) return res.status(404).json({ error: 'Rekening niet gevonden' });

  if (account.systeem) {
    return res.status(400).json({ error: 'Systeemrekeningen kunnen niet worden verwijderd' });
  }

  const inGebruik = await prisma.transactionRegel.count({ where: { rekening: nummer } });
  if (inGebruik > 0) {
    return res.status(400).json({
      error: `Rekening is in gebruik in ${inGebruik} boeking(en) en kan niet worden verwijderd`,
    });
  }

  await prisma.account.delete({ where: { nummer } });
  res.json({ ok: true });
});
