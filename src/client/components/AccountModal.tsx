import { useState } from 'react';
import { api } from '../lib/api';
import type { Account, AccountType } from '../lib/types';
import { Button, Field, inputClass } from './ui';
import { useToast } from './Toast';

interface Props {
  account?: Account | null; // aanwezig = bewerken
  onClose: () => void;
  onSaved: () => void;
}

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'actief', label: 'Actief (bezitting)' },
  { value: 'passief', label: 'Passief (schuld/eigen vermogen)' },
  { value: 'kosten', label: 'Kosten' },
  { value: 'opbrengsten', label: 'Opbrengsten' },
];

export default function AccountModal({ account, onClose, onSaved }: Props) {
  const toast = useToast();
  const bewerken = !!account;
  const [nummer, setNummer] = useState(account?.nummer ?? '');
  const [naam, setNaam] = useState(account?.naam ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'kosten');
  const [openingSaldo, setOpeningSaldo] = useState(
    account?.openingSaldo != null ? String(account.openingSaldo) : '0',
  );
  const [busy, setBusy] = useState(false);

  const balansRekening = type === 'actief' || type === 'passief';

  async function opslaan() {
    if (!nummer.trim()) return toast('Rekeningnummer is verplicht', 'error');
    if (!naam.trim()) return toast('Naam is verplicht', 'error');
    setBusy(true);
    try {
      const saldo = Number(openingSaldo.replace(',', '.')) || 0;
      if (bewerken) {
        await api.put(`/api/accounts/${account!.nummer}`, {
          naam,
          type: account!.systeem ? undefined : type,
          openingSaldo: balansRekening ? saldo : 0,
        });
      } else {
        await api.post('/api/accounts', {
          nummer,
          naam,
          type,
          openingSaldo: balansRekening ? saldo : 0,
        });
      }
      toast('Rekening opgeslagen ✓');
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opslaan mislukt', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="mt-16 w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            {bewerken ? 'Rekening bewerken' : 'Nieuwe rekening'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Field label="Rekeningnummer">
            <input
              value={nummer}
              onChange={(e) => setNummer(e.target.value)}
              disabled={bewerken}
              className={inputClass + (bewerken ? ' opacity-60' : '')}
              placeholder="bijv. 4300"
            />
          </Field>
          <Field label="Naam">
            <input value={naam} onChange={(e) => setNaam(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              disabled={account?.systeem}
              className={inputClass + (account?.systeem ? ' opacity-60' : '')}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          {balansRekening && (
            <Field label="Beginsaldo (natuurlijk saldo)">
              <input
                inputMode="decimal"
                value={openingSaldo}
                onChange={(e) => setOpeningSaldo(e.target.value)}
                className={inputClass + ' num'}
              />
            </Field>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={opslaan} disabled={busy}>
            {busy ? 'Bezig…' : 'Opslaan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
