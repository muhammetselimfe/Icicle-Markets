import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { NavBar } from '@/app/components/shell/nav-bar';
import { TabBar, TAB_BAR_HEIGHT } from '@/app/components/shell/tab-bar';
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
const BlockPage = lazy(() => import('@/app/pages/block-page').then(m => ({ default: m.BlockPage })));
const TransactionPage = lazy(() => import('@/app/pages/transaction-page').then(m => ({ default: m.TransactionPage })));
const AddressPage = lazy(() => import('@/app/pages/address-page').then(m => ({ default: m.AddressPage })));

/** Old /options/trade/:id links keep working. */
function LegacyTradeRedirect() {
  const { marketId } = useParams();
  return <Navigate to={`/predict/${marketId}`} replace />;
}

function AppContent() {
  const location = useLocation();

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

      <NavBar />
      {/* Bottom padding keeps content clear of the phone tab bar and the home indicator */}
      <main
        className="flex-1 relative z-10 pb-8 md:pb-8"
        style={{ paddingBottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom) + 1rem)` }}
      >
        {/* Keyed on pathname so a crash on one page resets when the user navigates away */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<MarketsView />} />
              <Route path="/token/:id" element={<TokenPage />} />

              <Route path="/predict" element={<OptionsView />} />
              <Route path="/predict/:marketId" element={<OptionsTradePage />} />
              <Route path="/options" element={<Navigate to="/predict" replace />} />
              <Route path="/options/trade/:marketId" element={<LegacyTradeRedirect />} />

              <Route path="/portfolio" element={<PortfolioView />} />
              <Route path="/portfolio/:segment" element={<PortfolioView />} />
              <Route path="/positions" element={<Navigate to="/portfolio/positions" replace />} />

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
      <TabBar />
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
