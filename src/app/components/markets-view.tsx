import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Star, Flame, Lock, TrendingUp, TrendingDown, Target, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/app/components/shell/page-header';
import { cn } from '@/app/components/ui/utils';
import { ErrorState, EmptyState } from '@/app/components/ui/data-states';
import { useMarketTokens, useMarketStats, useAvaxPrice, type TokenData } from '@/app/hooks/useTokenPrices';
import { formatUSD } from '@/app/utils/formatters';
import { type TokenCategory } from '@/app/data/markets-tokens';
import { SwapModal } from '@/app/components/swap-modal';

// Loading skeleton component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />;
}

// 7d trend rendered as compact ice-colored bars (matches the design language)
function MiniBars({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) {
    return <div className="text-ice-faint font-mono text-center text-[13px]">–</div>;
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
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Category tabs mapping
const CATEGORY_TABS: TokenCategory[] = ['majors', 'defi', 'gaming', 'stablecoins', 'meme', 'liquid-staking', 'rwa'];

// Favorites persist per browser. Storage can be unavailable (private mode, blocked), so
// every access is guarded and the page works without it.
const FAVORITES_KEY = 'icicle-favorites';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // ignore — favorites are a convenience, not state we must keep
  }
}

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
      <span className="text-ice-muted text-[13px]">
        {label}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className="font-semibold tabular-nums text-ice-text leading-none tracking-[-0.01em] text-[22px]">
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
            <span className={cn('tabular-nums font-medium', count ? 'text-ice-up' : deltaUp ? 'text-ice-up' : 'text-ice-down', 'text-[12px]')}>
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-8">
      <StatCard
        label="Ecosystem market cap"
        value={formatUSD(totalMarketCap)}
        delta={fmtPct(avgChange24h)}
        deltaUp={avgChange24h >= 0}
      />
      <StatCard label="Ecosystem volume 24h" value={formatUSD(total24hVolume)} />
      <StatCard
        label="AVAX price"
        value={avax.price > 0 ? `$${avax.price.toFixed(2)}` : '—'}
        delta={avax.price > 0 ? fmtPct(avax.change24h) : undefined}
        deltaUp={avax.change24h >= 0}
      />
      <StatCard label="Tracked assets" value={String(tokenCount)} delta="live" count />
    </div>
  );
}

export function MarketsView() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('trending');
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  useEffect(() => { saveFavorites(favorites); }, [favorites]);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<{ symbol: string; address?: string } | null>(null);

  // Fetch data from curated list
  const { tokens, loading: tokensLoading, error: tokensError, refetch: refetchTokens } = useMarketTokens();

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
      <PageHeader
        title="Markets"
        subtitle="Prices, charts, and swaps for Avalanche tokens"
        trailing={
          <Link
            to="/predict"
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-ice-line/[0.07] text-ice-muted hover:text-ice-text transition-colors text-[14px]"
          >
            <Target className="w-4 h-4" />
            <span className="hidden sm:inline">Prediction markets</span>
            <span className="sm:hidden">Predict</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }
      />
      {!tokensError && <StatsStrip tokens={tokens} />}

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
                    : 'bg-ice-surface border-ice-line/15 text-ice-muted hover:text-ice-text', 'text-[14px]')}
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
                      <div className="text-ice-text font-medium text-[15px]">
                        {token.name}
                      </div>
                      <div className="text-ice-muted text-[13px]">
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
                    <div className="text-ice-text font-mono font-medium text-[16px]">
                      ${formatTokenPrice(token.price)}
                    </div>
                    <div
                      className={cn('font-mono font-medium', isPositive ? 'text-ice-up' : 'text-ice-down', 'text-[13px]')}
                    >
                      {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
                    </div>
                  </div>
                  {token.restricted ? (
                    <div className="flex items-center gap-1.5 px-3 py-2.5 bg-yellow-500/10 rounded-lg min-h-[44px]">
                      <Lock className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-yellow-500 font-medium text-[12px]">
                        Institutional
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleBuyClick(token); }}
                      className="px-4 py-2.5 bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 rounded-lg font-semibold transition-colors min-h-[44px] text-[14px]"
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
                              <div className="text-ice-text font-semibold text-[14px]">
                                {token.symbol}
                              </div>
                              <div className="text-ice-muted truncate max-w-[160px] text-[12px]">
                                {token.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Price */}
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-ice-text text-[14px]">
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
                            <span className={cn('font-mono', isPositive ? 'text-ice-up' : 'text-ice-down', 'text-[13px]')}>
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
                          <span className="font-mono text-ice-muted text-[13px]">{formatUSD(token.marketCap)}</span>
                        </td>

                        {/* Volume 24h */}
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-ice-muted text-[13px]">{formatUSD(token.volume24h)}</span>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-4 text-right">
                          {token.restricted ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 rounded-lg">
                              <Lock className="w-3.5 h-3.5 text-yellow-500" />
                              <span className="text-yellow-500 font-medium text-[12px]">
                                Institutional
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleBuyClick(token); }}
                              className="px-4 py-2 bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 rounded-lg font-semibold transition-colors text-[13px]"
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
