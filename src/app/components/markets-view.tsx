import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Flame, Lock, TrendingUp, TrendingDown, Target, ArrowRight } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { ErrorState, EmptyState } from '@/app/components/ui/data-states';
import { useMarketTokens, useMarketStats, useAvaxPrice, type TokenData } from '@/app/hooks/useTokenPrices';
import { formatUSD } from '@/app/utils/formatters';
import { type TokenCategory } from '@/app/data/markets-tokens';
import { SwapModal } from '@/app/components/swap-modal';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { MarketState } from '@/app/types/options';
import { OptionMarketCard } from '@/app/components/option-market-card';

// Loading skeleton component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />;
}

// 7d trend rendered as compact ice-colored bars (matches the design language)
function MiniBars({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) {
    return <div className="text-ice-faint font-mono text-center" style={{ fontSize: '13px' }}>–</div>;
  }
  const target = 20;
  const step = Math.max(1, Math.floor(data.length / target));
  const pts = data.filter((_, i) => i % step === 0).slice(-target);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const color = up ? '#4dff99' : '#ff5c7a';
  return (
    <div className="flex items-end justify-center gap-[2px] h-9 w-28 mx-auto">
      {pts.map((v, i) => {
        const r = (v - min) / range;
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{ height: `${4 + r * 26}px`, background: color, opacity: 0.4 + 0.5 * r }}
          />
        );
      })}
    </div>
  );
}

