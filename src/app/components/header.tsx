import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Wallet, Settings, ChevronDown, LogOut, Loader2 } from 'lucide-react';
import { Input } from '@/app/components/ui/input';
import { BRAND } from '@/app/constants/brand';
import { api } from '@/app/services/api';

interface HeaderProps {
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  isWalletConnected: boolean;
  walletAddress?: string;
}

// Detect search type from input
function detectSearchType(query: string): 'tx' | 'address' | 'block' | 'unknown' {
  const trimmed = query.trim().toLowerCase();

  // Transaction hash: 0x + 64 hex chars = 66 total
  if (/^0x[a-f0-9]{64}$/i.test(trimmed)) {
    return 'tx';
  }

  // Address: 0x + 40 hex chars = 42 total
  if (/^0x[a-f0-9]{40}$/i.test(trimmed)) {
    return 'address';
  }

  // Block number: numeric only
  if (/^\d+$/.test(trimmed)) {
    return 'block';
  }

  return 'unknown';
}

export function Header({ onConnectWallet, onDisconnectWallet, isWalletConnected, walletAddress }: HeaderProps) {
  const navigate = useNavigate();
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setSearchError(null);
    setSearching(true);

    try {
      const searchType = detectSearchType(query);

      switch (searchType) {
        case 'tx':
          // Verify transaction exists
          try {
            await api.getTransaction(query);
            navigate(`/tx/${query}`);
            setSearchQuery('');
          } catch {
            setSearchError('Transaction not found');
          }
          break;

        case 'address':
          // Navigate directly to address page
          navigate(`/address/${query}`);
          setSearchQuery('');
          break;

        case 'block':
          // Verify block exists
          try {
            await api.getBlock(parseInt(query, 10));
            navigate(`/block/${query}`);
            setSearchQuery('');
          } catch {
            setSearchError('Block not found');
          }
          break;

        default:
          setSearchError('Enter a valid tx hash, address, or block number');
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
    // Clear error when typing
    if (searchError) {
      setSearchError(null);
    }
  };

  return (
    <header className="border-b-4 border-[#8be4ff] bg-[#0f1535] sticky top-0 z-50 shadow-[0_4px_0_0_rgba(139,228,255,0.3)]">
      <div className="container mx-auto px-6 py-5">
        <div className="flex items-center justify-between gap-8">
          {/* Logo */}
          <div className="flex items-center">
            <img
              src={BRAND.logos.main}
              alt={BRAND.name}
              className="h-20 cursor-pointer"
              onClick={() => navigate('/')}
            />
          </div>

          {/* Search */}
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <div className="absolute inset-0 bg-[#8be4ff] opacity-10 blur-sm" />
              <div className={`relative border-2 bg-[#0a0e27] ${searchError ? 'border-[#ff4d4d]' : 'border-[#4db8ff]'}`}>
                {searching ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8be4ff] animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8be4ff]" />
                )}
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="SEARCH TX HASH, ADDRESS, BLOCK..."
                  className="pl-10 pr-4 border-0 bg-transparent text-white placeholder:text-[#4db8ff]/50 focus-visible:ring-0 uppercase"
                  style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
                  disabled={searching}
                />
                {/* Search button */}
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 border border-[#4db8ff] bg-[#4db8ff]/10 hover:bg-[#4db8ff]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                    GO
                  </span>
                </button>
              </div>
              {/* Error message */}
              {searchError && (
                <div className="absolute top-full left-0 right-0 mt-1 px-3 py-2 bg-[#ff4d4d]/20 border border-[#ff4d4d] text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                  {searchError}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {isWalletConnected ? (
              <>
                {/* Network Badge */}
                <div className="relative border-2 border-[#4db8ff] bg-[#0f1535] px-3 py-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#4dff88]" />
                  <span
                    className="text-[#8be4ff] uppercase"
                    style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}
                  >
                    Avalanche
                  </span>
                </div>

                {/* Wallet Address with Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowWalletMenu(!showWalletMenu)}
                    className="relative border-3 border-[#8be4ff] bg-[#0f1535] px-4 py-2 hover:bg-[#8be4ff]/10 transition-colors"
                  >
                    <div className="absolute inset-0 bg-[#8be4ff] opacity-20 blur" />
                    <div className="relative flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#8be4ff]" />
                      <span className="text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                        {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                      </span>
                      <ChevronDown className="w-4 h-4 text-[#8be4ff]" />
                    </div>
                  </button>

                  {showWalletMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowWalletMenu(false)}
                      />
                      <div className="absolute top-full right-0 mt-2 z-50 border-2 border-[#8be4ff] bg-[#0f1535] min-w-[160px]">
                        <button
                          onClick={() => {
                            onDisconnectWallet();
                            setShowWalletMenu(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-[#ff4d4d]/10 transition-colors flex items-center gap-2"
                        >
                          <LogOut className="w-4 h-4 text-[#ff4d4d]" />
                          <span
                            className="text-[#ff4d4d]"
                            style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}
                          >
                            Disconnect
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-[#8be4ff] opacity-30 blur" />
                <button
                  onClick={onConnectWallet}
                  className="relative border-3 border-[#8be4ff] bg-[#0f1535] px-6 py-3 hover:bg-[#8be4ff] hover:text-[#0a0e27] transition-all shadow-[0_0_20px_rgba(139,228,255,0.5)]"
                >
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    <span className="uppercase font-bold" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                      CONNECT
                    </span>
                  </div>
                </button>
              </div>
            )}

            <button className="border-2 border-[#4db8ff] bg-[#0f1535] p-3 hover:bg-[#4db8ff]/10 transition-colors">
              <Settings className="w-5 h-5 text-[#8be4ff]" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
