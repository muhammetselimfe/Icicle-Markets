import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/app/components/header';
import { Navigation } from '@/app/components/navigation';
import { Footer } from '@/app/components/footer';
import { MarketsView } from '@/app/components/markets-view';
import { ErrorBoundary } from '@/app/components/error-boundary';
import { NotFound } from '@/app/components/not-found';
import { RouteFallback } from '@/app/components/route-fallback';
import { Toaster } from '@/app/components/ui/sonner';

// Every route except the landing page is code-split so the first paint only ships the
// markets table. Each `lazy` import becomes its own chunk.
const TokenPage = lazy(() => import('@/app/components/token-page').then(m => ({ default: m.TokenPage })));
const PortfolioView = lazy(() => import('@/app/components/portfolio-view').then(m => ({ default: m.PortfolioView })));
const ExplorerView = lazy(() => import('@/app/components/explorer-view').then(m => ({ default: m.ExplorerView })));
const OptionsView = lazy(() => import('@/app/components/options-view').then(m => ({ default: m.OptionsView })));
const OptionsTradePage = lazy(() => import('@/app/components/options-trade-page').then(m => ({ default: m.OptionsTradePage })));
const PositionsView = lazy(() => import('@/app/components/positions-view').then(m => ({ default: m.PositionsView })));
const BlockPage = lazy(() => import('@/app/pages/block-page').then(m => ({ default: m.BlockPage })));
const TransactionPage = lazy(() => import('@/app/pages/transaction-page').then(m => ({ default: m.TransactionPage })));
const AddressPage = lazy(() => import('@/app/pages/address-page').then(m => ({ default: m.AddressPage })));

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/portfolio') return 'portfolio';
    if (path === '/positions') return 'positions';
    if (path === '/options' || path.startsWith('/options/')) return 'options';
    if (path === '/explorer' || path.startsWith('/block') || path.startsWith('/tx') || path.startsWith('/address')) return 'explorer';
    return 'markets';
  };

  const activeTab = getActiveTab();

  const handleTabChange = (tab: string) => {
    switch (tab) {
      case 'markets':
        navigate('/');
        break;
      case 'portfolio':
        navigate('/portfolio');
        break;
      case 'options':
        navigate('/options');
        break;
      case 'positions':
        navigate('/positions');
        break;
      case 'explorer':
        navigate('/explorer');
        break;
    }
  };

  // Check if we're on a detail page (block, tx, address)
  const isDetailPage = location.pathname.startsWith('/block/') ||
                       location.pathname.startsWith('/tx/') ||
                       location.pathname.startsWith('/address/');

  return (
    <div className="min-h-screen bg-ice-bg text-ice-text relative overflow-hidden flex flex-col">
      {/* Atmospheric glows — theme-aware (see --glow-* tokens) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{ top: '-140px', right: '-100px', width: '760px', height: '360px', background: 'var(--glow-1)', opacity: 'var(--glow-opacity-1)', filter: 'blur(120px)' }}
        />
        <div
          className="absolute rounded-full"
          style={{ top: '420px', left: '-180px', width: '620px', height: '320px', background: 'var(--glow-2)', opacity: 'var(--glow-opacity-2)', filter: 'blur(130px)' }}
        />
      </div>

      <Header />
      {!isDetailPage && (
        <Navigation activeTab={activeTab} onTabChange={handleTabChange} />
      )}
      <main className="flex-1 pb-8 relative z-10">
        {/* Keyed on pathname so a crash on one page resets when the user navigates away */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<MarketsView />} />
              <Route path="/token/:id" element={<TokenPage />} />
              <Route path="/portfolio" element={<PortfolioView />} />
              <Route path="/options" element={<OptionsView />} />
              <Route path="/options/trade/:marketId" element={<OptionsTradePage />} />
              <Route path="/positions" element={<PositionsView />} />
              <Route path="/explorer" element={<ExplorerView />} />
              <Route path="/block/:blockNumber" element={<BlockPage />} />
              <Route path="/tx/:hash" element={<TransactionPage />} />
              <Route path="/address/:address" element={<AddressPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      {/* Theme comes from next-themes inside the wrapper, so light mode gets light toasts */}
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
