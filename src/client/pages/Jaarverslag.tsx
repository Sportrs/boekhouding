import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Balans, WenV, Settings } from '../lib/types';
import { euro, datumNL } from '../lib/format';
import { Button, Card, PageHeader } from '../components/ui';

export default function Jaarverslag() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [balans, setBalans] = useState<Balans | null>(null);
  const [wenv, setWenv] = useState<WenV | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await api.get<Settings>('/api/settings');
        setSettings(s);
        const [b, w] = await Promise.all([
          api.get<Balans>('/api/reports/balans'),
          api.get<WenV>('/api/reports/wenV'),
        ]);
        setBalans(b);
        setWenv(w);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fout');
      }
    })();
  }, []);

  if (error) return <div className="text-danger">{error}</div>;
  if (!balans || !wenv || !settings) return <div className="text-muted">Laden…</div>;

  return (
    <div className="print-area">
      <PageHeader
        title="Jaarverslag"
        subtitle={`${settings.bedrijfsnaam || 'BV'} — boekjaar ${settings.boekjaar}`}
        actions={
          <Button variant="ghost" className="no-print" onClick={() => window.print()}>
            🖨 Printen
          </Button>
        }
      />

      {/* Balans */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-sm font-medium text-inkdim">Balans per {datumNL(balans.datum)}</span>
          <span className={'text-xs ' + (balans.inBalans ? 'text-success' : 'text-danger')}>
            {balans.inBalans ? '✓ In balans' : '✗ Niet in balans'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-2">
          {/* Activa */}
          <div className="bg-surface p-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">Activa</div>
            <table className="w-full text-sm">
              <tbody>
                {balans.activa.map((p) => (
                  <tr key={p.nummer}>
                    <td className="py-1 text-inkdim">
                      {p.nummer} — {p.naam}
                    </td>
                    <td className="num py-1 text-ink">{euro(p.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="py-2 font-medium text-inkdim">Totaal activa</td>
                  <td className="num py-2 font-semibold text-ink">{euro(balans.totaalActiva)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Passiva */}
          <div className="bg-surface p-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">Passiva</div>
            <table className="w-full text-sm">
              <tbody>
                {balans.passiva.map((p) => (
                  <tr key={p.nummer}>
                    <td className="py-1 text-inkdim">
                      {p.nummer} — {p.naam}
                    </td>
                    <td className="num py-1 text-ink">{euro(p.saldo)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1 text-inkdim">Resultaat boekjaar</td>
                  <td
                    className={
                      'num py-1 ' + (balans.resultaatBoekjaar >= 0 ? 'text-success' : 'text-danger')
                    }
                  >
                    {euro(balans.resultaatBoekjaar)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="py-2 font-medium text-inkdim">Totaal passiva</td>
                  <td className="num py-2 font-semibold text-ink">{euro(balans.totaalPassiva)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Card>

      {/* Winst & verlies */}
      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-line px-5 py-3 text-sm font-medium text-inkdim">
          Winst- &amp; verliesrekening ({datumNL(wenv.from)} t/m {datumNL(wenv.to)})
        </div>
        <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-2">
          <div className="bg-surface p-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">Opbrengsten</div>
            <table className="w-full text-sm">
              <tbody>
                {wenv.opbrengsten.map((p) => (
                  <tr key={p.nummer}>
                    <td className="py-1 text-inkdim">
                      {p.nummer} — {p.naam}
                    </td>
                    <td className="num py-1 text-ink">{euro(p.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="py-2 font-medium text-inkdim">Totaal opbrengsten</td>
                  <td className="num py-2 font-semibold text-ink">{euro(wenv.totaalOpbrengsten)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="bg-surface p-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">Kosten</div>
            <table className="w-full text-sm">
              <tbody>
                {wenv.kosten.map((p) => (
                  <tr key={p.nummer}>
                    <td className="py-1 text-inkdim">
                      {p.nummer} — {p.naam}
                    </td>
                    <td className="num py-1 text-ink">{euro(p.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="py-2 font-medium text-inkdim">Totaal kosten</td>
                  <td className="num py-2 font-semibold text-ink">{euro(wenv.totaalKosten)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line bg-surface2/40 px-5 py-3">
          <span className="font-medium text-inkdim">Resultaat boekjaar</span>
          <span
            className={'num text-lg font-bold ' + (wenv.resultaat >= 0 ? 'text-success' : 'text-danger')}
          >
            {euro(wenv.resultaat)}
          </span>
        </div>
      </Card>

      <Card className="p-5 text-sm leading-relaxed text-muted">
        <p>
          Deze rapportage is een interne weergave van de financiële positie van{' '}
          {settings.bedrijfsnaam || 'de vennootschap'} per {datumNL(balans.datum)} en het resultaat
          over boekjaar {settings.boekjaar}. De balans toont de activa en passiva; het resultaat over
          het boekjaar is aan de passiefzijde opgenomen. Controle:&nbsp;
          totaal activa ({euro(balans.totaalActiva)}) is gelijk aan totaal passiva inclusief resultaat
          ({euro(balans.totaalPassiva)}). Dit betreft geen officieel jaarverslag conform Boek 2 BW.
        </p>
      </Card>
    </div>
  );
}
