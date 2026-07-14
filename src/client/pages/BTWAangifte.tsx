import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { BtwAangifte, Settings } from '../lib/types';
import { euro, datumNL } from '../lib/format';
import { Card, PageHeader } from '../components/ui';

function Rij({
  label,
  grondslag,
  btw,
}: {
  label: string;
  grondslag?: number;
  btw: number;
}) {
  return (
    <tr className="border-t border-line/60">
      <td className="px-4 py-2 text-inkdim">{label}</td>
      <td className="num px-4 py-2 text-muted">{grondslag != null ? euro(grondslag) : ''}</td>
      <td className="num px-4 py-2 text-ink">{euro(btw)}</td>
    </tr>
  );
}

export default function BTWAangifte() {
  const [jaar, setJaar] = useState<number>(new Date().getFullYear());
  const [kwartaal, setKwartaal] = useState(1);
  const [data, setData] = useState<BtwAangifte | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Settings>('/api/settings').then((s) => {
      const y = Number(s.boekjaar);
      if (y) setJaar(y);
    });
  }, []);

  useEffect(() => {
    setError('');
    api
      .get<BtwAangifte>(`/api/reports/btw?quarter=${kwartaal}&year=${jaar}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Fout'));
  }, [kwartaal, jaar]);

  const teBetalen = (data?.saldo ?? 0) >= 0;

  return (
    <div>
      <PageHeader title="BTW-aangifte" subtitle={`Omzetbelasting per kwartaal — ${jaar}`} />

      <div className="mb-6 flex gap-2">
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            onClick={() => setKwartaal(q)}
            className={
              'rounded-lg px-5 py-2 text-sm font-medium transition-colors ' +
              (kwartaal === q
                ? 'bg-brand text-white'
                : 'bg-surface2 text-inkdim hover:text-ink')
            }
          >
            Q{q}
          </button>
        ))}
      </div>

      {error && <div className="text-danger">{error}</div>}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3 text-sm font-medium text-inkdim">
              Rubrieken ({datumNL(data.from)} t/m {datumNL(data.to)})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 text-left font-medium">Rubriek</th>
                  <th className="px-4 py-2 text-right font-medium">Grondslag</th>
                  <th className="px-4 py-2 text-right font-medium">BTW</th>
                </tr>
              </thead>
              <tbody>
                <Rij label="1a — Omzet hoog (21%)" grondslag={data.rubriek1a.grondslag} btw={data.rubriek1a.btw} />
                <Rij label="1b — Omzet laag (9%)" grondslag={data.rubriek1b.grondslag} btw={data.rubriek1b.btw} />
                <Rij label="1c — Overige tarieven" grondslag={data.rubriek1c.grondslag} btw={data.rubriek1c.btw} />
                <Rij label="1d — Privégebruik" grondslag={data.rubriek1d.grondslag} btw={data.rubriek1d.btw} />
                <tr className="border-t border-line bg-surface2/40">
                  <td className="px-4 py-2 font-medium text-inkdim">Verschuldigde BTW</td>
                  <td></td>
                  <td className="num px-4 py-2 font-medium text-ink">{euro(data.verschuldigd)}</td>
                </tr>
                <Rij label="5b — Voorbelasting" btw={data.rubriek5b} />
              </tbody>
            </table>
          </Card>

          <div className="space-y-6">
            <Card className="p-6">
              <div className="text-sm font-medium text-inkdim">Saldo aangifte</div>
              <div
                className={
                  'num mt-2 text-3xl font-bold ' + (teBetalen ? 'text-danger' : 'text-success')
                }
              >
                {euro(Math.abs(data.saldo))}
              </div>
              <div className="mt-1 text-sm text-muted">
                {teBetalen ? 'Te betalen aan de Belastingdienst' : 'Te ontvangen van de Belastingdienst'}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-3 text-sm font-medium text-inkdim">
                Boekingen met BTW in dit kwartaal
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.transacties.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-muted">Geen boekingen.</td>
                    </tr>
                  )}
                  {data.transacties.map((t) => (
                    <tr key={t.id} className="border-t border-line/60">
                      <td className="num px-4 py-2 text-inkdim">{datumNL(t.datum)}</td>
                      <td className="px-4 py-2 text-inkdim">{t.omschrijving}</td>
                      <td className="px-4 py-2 text-xs text-muted">
                        {t.btwRichting === 'afdracht' ? 'afdracht' : 'vordering'} {t.btwCode}%
                      </td>
                      <td className="num px-4 py-2 text-ink">{euro(t.btwBedrag ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
