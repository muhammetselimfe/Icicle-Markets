import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useChainId, useDisconnect } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { Search, ChevronDown, LogOut, Loader2, Menu, X, Copy, Check, Wallet, CircleUserRound, Network, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/app/components/ui/utils';
import { Input } from '@/app/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/app/components/ui/dropdown-menu';
import { BRAND } from '@/app/constants/brand';
import { api } from '@/app/services/api';
import { CHAIN_IDS } from '@/app/config/wagmi';

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

// Deterministic flake set (computed once) so positions don't jump on re-render.
const SNOWFLAKES = Array.from({ length: 16 }).map((_, i) => ({
  left: (i * 6.27 + 3) % 100,
  delay: Number(((i * 0.53) % 6).toFixed(2)),
  duration: 6 + (i % 5),
  size: i % 4 === 0 ? 3 : 2,
}));

export function Header() {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  const currentChainId = useChainId();
  const { address, isConnected } = useAccount();
  const { logout, authenticated } = usePrivy();
  const { login } = useLogin();
  const { disconnect } = useDisconnect();

  const handleLogin = async () => {
    if (authenticated) {
      // Clear stale Privy session before re-login
      await logout();
    }
    login();
  };

  const handleDisconnect = async () => {
    disconnect();
    await logout();
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const isFuji = currentChainId === CHAIN_IDS.FUJI;
  const networkLabel = isFuji ? 'Testnet' : 'Avalanche';
  const networkDotColor = isFuji ? 'bg-yellow-500' : 'bg-green-500';

  const handleCopyAddress = useCallback(() => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [address]);

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
    <header className="relative overflow-hidden border-b border-ice-line/15 bg-ice-surface sticky top-0 z-50">
      {/* Snowfall — contained to the header */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {SNOWFLAKES.map((s, i) => (
          <span
            key={i}
            className="absolute top-0 rounded-full"
            style={{
              left: `${s.left}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              background: 'var(--snow)',
              animation: `icicle-snow ${s.duration}s linear ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`@keyframes icicle-snow { 0% { transform: translateY(-6px); opacity: 0; } 20% { opacity: 0.6; } 100% { transform: translateY(96px); opacity: 0; } }`}</style>
      <div className="relative z-10 container mx-auto px-4 md:px-6 py-3 md:py-4">
        {/* Mobile layout */}
        <div className="flex items-center justify-between md:hidden">
          <img
            src={BRAND.logos.main}
            alt={BRAND.name}
            className="h-10 cursor-pointer"
            onClick={() => navigate('/')}
          />
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 bg-ice-surface2 rounded-lg text-slate-400 hover:text-white hover:bg-ice-line/[0.08] transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Desktop layout */}
        <div className="hidden md:flex items-center justify-between gap-4 lg:gap-8">
          {/* Logo */}
          <div className="flex items-center">
            <img
              src={BRAND.logos.main}
              alt={BRAND.name}
              className="h-12 lg:h-16 cursor-pointer"
              onClick={() => navigate('/')}
            />
          </div>

          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <div className={cn(
                "relative bg-ice-surface border border-ice-line/15 rounded-xl",
                searchError && "ring-1 ring-red-500"
              )}>
                {searching ? (
                  <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 animate-spin" />
                ) : (
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                )}
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search for transaction, address, block..."
                  className="pl-12 pr-4 py-4 border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}
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
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-xl bg-ice-surface border border-ice-line/15 hover:border-ice-line/30 transition-colors flex items-center justify-center"
              title="Toggle theme"
              aria-label="Toggle light/dark theme"
            >
              {resolvedTheme === 'dark' ? <Sun className="w-5 h-5 text-ice-muted" /> : <Moon className="w-5 h-5 text-ice-muted" />}
            </button>
            <button
              onClick={() => navigate('/explorer')}
              className="w-10 h-10 rounded-xl bg-ice-surface border border-ice-line/15 hover:border-ice-line/30 transition-colors flex items-center justify-center"
              title="Explorer"
            >
              <Network className="w-5 h-5 text-ice-muted" />
            </button>
            {isConnected ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="relative w-10 h-10 rounded-full bg-ice-line/[0.08] hover:bg-ice-line/[0.1] transition-colors flex items-center justify-center outline-none">
                    <CircleUserRound className="w-5 h-5 text-slate-300" />
                    <div className={cn("absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-ice-surface", networkDotColor)} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px] bg-ice-surface border-ice-line/15">
                  <div className="px-3 py-2 border-b border-ice-line/15">
                    <p className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </p>
                    <p className="text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '12px' }}>
                      {networkLabel}
                    </p>
                  </div>
                  <DropdownMenuItem onClick={() => navigate('/portfolio')} className="flex items-center gap-2 text-slate-200 focus:text-white">
                    <Wallet className="w-4 h-4 text-slate-400" />
                    <span>Portfolio</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyAddress} className="flex items-center gap-2 text-slate-200 focus:text-white">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                    <span>{copied ? 'Copied!' : 'Copy Address'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDisconnect} className="flex items-center gap-2 text-red-500 focus:text-red-500">
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                onClick={() => handleLogin()}
                className="px-5 py-2.5 rounded-xl flex items-center gap-2 transition-transform hover:-translate-y-px"
                style={{ background: 'linear-gradient(180deg, #8be4ff 0%, #4db8ff 100%)', boxShadow: '0 2px 16px rgba(139,228,255,0.3)' }}
              >
                <span className="font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#06223a' }}>
                  Sign In
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-72 bg-ice-surface border-l border-ice-line/15 p-6 flex flex-col">
            {/* Close Button */}
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Mobile Search */}
            <div className="mb-6">
              <div className={cn(
                "relative bg-ice-surface2 rounded-xl",
                searchError && "ring-1 ring-red-500"
              )}>
                {searching ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                )}
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    handleKeyDown(e);
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      setMobileMenuOpen(false);
                    }
                  }}
                  placeholder="Search..."
                  className="pl-10 pr-4 py-3 border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                  disabled={searching}
                />
              </div>
              {searchError && (
                <div
                  className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
                >
                  {searchError}
                </div>
              )}
            </div>

            {/* Wallet Section */}
            <div className="flex-1">
              {isConnected ? (
                <div className="space-y-3">
                  {/* Address Display */}
                  <div className="bg-ice-surface2 px-4 py-3 rounded-lg flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", networkDotColor)} />
                    <span
                      className="text-white font-medium"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                  </div>

                  {/* Portfolio */}
                  <button
                    onClick={() => {
                      navigate('/portfolio');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 bg-ice-surface2 rounded-lg flex items-center gap-2 hover:bg-ice-line/[0.08] transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-slate-400" />
                    <span
                      className="text-slate-300"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      Portfolio
                    </span>
                  </button>

                  {/* Copy Address */}
                  <button
                    onClick={handleCopyAddress}
                    className="w-full px-4 py-3 bg-ice-surface2 rounded-lg flex items-center gap-2 hover:bg-ice-line/[0.08] transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                    <span
                      className="text-slate-300"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      {copied ? 'Copied!' : 'Copy Address'}
                    </span>
                  </button>

                  {/* Explorer */}
                  <button
                    onClick={() => {
                      navigate('/explorer');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 bg-ice-surface2 rounded-lg flex items-center gap-2 hover:bg-ice-line/[0.08] transition-colors"
                  >
                    <Network className="w-4 h-4 text-slate-400" />
                    <span
                      className="text-slate-300"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      Explorer
                    </span>
                  </button>

                  {/* Sign Out */}
                  <button
                    onClick={async () => {
                      await handleDisconnect();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 bg-red-500/10 rounded-lg flex items-center gap-2 hover:bg-red-500/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span
                      className="text-red-500"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      Sign Out
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      handleLogin();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-ice-line/[0.08] px-5 py-3 hover:bg-ice-line/[0.1] transition-all rounded-lg flex items-center justify-center gap-2"
                  >
                    <span
                      className="text-white font-medium"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      Sign In
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('/explorer');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 bg-ice-surface2 rounded-lg flex items-center gap-2 hover:bg-ice-line/[0.08] transition-colors"
                  >
                    <Network className="w-4 h-4 text-slate-400" />
                    <span
                      className="text-slate-300"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      Explorer
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
