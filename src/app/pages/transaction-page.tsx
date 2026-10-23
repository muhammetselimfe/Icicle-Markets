import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatUnits } from 'viem';
import { DetailHeader } from '@/app/components/shell/page-header';
import { DetailList, DetailRow, CopyButton, AddressLink, DetailSkeleton, shortHex } from '@/app/components/shell/detail-list';
import { TokenLogo } from '@/app/components/shell/token-logo';
import { TransactionTypeIcon, TX_TYPE_LABELS } from '@/app/components/shell/transaction-type';
import { ErrorState } from '@/app/components/ui/data-states';
import { useAccount } from 'wagmi';
import { api } from '@/app/services/api';
import { getRelativeTime, formatTimestamp } from '@/app/utils/time';
import {
  classifyTransaction,
  collectTransferLegs,
  describeCounterparty,
  formatCounterparty,
  formatLegAmount,
  getProtocol,
  intentTitle,
  isSuspiciousTransfer,
  methodLabel,
  nameFor,
  type TransactionType,
  type TransferLeg,
} from '@/app/utils/transaction-history';
import type { Transaction } from '@/app/types/api';
import { cn } from '@/app/components/ui/utils';

/** Types where the wallet handed assets to a contract, or got several back from one. */
const GAVE_TYPES = new Set<TransactionType>(['deposit', 'add_liquidity', 'stake']);
const GOT_TYPES = new Set<TransactionType>(['withdraw', 'remove_liquidity', 'claim', 'unstake']);

const MAX_TRANSFERS_COLLAPSED = 4;

function formatTokenAmount(value: string, decimals: number): string {
  return formatLegAmount(BigInt(value), decimals);
}

function Amount({ leg, big }: { leg: TransferLeg; big?: boolean }) {
  const out = leg.direction === 'out';
  const tone = out ? 'text-ice-text' : 'text-ice-up';
  if (!big) {
    return (
      <span className={cn('font-semibold tabular-nums tracking-[-0.01em] text-[15px]', tone)}>
        {out ? '−' : '+'}
        {formatLegAmount(leg.raw, leg.decimals)} {leg.symbol}
      </span>
    );
  }
  // The logo carries the token; the symbol is a caption so the number stays on one line.
  return (
    <span className="inline-flex items-center gap-3 min-w-0">
      <TokenLogo symbol={leg.symbol} logoUrl={leg.logoUrl} className="w-9 h-9 md:w-10 md:h-10" />
      <span className="flex flex-col min-w-0">
        <span className={cn('font-semibold tabular-nums tracking-[-0.01em] text-[28px] md:text-[32px] leading-none truncate', tone)}>
          {out ? '−' : '+'}
          {formatLegAmount(leg.raw, leg.decimals)}
        </span>
        <span className="text-ice-muted text-[13px] font-medium mt-1 truncate">{leg.symbol}</span>
      </span>
    </span>
  );
}

