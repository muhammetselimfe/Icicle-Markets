import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Flame, AlertCircle, Lock, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useMarketTokens, type TokenData } from '@/app/hooks/useTokenPrices';
import { formatUSD } from '@/app/utils/formatters';
import { type TokenCategory } from '@/app/data/markets-tokens';
import { SwapModal } from '@/app/components/swap-modal';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { MarketState } from '@/app/types/options';
import { formatTickAsPrice } from '@/app/utils/options';
import { useRedstonePrice } from '@/app/hooks/useRedstonePrice';

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

function useCountdown(targetUnix: number) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetUnix - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const left = Math.max(0, targetUnix - Math.floor(Date.now() / 1000));
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetUnix]);

  if (remaining <= 0) return null;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function OptionsMarketCard({ market: m, onClick }: { market: import('@/app/types/options').MarketDisplay; onClick: () => void }) {
  const { price } = useRedstonePrice(m.feedId);
  const countdown = useCountdown(m.tradingEnd);
  const [logoFailed, setLogoFailed] = useState(false);

  const fmtPrice = m.priceDecimals === 0
    ? `$${Math.round(price).toLocaleString()}`
    : `$${price.toFixed(2)}`;

  return (
    <div
      onClick={onClick}
      className="group relative bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden cursor-pointer transition-all hover:bg-white/[0.06] hover:border-white/10"
    >
      {/* Top accent line */}
      <div className="h-[2px]" style={{ background: `linear-gradient(to right, ${m.accentColor}, transparent)` }} />

      <div className="p-5 space-y-4">
        {/* Header: logo + asset info + live price */}
        <div className="flex items-center gap-3">
          {!m.assetLogo || logoFailed ? (
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {m.assetSymbol.slice(0, 2)}
            </div>
          ) : (
            <img src={m.assetLogo} alt={m.assetSymbol} className="w-10 h-10 rounded-full shrink-0" onError={() => setLogoFailed(true)} />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
              {m.assetSymbol}/USD
            </div>
            <div className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
              {m.assetName}
            </div>
          </div>
          {price > 0 && (
            <div className="text-right">
              <div className="text-white font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
                {fmtPrice}
              </div>
              <div className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px' }}>
                Live
              </div>
            </div>
          )}
        </div>

        {/* Range + countdown row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-300" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              {formatTickAsPrice(m.minTick, m.tickDivisor)} – {formatTickAsPrice(m.maxTick, m.tickDivisor)}
            </span>
          </div>
          {countdown && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                {countdown}
              </span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl transition-colors"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            background: `${m.accentColor}15`,
            color: m.accentColor,
          }}
        >
          <span className="font-medium">Trade Options</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </div>
  );
}

export function MarketsView() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('trending');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<{ symbol: string; address?: string } | null>(null);

  // Fetch data from curated list
  const { tokens, loading: tokensLoading, error: tokensError } = useMarketTokens();

  // Fetch active options markets for trending cards
  const { markets: optionsMarkets, loading: optionsLoading } = useOptionsMarkets();
  const activeOptions = optionsMarkets
    .filter(m => m.state === MarketState.Trading)
    .sort((a, b) => b.marketId - a.marketId)
    .slice(0, 3);

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
      {/* Trending Options Markets */}
      {activeOptions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-white font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
                Trending Options
              </span>
            </div>
            <button
              onClick={() => navigate('/options')}
              className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
            >
              View All
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOptions.map(m => (
              <OptionsMarketCard
                key={m.marketId}
                market={m}
                onClick={() => navigate(`/options/trade/${m.marketId}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton for options */}
      {optionsLoading && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-white font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              Trending Options
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-20 mb-1.5" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      )}

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
                  {token.restricted ? (
                    <div className="flex items-center gap-1.5 px-3 py-2.5 bg-yellow-500/10 rounded-lg min-h-[44px]">
                      <Lock className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-yellow-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '12px' }}>
                        Institutional
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleBuyClick(token)}
                      className="px-4 py-2.5 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg font-medium transition-colors min-h-[44px]"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                    >
                      Trade
                    </button>
                  )}
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
                          {token.restricted ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 rounded-lg">
                              <Lock className="w-3.5 h-3.5 text-yellow-500" />
                              <span className="text-yellow-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '12px' }}>
                                Institutional
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleBuyClick(token)}
                              className="px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg font-medium transition-colors"
                              style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                            >
                              Trade
                            </button>
                          )}
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
      />
    </div>
  );
}
