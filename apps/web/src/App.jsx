import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, Divider } from '@heroui/react';
import sidebarSunMark from './brand/apoth3.png';
import Assets from './pages/Assets.jsx';
import History from './pages/History.jsx';
import Wallets from './pages/Wallets.jsx';

const PAGES = [
  { key: 'assets', label: 'Assets', component: Assets },
  { key: 'wallets', label: 'Addresses', component: Wallets },
  { key: 'history', label: 'History', component: History }
];

const PAGE_ROUTE_BY_KEY = {
  assets: '/assets',
  wallets: '/addresses',
  history: '/history'
};

const PAGE_KEY_BY_ROUTE = {
  '/assets': 'assets',
  '/addresses': 'wallets',
  '/history': 'history'
};

function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

function getPageKeyFromPath(pathname) {
  const normalized = normalizePath(pathname);
  if (normalized === '/') {
    return 'assets';
  }
  return PAGE_KEY_BY_ROUTE[normalized] || 'assets';
}

export default function App() {
  const [pageKey, setPageKey] = useState(() => getPageKeyFromPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => {
      setPageKey(getPageKeyFromPath(window.location.pathname));
    };

    window.addEventListener('popstate', onPopState);
    const targetRoute = PAGE_ROUTE_BY_KEY[getPageKeyFromPath(window.location.pathname)];
    const currentRoute = normalizePath(window.location.pathname);
    if (targetRoute && currentRoute !== targetRoute) {
      window.history.replaceState(null, '', targetRoute);
    }

    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  function navigateToPage(nextPageKey) {
    const resolvedPageKey = PAGES.some((page) => page.key === nextPageKey) ? nextPageKey : 'assets';
    const targetRoute = PAGE_ROUTE_BY_KEY[resolvedPageKey] || PAGE_ROUTE_BY_KEY.assets;
    const currentRoute = normalizePath(window.location.pathname);

    if (currentRoute !== targetRoute) {
      window.history.pushState(null, '', targetRoute);
    }
    setPageKey(resolvedPageKey);
  }

  const ActivePage = useMemo(
    () => PAGES.find((page) => page.key === pageKey)?.component || Assets,
    [pageKey]
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <Card className="sidebar-card" shadow="none">
          <CardBody className="p-0">
            <div className="sidebar-brand">
              <img className="sidebar-logo" src={sidebarSunMark} alt="Apotheon emblem" />
            </div>
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
                  onPress={() => navigateToPage(page.key)}
                >
                  {page.label}
                </Button>
              ))}
            </nav>
          </CardBody>
        </Card>
      </aside>
      <section className="content">
        <div className={`content-inner ${pageKey === 'history' ? 'content-inner-wide' : ''}`}>
          <ActivePage />
        </div>
      </section>
    </main>
  );
}
