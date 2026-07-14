import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db.js';

export interface FactuurData {
  leverancier: string;
  factuurNummer: string;
  factuurDatum: string; // YYYY-MM-DD
  omschrijving: string;
  bedragExBTW: number;
  btwBedrag: number;
  btwPercentage: number;
}

/**
 * Haal de Anthropic API-sleutel op. Voorkeur: env var, anders uit de settings-tabel.
 */
async function getApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const setting = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } });
  return setting?.value || null;
}

const PROMPT = `Lees deze factuur en retourneer ALLEEN een JSON-object (geen markdown):
{
  "leverancier": "naam leverancier",
  "factuurNummer": "factuurnummer",
  "factuurDatum": "YYYY-MM-DD",
  "omschrijving": "korte omschrijving van de dienst/het product",
  "bedragExBTW": 0.00,
  "btwBedrag": 0.00,
  "btwPercentage": 21
}
Als er geen BTW is, zet btwBedrag en btwPercentage op 0.`;

/**
 * Lees een base64-gecodeerde PDF-factuur uit via de Anthropic Messages API.
 */
export async function leesFactuur(base64Pdf: string): Promise<FactuurData> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Geen Anthropic API-sleutel ingesteld. Voeg deze toe bij Instellingen.');
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Pdf,
            },
          },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Geen tekstantwoord ontvangen van de AI.');
  }

  return parseFactuurJson(textBlock.text);
}

/** Parse het JSON-object uit de AI-respons, ook als er per ongeluk markdown omheen staat. */
function parseFactuurJson(text: string): FactuurData {
  let raw = text.trim();
  // Strip eventuele ```json ... ``` fences.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  // Val terug op het eerste { ... } blok.
  if (!raw.startsWith('{')) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Kon de factuurdata niet uitlezen (ongeldige AI-respons).');
  }

  const num = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number(v.replace(',', '.')) || 0;
    return 0;
  };
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');

  return {
    leverancier: str(parsed.leverancier),
    factuurNummer: str(parsed.factuurNummer),
    factuurDatum: str(parsed.factuurDatum),
    omschrijving: str(parsed.omschrijving),
    bedragExBTW: num(parsed.bedragExBTW),
    btwBedrag: num(parsed.btwBedrag),
    btwPercentage: num(parsed.btwPercentage),
  };
}
