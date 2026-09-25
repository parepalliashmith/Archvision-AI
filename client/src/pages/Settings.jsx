import { useState } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';

const THEME_KEY = 'archvision_theme';

export function getSavedTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}

// 'system' removes the override so the prefers-color-scheme media query decides.
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
}

const OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'Match device', icon: Monitor },
];

export default function Settings({ account, onLogout }) {
  const [theme, setTheme] = useState(getSavedTheme);

  function choose(mode) {
    setTheme(mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode — still applies this visit */ }
    applyTheme(mode);
  }

  return (
    <div className="profile-page">
      <div className="side-card">
        <h4>Appearance</h4>
        <div className="theme-options">
          {OPTIONS.map((o) => (
            <button key={o.id} className={'theme-option' + (theme === o.id ? ' active' : '')} onClick={() => choose(o.id)}>
              <o.icon size={18} /> {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="side-card">
        <h4>Notifications</h4>
        <p style={{ margin: 0 }}>
          Replies from builders and customers are emailed to <strong>{account?.email}</strong>. Email notifications
          can't be switched off yet.
        </p>
      </div>

      <div className="side-card">
        <h4>Account</h4>
        <p>Signed in as {account?.email}. There are no passwords — you sign in with a one-time email code.</p>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}><LogOut size={14} /> Log out</button>
      </div>
    </div>
  );
}
