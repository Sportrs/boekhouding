// Boekhoudlogica: saldiberekening, balans, winst & verlies en BTW-aangifte.
// Alle bedragen zijn in euro's (Float). Afronding op centen gebeurt in de helper.

export type AccountType = 'actief' | 'passief' | 'kosten' | 'opbrengsten';

export interface Account {
  nummer: string;
  naam: string;
  type: string; // AccountType
  systeem: boolean;
  openingSaldo: number;
}

export interface Regel {
  rekening: string;
  debet: number;
  credit: number;
}

export interface Transactie {
  id: string;
  datum: string; // YYYY-MM-DD
  omschrijving: string;
  factuurNummer?: string | null;
  btwGrondslag?: number | null;
  btwBedrag?: number | null;
  btwCode?: string | null; // "21" | "9" | "0"
  btwRichting?: string | null; // "vordering" | "afdracht"
  regels: Regel[];
}

/** Rond af op centen om Float-ruis te vermijden. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface Beweging {
  debet: number;
  credit: number;
}

/**
 * Tel debet/credit per rekeningnummer op uit de transacties,
 * optioneel gefilterd op datum (from t/m to, inclusief).
 */
function bewegingenPerRekening(
  transacties: Transactie[],
  opts: { from?: string; to?: string } = {},
): Map<string, Beweging> {
  const map = new Map<string, Beweging>();
  for (const t of transacties) {
    if (opts.from && t.datum < opts.from) continue;
    if (opts.to && t.datum > opts.to) continue;
    for (const r of t.regels) {
      const b = map.get(r.rekening) ?? { debet: 0, credit: 0 };
      b.debet += r.debet || 0;
      b.credit += r.credit || 0;
      map.set(r.rekening, b);
    }
  }
  return map;
}

/**
 * Saldo van één rekening op basis van type ("natural balance").
 * actief / kosten:      openingSaldo + Σdebet − Σcredit
 * passief / opbrengsten: openingSaldo + Σcredit − Σdebet
 */
export function saldoVoorRekening(
  account: Account,
  beweging: Beweging,
  metOpening = true,
): number {
  const opening = metOpening ? account.openingSaldo : 0;
  if (account.type === 'actief' || account.type === 'kosten') {
    return round2(opening + beweging.debet - beweging.credit);
  }
  // passief | opbrengsten
  return round2(opening + beweging.credit - beweging.debet);
}

export interface SaldoRegel {
  nummer: string;
  naam: string;
  type: string;
  saldo: number;
}

/** Saldo per rekening (alle types), t/m een datum. */
export function saldiPerRekening(
  accounts: Account[],
  transacties: Transactie[],
  opts: { from?: string; to?: string } = {},
): SaldoRegel[] {
  const beweging = bewegingenPerRekening(transacties, opts);
  return accounts.map((a) => ({
    nummer: a.nummer,
    naam: a.naam,
    type: a.type,
    saldo: saldoVoorRekening(a, beweging.get(a.nummer) ?? { debet: 0, credit: 0 }),
  }));
}

// ---------------------------------------------------------------------------
// Balans
// ---------------------------------------------------------------------------

export interface BalansPost {
  nummer: string;
  naam: string;
  saldo: number;
}

export interface Balans {
  datum: string;
  activa: BalansPost[];
  passiva: BalansPost[];
  resultaatBoekjaar: number;
  totaalActiva: number;
  totaalPassiva: number; // incl. resultaat
  inBalans: boolean;
}

/**
 * Balans per datum. Activa en passiva op basis van openingSaldo + bewegingen
 * t/m die datum. Resultaat boekjaar (opbrengsten − kosten binnen het boekjaar)
 * wordt aan de passiefkant getoond.
 */
export function berekenBalans(
  accounts: Account[],
  transacties: Transactie[],
  datum: string,
  boekjaarStart: string,
): Balans {
  const bewegingTotaal = bewegingenPerRekening(transacties, { to: datum });
  const bewegingBoekjaar = bewegingenPerRekening(transacties, {
    from: boekjaarStart,
    to: datum,
  });

  const activa: BalansPost[] = [];
  const passiva: BalansPost[] = [];
  let resultaatBoekjaar = 0;

  for (const a of accounts) {
    const bTot = bewegingTotaal.get(a.nummer) ?? { debet: 0, credit: 0 };
    if (a.type === 'actief') {
      const saldo = saldoVoorRekening(a, bTot);
      if (saldo !== 0) activa.push({ nummer: a.nummer, naam: a.naam, saldo });
    } else if (a.type === 'passief') {
      const saldo = saldoVoorRekening(a, bTot);
      if (saldo !== 0) passiva.push({ nummer: a.nummer, naam: a.naam, saldo });
    } else {
      // kosten / opbrengsten dragen bij aan het resultaat van het boekjaar
      const bBj = bewegingBoekjaar.get(a.nummer) ?? { debet: 0, credit: 0 };
      const saldo = saldoVoorRekening(a, bBj, false);
      if (a.type === 'opbrengsten') resultaatBoekjaar += saldo;
      else resultaatBoekjaar -= saldo; // kosten
    }
  }

  resultaatBoekjaar = round2(resultaatBoekjaar);

  const totaalActiva = round2(activa.reduce((s, p) => s + p.saldo, 0));
  const totaalPassivaExclResultaat = round2(
    passiva.reduce((s, p) => s + p.saldo, 0),
  );
  const totaalPassiva = round2(totaalPassivaExclResultaat + resultaatBoekjaar);

  return {
    datum,
    activa,
    passiva,
    resultaatBoekjaar,
    totaalActiva,
    totaalPassiva,
    inBalans: Math.abs(totaalActiva - totaalPassiva) < 0.005,
  };
}

