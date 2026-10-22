import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ExternalLink, Wallet, ChevronRight, BadgeCheck } from 'lucide-react';
import { formatUnits } from 'viem';
import { DetailHeader } from '@/app/components/shell/page-header';
import { DetailList, DetailRow, CopyButton, AddressLink, DetailSkeleton, shortHex } from '@/app/components/shell/detail-list';
import { WalletAvatar } from '@/app/components/shell/wallet-avatar';
import { EmptyState } from '@/app/components/shell/empty-state';
import { ErrorState } from '@/app/components/ui/data-states';
import { ActivityList } from '@/app/components/portfolio-view';
import { useTransactionHistory } from '@/app/hooks/useTransactionHistory';
import { useAddressLabel } from '@/app/hooks/useAddressLabel';
import { api } from '@/app/services/api';
import { getRelativeTime } from '@/app/utils/time';
import { getTokenByAddress } from '@/app/data/markets-tokens';
import type { NativeBalance, TokenBalance } from '@/app/types/api';
import { cn } from '@/app/components/ui/utils';

const MAX_TOKENS = 8;
/** The index has no history before C-Chain mainnet; earlier "first seen" dates are placeholders. */
const INDEX_EPOCH = Date.parse('2020-09-21T00:00:00Z');

function firstSeen(iso: string | null | undefined): { value: string; sub?: string } {
  if (!iso) return { value: '—' };
  if (Date.parse(iso) < INDEX_EPOCH) return { value: '—', sub: 'Older than the index' };
  return { value: getRelativeTime(iso), sub: formatDate(iso) };
}
/** Airdrop spam names itself after a website so holders go there; a real token never does. */
const SPAM_TOKEN = /https?:\/\/|www\.|\.(com|org|xyz|io|net|app|finance)\b/i;

function looksLikeSpam(t: TokenBalance): boolean {
  return SPAM_TOKEN.test(t.name ?? '') || SPAM_TOKEN.test(t.symbol ?? '');
}

function formatAvax(wei: string): string {
  const n = parseFloat(formatUnits(BigInt(wei), 18));
  if (n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 });
}

function formatTokenBalance(raw: string, decimals: number): string {
  const n = parseFloat(formatUnits(BigInt(raw), decimals));
  if (n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-ice-line/[0.05] p-4 flex flex-col gap-1">
      <span className="text-ice-muted text-[13px]">{label}</span>
      <span className="text-ice-text font-semibold tabular-nums tracking-[-0.01em] text-[20px] leading-tight">{value}</span>
      {sub && <span className="text-ice-faint text-[12px]">{sub}</span>}
    </div>
  );
}

