import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { handleApiError } from '../App';
import type { Dashboard as DashboardData } from '../lib/types';
import { euro, datumNL } from '../lib/format';
import { Card, PageHeader } from '../components/ui';

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'brand' | 'success' | 'danger' | 'warning';
}) {
  const color =
    accent === 'success'
      ? 'text-success'
      : accent === 'danger'
        ? 'text-danger'
        : accent === 'warning'
          ? 'text-warning'
          : 'text-ink';
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={'num mt-2 text-2xl font-semibold ' + color}>{value}</div>
    </Card>
  );
}

export default function Dashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<DashboardData>('/api/reports/dashboard')
      .then(setData)
      .catch((err) => setError(handleApiError(err, onUnauthorized)));
  }, [onUnauthorized]);

  if (error) return <div className="text-danger">{error}</div>;
  if (!data) return <div className="text-muted">Laden…</div>;

  const q = data.huidigKwartaal;
  const btwTeBetalen = q.saldo >= 0;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Boekjaar ${data.boekjaar}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Banksaldo" value={euro(data.banksaldo)} accent="brand" />
        <Stat label="Omzet boekjaar" value={euro(data.omzetBoekjaar)} accent="success" />
        <Stat label="Kosten boekjaar" value={euro(data.kostenBoekjaar)} accent="warning" />
        <Stat
          label="Resultaat boekjaar"
          value={euro(data.resultaatBoekjaar)}
          accent={data.resultaatBoekjaar >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-line px-5 py-3 text-sm font-medium text-inkdim">
            Recente boekingen
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2 text-left font-medium">Datum</th>
                <th className="px-5 py-2 text-left font-medium">Omschrijving</th>
                <th className="px-5 py-2 text-right font-medium">Bedrag</th>
              </tr>
            </thead>
            <tbody>
              {data.recenteBoekingen.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-muted">
                    Nog geen boekingen.
                  </td>
                </tr>
              )}
              {data.recenteBoekingen.map((t) => {
                const bedrag = t.regels.reduce((s, r) => s + r.debet, 0);
                return (
                  <tr key={t.id} className="border-t border-line/60">
                    <td className="num px-5 py-2 text-left text-inkdim">{datumNL(t.datum)}</td>
                    <td className="px-5 py-2 text-inkdim">{t.omschrijving}</td>
                    <td className="num px-5 py-2 text-ink">{euro(bedrag)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-medium text-inkdim">
            BTW Q{q.kwartaal} {q.jaar}
          </div>
          <div
            className={
              'num mt-3 text-2xl font-semibold ' + (btwTeBetalen ? 'text-danger' : 'text-success')
            }
          >
            {euro(Math.abs(q.saldo))}
          </div>
          <div className="mt-1 text-sm text-muted">
            {btwTeBetalen ? 'Te betalen' : 'Te ontvangen'}
          </div>
          <Link
            to="/btw"
            className="mt-4 inline-block rounded-lg bg-surface2 px-3 py-2 text-sm text-inkdim hover:text-ink"
          >
            Naar aangifte →
          </Link>
        </Card>
      </div>
    </div>
  );
}
