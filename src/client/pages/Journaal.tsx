import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { handleApiError } from '../App';
import type { Transactie } from '../lib/types';
import { euro, datumNL } from '../lib/format';
import { Card, PageHeader, inputClass } from '../components/ui';
import { useToast } from '../components/Toast';

export default function Journaal({ onUnauthorized }: { onUnauthorized: () => void }) {
  const toast = useToast();
  const [transacties, setTransacties] = useState<Transactie[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function load() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    api
      .get<Transactie[]>('/api/transactions' + (qs ? `?${qs}` : ''))
      .then(setTransacties)
      .catch((err) => toast(handleApiError(err, onUnauthorized), 'error'));
  }

  useEffect(load, [from, to]);

  async function verwijder(id: string) {
    if (!confirm('Deze boeking verwijderen?')) return;
    try {
      await api.del(`/api/transactions/${id}`);
      toast('Boeking verwijderd');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Verwijderen mislukt', 'error');
    }
  }

  const inclVan = (t: Transactie) => t.regels.reduce((s, r) => s + r.debet, 0);

  return (
    <div>
      <PageHeader
        title="Journaal"
        subtitle="Alle boekingen, nieuwste eerst."
        actions={
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            <span className="text-muted">t/m</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            {(from || to) && (
              <button
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
                className="text-sm text-muted hover:text-ink"
              >
                wissen
              </button>
            )}
          </div>
        }
      />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 text-left font-medium">Datum</th>
              <th className="px-4 py-3 text-left font-medium">Factuurnr.</th>
              <th className="px-4 py-3 text-left font-medium">Omschrijving</th>
              <th className="px-4 py-3 text-right font-medium">Excl. BTW</th>
              <th className="px-4 py-3 text-right font-medium">BTW</th>
              <th className="px-4 py-3 text-right font-medium">Incl. BTW</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {transacties.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Geen boekingen gevonden.
                </td>
              </tr>
            )}
            {transacties.map((t) => (
              <tr key={t.id} className="border-t border-line/60 hover:bg-surface2/40">
                <td className="num px-4 py-2 text-left text-inkdim">{datumNL(t.datum)}</td>
                <td className="px-4 py-2 text-muted">{t.factuurNummer || '—'}</td>
                <td className="px-4 py-2 text-inkdim">{t.omschrijving}</td>
                <td className="num px-4 py-2 text-inkdim">
                  {t.btwGrondslag != null ? euro(t.btwGrondslag) : '—'}
                </td>
                <td className="num px-4 py-2 text-inkdim">
                  {t.btwBedrag != null ? euro(t.btwBedrag) : '—'}
                </td>
                <td className="num px-4 py-2 text-ink">{euro(inclVan(t))}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => verwijder(t.id)}
                    className="text-muted transition-colors hover:text-danger"
                    title="Verwijderen"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
