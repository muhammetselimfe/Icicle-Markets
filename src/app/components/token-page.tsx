import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, ExternalLink, Lock, Globe, Twitter, Github, MessageCircle, ChevronDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/app/components/ui/utils';
import { ErrorState } from '@/app/components/ui/data-states';
import { SwapModal } from '@/app/components/swap-modal';
import { useTokenDetail, useTokenChart, useTokenInfo, useTokenPools, useTokenVariants, type TokenDetail } from '@/app/hooks/useTokenPrices';
import type { CoinMarketData } from '@/app/services/coingecko';
import { formatUSD } from '@/app/utils/formatters';

// Asset families: a base token and its on-chain representations (wrapped / liquid-staking).
type VariantTag = 'Native' | 'Wrapped' | 'Yield' | 'Bridged';
const VARIANT_FAMILIES: { label: string; members: { id: string; tag: VariantTag }[] }[] = [
  { label: 'Avalanche', members: [
    { id: 'avalanche-2', tag: 'Native' },
    { id: 'wrapped-avax', tag: 'Wrapped' },
    { id: 'benqi-liquid-staked-avax', tag: 'Yield' },
    { id: 'gogopool-ggavax', tag: 'Yield' },
  ] },
  { label: 'Bitcoin', members: [
    { id: 'bitcoin-avalanche-bridged-btc-b', tag: 'Bridged' },
    { id: 'wrapped-bitcoin', tag: 'Bridged' },
  ] },
];
const TAG_STYLE: Record<VariantTag, string> = {
  Native: 'bg-ice-accent/10 text-ice-accent border-ice-line/30',
  Wrapped: 'bg-ice-accent/10 text-ice-accent border-ice-line/30',
  Yield: 'bg-ice-up/10 text-ice-up border-ice-up/20',
  Bridged: 'bg-ice-accent2/10 text-ice-accent2 border-ice-line/30',
};
function findFamily(id: string) {
  return VARIANT_FAMILIES.find((f) => f.members.some((m) => m.id === id));
}

const FONT = { fontFamily: 'Inter, sans-serif' } as const;

const TIMEFRAMES = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
] as const;

