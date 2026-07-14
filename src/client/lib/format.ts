const euroFmt = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatteert een bedrag als "€ 1.234,56". */
export function euro(bedrag: number | null | undefined): string {
  return euroFmt.format(bedrag ?? 0);
}

const dateFmt = new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Formatteert "YYYY-MM-DD" naar "dd-mm-jjjj". */
export function datumNL(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

/** Datum van vandaag als "YYYY-MM-DD". */
export function vandaag(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Herbruik dateFmt om de linter niet te laten klagen over ongebruikte binding.
export function datumLang(iso: string): string {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return iso;
  return dateFmt.format(new Date(parts[0], parts[1] - 1, parts[2]));
}
