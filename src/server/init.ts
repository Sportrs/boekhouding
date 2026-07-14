import { prisma } from './db.js';

/**
 * Zorg dat de verplichte systeem-rekeningen bestaan bij het opstarten.
 * Deze zijn niet verwijderbaar (systeem = true).
 */
export async function ensureSystemAccounts() {
  const systeemRekeningen = [
    { nummer: '1810', naam: 'BTW te vorderen', type: 'actief', systeem: true },
    { nummer: '1910', naam: 'BTW te betalen', type: 'passief', systeem: true },
  ];

  for (const r of systeemRekeningen) {
    await prisma.account.upsert({
      where: { nummer: r.nummer },
      update: {}, // bestaande rekening niet overschrijven
      create: { ...r, openingSaldo: 0 },
    });
  }
}
