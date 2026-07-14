import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';

import { prisma } from './db.js';
import { ensureSystemAccounts } from './init.js';
import { requireAuth, login, logout, me } from './auth.js';
import { settingsRouter } from './routes/settings.js';
import { accountsRouter } from './routes/accounts.js';
import { transactionsRouter } from './routes/transactions.js';
import { invoiceRouter } from './routes/invoice.js';
import { reportsRouter } from './routes/reports.js';

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'onveilig-standaard-secret';

const app = express();
// Achter de Apache/Passenger-proxy op cPanel: vertrouw de proxy zodat
// req.secure klopt en de secure-cookie via HTTPS werkt.
app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser(SESSION_SECRET));

// --- Authenticatie (onbeveiligd) ---
app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', me);

// --- Beveiligde API ---
const api = express.Router();
api.use(requireAuth);
api.use('/settings', settingsRouter);
api.use('/accounts', accountsRouter);
api.use('/transactions', transactionsRouter);
api.use('/invoice', invoiceRouter);
api.use('/reports', reportsRouter);
app.use('/api', api);

// Onbekende API-route → 404 JSON.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Niet gevonden' }));

// --- Statische frontend (indien gebouwd: dist/client) ---
// Passenger (cPanel) en `npm run dev` draaien beide vanuit de app-root,
// dus dist/client staat relatief aan de working directory.
const clientDir = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use(express.static(clientDir));
  // SPA-fallback: alle niet-API-routes serveren index.html.
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

// --- Foutafhandeling (als laatste) ---
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Interne serverfout';
  res.status(500).json({ error: message });
});

async function start() {
  await ensureSystemAccounts();
  app.listen(PORT, () => {
    console.log(`Boekhouding-server draait op poort ${PORT}`);
  });
}

start().catch(async (err) => {
  console.error('Kon de server niet starten:', err);
  await prisma.$disconnect();
  process.exit(1);
});
