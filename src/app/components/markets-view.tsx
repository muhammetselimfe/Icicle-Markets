import { useState } from 'react';
import { Star, Flame, AlertCircle } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useMarketTokens, type TokenData } from '@/app/hooks/useTokenPrices';
import { formatUSD } from '@/app/utils/formatters';
import { type TokenCategory } from '@/app/data/markets-tokens';
import { SwapModal } from '@/app/components/swap-modal';

// Loading skeleton component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />;
}

// Error display component
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-12 text-red-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
      <AlertCircle className="w-5 h-5" />
      {message}
    </div>
  );
}

// Transform sparkline data to chart format
function transformSparkline(prices: number[]): { value: number }[] {
  if (!prices || prices.length === 0) return [];
  const step = Math.max(1, Math.floor(prices.length / 20));
  return prices.filter((_, i) => i % step === 0).map(value => ({ value }));
}

// Category tabs mapping
const CATEGORY_TABS: TokenCategory[] = ['majors', 'defi', 'gaming', 'stablecoins', 'meme', 'liquid-staking', 'rwa'];

interface MarketsViewProps {
  onConnectWallet?: () => void;
}

export function MarketsView({ onConnectWallet }: MarketsViewProps) {
  const [activeTab, setActiveTab] = useState('trending');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<{ symbol: string; address?: string } | null>(null);

  // Fetch data from curated list
  const { tokens, loading: tokensLoading, error: tokensError } = useMarketTokens();

  const tabs = [
    { id: 'favorites', label: '', icon: Star, iconOnly: true },
    { id: 'trending', label: 'Trending', icon: Flame },
    { id: 'majors', label: 'Majors' },
    { id: 'defi', label: 'DeFi' },
    { id: 'gaming', label: 'Gaming' },
    { id: 'stablecoins', label: 'Stablecoins' },
    { id: 'meme', label: 'Meme' },
    { id: 'liquid-staking', label: 'LST' },
    { id: 'rwa', label: 'Commodities' },
  ];

  const toggleFavorite = (id: string) => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(fav => fav !== id) : [...prev, id]
    );
  };

  const handleBuyClick = (token: TokenData) => {
    setSelectedToken({ symbol: token.symbol, address: token.address });
    setSwapModalOpen(true);
  };

  // Filter and sort tokens based on active tab
  const getFilteredTokens = (): TokenData[] => {
    let filtered = [...tokens];

    if (activeTab === 'favorites') {
      filtered = filtered.filter(t => favorites.includes(t.id));
    } else if (activeTab === 'trending') {
      // Keep default order (by market cap)
    } else if (CATEGORY_TABS.includes(activeTab as TokenCategory)) {
      // Filter by category field on each token
      filtered = filtered.filter(t => t.category === activeTab);
    }

    // Always put Avalanche first (unless filtering by category)
    if (activeTab === 'trending' || activeTab === 'favorites') {
      const avaxIndex = filtered.findIndex(t => t.id === 'avalanche-2');
      if (avaxIndex > 0) {
        const [avax] = filtered.splice(avaxIndex, 1);
        filtered.unshift(avax);
      }
    }

    return filtered;
  };

  const filteredTokens = getFilteredTokens();

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Pill-style Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium whitespace-nowrap",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-white"
                )}
                style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {!tab.iconOnly && <span>{tab.label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {tokensError ? (
          <ErrorDisplay message={tokensError} />
        ) : tokensLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/[0.02] p-4 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
                <Skeleton className="w-4 h-4" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-5 w-16 mb-1" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-10 w-16 rounded-lg" />
              </div>
            </div>
          ))
        ) : (
          filteredTokens.map((token) => {
            const isPositive = token.change24h >= 0;
            return (
              <div key={token.id} className="bg-white/[0.02] p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-full overflow-hidden flex items-center justify-center">
                      {token.image ? (
                        <img src={token.image} alt={token.symbol} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-slate-400 text-xs">?</span>
                      )}
                    </div>
                    <div>
                      <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                        {token.name}
                      </div>
                      <div className="text-slate-400" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                        {token.symbol}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleFavorite(token.id)}
                    className="p-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Star
                      className={cn(
                        "w-5 h-5",
                        favorites.includes(token.id)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-slate-500"
                      )}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}>
                      ${token.price < 0.01 ? token.price.toFixed(6) : token.price < 1 ? token.price.toFixed(4) : token.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div
                      className={cn("font-medium", isPositive ? 'text-green-500' : 'text-red-500')}
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
                    >
                      {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuyClick(token)}
                    className="px-4 py-2.5 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg font-medium transition-colors min-h-[44px]"
                    style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                  >
                    Trade
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Token Table */}
      <div className="hidden md:block relative bg-white/[0.02] overflow-hidden rounded-xl">
        <div className="relative overflow-x-auto">
          {tokensError ? (
            <ErrorDisplay message={tokensError} />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="w-12 px-4 py-4"></th>
                  <th className="text-left px-4 py-4 text-slate-400 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>Token</th>
                  <th className="text-left px-4 py-4 text-slate-400 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>Price</th>
                  <th className="text-center px-4 py-4 text-slate-400 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>7D</th>
                  <th className="text-right px-4 py-4 text-slate-400 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>Market Cap</th>
                  <th className="w-24 px-4 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {tokensLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-4"><Skeleton className="h-4 w-4" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-10 w-36" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-10 w-24" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-10 w-24 mx-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-20 ml-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-8 w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : (
                  filteredTokens.map((token) => {
                    const sparklineData = transformSparkline(token.sparkline);
                    const isPositive = token.change24h >= 0;

                    return (
                      <tr
                        key={token.id}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Favorite */}
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleFavorite(token.id)}
                            className="transition-colors"
                          >
                            <Star
                              className={cn(
                                "w-4 h-4",
                                favorites.includes(token.id)
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-slate-500 hover:text-slate-300"
                              )}
                            />
                          </button>
                        </td>

                        {/* Token */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/10 rounded-full overflow-hidden flex items-center justify-center">
                              {token.image ? (
                                <img src={token.image} alt={token.symbol} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-slate-400 text-xs">?</span>
                              )}
                            </div>
                            <div>
                              <div className="text-white font-medium truncate max-w-[140px]" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                                {token.name}
                              </div>
                              <div className="text-slate-400" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                                {token.symbol}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Price + Change */}
                        <td className="px-4 py-4">
                          <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                            ${token.price < 0.01 ? token.price.toFixed(6) : token.price < 1 ? token.price.toFixed(4) : token.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div
                            className={cn("font-medium", isPositive ? 'text-green-500' : 'text-red-500')}
                            style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
                          >
                            {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
                          </div>
                        </td>

                        {/* Chart */}
                        <td className="px-4 py-4">
                          <div className="w-24 h-10 mx-auto">
                            {sparklineData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparklineData}>
                                  <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={isPositive ? "#22c55e" : "#ef4444"}
                                    strokeWidth={1.5}
                                    fill="transparent"
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                                -
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Market Cap */}
                        <td className="px-4 py-4 text-right text-slate-400" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                          {formatUSD(token.marketCap)}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => handleBuyClick(token)}
                            className="px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg font-medium transition-colors"
                            style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                          >
                            Trade
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Swap Modal */}
      <SwapModal
        isOpen={swapModalOpen}
        onClose={() => {
          setSwapModalOpen(false);
          setSelectedToken(null);
        }}
        initialToToken={selectedToken ?? undefined}
        onConnectWallet={onConnectWallet}
      />
    </div>
  );
}
