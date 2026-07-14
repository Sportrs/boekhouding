import { Router } from 'express';
import { leesFactuur } from '../lib/anthropic.js';

export const invoiceRouter = Router();

// Ontvangt { pdf: "<base64>" } en retourneert geëxtraheerde factuurdata.
invoiceRouter.post('/read', async (req, res) => {
  const { pdf } = req.body ?? {};
  if (typeof pdf !== 'string' || pdf.length < 100) {
    return res.status(400).json({ error: 'Geen geldige PDF (base64) ontvangen' });
  }

  try {
    const data = await leesFactuur(pdf);
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout bij uitlezen';
    res.status(502).json({ error: message });
  }
});