export function TransactionPage() {
  const { hash } = useParams<{ hash: string }>();
  const { address: connectedAddress } = useAccount();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTransfers, setShowAllTransfers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchTransaction() {
      if (!hash) return;
      try {
        setLoading(true);
        setError(null);
        const response = await api.getTransaction(hash);
        if (!cancelled) setTx(response.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch transaction');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTransaction();
    return () => {
      cancelled = true;
    };
  }, [hash]);

  // Read the transaction from the signed-in wallet's side when it took part; otherwise from the sender's.
  const viewer = useMemo(() => {
    if (!tx) return null;
    const me = connectedAddress?.toLowerCase();
    if (me) {
      const parties = [tx.from, tx.to ?? '', ...(tx.token_transfers ?? []).flatMap((t) => [t.from, t.to])].map((a) => a.toLowerCase());
      if (parties.includes(me)) return me;
    }
    return tx.from.toLowerCase();
  }, [tx, connectedAddress]);

  const legs = useMemo(() => (tx && viewer ? collectTransferLegs(tx, viewer) : []), [tx, viewer]);
  const protocol = tx ? getProtocol(tx.to, tx.to_label) : null;
  const type: TransactionType = tx && viewer ? classifyTransaction(tx, legs, protocol, viewer) : 'contract';

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
        <DetailHeader backLabel="Explorer" backTo="/explorer" />
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
        <DetailHeader backLabel="Explorer" backTo="/explorer" />
        <ErrorState message={error || 'Transaction not found'} />
      </div>
    );
  }

  const feeAvax = (tx.gas_used * tx.gas_price) / 1e18;
  const gasPriceNano = tx.gas_price / 1e9;
  const outs = legs.filter((l) => l.direction === 'out');
  const ins = legs.filter((l) => l.direction === 'in');
  const nameOf = (a: string) => nameFor(tx, a) ?? shortHex(a, 8, 6);
  // Who the viewer dealt with, phrased by what happened.
  const context = formatCounterparty(describeCounterparty(tx, type, viewer!, protocol));
  const method = methodLabel(tx.method);
  const title = (viewer === tx.from.toLowerCase() && intentTitle(tx)) || TX_TYPE_LABELS[type];
  const transfers = tx.token_transfers ?? [];
  const visibleTransfers = showAllTransfers ? transfers : transfers.slice(0, MAX_TRANSFERS_COLLAPSED);
  const internal = (tx.internal_txs ?? []).filter((c) => c.value !== '0');

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
      <DetailHeader backLabel="Explorer" backTo="/explorer" />

      {/* Summary */}
      <section className="rounded-2xl bg-ice-surface border border-ice-line/15 p-5 md:p-6 mb-4">
        <div className="flex items-center gap-4">
          <span className={cn('w-12 h-12 rounded-full flex items-center justify-center shrink-0', tx.success && type !== 'suspicious' ? 'bg-ice-line/[0.08] text-ice-muted' : 'bg-ice-down/10 text-ice-down')}>
            <TransactionTypeIcon type={type} className="w-6 h-6" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-ice-text font-bold text-[22px] leading-tight">{title}</h1>
              <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[12px] font-medium', tx.success ? 'bg-ice-up/10 text-ice-up' : 'bg-ice-down/10 text-ice-down')}>
                <span className={cn('w-1.5 h-1.5 rounded-full', tx.success ? 'bg-ice-up' : 'bg-ice-down')} />
                {tx.success ? 'Confirmed' : 'Failed'}
              </span>
            </div>
            <div className="text-ice-muted text-[14px] line-clamp-2 sm:line-clamp-none sm:truncate">
              {type === 'contract' && method ? `${method} · ` : ''}
              {context} · {getRelativeTime(tx.block_time)}
            </div>
          </div>
        </div>

        {/* What moved, from the viewer's side */}
        {legs.length > 0 && (
          <div className="mt-5 pt-5 border-t border-ice-line/10">
            {outs.length > 0 && ins.length > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                <div className="space-y-1">{outs.map((l, i) => <div key={i}><Amount leg={l} big /></div>)}</div>
                <ArrowRight className="hidden sm:block w-6 h-6 text-ice-faint shrink-0" />
                <ArrowDown className="sm:hidden w-5 h-5 text-ice-faint" />
                <div className="space-y-1">{ins.map((l, i) => <div key={i}><Amount leg={l} big /></div>)}</div>
              </div>
            ) : (
              <div className="space-y-1">{legs.map((l, i) => <div key={i}><Amount leg={l} big /></div>)}</div>
            )}
          </div>
        )}

        {type === 'approve' && tx.approvals && (
          <div className="mt-5 pt-5 border-t border-ice-line/10 space-y-2">
            {tx.approvals.map((a, i) => (
              <div key={i} className="text-[15px]">
                <span className="text-ice-text font-semibold tabular-nums">{a.is_unlimited ? 'Unlimited' : formatTokenAmount(a.amount, a.decimals)} {a.symbol || 'tokens'}</span>
                <span className="text-ice-muted"> allowed for {nameOf(a.spender)}</span>
              </div>
            ))}
          </div>
        )}

        {GAVE_TYPES.has(type) && outs.length > 1 && (
          <p className="mt-3 text-ice-muted text-[14px]">
            The wallet sent the contract {outs.length} assets in one transaction{ins.length > 0 ? ' and got a small amount back' : ''}.
          </p>
        )}
        {GOT_TYPES.has(type) && ins.length > 1 && (
          <p className="mt-3 text-ice-muted text-[14px]">The wallet called the contract and received {ins.length} assets in one transaction.</p>
        )}

        {type === 'suspicious' && (
          <div className="mt-5 pt-5 border-t border-ice-line/10 text-[14px] space-y-1.5">
            <p className="text-ice-down font-medium">This looks like address poisoning.</p>
            <p className="text-ice-muted">
              A contract emitted a transfer of a token that only borrows a real name; nothing of value moved apart from dust. It is sent so a lookalike
              address shows up in someone's history. Never copy an address from a transaction like this.
            </p>
          </div>
        )}

        {!tx.success && (
          <p className="mt-4 text-ice-down text-[14px]">This transaction reverted. Gas was spent, nothing else moved.</p>
        )}
      </section>

      {/* Details */}
      <DetailList className="mb-4">
        <DetailRow label="Hash">
          <span className="font-mono truncate">{shortHex(tx.hash, 10, 8)}</span>
          <CopyButton value={tx.hash} label="Copy hash" />
        </DetailRow>
        <DetailRow label="Time" sub={getRelativeTime(tx.block_time)}>
          {formatTimestamp(tx.block_time)}
        </DetailRow>
        <DetailRow label="Block">
          <Link to={`/block/${tx.block_number}`} className="hover:text-ice-accent transition-colors">#{tx.block_number.toLocaleString('en-US')}</Link>
        </DetailRow>
        <DetailRow label="From">
          <AddressLink address={tx.from} label={tx.from_label} />
          <CopyButton value={tx.from} label="Copy address" />
        </DetailRow>
        {tx.to && (
          <DetailRow label="To">
            <AddressLink address={tx.to} label={tx.to_label} />
            <CopyButton value={tx.to} label="Copy address" />
          </DetailRow>
        )}
        {tx.method && (
          <DetailRow label="Method" sub={tx.method.signature ? <span className="font-mono break-all">{tx.method.signature}</span> : undefined}>
            <span className="truncate">{method}</span>
            <span className="font-mono text-ice-faint text-[12px] shrink-0">{tx.method.selector}</span>
          </DetailRow>
        )}
        {tx.value !== '0' && <DetailRow label="Value">{formatUnits(BigInt(tx.value), 18)} AVAX</DetailRow>}
        <DetailRow label="Fee" sub={`${tx.gas_used.toLocaleString('en-US')} gas × ${gasPriceNano.toLocaleString('en-US', { maximumFractionDigits: 2 })} nAVAX`}>
          {feeAvax.toFixed(6)} AVAX
        </DetailRow>
      </DetailList>

      {/* Token transfers */}
      {transfers.length > 0 && (
        <DetailList className="mb-4" title={`Token transfers · ${transfers.length}`}>
          {visibleTransfers.map((t, i) => {
            const fake = isSuspiciousTransfer(t);
            return (
              <div key={`${t.log_index}-${i}`} className="flex items-center gap-3 px-4 md:px-5 min-h-[56px] py-3">
                <span className="flex-1 min-w-0 text-[13px] text-ice-muted flex items-center gap-1.5 flex-wrap">
                  <AddressLink address={t.from} className="text-ice-text" />
                  <ArrowRight className="w-3.5 h-3.5 text-ice-faint shrink-0" />
                  <AddressLink address={t.to} className="text-ice-text" />
                </span>
                <span className="flex flex-col items-end shrink-0">
                  <span className={cn('font-semibold tabular-nums text-[14px]', fake ? 'text-ice-faint line-through' : 'text-ice-text')}>
                    {formatTokenAmount(t.value, t.decimals)} {t.symbol ?? t.token_label?.name ?? nameOf(t.token)}
                  </span>
                  {fake && (
                    <Link to={`/address/${t.token}`} className="text-ice-down text-[12px] hover:underline">
                      Fake token using this name
                    </Link>
                  )}
                </span>
              </div>
            );
          })}
          {transfers.length > MAX_TRANSFERS_COLLAPSED && (
            <button
              type="button"
              onClick={() => setShowAllTransfers((s) => !s)}
              className="w-full min-h-[48px] flex items-center justify-center gap-1.5 text-ice-accent text-[14px] font-medium hover:bg-ice-line/[0.05] transition-colors"
            >
              {showAllTransfers ? 'Show fewer' : `Show all ${transfers.length}`}
              {showAllTransfers ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </DetailList>
      )}

      {/* Internal AVAX movements */}
      {internal.length > 0 && (
        <DetailList className="mb-4" title={`Internal transfers · ${internal.length}`}>
          {internal.map((c, i) => (
            <div key={`${c.trace_index}-${i}`} className="flex items-center gap-3 px-4 md:px-5 min-h-[56px] py-3">
              <span className="flex-1 min-w-0 text-[13px] text-ice-muted flex items-center gap-1.5 flex-wrap">
                <AddressLink address={c.from} className="text-ice-text" />
                <ArrowRight className="w-3.5 h-3.5 text-ice-faint shrink-0" />
                <AddressLink address={c.to} className="text-ice-text" />
                {!c.success && <span className="text-ice-down">failed</span>}
              </span>
              <span className="text-ice-text font-semibold tabular-nums text-[14px] shrink-0">{formatLegAmount(BigInt(c.value), 18)} AVAX</span>
            </div>
          ))}
        </DetailList>
      )}

      <a
        href={`https://snowtrace.io/tx/${tx.hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 min-h-[44px] px-1 text-ice-muted hover:text-ice-text transition-colors text-[14px]"
      >
        View on Snowtrace <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