export function AddressPage() {
  const { address = '' } = useParams<{ address: string }>();
  const valid = /^0x[a-f0-9]{40}$/i.test(address);
  const label = useAddressLabel(valid ? address : null);

  const [native, setNative] = useState<NativeBalance | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const history = useTransactionHistory(valid ? address : undefined);

  useEffect(() => {
    let cancelled = false;
    if (!valid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([api.getAddressNativeBalance(address).catch(() => null), api.getAddressBalances(address, 43114, 100, 0).catch(() => null)])
      .then(([nativeRes, balancesRes]) => {
        if (cancelled) return;
        setNative(nativeRes?.data ?? null);
        const held = (balancesRes?.data ?? []).filter((t) => t.balance !== '0' && !looksLikeSpam(t));
        // Listed tokens first, then by raw balance as a rough proxy for relevance.
        held.sort((a, b) => Number(!!getTokenByAddress(b.token)) - Number(!!getTokenByAddress(a.token)));
        setTokens(held);
        // Both calls failing is an outage or a rate limit, not an empty address.
        if (!nativeRes && !balancesRes) setError('Could not load this address right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, valid, attempt]);

  if (!valid) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
        <DetailHeader backLabel="Explorer" backTo="/explorer" />
        <ErrorState message="That is not an Avalanche address." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
        <DetailHeader backLabel="Explorer" backTo="/explorer" />
        <DetailSkeleton />
      </div>
    );
  }

  const balanceAvax = native ? formatAvax(native.balance) : '—';
  const visibleTokens = showAllTokens ? tokens : tokens.slice(0, MAX_TOKENS);
  const title = label?.name ?? (label?.isContract ? 'Contract' : 'Address');

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
      <DetailHeader backLabel="Explorer" backTo="/explorer" />

      {/* Identity and balance */}
      <section className="rounded-2xl bg-ice-surface border border-ice-line/15 p-5 md:p-6 mb-4">
        <div className="flex items-center gap-4 mb-5">
          <WalletAvatar address={address} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-ice-text font-bold text-[22px] leading-tight truncate">{title}</h1>
              {label?.kind && (
                <span className="px-2 h-6 inline-flex items-center rounded-full bg-ice-line/[0.08] text-ice-muted text-[12px] font-medium capitalize">{label.kind}</span>
              )}
            </div>
            <div className="flex items-center gap-1 text-ice-muted text-[14px]">
              <span className="font-mono truncate">{shortHex(address, 10, 8)}</span>
              <CopyButton value={address} label="Copy address" />
              <a
                href={`https://snowtrace.io/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 -my-1 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors"
                aria-label="View on Snowtrace"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {error && !native ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-ice-down/[0.08] px-4 py-3 text-[14px]">
            <span className="text-ice-down">{error}</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="text-ice-accent font-medium min-h-[32px] px-2">
              Try again
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="AVAX balance" value={balanceAvax} />
            <Stat label="Transactions" value={native ? native.tx_count.toLocaleString('en-US') : '—'} />
            <Stat label="First seen" {...firstSeen(native?.first_tx_time)} />
            <Stat label="Last active" value={native?.last_tx_time ? getRelativeTime(native.last_tx_time) : '—'} sub={native?.last_tx_time ? formatDate(native.last_tx_time) : undefined} />
          </div>
        )}
      </section>

      {/* What the indexer knows about the contract */}
      {label?.isContract && (
        <DetailList className="mb-4" title="Contract">
          {label.protocol && <DetailRow label="Protocol">{label.protocol}</DetailRow>}
          <DetailRow label="Source">
            {label.verified ? (
              <span className="inline-flex items-center gap-1 text-ice-up">
                <BadgeCheck className="w-4 h-4" /> Verified
              </span>
            ) : (
              <span className="text-ice-muted">Not verified</span>
            )}
          </DetailRow>
          {label.implementation && (
            <DetailRow label="Implementation" sub="This address is a proxy; the code lives at the implementation.">
              <AddressLink address={label.implementation} />
              <CopyButton value={label.implementation} label="Copy implementation address" />
            </DetailRow>
          )}
        </DetailList>
      )}

      {/* Tokens held */}
      {tokens.length > 0 && (
        <DetailList className="mb-4" title={`Tokens · ${tokens.length}`}>
          {visibleTokens.map((t) => {
            const listed = getTokenByAddress(t.token);
            const symbol = listed?.symbol ?? t.symbol ?? shortHex(t.token);
            const decimals = listed?.decimals ?? t.decimals ?? 18;
            // Listed tokens have a market page; anything else opens the contract itself.
            const to = listed ? `/token/${listed.coingeckoId}` : `/address/${t.token}`;
            return (
              <Link key={t.token} to={to} className="flex items-center gap-3 px-4 md:px-5 min-h-[56px] py-2.5 hover:bg-ice-line/[0.05] transition-colors">
                {listed?.logoUrl ? (
                  <img src={listed.logoUrl} alt="" className="w-9 h-9 rounded-full shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-ice-line/[0.1] flex items-center justify-center text-ice-text text-[12px] font-semibold shrink-0">{symbol.slice(0, 2)}</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-ice-text font-semibold text-[15px] truncate">{symbol}</span>
                  <span className="block text-ice-faint text-[13px] truncate">{listed?.name ?? t.name ?? shortHex(t.token)}</span>
                </span>
                <span className={cn('text-ice-text tabular-nums text-[14px] shrink-0', !listed && 'text-ice-muted')}>
                  {formatTokenBalance(t.balance, decimals)}
                </span>
                <ChevronRight className="w-4 h-4 text-ice-faint shrink-0" />
              </Link>
            );
          })}
          {tokens.length > MAX_TOKENS && (
            <button type="button" onClick={() => setShowAllTokens((s) => !s)} className="w-full min-h-[48px] text-ice-accent text-[14px] font-medium hover:bg-ice-line/[0.05] transition-colors">
              {showAllTokens ? 'Show fewer' : `Show all ${tokens.length}`}
            </button>
          )}
        </DetailList>
      )}

      {/* Native totals */}
      {native && (
        <DetailList className="mb-4" title="AVAX flow">
          <DetailRow label="Received">{formatAvax(native.total_in)} AVAX</DetailRow>
          <DetailRow label="Sent">{formatAvax(native.total_out)} AVAX</DetailRow>
          <DetailRow label="Spent on gas">{formatAvax(native.total_gas)} AVAX</DetailRow>
        </DetailList>
      )}

      {/* Activity, read from this address's side */}
      <section>
        <h3 className="text-ice-text font-semibold text-[15px] px-1 mb-2">Activity</h3>
        {history.error && history.transactions.length === 0 ? (
          <ErrorState message={history.error} onRetry={history.refetch} />
        ) : !history.loading && history.transactions.length === 0 ? (
          <EmptyState icon={<Wallet className="w-6 h-6" />} title="No transactions yet" message="Activity from this address shows up here." />
        ) : (
          <ActivityList
            transactions={history.transactions}
            loading={history.loading}
            error={null}
            onRefetch={history.refetch}
            hasMore={history.hasMore}
            onLoadMore={history.loadMore}
          />
        )}
      </section>
    </div>
  );
}
