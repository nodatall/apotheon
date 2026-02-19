import React, { useMemo, useState } from 'react';
import Assets from './pages/Assets.jsx';
import History from './pages/History.jsx';
import Wallets from './pages/Wallets.jsx';

const PAGES = [
  { key: 'assets', label: 'Assets', component: Assets },
  { key: 'wallets', label: 'Wallets', component: Wallets },
  { key: 'history', label: 'History', component: History }
];

export default function App() {
  const [pageKey, setPageKey] = useState('assets');

  const ActivePage = useMemo(
    () => PAGES.find((page) => page.key === pageKey)?.component || Assets,
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
