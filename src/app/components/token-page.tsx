import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, ExternalLink, Lock, Globe, Twitter, Github, MessageCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { DetailHeader } from '@/app/components/shell/page-header';
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
  return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompact(n?: number | null): string {
  if (n == null || n === 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** CoinGecko descriptions are HTML with entities; keep the words only. */
function stripHtml(html?: string): string {
  if (!html) return '';
  const text = typeof DOMParser !== 'undefined' ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '') : html.replace(/<[^>]*>/g, '');
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-ice-line/[0.08] rounded ${className}`} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-ice-text font-bold mb-3 text-[16px]">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, subUp, valueClass }: { label: string; value: string; sub?: string; subUp?: boolean; valueClass?: string }) {
  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-4 flex flex-col gap-1">
      <span className="text-ice-muted text-[13px]">{label}</span>
      <span className={cn('font-semibold tabular-nums tracking-[-0.01em] text-[18px] leading-tight', valueClass ?? 'text-ice-text')}>{value}</span>
      {sub && <span className={cn('text-[12px] tabular-nums', subUp === undefined ? 'text-ice-faint' : subUp ? 'text-ice-up' : 'text-ice-down')}>{sub}</span>}
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
        <span className="text-ice-text font-semibold text-[15px]">Price</span>
        <div className="flex gap-0.5 -mr-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.days}
              type="button"
              onClick={() => setDays(tf.days)}
              className={cn('min-w-[40px] min-h-[32px] px-2 rounded-lg transition-colors font-medium text-[13px]', days === tf.days ? 'bg-ice-accent/10 text-ice-accent' : 'text-ice-muted hover:text-ice-text')}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[240px] md:h-[300px]">
        {loading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-ice-faint text-[13px]">No chart data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tokenArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tickFormatter={tickFmt} tick={{ fontSize: 11, fill: 'var(--ice-faint)' }} minTickGap={48} axisLine={false} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tickFormatter={(v) => fmtPrice(v)} tick={{ fontSize: 11, fill: 'var(--ice-faint)' }} width={56} axisLine={false} tickLine={false} orientation="right" />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--ice-line)', borderRadius: '10px', fontSize: '12px', color: '#e2e8f0' }}
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
          <p className="text-ice-faint text-[13px]">No description available.</p>
        ) : (
          <>
            <p className={cn('text-ice-muted leading-relaxed', !expanded && 'line-clamp-6', 'text-[13px]')}>{text}</p>
            {text.length > 280 && (
              <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 mt-2 text-ice-accent text-[13px]">
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ice-surface2 border border-ice-line/15 text-ice-muted hover:text-ice-text transition-colors text-[12px]"
         >
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
  const cols = ['Pair', 'Liquidity', '24h volume', '24h trades', '24h wallets'];
  const dexName = (p: (typeof pools)[number]) => (p.dex ? p.dex.replace(/-/g, ' ') : truncAddr(p.address));

  return (
    <Section title="On-chain markets">
      <div className="rounded-2xl bg-ice-surface border border-ice-line/15 overflow-hidden">
        {/* Phones: one row per pool, the two numbers people compare on the trailing edge. */}
        <ul className="md:hidden divide-y divide-ice-line/10">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-4 py-3"><Skeleton className="h-9 w-full" /></li>
              ))
            : top.map((p, i) => (
                <li key={i}>
                  <a href={`https://www.geckoterminal.com/avax/pools/${p.address}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 min-h-[60px] py-2.5 hover:bg-ice-line/[0.05] transition-colors">
                    <span className="flex-1 min-w-0">
                      <span className="block text-ice-text font-semibold text-[15px] truncate">{p.name}</span>
                      <span className="block text-ice-faint text-[13px] capitalize truncate">{dexName(p)}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-ice-text tabular-nums text-[14px]">{formatUSD(p.liquidityUsd)}</span>
                      <span className="block text-ice-faint tabular-nums text-[12px]">{formatUSD(p.volume24hUsd)} 24h</span>
                    </span>
                    <ExternalLink className="w-4 h-4 text-ice-faint shrink-0" />
                  </a>
                </li>
              ))}
        </ul>
        <table className="hidden md:table w-full">
          <thead>
            <tr className="border-b border-ice-line/15">
              {cols.map((h, i) => (
                <th key={i} className={cn('px-4 py-3 text-ice-muted font-medium whitespace-nowrap text-[13px]', i === 0 ? 'text-left' : 'text-right')}>{h}</th>
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
                      <span className="text-ice-text font-semibold whitespace-nowrap text-[14px]">{p.name}</span>
                      <a href={`https://www.geckoterminal.com/avax/pools/${p.address}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ice-faint hover:text-ice-muted w-fit text-[12px] capitalize">
                        {dexName(p)} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-ice-text tabular-nums whitespace-nowrap text-[14px]">{formatUSD(p.liquidityUsd)}</td>
                  <td className="px-4 py-3 text-right text-ice-muted tabular-nums whitespace-nowrap text-[14px]">{formatUSD(p.volume24hUsd)}</td>
                  <td className="px-4 py-3 text-right text-ice-muted tabular-nums whitespace-nowrap text-[14px]">{p.trades24h.toLocaleString('en-US')}</td>
                  <td className="px-4 py-3 text-right text-ice-muted tabular-nums whitespace-nowrap text-[14px]">{p.wallets24h.toLocaleString('en-US')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function VariantCard({ coin, tag, onClick }: { coin: CoinMarketData; tag: VariantTag; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button type="button" onClick={onClick} className="w-full text-left rounded-2xl bg-ice-surface border border-ice-line/15 px-4 min-h-[64px] py-3 flex items-center gap-3 hover:bg-ice-line/[0.05] transition-colors">
      {coin.image && !failed ? (
        <img src={coin.image} alt="" className="w-9 h-9 rounded-full shrink-0" onError={() => setFailed(true)} />
      ) : (
        <span className="w-9 h-9 rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-text text-[12px] font-semibold shrink-0">{coin.symbol.slice(0, 2).toUpperCase()}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-ice-text font-semibold truncate text-[15px]">{coin.name}</span>
        <span className="flex items-center gap-1.5 text-ice-faint text-[13px] truncate">
          <span className={cn('px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] font-medium shrink-0', TAG_STYLE[tag])}>{tag}</span>
          {coin.symbol.toUpperCase()} · ${fmtCompact(coin.market_cap)} cap
        </span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-ice-text tabular-nums text-[14px]">{fmtPrice(coin.current_price)}</span>
        <span className="block text-ice-faint tabular-nums text-[12px]">${fmtCompact(coin.total_volume)} 24h</span>
      </span>
      <ChevronRight className="w-4 h-4 text-ice-faint shrink-0" />
    </button>
  );
}

function Variants({ baseId }: { baseId: string }) {
  const fam = findFamily(baseId);
  const others = fam ? fam.members.filter((m) => m.id !== baseId) : [];
  const { variants, loading } = useTokenVariants(others.map((m) => m.id));
  const navigate = useNavigate();
  if (!fam || others.length === 0) return null;
  const tagOf = (id: string): VariantTag => fam.members.find((m) => m.id === id)?.tag ?? 'Wrapped';
  const ordered = others.map((m) => variants.find((v) => v.id === m.id)).filter(Boolean) as CoinMarketData[];

  return (
    <div className="mt-6">
      <Section title="Variants">
        <p className="text-ice-muted -mt-1 mb-4 text-[13px]">Token representations of {fam.label} on Avalanche.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {loading || ordered.length === 0
            ? Array.from({ length: others.length }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)
            : ordered.map((v) => <VariantCard key={v.id} coin={v} tag={tagOf(v.id)} onClick={() => navigate(`/token/${v.id}`)} />)}
        </div>
      </Section>
    </div>
  );
}

export function TokenPage() {
  const { id } = useParams<{ id: string }>();
  const { token, loading, error, refetch } = useTokenDetail(id);
  const [swapOpen, setSwapOpen] = useState(false);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-6xl">
      <DetailHeader backLabel="Markets" backTo="/" />

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
    { label: 'Market cap', value: `$${fmtCompact(token.market_cap)}`, sub: token.market_cap_rank ? `Rank #${token.market_cap_rank}` : undefined },
    { label: 'Liquidity', value: tvl ? `$${fmtCompact(tvl)}` : '—' },
    { label: '24h volume', value: `$${fmtCompact(token.total_volume)}` },
    { label: 'Circulating supply', value: fmtCompact(token.circulating_supply) },
    { label: 'Price', value: fmtPrice(token.current_price) },
    { label: '24h change', value: `${up ? '+' : ''}${change.toFixed(2)}%`, valueClass: up ? 'text-ice-up' : 'text-ice-down' },
    { label: 'Fully diluted value', value: token.fully_diluted_valuation ? `$${fmtCompact(token.fully_diluted_valuation)}` : '—' },
    { label: 'Total supply', value: fmtCompact(token.total_supply) },
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
                <h1 className="text-ice-text font-bold text-[22px] leading-tight">{token.name}</h1>
                <span className="text-ice-muted text-[14px]">{token.symbol}</span>
                {token.category && (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-ice-line/[0.08] text-ice-muted capitalize text-[12px] font-medium">{token.category.replace('-', ' ')}</span>
                )}
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="font-semibold tabular-nums tracking-[-0.02em] text-ice-text text-[28px] leading-none">{fmtPrice(token.current_price)}</span>
                <span className={cn('inline-flex items-center gap-1 tabular-nums font-medium text-[14px]', up ? 'text-ice-up' : 'text-ice-down')}>
                  {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}{up ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {token.address && (
              <a href={`https://snowtrace.io/token/${token.address}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-full bg-ice-line/[0.08] text-ice-text hover:bg-ice-line/[0.14] transition-colors text-[15px] font-medium">
                Snowtrace <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {token.restricted ? (
              <div className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-full bg-yellow-500/10 text-yellow-500 text-[14px]">
                <Lock className="w-4 h-4" /> Institutional
              </div>
            ) : (
              <button type="button" onClick={() => setSwapOpen(true)} className="flex-1 sm:flex-none sm:min-w-[120px] min-h-[44px] px-6 rounded-full font-semibold text-[16px] bg-ice-accent text-[#06223a] hover:brightness-105 active:scale-[0.98] transition">
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
