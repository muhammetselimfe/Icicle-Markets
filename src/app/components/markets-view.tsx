import { useState, useMemo } from 'react';
import { Star, Flame, ChevronDown, AlertCircle } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useMarketTokens, type TokenData } from '@/app/hooks/useTokenPrices';
import { formatUSD } from '@/app/utils/formatters';
import { type TokenCategory } from '@/app/data/markets-tokens';
import { SwapModal } from '@/app/components/swap-modal';

// Loading skeleton component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#4db8ff]/20 ${className}`} />;
}

// Error display component
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
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

// Market Score badge component - retro terminal style
function MarketScoreBadge({ score }: { score: 'A' | 'B' | 'C' }) {
  const colors = {
    A: '#4dff88',
    B: '#4db8ff',
    C: '#ff4d4d',
  };

  const color = colors[score];

  return (
    <div
      className="w-8 h-8 border-2 flex items-center justify-center"
      style={{ borderColor: color, backgroundColor: `${color}15` }}
    >
      <span
        style={{ color, fontFamily: "'VT323', monospace", fontSize: '20px', fontWeight: 'bold' }}
      >
        {score}
      </span>
    </div>
  );
}

// Calculate market score based on market cap and volume
function getMarketScore(marketCap: number, volume24h: number): 'A' | 'B' | 'C' {
  const ratio = volume24h / marketCap;
  if (marketCap > 1000000000 && ratio > 0.05) return 'A';
  if (marketCap > 100000000 && ratio > 0.02) return 'B';
  return 'C';
}

// Category tabs mapping
const CATEGORY_TABS: TokenCategory[] = ['majors', 'defi', 'gaming', 'stablecoins', 'meme', 'liquid-staking', 'rwa'];

export function MarketsView() {
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

  // Calculate total volume
  const totalVolume = useMemo(() => {
    return tokens.reduce((sum, token) => sum + token.volume24h, 0);
  }, [tokens]);

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
    <div className="container mx-auto px-6 py-8">
      {/* Tabs */}
      <div className="flex items-center border-b-2 border-[#4db8ff]/30 mb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 transition-all border-b-2 -mb-[2px] uppercase",
                isActive
                  ? "text-[#8be4ff] border-[#8be4ff]"
                  : "text-[#4db8ff]/60 border-transparent hover:text-[#8be4ff] hover:border-[#8be4ff]/30"
              )}
              style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "w-4 h-4",
                    isActive && tab.id === 'trending' && "text-[#8be4ff] animate-flame"
                  )}
                  style={isActive && tab.id === 'trending' ? {
                    filter: 'drop-shadow(0 0 4px #8be4ff) drop-shadow(0 0 8px #4db8ff)',
                  } : undefined}
                />
              )}
              {!tab.iconOnly && <span>{tab.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Info bar */}
      <div className="flex items-center mb-6">
        <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
          TOTAL VOL: <span className="text-[#8be4ff]">{formatUSD(totalVolume)}</span>
        </div>
      </div>

      {/* Token Table */}
      <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden">
        {/* Accent overlay */}
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5 pointer-events-none" />
        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#8be4ff] to-transparent" />

        <div className="relative overflow-x-auto">
          {tokensError ? (
            <ErrorDisplay message={tokensError} />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-[#4db8ff] bg-[#0a0e27]">
                  <th className="text-left px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}></th>
                  <th className="text-left px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>TOKEN</th>
                  <th className="text-left px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                    PRICE <span className="text-[#4db8ff]/60">/ 24H</span>
                  </th>
                  <th className="text-center px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                    TRENDLINE <span className="text-[#4db8ff]/60">7D</span>
                  </th>
                  <th className="text-right px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                    <div className="flex items-center justify-end gap-1">
                      MARKET CAP
                      <ChevronDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="text-right px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                    <div className="flex items-center justify-end gap-1">
                      VOLUME <span className="text-[#4db8ff]/60">24H</span>
                      <ChevronDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="text-center px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>SCORE</th>
                  <th className="text-center px-4 py-4 text-[#8be4ff] font-normal uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}></th>
                </tr>
              </thead>
              <tbody>
                {tokensLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#4db8ff]/30">
                      <td className="px-4 py-4"><Skeleton className="h-4 w-4" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-10 w-36" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-32" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-10 w-28 mx-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-20 ml-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-20 ml-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-8 w-8 mx-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-8 w-14 mx-auto" /></td>
                    </tr>
                  ))
                ) : (
                  filteredTokens.map((token, index) => {
                    const sparklineData = transformSparkline(token.sparkline);
                    const isPositive = token.change24h >= 0;
                    const marketScore = getMarketScore(token.marketCap, token.volume24h);

                    return (
                      <tr
                        key={token.id}
                        className="border-b border-[#4db8ff]/30 hover:bg-[#8be4ff]/5 transition-colors"
                      >
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleFavorite(token.id)}
                            className="text-[#4db8ff]/40 hover:text-[#ffeb3b] transition-colors"
                          >
                            <Star
                              className={cn(
                                "w-4 h-4",
                                favorites.includes(token.id) && "fill-[#ffeb3b] text-[#ffeb3b]"
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 border-2 border-[#8be4ff] bg-[#0a0e27] flex items-center justify-center overflow-hidden">
                              {token.image ? (
                                <img src={token.image} alt={token.symbol} className="w-8 h-8 object-cover" />
                              ) : (
                                <span className="text-[#4db8ff] text-xs">?</span>
                              )}
                            </div>
                            <div>
                              <div className="text-[#8be4ff] truncate max-w-[140px]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                                {token.name}
                              </div>
                              <div className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                                {token.symbol}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[#8be4ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                              ${token.price < 0.01 ? token.price.toFixed(6) : token.price < 1 ? token.price.toFixed(4) : token.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span
                              style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
                              className={isPositive ? "text-[#4dff88]" : "text-[#ff4d4d]"}
                            >
                              {isPositive ? '+' : ''}{token.change24h.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="w-28 h-10 mx-auto border border-[#4db8ff]/20 bg-[#0a0e27]/50">
                            {sparklineData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparklineData}>
                                  <defs>
                                    <linearGradient id={`gradient-${token.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop
                                        offset="5%"
                                        stopColor={isPositive ? "#4dff88" : "#ff4d4d"}
                                        stopOpacity={0.3}
                                      />
                                      <stop
                                        offset="95%"
                                        stopColor={isPositive ? "#4dff88" : "#ff4d4d"}
                                        stopOpacity={0}
                                      />
                                    </linearGradient>
                                  </defs>
                                  <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={isPositive ? "#4dff88" : "#ff4d4d"}
                                    strokeWidth={2}
                                    fill={`url(#gradient-${token.id})`}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-[#4db8ff]/40" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                                -
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-[#8be4ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                          {formatUSD(token.marketCap)}
                        </td>
                        <td className="px-4 py-4 text-right text-[#8be4ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                          {formatUSD(token.volume24h)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-center">
                            <MarketScoreBadge score={marketScore} />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => handleBuyClick(token)}
                            className="px-4 py-2 border-2 border-[#8be4ff] bg-transparent text-[#8be4ff] hover:bg-[#8be4ff]/10 transition-all uppercase"
                            style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
                          >
                            BUY
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
      />
    </div>
  );
}
