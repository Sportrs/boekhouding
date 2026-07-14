import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Account, Settings } from '../lib/types';
import { euro } from '../lib/format';
import { Button, Card, Field, PageHeader, inputClass } from '../components/ui';
import { useToast } from '../components/Toast';
import AccountModal from '../components/AccountModal';

const TYPE_LABEL: Record<string, string> = {
  actief: 'Actief',
  passief: 'Passief',
  kosten: 'Kosten',
  opbrengsten: 'Opbrengsten',
};

export default function Instellingen({
  settings,
  onSaved,
}: {
  settings: Settings | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [bedrijfsnaam, setBedrijfsnaam] = useState('');
  const [boekjaar, setBoekjaar] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiConfigured, setApiConfigured] = useState(false);
  const [apiFromEnv, setApiFromEnv] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [modal, setModal] = useState<{ account: Account | null } | null>(null);

  function loadAll() {
    api.get<Settings>('/api/settings').then((s) => {
      setBedrijfsnaam(s.bedrijfsnaam);
      setBoekjaar(s.boekjaar);
      setApiConfigured(s.apiKeyConfigured);
      setApiFromEnv(s.apiKeyFromEnv);
    });
    api.get<Account[]>('/api/accounts').then(setAccounts);
  }

  useEffect(() => {
    loadAll();
    if (settings) {
      setBedrijfsnaam(settings.bedrijfsnaam);
      setBoekjaar(settings.boekjaar);
    }
  }, []);

  async function bewaarBedrijf() {
    try {
      await api.put('/api/settings', { bedrijfsnaam, boekjaar });
      toast('Opgeslagen ✓');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opslaan mislukt', 'error');
    }
  }

  async function bewaarApiKey() {
    try {
      await api.put('/api/settings/api-key', { apiKey });
      setApiKey('');
      toast('API-sleutel opgeslagen ✓');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opslaan mislukt', 'error');
    }
  }

  async function verwijderRekening(a: Account) {
    if (!confirm(`Rekening ${a.nummer} — ${a.naam} verwijderen?`)) return;
    try {
      await api.del(`/api/accounts/${a.nummer}`);
      toast('Rekening verwijderd');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Verwijderen mislukt', 'error');
    }
  }

  async function reset() {
    const bevestiging = prompt(
      'Dit verwijdert ALLE boekingen en niet-systeemrekeningen. Typ RESET om te bevestigen.',
    );
    if (bevestiging !== 'RESET') return;
    try {
      await api.post('/api/settings/reset', { bevestig: 'RESET' });
      toast('Boekhouding gereset');
      loadAll();
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Reset mislukt', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="Instellingen" />

      <div className="space-y-6">
        {/* Bedrijf */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium text-inkdim">Bedrijf</h2>
          <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bedrijfsnaam">
              <input
                value={bedrijfsnaam}
                onChange={(e) => setBedrijfsnaam(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Boekjaar">
              <input
                value={boekjaar}
                onChange={(e) => setBoekjaar(e.target.value)}
                placeholder="2026"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button onClick={bewaarBedrijf}>Opslaan</Button>
          </div>
        </Card>

        {/* API-sleutel */}
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-medium text-inkdim">Anthropic API-sleutel</h2>
          <p className="mb-4 text-xs text-muted">
            {apiFromEnv
              ? 'Ingesteld via omgevingsvariabele (ANTHROPIC_API_KEY).'
              : apiConfigured
                ? 'Er is een sleutel opgeslagen. Vul een nieuwe in om te vervangen.'
                : 'Nog geen sleutel ingesteld — nodig voor het uitlezen van PDF-facturen.'}
          </p>
          <div className="flex max-w-lg items-end gap-2">
            <div className="flex-1">
              <Field label="Nieuwe sleutel">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className={inputClass}
                />
              </Field>
            </div>
            <Button onClick={bewaarApiKey} disabled={!apiKey.trim()}>
              Opslaan
            </Button>
          </div>
        </Card>

        {/* Rekeningschema */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-medium text-inkdim">Rekeningschema</h2>
            <Button onClick={() => setModal({ account: null })}>+ Nieuwe rekening</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2 text-left font-medium">Nummer</th>
                <th className="px-5 py-2 text-left font-medium">Naam</th>
                <th className="px-5 py-2 text-left font-medium">Type</th>
                <th className="px-5 py-2 text-right font-medium">Beginsaldo</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.nummer} className="border-t border-line/60 hover:bg-surface2/40">
                  <td className="num px-5 py-2 text-left text-inkdim">{a.nummer}</td>
                  <td className="px-5 py-2 text-inkdim">
                    {a.naam}
                    {a.systeem && (
                      <span className="ml-2 rounded bg-surface2 px-1.5 py-0.5 text-xs text-muted">
                        systeem
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-muted">{TYPE_LABEL[a.type] ?? a.type}</td>
                  <td className="num px-5 py-2 text-inkdim">
                    {a.type === 'actief' || a.type === 'passief' ? euro(a.openingSaldo) : '—'}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <button
                      onClick={() => setModal({ account: a })}
                      className="mr-3 text-muted hover:text-brand"
                    >
                      bewerken
                    </button>
                    {!a.systeem && (
                      <button
                        onClick={() => verwijderRekening(a)}
                        className="text-muted hover:text-danger"
                      >
                        verwijderen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Gevaarlijke zone */}
        <Card className="border-danger/40 p-5">
          <h2 className="mb-1 text-sm font-medium text-danger">Gevaarlijke zone</h2>
          <p className="mb-4 text-xs text-muted">
            Verwijder alle boekingen en niet-systeemrekeningen. Dit kan niet ongedaan worden gemaakt.
          </p>
          <Button variant="danger" onClick={reset}>
            Boekhouding resetten
          </Button>
        </Card>
      </div>

      {modal && (
        <AccountModal
          account={modal.account}
          onClose={() => setModal(null)}
          onSaved={() => {
            loadAll();
            onSaved();
          }}
        />
      )}
    </div>
  );
}
