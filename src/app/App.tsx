import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/app/components/header';
import { Navigation } from '@/app/components/navigation';
import { Footer } from '@/app/components/footer';
import { MarketsView } from '@/app/components/markets-view';
import { PortfolioView } from '@/app/components/portfolio-view';
import { ExplorerView } from '@/app/components/explorer-view';
import { OptionsView } from '@/app/components/options-view';
import { PositionsView } from '@/app/components/positions-view';
import { OptionsTradePage } from '@/app/components/options-trade-page';
import { TokenPage } from '@/app/components/token-page';
import { BlockPage, TransactionPage, AddressPage } from '@/app/pages';
import { Toaster } from '@/app/components/ui/sonner';

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
        </Routes>
      </main>
      <Footer />
      <Toaster theme="dark" />
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
