export type AccountType = 'actief' | 'passief' | 'kosten' | 'opbrengsten';

export interface Account {
  id: number;
  nummer: string;
  naam: string;
  type: AccountType;
  systeem: boolean;
  openingSaldo: number;
}

export interface Regel {
  id?: number;
  rekening: string;
  debet: number;
  credit: number;
}

export interface Transactie {
  id: string;
  datum: string;
  omschrijving: string;
  factuurNummer?: string | null;
  btwGrondslag?: number | null;
  btwBedrag?: number | null;
  btwCode?: string | null;
  btwRichting?: string | null;
  regels: Regel[];
  createdAt?: string;
}

export interface Settings {
  bedrijfsnaam: string;
  boekjaar: string;
  apiKeyConfigured: boolean;
  apiKeyFromEnv: boolean;
}

export interface FactuurData {
  leverancier: string;
  factuurNummer: string;
  factuurDatum: string;
  omschrijving: string;
  bedragExBTW: number;
  btwBedrag: number;
  btwPercentage: number;
}

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
  totaalPassiva: number;
  inBalans: boolean;
}

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

export interface BtwAangifte {
  kwartaal: number;
  jaar: number;
  from: string;
  to: string;
  rubriek1a: { grondslag: number; btw: number };
  rubriek1b: { grondslag: number; btw: number };
  rubriek1c: { grondslag: number; btw: number };
  rubriek1d: { grondslag: number; btw: number };
  rubriek5b: number;
  verschuldigd: number;
  saldo: number;
  transacties: Transactie[];
}

export interface Dashboard {
  boekjaar: string;
  banksaldo: number;
  bankRekeningen: string[];
  omzetBoekjaar: number;
  kostenBoekjaar: number;
  resultaatBoekjaar: number;
  huidigKwartaal: { kwartaal: number; jaar: number; saldo: number };
  recenteBoekingen: Transactie[];
}