function fmtPrice(p?: number | null): string {
  if (p == null) return '—';
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompact(n?: number | null): string {
  if (n == null || n === 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-ice-line/[0.08] rounded ${className}`} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-ice-text font-bold mb-3" style={{ ...FONT, fontSize: '16px' }}>{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, subUp, valueClass }: { label: string; value: string; sub?: string; subUp?: boolean; valueClass?: string }) {
  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-4 flex flex-col gap-1.5">
      <span className="font-mono uppercase text-ice-faint" style={{ fontSize: '10px', letterSpacing: '0.8px' }}>{label}</span>
      <span className={cn('font-mono font-semibold', valueClass ?? 'text-ice-text')} style={{ fontSize: '16px' }}>{value}</span>
      {sub && (
        <span className={cn('font-mono', subUp === undefined ? 'text-ice-faint' : subUp ? 'text-ice-up' : 'text-ice-down')} style={{ fontSize: '11px' }}>{sub}</span>
      )}
    </div>
  );
}

function PriceChart({ id }: { id: string }) {
  const [days, setDays] = useState<number>(7);
  const { data, loading } = useTokenChart(id, days);
  const up = data.length > 1 ? data[data.length - 1].price >= data[0].price : true;
  const color = up ? 'var(--ice-up)' : 'var(--ice-down)';

  const tickFmt = (t: number) => {
    const d = new Date(t);
    if (days <= 1) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    if (days <= 90) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  };

  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-ice-text font-semibold" style={{ ...FONT, fontSize: '15px' }}>Price</span>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.days}
              onClick={() => setDays(tf.days)}
              className={cn('px-2.5 py-1 rounded-lg transition-colors font-medium', days === tf.days ? 'bg-ice-accent/10 text-ice-accent border border-ice-line/30' : 'text-ice-muted hover:text-ice-text border border-transparent')}
              style={{ ...FONT, fontSize: '12px' }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[300px]">
        {loading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-ice-faint" style={{ ...FONT, fontSize: '13px' }}>No chart data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tokenArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tickFormatter={tickFmt} tick={{ fontSize: 10, fill: 'var(--ice-faint)', fontFamily: 'var(--font-mono)' }} minTickGap={40} axisLine={false} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tickFormatter={(v) => fmtPrice(v)} tick={{ fontSize: 10, fill: 'var(--ice-faint)', fontFamily: 'var(--font-mono)' }} width={64} axisLine={false} tickLine={false} orientation="right" />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--ice-line)', borderRadius: '10px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#e2e8f0' }}
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => [fmtPrice(v), 'Price']}
              />
              <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#tokenArea)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function TokenLogo({ token }: { token: TokenDetail }) {
  const [failed, setFailed] = useState(false);
  if (!token.image || failed) {
    return <div className="w-12 h-12 rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-text font-bold shrink-0">{token.symbol.slice(0, 2)}</div>;
  }
  return <img src={token.image} alt={token.symbol} className="w-12 h-12 rounded-full shrink-0" onError={() => setFailed(true)} />;
}

function About({ id, name }: { id: string; name: string }) {
  const { info, loading } = useTokenInfo(id);
  const [expanded, setExpanded] = useState(false);
  const text = stripHtml(info?.description?.en);

  return (
    <Section title={`About ${name}`}>
      <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-4">
        {loading ? (
          <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /></div>
        ) : !text ? (
          <p className="text-ice-faint" style={{ ...FONT, fontSize: '13px' }}>No description available.</p>
        ) : (
          <>
            <p className={cn('text-ice-muted leading-relaxed', !expanded && 'line-clamp-6')} style={{ ...FONT, fontSize: '13px' }}>{text}</p>
            {text.length > 280 && (
              <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 mt-2 text-ice-accent" style={{ ...FONT, fontSize: '13px' }}>
                {expanded ? 'Read less' : 'Read more'}
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
              </button>
            )}
            <Links info={info} />
          </>
        )}
      </div>
    </Section>
  );
}

function Links({ info }: { info: ReturnType<typeof useTokenInfo>['info'] }) {
  if (!info) return null;
  const links: { label: string; href: string; icon: React.ReactNode }[] = [];
  const home = info.links.homepage?.find(Boolean);
  if (home) links.push({ label: 'Website', href: home, icon: <Globe className="w-3.5 h-3.5" /> });
  const explorer = info.links.blockchain_site?.find(Boolean);
  if (explorer) links.push({ label: 'Explorer', href: explorer, icon: <ExternalLink className="w-3.5 h-3.5" /> });
  if (info.links.twitter_screen_name) links.push({ label: 'X', href: `https://x.com/${info.links.twitter_screen_name}`, icon: <Twitter className="w-3.5 h-3.5" /> });
  if (info.links.subreddit_url) links.push({ label: 'Reddit', href: info.links.subreddit_url, icon: <MessageCircle className="w-3.5 h-3.5" /> });
  const gh = info.links.repos_url?.github?.find(Boolean);
  if (gh) links.push({ label: 'GitHub', href: gh, icon: <Github className="w-3.5 h-3.5" /> });
  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-ice-line/15">
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ice-surface2 border border-ice-line/15 text-ice-muted hover:text-ice-text transition-colors"
          style={{ ...FONT, fontSize: '12px' }}>
          {l.icon}{l.label}
        </a>
      ))}
    </div>
  );
}

function truncAddr(a: string): string {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
}

