import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Account, FactuurData } from '../lib/types';
import { euro, vandaag } from '../lib/format';
import { Button, Field, inputClass } from './ui';
import { useToast } from './Toast';

interface Props {
  accounts: Account[];
  initial?: Partial<FactuurData>;
  initialType?: 'inkoop' | 'verkoop';
  onClose: () => void;
  onBooked: () => void;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function BookingModal({
  accounts,
  initial,
  initialType,
  onClose,
  onBooked,
}: Props) {
  const toast = useToast();
  const [type, setType] = useState<'inkoop' | 'verkoop'>(initialType ?? 'inkoop');
  const [datum, setDatum] = useState(initial?.factuurDatum || vandaag());
  const [factuurNummer, setFactuurNummer] = useState(initial?.factuurNummer || '');
  const [omschrijving, setOmschrijving] = useState(
    initial?.omschrijving || initial?.leverancier || '',
  );
  const [bedragExBTW, setBedragExBTW] = useState(
    initial?.bedragExBTW != null ? String(initial.bedragExBTW) : '',
  );
  const [btwPercentage, setBtwPercentage] = useState<number>(
    initial?.btwPercentage != null ? Number(initial.btwPercentage) : 21,
  );

  const kostenRekeningen = accounts.filter((a) => a.type === 'kosten');
  const omzetRekeningen = accounts.filter((a) => a.type === 'opbrengsten');
  const bankRekeningen = accounts.filter((a) => a.type === 'actief' && !a.systeem);

  const grootboekOpties = type === 'inkoop' ? kostenRekeningen : omzetRekeningen;

  const [grootboek, setGrootboek] = useState(grootboekOpties[0]?.nummer ?? '');
  const [betaal, setBetaal] = useState(
    bankRekeningen.find((a) => /bank/i.test(a.naam))?.nummer ?? bankRekeningen[0]?.nummer ?? '',
  );
  const [busy, setBusy] = useState(false);

  // Herbereken de grootboek-selectie als het type wisselt.
  function wisselType(t: 'inkoop' | 'verkoop') {
    setType(t);
    const opts = t === 'inkoop' ? kostenRekeningen : omzetRekeningen;
    setGrootboek(opts[0]?.nummer ?? '');
  }

  const excl = round2(Number(bedragExBTW.replace(',', '.')) || 0);
  const btwBedrag = round2((excl * btwPercentage) / 100);
  const totaal = round2(excl + btwBedrag);

  const naam = (nr: string) => accounts.find((a) => a.nummer === nr)?.naam ?? nr;

  // Live journaalpost-preview.
  const preview = useMemo(() => {
    const regels: { rekening: string; debet: number; credit: number }[] = [];
    if (type === 'inkoop') {
      regels.push({ rekening: grootboek, debet: excl, credit: 0 });
      if (btwBedrag > 0) regels.push({ rekening: '1810', debet: btwBedrag, credit: 0 });
      regels.push({ rekening: betaal, debet: 0, credit: totaal });
    } else {
      regels.push({ rekening: betaal, debet: totaal, credit: 0 });
      regels.push({ rekening: grootboek, debet: 0, credit: excl });
      if (btwBedrag > 0) regels.push({ rekening: '1910', debet: 0, credit: btwBedrag });
    }
    return regels;
  }, [type, grootboek, betaal, excl, btwBedrag, totaal]);

  async function boeken() {
    if (!(excl > 0)) return toast('Vul een bedrag groter dan 0 in', 'error');
    if (!omschrijving.trim()) return toast('Vul een omschrijving in', 'error');
    if (!grootboek || !betaal) return toast('Kies de rekeningen', 'error');
    setBusy(true);
    try {
      await api.post('/api/transactions', {
        datum,
        omschrijving,
        factuurNummer,
        type,
        bedragExBTW: excl,
        btwPercentage,
        grootboekrekening: grootboek,
        betaalRekening: betaal,
      });
      toast('Boeking opgeslagen ✓');
      onBooked();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Boeken mislukt', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="mt-10 w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Boeking invoeren</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Type */}
          <div className="flex gap-2">
            {(['inkoop', 'verkoop'] as const).map((t) => (
              <button
                key={t}
                onClick={() => wisselType(t)}
                className={
                  'flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize ' +
                  (type === t
                    ? 'border-brand bg-brand/15 text-brand'
                    : 'border-line bg-surface2 text-inkdim hover:text-ink')
                }
              >
                {t}factuur
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Datum">
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Factuurnummer">
              <input
                value={factuurNummer}
                onChange={(e) => setFactuurNummer(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Omschrijving">
            <input
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Bedrag excl. BTW">
              <input
                inputMode="decimal"
                value={bedragExBTW}
                onChange={(e) => setBedragExBTW(e.target.value)}
                placeholder="0,00"
                className={inputClass + ' num'}
              />
            </Field>
            <Field label="BTW-percentage">
              <select
                value={btwPercentage}
                onChange={(e) => setBtwPercentage(Number(e.target.value))}
                className={inputClass}
              >
                <option value={21}>21%</option>
                <option value={9}>9%</option>
                <option value={0}>0%</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={type === 'inkoop' ? 'Kostenrekening' : 'Omzetrekening'}>
              <select
                value={grootboek}
                onChange={(e) => setGrootboek(e.target.value)}
                className={inputClass}
              >
                {grootboekOpties.length === 0 && <option value="">— geen rekeningen —</option>}
                {grootboekOpties.map((a) => (
                  <option key={a.nummer} value={a.nummer}>
                    {a.nummer} — {a.naam}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Betaald via">
              <select
                value={betaal}
                onChange={(e) => setBetaal(e.target.value)}
                className={inputClass}
              >
                {bankRekeningen.length === 0 && <option value="">— geen rekeningen —</option>}
                {bankRekeningen.map((a) => (
                  <option key={a.nummer} value={a.nummer}>
                    {a.nummer} — {a.naam}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-line bg-surface2/50">
            <div className="border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-muted">
              Journaalpost-preview
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-4 py-1 text-left font-medium">Rekening</th>
                  <th className="px-4 py-1 text-right font-medium">Debet</th>
                  <th className="px-4 py-1 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className="px-4 py-1 text-inkdim">
                      {r.rekening} — {naam(r.rekening)}
                    </td>
                    <td className="num px-4 py-1 text-ink">{r.debet ? euro(r.debet) : ''}</td>
                    <td className="num px-4 py-1 text-ink">{r.credit ? euro(r.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button variant="success" onClick={boeken} disabled={busy}>
            {busy ? 'Bezig…' : 'Boeken ✓'}
          </Button>
        </div>
      </div>
    </div>
  );
}
