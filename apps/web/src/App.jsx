import React, { useMemo, useState } from 'react';
import { Button, Card, CardBody, Divider } from '@heroui/react';
import Assets from './pages/Assets.jsx';
import History from './pages/History.jsx';
import Wallets from './pages/Wallets.jsx';

const PAGES = [
  { key: 'assets', label: 'Assets', component: Assets },
  { key: 'wallets', label: 'Addresses', component: Wallets },
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
        <Card className="sidebar-card" shadow="none">
          <CardBody className="p-0">
            <h1 className="sidebar-title">Apotheon</h1>
            <Divider className="my-4" />
            <nav className="nav-stack" aria-label="Primary">
              {PAGES.map((page) => (
                <Button
                  key={page.key}
                  type="button"
                  fullWidth
                  radius="sm"
                  variant={page.key === pageKey ? 'solid' : 'flat'}
                  color="default"
                  className={page.key === pageKey ? 'justify-start nav-active' : 'justify-start'}
                  onPress={() => setPageKey(page.key)}
                >
                  {page.label}
                </Button>
              ))}
            </nav>
          </CardBody>
        </Card>
      </aside>
      <section className="content">
        <div className="content-inner">
          <ActivePage />
        </div>
      </section>
    </main>
  );
}
