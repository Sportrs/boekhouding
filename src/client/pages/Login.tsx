import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/login', { password });
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inloggen mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-xl"
      >
        <h1 className="text-lg font-semibold text-ink">BV Boekhouding</h1>
        <p className="mt-1 text-sm text-muted">Log in om verder te gaan.</p>

        <label className="mt-6 block text-sm text-inkdim">Wachtwoord</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-ink outline-none focus:border-brand"
        />

        {error && <div className="mt-3 text-sm text-danger">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-brand px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Bezig…' : 'Inloggen'}
        </button>
      </form>
    </div>
  );
}
