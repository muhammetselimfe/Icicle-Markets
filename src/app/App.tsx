import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { X, Wallet, QrCode, ExternalLink } from 'lucide-react';
import { isMobile, getWalletDeepLink } from '@/app/utils/mobile';
import { Header } from '@/app/components/header';
import { Navigation } from '@/app/components/navigation';
import { Footer } from '@/app/components/footer';
import { MarketsView } from '@/app/components/markets-view';
import { PortfolioView } from '@/app/components/portfolio-view';
import { ExplorerView } from '@/app/components/explorer-view';
import { BlockPage, TransactionPage, AddressPage } from '@/app/pages';
import { Toaster } from '@/app/components/ui/sonner';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showWalletModal, setShowWalletModal] = useState(false);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  // Determine active tab from URL
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/portfolio') return 'portfolio';
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
      case 'explorer':
        navigate('/explorer');
        break;
    }
  };

  const handleConnectWallet = () => {
    setShowWalletModal(true);
  };

  const handleSelectConnector = (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      connect({ connector });
      setShowWalletModal(false);
    }
  };

  const handleDisconnectWallet = () => {
    disconnect();
  };

  // Check if we're on a detail page (block, tx, address)
  const isDetailPage = location.pathname.startsWith('/block/') ||
                       location.pathname.startsWith('/tx/') ||
                       location.pathname.startsWith('/address/');

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white relative overflow-hidden flex flex-col">
      {/* Retro grid background */}
      <div className="fixed inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: `
          linear-gradient(rgba(139, 228, 255, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139, 228, 255, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        transform: 'perspective(500px) rotateX(60deg)',
        transformOrigin: 'center top',
      }} />

      {/* Animated snow particles */}
      <div className="fixed inset-0 pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full opacity-60"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-${Math.random() * 20}%`,
              animation: `snowfall ${10 + Math.random() * 20}s linear infinite`,
              animationDelay: `${Math.random() * 10}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes snowfall {
          to {
            transform: translateY(100vh);
          }
        }
      `}</style>

      <Header
        onConnectWallet={handleConnectWallet}
        onDisconnectWallet={handleDisconnectWallet}
        isWalletConnected={isConnected}
        walletAddress={address}
      />
      {!isDetailPage && (
        <Navigation activeTab={activeTab} onTabChange={handleTabChange} />
      )}
      <main className="flex-1 pb-8 relative z-10">
        <Routes>
          <Route path="/" element={<MarketsView onConnectWallet={handleConnectWallet} />} />
          <Route
            path="/portfolio"
            element={
              <PortfolioView
                isWalletConnected={isConnected}
                onConnectWallet={handleConnectWallet}
              />
            }
          />
          <Route path="/explorer" element={<ExplorerView />} />
          <Route path="/block/:blockNumber" element={<BlockPage />} />
          <Route path="/tx/:hash" element={<TransactionPage />} />
          <Route path="/address/:address" element={<AddressPage />} />
        </Routes>
      </main>
      <Footer />
      <Toaster theme="dark" />

      {/* Wallet Selection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowWalletModal(false)} />
          <div className="relative border border-white/10 bg-[#0f1535] w-full max-w-sm rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="relative z-10">
              <div className="flex items-center justify-between p-4 md:p-5 border-b border-white/10">
                <h2
                  className="text-white font-medium"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}
                >
                  Connect Wallet
                </h2>
                <button
                  onClick={() => setShowWalletModal(false)}
                  className="text-slate-400 hover:text-white transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* Mobile: Show wallet-specific connectors with deep link support */}
                {isMobile() ? (
                  <>
                    {/* MetaMask SDK connector */}
                    {connectors.find(c => c.id === 'metaMaskSDK') && (
                      <button
                        onClick={() => handleSelectConnector('metaMaskSDK')}
                        disabled={isPending}
                        className="w-full bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[72px]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-[#f6851b]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
                          </div>
                          <div className="text-left">
                            <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                              MetaMask
                            </div>
                            <div className="text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                              Open in MetaMask app
                            </div>
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Core Wallet deep link */}
                    <a
                      href={getWalletDeepLink('core')}
                      className="w-full bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-all block min-h-[72px]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-bold text-white">C</span>
                        </div>
                        <div className="text-left flex-1">
                          <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                            Core Wallet
                          </div>
                          <div className="text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                            Open in Core app
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500" />
                      </div>
                    </a>

                    {/* Coinbase Wallet connector */}
                    {connectors.find(c => c.id === 'coinbaseWalletSDK') && (
                      <button
                        onClick={() => handleSelectConnector('coinbaseWalletSDK')}
                        disabled={isPending}
                        className="w-full bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[72px]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-[#0052ff]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <div className="w-6 h-6 bg-[#0052ff] rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">C</span>
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                              Coinbase Wallet
                            </div>
                            <div className="text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                              Open in Coinbase app
                            </div>
                          </div>
                        </div>
                      </button>
                    )}

                    {/* WalletConnect for other wallets */}
                    {connectors.find(c => c.id === 'walletConnect') && (
                      <button
                        onClick={() => handleSelectConnector('walletConnect')}
                        disabled={isPending}
                        className="w-full bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[72px]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-[#3b99fc]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <QrCode className="w-5 h-5 text-[#3b99fc]" />
                          </div>
                          <div className="text-left">
                            <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                              Other Wallets
                            </div>
                            <div className="text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                              Use WalletConnect
                            </div>
                          </div>
                        </div>
                      </button>
                    )}
                  </>
                ) : (
                  /* Desktop: Show all connectors */
                  connectors.map((connector) => (
                    <button
                      key={connector.id}
                      onClick={() => handleSelectConnector(connector.id)}
                      disabled={isPending}
                      className="w-full bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[72px]"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          connector.id === 'metaMaskSDK' ? 'bg-[#f6851b]/10' :
                          connector.id === 'coinbaseWalletSDK' ? 'bg-[#0052ff]/10' :
                          connector.id === 'walletConnect' ? 'bg-[#3b99fc]/10' :
                          'bg-white/10'
                        }`}>
                          {connector.id === 'metaMaskSDK' ? (
                            <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
                          ) : connector.id === 'coinbaseWalletSDK' ? (
                            <div className="w-6 h-6 bg-[#0052ff] rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">C</span>
                            </div>
                          ) : connector.id === 'walletConnect' ? (
                            <QrCode className="w-5 h-5 text-[#3b99fc]" />
                          ) : (
                            <Wallet className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="text-left">
                          <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                            {connector.id === 'injected' ? 'Browser Wallet' : connector.name}
                          </div>
                          <div className="text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                            {connector.id === 'injected'
                              ? 'MetaMask, Rabby, etc.'
                              : connector.id === 'walletConnect'
                              ? 'Scan with mobile wallet'
                              : connector.id === 'metaMaskSDK'
                              ? 'Connect with MetaMask'
                              : connector.id === 'coinbaseWalletSDK'
                              ? 'Connect with Coinbase'
                              : ''}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}

                {isPending && (
                  <div className="text-center py-2">
                    <span
                      className="text-slate-400"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      Connecting...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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
