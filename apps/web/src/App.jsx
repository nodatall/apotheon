import React, { useMemo, useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Assets from './pages/Assets.jsx';
import Protocols from './pages/Protocols.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', component: Dashboard },
  { key: 'assets', label: 'Assets', component: Assets },
  { key: 'protocols', label: 'Protocols', component: Protocols },
  { key: 'history', label: 'History', component: History },
  { key: 'settings', label: 'Settings', component: Settings }
];

export default function App() {
  const [pageKey, setPageKey] = useState('dashboard');

  const ActivePage = useMemo(
    () => PAGES.find((page) => page.key === pageKey)?.component || Dashboard,
    [pageKey]
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <h1>Apotheon</h1>
        <p className="muted">Single-owner operations console</p>
        <nav>
          {PAGES.map((page) => (
            <button
              key={page.key}
              type="button"
              className={page.key === pageKey ? 'nav-item active' : 'nav-item'}
              onClick={() => setPageKey(page.key)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="content">
        <ActivePage />
      </section>
    </main>
  );
}