function formatTokenPrice(p: number): string {
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Category tabs mapping
const CATEGORY_TABS: TokenCategory[] = ['majors', 'defi', 'gaming', 'stablecoins', 'meme', 'liquid-staking', 'rwa'];

// ── Stats strip ───────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  delta,
  deltaUp,
  count,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  count?: boolean;
}) {
  return (
    <div className="flex-1 rounded-2xl bg-ice-surface border border-ice-line/15 p-4 lg:p-[18px] flex flex-col gap-2.5">
      <span className="font-mono text-ice-faint uppercase tracking-wide" style={{ fontSize: '10px', letterSpacing: '1px' }}>
        {label}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className="font-mono font-semibold text-ice-text leading-none" style={{ fontSize: '22px' }}>
          {value}
        </span>
        {delta && (
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md',
              count ? 'bg-ice-up/[0.08]' : deltaUp ? 'bg-ice-up/[0.08]' : 'bg-ice-down/[0.08]',
            )}
          >
            {count ? (
              <span className="w-1.5 h-1.5 rounded-full bg-ice-up" />
            ) : deltaUp ? (
              <TrendingUp className="w-3 h-3 text-ice-up" />
            ) : (
              <TrendingDown className="w-3 h-3 text-ice-down" />
            )}
            <span className={cn('font-mono', count ? 'text-ice-up' : deltaUp ? 'text-ice-up' : 'text-ice-down')} style={{ fontSize: '12px' }}>
              {delta}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsStrip({ tokens }: { tokens: TokenData[] }) {
  const { totalMarketCap, total24hVolume, avgChange24h, tokenCount } = useMarketStats(tokens);
  const avax = useAvaxPrice();

  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  return (
    <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 mb-8">
      <StatCard
        label="Avalanche Market Cap"
        value={formatUSD(totalMarketCap)}
        delta={fmtPct(avgChange24h)}
        deltaUp={avgChange24h >= 0}
      />
      <StatCard label="24h Volume" value={formatUSD(total24hVolume)} />
      <StatCard
        label="AVAX Price"
        value={avax.price > 0 ? `$${avax.price.toFixed(2)}` : '—'}
        delta={avax.price > 0 ? fmtPct(avax.change24h) : undefined}
        deltaUp={avax.change24h >= 0}
      />
      <StatCard label="Tracked Assets" value={String(tokenCount)} delta="live" count />
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
  const { tokens, loading: tokensLoading, error: tokensError, refetch: refetchTokens } = useMarketTokens();

  // Fetch active options markets for trending cards
  const { markets: optionsMarkets, loading: optionsLoading } = useOptionsMarkets();
  const liveOptions = optionsMarkets.filter(m => m.state === MarketState.Trading);
  // Prefer live markets; fall back to the most recent so the section always shows.
  const featuredOptions = (liveOptions.length > 0 ? liveOptions : [...optionsMarkets])
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
  const showEmpty = !tokensLoading && !tokensError && filteredTokens.length === 0;
  const emptyTitle = activeTab === 'favorites' ? 'No favorites yet' : 'No tokens in this category';
  const emptyMessage = activeTab === 'favorites'
    ? 'Tap the star on any token to pin it here.'
    : 'Try another category, or check back once data loads.';

  const tableColHeader = 'px-4 py-3 font-mono uppercase text-ice-faint';
  const colHeadStyle = { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.8px' } as const;

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Market overview stats */}
      {!tokensError && <StatsStrip tokens={tokens} />}

      {/* Prediction Markets Section */}
      {(featuredOptions.length > 0 || optionsLoading) && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-[9px] bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
                <Target className="w-[18px] h-[18px] text-ice-accent" />
              </div>
              <div className="min-w-0">
                <div className="text-ice-text font-bold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px' }}>
                  Prediction Markets
                </div>
                <p className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                  Bet on where asset prices will land. Pick a range, trade options, win if you're right.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/options')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-ice-surface border border-ice-line/15 text-ice-muted hover:text-ice-text hover:border-ice-line/30 transition-colors"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
            >
              View all markets
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {optionsLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-ice-surface border border-ice-line/15 rounded-2xl p-[18px] space-y-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-9 h-9 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-20 mb-1.5" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-[68px] w-full" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                ))
              : featuredOptions.map(m => (
                  <OptionMarketCard
                    key={m.marketId}
                    market={m}
                    onClick={() => navigate(`/options/trade/${m.marketId}`)}
                  />
                ))}
          </div>
        </div>
      )}

      {/* Spot Trading Section */}
      <div className="flex items-center gap-3 mb-4 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-[9px] bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
          <TrendingUp className="w-[18px] h-[18px] text-ice-accent" />
        </div>
        <div className="min-w-0">
          <div className="text-ice-text font-bold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px' }}>
            Spot Trading
          </div>
          <p className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
            Swap Avalanche tokens instantly. Browse prices, charts, and trade directly.
          </p>
        </div>
      </div>

      {/* Pill-style Tabs */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-[9px] transition-all font-medium whitespace-nowrap border',
                  isActive
                    ? 'bg-ice-accent/10 border-ice-line/40 text-ice-accent'
                    : 'bg-ice-surface border-ice-line/15 text-ice-muted hover:text-ice-text',
                )}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
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
          <ErrorState message={tokensError} onRetry={refetchTokens} />
        ) : showEmpty ? (
          <EmptyState title={emptyTitle} message={emptyMessage} />
        ) : tokensLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-ice-surface border border-ice-line/15 p-4 rounded-xl">
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
              <div key={token.id} onClick={() => navigate(`/token/${token.id}`)} className="bg-ice-surface border border-ice-line/15 p-4 rounded-xl cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-full overflow-hidden flex items-center justify-center">
                      {token.image ? (
                        <img src={token.image} alt={token.symbol} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-ice-muted text-xs">?</span>
                      )}
                    </div>
                    <div>
                      <div className="text-ice-text font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
                        {token.name}
                      </div>
                      <div className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                        {token.symbol}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(token.id); }}
                    className="p-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Star
                      className={cn(
                        'w-5 h-5',
                        favorites.includes(token.id) ? 'fill-yellow-400 text-yellow-400' : 'text-ice-faint',
                      )}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-ice-text font-mono font-medium" style={{ fontSize: '16px' }}>
                      ${formatTokenPrice(token.price)}
                    </div>
                    <div
                      className={cn('font-mono font-medium', isPositive ? 'text-ice-up' : 'text-ice-down')}
                      style={{ fontSize: '13px' }}
                    >
                      {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
                    </div>
                  </div>
                  {token.restricted ? (
                    <div className="flex items-center gap-1.5 px-3 py-2.5 bg-yellow-500/10 rounded-lg min-h-[44px]">
                      <Lock className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-yellow-500 font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                        Institutional
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleBuyClick(token); }}
                      className="px-4 py-2.5 bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 rounded-lg font-semibold transition-colors min-h-[44px]"
                      style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
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
      {tokensError ? (
        <div className="hidden md:block">
          <ErrorState message={tokensError} onRetry={refetchTokens} />
        </div>
      ) : showEmpty ? (
        <div className="hidden md:block">
          <EmptyState title={emptyTitle} message={emptyMessage} />
        </div>
      ) : (
        <div className="hidden md:block relative bg-ice-surface border border-ice-line/15 overflow-hidden rounded-2xl">
          <div className="relative overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-ice-surface2/40 border-b border-ice-line/15">
                  <th className="w-12 px-4 py-3"></th>
                  <th className={cn(tableColHeader, 'text-left')} style={colHeadStyle}>Token</th>
                  <th className={cn(tableColHeader, 'text-right')} style={colHeadStyle}>Price</th>
                  <th className={cn(tableColHeader, 'text-right')} style={colHeadStyle}>24h %</th>
                  <th className={cn(tableColHeader, 'text-center')} style={colHeadStyle}>7d Trend</th>
                  <th className={cn(tableColHeader, 'text-right')} style={colHeadStyle}>Market Cap</th>
                  <th className={cn(tableColHeader, 'text-right')} style={colHeadStyle}>Volume 24h</th>
                  <th className="w-28 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tokensLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-ice-line/[0.06]">
                      <td className="px-4 py-4"><Skeleton className="h-4 w-4" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-10 w-36" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-20 ml-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-14 ml-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-8 w-24 mx-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-20 ml-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-20 ml-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-8 w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : (
                  filteredTokens.map((token) => {
                    const isPositive = token.change24h >= 0;

                    return (
                      <tr
                        key={token.id}
                        onClick={() => navigate(`/token/${token.id}`)}
                        className="border-b border-ice-line/[0.06] last:border-0 hover:bg-ice-line/[0.03] transition-colors cursor-pointer"
                      >
                        {/* Favorite */}
                        <td className="px-4 py-4">
                          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(token.id); }} className="transition-colors">
                            <Star
                              className={cn(
                                'w-4 h-4',
                                favorites.includes(token.id)
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-ice-faint hover:text-ice-muted',
                              )}
                            />
                          </button>
                        </td>

                        {/* Token */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-white/10 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                              {token.image ? (
                                <img src={token.image} alt={token.symbol} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-ice-muted text-xs">?</span>
                              )}
                            </div>
                            <div>
                              <div className="text-ice-text font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                                {token.symbol}
                              </div>
                              <div className="text-ice-muted truncate max-w-[160px]" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                                {token.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Price */}
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-ice-text" style={{ fontSize: '14px' }}>
                            ${formatTokenPrice(token.price)}
                          </span>
                        </td>

                        {/* 24h % */}
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {isPositive ? (
                              <TrendingUp className="w-3.5 h-3.5 text-ice-up" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5 text-ice-down" />
                            )}
                            <span className={cn('font-mono', isPositive ? 'text-ice-up' : 'text-ice-down')} style={{ fontSize: '13px' }}>
                              {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
                            </span>
                          </div>
                        </td>

                        {/* 7d trend */}
                        <td className="px-4 py-4">
                          <MiniBars data={token.sparkline} up={isPositive} />
                        </td>

                        {/* Market Cap */}
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-ice-muted" style={{ fontSize: '13px' }}>{formatUSD(token.marketCap)}</span>
                        </td>

                        {/* Volume 24h */}
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-ice-muted" style={{ fontSize: '13px' }}>{formatUSD(token.volume24h)}</span>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-4 text-right">
                          {token.restricted ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 rounded-lg">
                              <Lock className="w-3.5 h-3.5 text-yellow-500" />
                              <span className="text-yellow-500 font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                                Institutional
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleBuyClick(token); }}
                              className="px-4 py-2 bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 rounded-lg font-semibold transition-colors"
                              style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
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
          </div>
        </div>
      )}

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
