import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Wallet, Settings, ChevronDown, LogOut, Loader2 } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
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
          try {
            await api.getTransaction(query);
            navigate(`/tx/${query}`);
            setSearchQuery('');
          } catch {
            setSearchError('Transaction not found');
          }
          break;

        case 'address':
          navigate(`/address/${query}`);
          setSearchQuery('');
          break;

        case 'block':
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
    if (searchError) {
      setSearchError(null);
    }
  };

  return (
    <header className="border-b border-white/10 bg-[#0f1535] sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-8">
          {/* Logo */}
          <div className="flex items-center">
            <img
              src={BRAND.logos.main}
              alt={BRAND.name}
              className="h-16 cursor-pointer"
              onClick={() => navigate('/')}
            />
          </div>

          {/* Search */}
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <div className={cn(
                "relative bg-white/5 rounded-xl",
                searchError && "ring-1 ring-red-500"
              )}>
                {searching ? (
                  <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                ) : (
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                )}
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search tx hash, address, block..."
                  className="pl-11 pr-4 py-3 border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                  disabled={searching}
                />
              </div>
              {searchError && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
                >
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
                <div className="bg-white/5 px-3 py-2 flex items-center gap-2 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span
                    className="text-slate-400"
                    style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                  >
                    Avalanche
                  </span>
                </div>

                {/* Wallet Address with Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowWalletMenu(!showWalletMenu)}
                    className="bg-white/5 px-4 py-2 hover:bg-white/10 transition-colors rounded-lg flex items-center gap-2"
                  >
                    <Wallet className="w-4 h-4 text-slate-400" />
                    <span
                      className="text-white font-medium"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>

                  {showWalletMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowWalletMenu(false)}
                      />
                      <div className="absolute top-full right-0 mt-2 z-50 border border-white/10 bg-[#0f1535] min-w-[160px] rounded-xl overflow-hidden">
                        <button
                          onClick={() => {
                            onDisconnectWallet();
                            setShowWalletMenu(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors flex items-center gap-2"
                        >
                          <LogOut className="w-4 h-4 text-red-500" />
                          <span
                            className="text-red-500"
                            style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
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
              <button
                onClick={onConnectWallet}
                className="bg-white/10 px-5 py-2.5 hover:bg-white/15 transition-all rounded-lg flex items-center gap-2"
              >
                <Wallet className="w-4 h-4 text-white" />
                <span
                  className="text-white font-medium"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                >
                  Connect Wallet
                </span>
              </button>
            )}

            <button className="bg-white/5 p-2.5 hover:bg-white/10 transition-colors rounded-lg text-slate-400 hover:text-white">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
