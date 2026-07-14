import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, ApiError } from './lib/api';
import type { Settings } from './lib/types';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Facturen from './pages/Facturen';
import Journaal from './pages/Journaal';
import BTWAangifte from './pages/BTWAangifte';
import Jaarverslag from './pages/Jaarverslag';
import Instellingen from './pages/Instellingen';

export default function App() {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.get<Settings>('/api/settings');
      setSettings(s);
    } catch {
      /* genegeerd */
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const r = await api.get<{ authenticated: boolean }>('/api/auth/me');
      setAuthed(r.authenticated);
      if (r.authenticated) await loadSettings();
    } finally {
      setChecked(true);
    }
  }, [loadSettings]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function handleLogout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* genegeerd */
    }
    setAuthed(false);
    setSettings(null);
  }

  // Vang globale 401's op (verlopen sessie): terug naar login.
  useEffect(() => {
    const original = window.fetch;
    return () => {
      window.fetch = original;
    };
  }, []);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">Laden…</div>
    );
  }

  if (!authed) {
    return (
      <Login
        onLogin={async () => {
          setAuthed(true);
          await loadSettings();
        }}
      />
    );
  }

  const onUnauthorized = () => setAuthed(false);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        bedrijfsnaam={settings?.bedrijfsnaam ?? ''}
        boekjaar={settings?.boekjaar ?? ''}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard onUnauthorized={onUnauthorized} />} />
            <Route path="/facturen" element={<Facturen onUnauthorized={onUnauthorized} />} />
            <Route path="/journaal" element={<Journaal onUnauthorized={onUnauthorized} />} />
            <Route path="/btw" element={<BTWAangifte />} />
            <Route path="/jaarverslag" element={<Jaarverslag />} />
            <Route
              path="/instellingen"
              element={<Instellingen settings={settings} onSaved={loadSettings} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

// Kleine helper voor pagina's om 401 netjes af te handelen.
export function handleApiError(err: unknown, onUnauthorized?: () => void): string {
  if (err instanceof ApiError && err.status === 401) {
    onUnauthorized?.();
    return 'Sessie verlopen. Log opnieuw in.';
  }
  return err instanceof Error ? err.message : 'Onbekende fout';
}
