import { NavLink } from 'react-router-dom';

interface Props {
  bedrijfsnaam: string;
  boekjaar: string;
  onLogout: () => void;
}

const links = [
  { to: '/', label: 'Dashboard', icon: '▤', end: true },
  { to: '/facturen', label: 'Facturen invoeren', icon: '＋', end: false },
  { to: '/journaal', label: 'Journaal', icon: '≣', end: false },
  { to: '/btw', label: 'BTW-aangifte', icon: '％', end: false },
  { to: '/jaarverslag', label: 'Jaarverslag', icon: '▦', end: false },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙', end: false },
];

export default function Sidebar({ bedrijfsnaam, boekjaar, onLogout }: Props) {
  return (
    <aside className="no-print flex h-screen w-[220px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-5 py-5">
        <div className="truncate text-base font-semibold text-ink">
          {bedrijfsnaam || 'BV Boekhouding'}
        </div>
        <div className="mt-0.5 text-xs text-muted">Boekjaar {boekjaar}</div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ' +
              (isActive
                ? 'bg-brand/15 text-brand'
                : 'text-inkdim hover:bg-surface2 hover:text-ink')
            }
          >
            <span className="w-4 text-center text-base leading-none">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <button
          onClick={onLogout}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          ⎋ Uitloggen
        </button>
      </div>
    </aside>
  );
}