// ---------------------------------------------------------------------------
// Winst & Verliesrekening
// ---------------------------------------------------------------------------

export interface WenVPost {
  nummer: string;
  naam: string;
  saldo: number;
}

export interface WenV {
  from: string;
  to: string;
  opbrengsten: WenVPost[];
  kosten: WenVPost[];
  totaalOpbrengsten: number;
  totaalKosten: number;
  resultaat: number;
}

export function berekenWenV(
  accounts: Account[],
  transacties: Transactie[],
  from: string,
  to: string,
): WenV {
  const beweging = bewegingenPerRekening(transacties, { from, to });
  const opbrengsten: WenVPost[] = [];
  const kosten: WenVPost[] = [];

  for (const a of accounts) {
    if (a.type !== 'kosten' && a.type !== 'opbrengsten') continue;
    const b = beweging.get(a.nummer) ?? { debet: 0, credit: 0 };
    const saldo = saldoVoorRekening(a, b, false);
    if (saldo === 0) continue;
    if (a.type === 'opbrengsten') {
      opbrengsten.push({ nummer: a.nummer, naam: a.naam, saldo });
    } else {
      kosten.push({ nummer: a.nummer, naam: a.naam, saldo });
    }
  }

  const totaalOpbrengsten = round2(opbrengsten.reduce((s, p) => s + p.saldo, 0));
  const totaalKosten = round2(kosten.reduce((s, p) => s + p.saldo, 0));

  return {
    from,
    to,
    opbrengsten,
    kosten,
    totaalOpbrengsten,
    totaalKosten,
    resultaat: round2(totaalOpbrengsten - totaalKosten),
  };
}

// ---------------------------------------------------------------------------
// BTW-aangifte (kwartaal)
// ---------------------------------------------------------------------------

export interface BtwAangifte {
  kwartaal: number;
  jaar: number;
  from: string;
  to: string;
  rubriek1a: { grondslag: number; btw: number }; // omzet hoog 21%
  rubriek1b: { grondslag: number; btw: number }; // omzet laag 9%
  rubriek1c: { grondslag: number; btw: number }; // altijd 0
  rubriek1d: { grondslag: number; btw: number }; // altijd 0
  rubriek5b: number; // voorbelasting
  verschuldigd: number; // 1a + 1b btw
  saldo: number; // (1a + 1b) − 5b; positief = te betalen
  transacties: Transactie[];
}

/** Bepaal de datumgrenzen van een kwartaal (from t/m to, inclusief). */
export function kwartaalGrenzen(kwartaal: number, jaar: number): { from: string; to: string } {
  const startMaand = (kwartaal - 1) * 3 + 1; // 1, 4, 7, 10
  const eindMaand = startMaand + 2; // 3, 6, 9, 12
  const from = `${jaar}-${String(startMaand).padStart(2, '0')}-01`;
  const laatsteDag = new Date(jaar, eindMaand, 0).getDate(); // dag 0 van volgende maand
  const to = `${jaar}-${String(eindMaand).padStart(2, '0')}-${String(laatsteDag).padStart(2, '0')}`;
  return { from, to };
}

export function berekenBtwAangifte(
  transacties: Transactie[],
  kwartaal: number,
  jaar: number,
): BtwAangifte {
  const { from, to } = kwartaalGrenzen(kwartaal, jaar);

  const inKwartaal = transacties.filter(
    (t) =>
      t.datum >= from &&
      t.datum <= to &&
      t.btwBedrag != null &&
      t.btwRichting != null,
  );

  const som = (
    pred: (t: Transactie) => boolean,
    veld: 'btwGrondslag' | 'btwBedrag',
  ) => round2(inKwartaal.filter(pred).reduce((s, t) => s + (t[veld] ?? 0), 0));

  const afdracht21 = (t: Transactie) => t.btwRichting === 'afdracht' && t.btwCode === '21';
  const afdracht9 = (t: Transactie) => t.btwRichting === 'afdracht' && t.btwCode === '9';
  const vordering = (t: Transactie) => t.btwRichting === 'vordering';

  const rubriek1a = { grondslag: som(afdracht21, 'btwGrondslag'), btw: som(afdracht21, 'btwBedrag') };
  const rubriek1b = { grondslag: som(afdracht9, 'btwGrondslag'), btw: som(afdracht9, 'btwBedrag') };
  const rubriek5b = som(vordering, 'btwBedrag');

  const verschuldigd = round2(rubriek1a.btw + rubriek1b.btw);
  const saldo = round2(verschuldigd - rubriek5b);

  return {
    kwartaal,
    jaar,
    from,
    to,
    rubriek1a,
    rubriek1b,
    rubriek1c: { grondslag: 0, btw: 0 },
    rubriek1d: { grondslag: 0, btw: 0 },
    rubriek5b,
    verschuldigd,
    saldo,
    transacties: inKwartaal,
  };
}
