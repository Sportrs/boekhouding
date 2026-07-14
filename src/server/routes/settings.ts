import { Router } from 'express';
import { prisma } from '../db.js';

export const settingsRouter = Router();

async function getSetting(key: string, fallback = ''): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// Laad bedrijfsnaam en boekjaar.
settingsRouter.get('/', async (_req, res) => {
  const bedrijfsnaam = await getSetting('bedrijfsnaam', '');
  const boekjaar = await getSetting('boekjaar', String(new Date().getFullYear()));
  const envKey = !!process.env.ANTHROPIC_API_KEY;
  const dbKey = !!(await getSetting('anthropicApiKey', ''));
  res.json({
    bedrijfsnaam,
    boekjaar,
    apiKeyConfigured: envKey || dbKey,
    apiKeyFromEnv: envKey,
  });
});

// Sla bedrijfsnaam en boekjaar op.
settingsRouter.put('/', async (req, res) => {
  const { bedrijfsnaam, boekjaar } = req.body ?? {};
  if (typeof bedrijfsnaam === 'string') await setSetting('bedrijfsnaam', bedrijfsnaam);
  if (typeof boekjaar === 'string' && /^\d{4}$/.test(boekjaar)) {
    await setSetting('boekjaar', boekjaar);
  }
  res.json({ ok: true });
});

// Sla de Anthropic API-sleutel op (in de DB).
settingsRouter.put('/api-key', async (req, res) => {
  const { apiKey } = req.body ?? {};
  if (typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'apiKey ontbreekt' });
  }
  await setSetting('anthropicApiKey', apiKey.trim());
  res.json({ ok: true });
});

// Reset: verwijder alle transacties en niet-systeemrekeningen (gevaarlijke zone).
// Systeemrekeningen (BTW) en de opgeslagen API-sleutel blijven behouden.
settingsRouter.post('/reset', async (req, res) => {
  if (req.body?.bevestig !== 'RESET') {
    return res.status(400).json({ error: 'Bevestiging ontbreekt' });
  }
  await prisma.transactionRegel.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.account.deleteMany({ where: { systeem: false } });
  await prisma.setting.deleteMany({ where: { key: { in: ['bedrijfsnaam'] } } });
  res.json({ ok: true });
});

/** Helper voor andere routes: het geconfigureerde boekjaar (als jaartal-string). */
export async function getBoekjaar(): Promise<string> {
  return getSetting('boekjaar', String(new Date().getFullYear()));
}