function MarketsTable({ address }: { address?: string }) {
  const { pools, loading } = useTokenPools(address);
  if (!address) return null;
  if (!loading && pools.length === 0) return null;
  const top = pools.slice(0, 10);
  const cols = ['Pair', 'Liquidity', '24h Vol', '24h Trades', '24h Wallets'];

  return (
    <Section title="On-Chain Markets">
      <div className="rounded-2xl bg-ice-surface border border-ice-line/15 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-ice-surface2/40 border-b border-ice-line/15">
                {cols.map((h, i) => (
                  <th key={i} className={cn('px-4 py-3 font-mono uppercase text-ice-faint whitespace-nowrap', i === 0 ? 'text-left' : 'text-right')} style={{ fontSize: '10px', letterSpacing: '0.8px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-ice-line/[0.06]"><td className="px-4 py-3" colSpan={5}><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : (
                top.map((p, i) => (
                  <tr key={i} className="border-b border-ice-line/[0.06] last:border-0 hover:bg-ice-line/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-ice-text font-semibold whitespace-nowrap" style={{ ...FONT, fontSize: '13px' }}>{p.name}</span>
                        <a href={`https://www.geckoterminal.com/avax/pools/${p.address}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ice-faint hover:text-ice-muted font-mono w-fit" style={{ fontSize: '11px' }}>
                          {p.dex ? p.dex.replace(/-/g, ' ') : truncAddr(p.address)} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-ice-text font-mono whitespace-nowrap" style={{ fontSize: '13px' }}>{formatUSD(p.liquidityUsd)}</td>
                    <td className="px-4 py-3 text-right text-ice-muted font-mono whitespace-nowrap" style={{ fontSize: '13px' }}>{formatUSD(p.volume24hUsd)}</td>
                    <td className="px-4 py-3 text-right text-ice-muted font-mono whitespace-nowrap" style={{ fontSize: '13px' }}>{p.trades24h.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-ice-muted font-mono whitespace-nowrap" style={{ fontSize: '13px' }}>{p.wallets24h.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function VariantCard({ coin, tag, onClick }: { coin: CoinMarketData; tag: VariantTag; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button onClick={onClick} className="text-left rounded-2xl bg-ice-surface border border-ice-line/15 p-4 hover:border-ice-line/40 hover:bg-ice-surface2 transition-all">
      <div className="flex items-center gap-2.5 mb-3">
        {coin.image && !failed ? (
          <img src={coin.image} alt={coin.symbol} className="w-8 h-8 rounded-full" onError={() => setFailed(true)} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-text text-xs font-bold">{coin.symbol.slice(0, 2).toUpperCase()}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-ice-text font-semibold truncate" style={{ ...FONT, fontSize: '13px' }}>{coin.name}</div>
          <div className="font-mono text-ice-faint" style={{ fontSize: '11px' }}>{coin.symbol.toUpperCase()}</div>
        </div>
      </div>
      <span className={cn('inline-block px-2 py-0.5 rounded-md border mb-3 font-mono', TAG_STYLE[tag])} style={{ fontSize: '10px' }}>{tag}</span>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-ice-faint uppercase" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>Mkt Cap</div>
          <div className="font-mono text-ice-text" style={{ fontSize: '12px' }}>${fmtCompact(coin.market_cap)}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-ice-faint uppercase" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>24h Vol</div>
          <div className="font-mono text-ice-text" style={{ fontSize: '12px' }}>${fmtCompact(coin.total_volume)}</div>
        </div>
      </div>
    </button>
  );
}

function Variants({ baseId }: { baseId: string }) {
  const navigate = useNavigate();
  const fam = findFamily(baseId);
  const others = fam ? fam.members.filter((m) => m.id !== baseId) : [];
  const { variants, loading } = useTokenVariants(others.map((m) => m.id));
  if (!fam || others.length === 0) return null;
  const tagOf = (id: string): VariantTag => fam.members.find((m) => m.id === id)?.tag ?? 'Wrapped';
  const ordered = others.map((m) => variants.find((v) => v.id === m.id)).filter(Boolean) as CoinMarketData[];

  return (
    <div className="mt-6">
      <Section title="Variants">
        <p className="text-ice-muted -mt-1 mb-4" style={{ ...FONT, fontSize: '13px' }}>Token representations of {fam.label} on Avalanche.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {loading || ordered.length === 0
            ? Array.from({ length: others.length }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
            : ordered.map((v) => <VariantCard key={v.id} coin={v} tag={tagOf(v.id)} onClick={() => navigate(`/token/${v.id}`)} />)}
        </div>
      </Section>
    </div>
  );
}

export function TokenPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, loading, error, refetch } = useTokenDetail(id);
  const [swapOpen, setSwapOpen] = useState(false);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-6xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors mb-6" style={{ ...FONT, fontSize: '14px' }}>
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading || !token ? (
        <div className="space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid lg:grid-cols-[1fr_340px] gap-6">
            <Skeleton className="h-[380px] rounded-2xl" />
            <Skeleton className="h-[380px] rounded-2xl" />
          </div>
        </div>
      ) : (
        <TokenDetailContent token={token} swapOpen={swapOpen} setSwapOpen={setSwapOpen} />
      )}
    </div>
  );
}

function TokenDetailContent({ token, swapOpen, setSwapOpen }: { token: TokenDetail; swapOpen: boolean; setSwapOpen: (v: boolean) => void }) {
  const { info } = useTokenInfo(token.id);
  const change = token.price_change_percentage_24h ?? 0;
  const up = change >= 0;
  const tvl = info?.market_data?.total_value_locked?.usd ?? null;

  const stats: { label: string; value: string; sub?: string; subUp?: boolean; valueClass?: string }[] = [
    { label: 'Market Cap', value: `$${fmtCompact(token.market_cap)}`, sub: token.market_cap_rank ? `Rank #${token.market_cap_rank}` : undefined },
    { label: 'Liquidity', value: tvl ? `$${fmtCompact(tvl)}` : '—' },
    { label: '24H Volume', value: `$${fmtCompact(token.total_volume)}` },
    { label: 'Supply', value: fmtCompact(token.circulating_supply) },
    { label: 'Price', value: fmtPrice(token.current_price) },
    { label: '24H Change', value: `${up ? '+' : ''}${change.toFixed(2)}%`, valueClass: up ? 'text-ice-up' : 'text-ice-down' },
    { label: 'FDV', value: token.fully_diluted_valuation ? `$${fmtCompact(token.fully_diluted_valuation)}` : '—' },
    { label: 'Total Supply', value: fmtCompact(token.total_supply) },
  ];

  return (
    <>
      {/* Header */}
      <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-5 md:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <TokenLogo token={token} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-ice-text font-bold" style={{ ...FONT, fontSize: '22px' }}>{token.name}</h1>
                <span className="font-mono text-ice-faint" style={{ fontSize: '13px' }}>{token.symbol}</span>
                {token.category && (
                  <span className="px-2 py-0.5 rounded-md bg-ice-line/[0.06] border border-ice-line/15 text-ice-muted capitalize" style={{ ...FONT, fontSize: '11px' }}>{token.category.replace('-', ' ')}</span>
                )}
              </div>
              <div className="flex items-baseline gap-3 mt-1.5">
                <span className="font-mono font-semibold text-ice-text" style={{ fontSize: '28px', lineHeight: 1 }}>{fmtPrice(token.current_price)}</span>
                <span className={cn('flex items-center gap-1 font-mono', up ? 'text-ice-up' : 'text-ice-down')} style={{ fontSize: '14px' }}>
                  {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}{up ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {token.address && (
              <a href={`https://snowtrace.io/token/${token.address}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-ice-surface2 border border-ice-line/15 text-ice-muted hover:text-ice-text transition-colors" style={{ ...FONT, fontSize: '13px' }}>
                Snowtrace <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {token.restricted ? (
              <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-yellow-500/10 text-yellow-500" style={{ ...FONT, fontSize: '13px' }}>
                <Lock className="w-3.5 h-3.5" /> Institutional
              </div>
            ) : (
              <button onClick={() => setSwapOpen(true)} className="px-6 py-2.5 rounded-xl font-semibold transition-transform hover:-translate-y-px"
                style={{ ...FONT, fontSize: '14px', background: 'linear-gradient(180deg, #8be4ff 0%, #4db8ff 100%)', color: '#06223a', boxShadow: '0 2px 16px rgba(139,228,255,0.25)' }}>
                Trade
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        {/* Left: chart, stats, markets */}
        <div className="space-y-6 min-w-0">
          <PriceChart id={token.id} />
          <Section title="Stats">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.map((s) => <StatCard key={s.label} {...s} />)}
            </div>
          </Section>
          <MarketsTable address={token.address} />
        </div>

        {/* Right: about + links */}
        <div className="space-y-6">
          <About id={token.id} name={token.name} />
        </div>
      </div>

      <Variants baseId={token.id} />

      <SwapModal isOpen={swapOpen} onClose={() => setSwapOpen(false)} initialToToken={{ symbol: token.symbol, address: token.address }} />
    </>
  );
}
