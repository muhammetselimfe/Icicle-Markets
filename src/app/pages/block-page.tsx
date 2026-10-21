import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, ChevronLeft, ChevronRight, ExternalLink, XCircle, ArrowRight } from 'lucide-react';
import { DetailHeader } from '@/app/components/shell/page-header';
import { DetailList, DetailRow, CopyButton, AddressLink, DetailSkeleton, shortHex } from '@/app/components/shell/detail-list';
import { TransactionTypeIcon } from '@/app/components/shell/transaction-type';
import { ErrorState } from '@/app/components/ui/data-states';
import { api } from '@/app/services/api';
import { formatGas, formatWei } from '@/app/utils/formatters';
import { getRelativeTime, formatTimestamp } from '@/app/utils/time';
import { intentToType, methodLabel, nameFor } from '@/app/utils/transaction-history';
import type { Block, Transaction } from '@/app/types/api';
import { cn } from '@/app/components/ui/utils';

const TX_PAGE = 25;
/** C-Chain blocks carry a fixed placeholder coinbase, not a real validator address. */
const PLACEHOLDER_COINBASE = /^0x0*1?0*$/;

/** What the sender did, in the indexer's words, falling back to the method or a plain description. */
export function transactionTitle(tx: Transaction): string {
  if (tx.intent?.label) return tx.intent.label;
  const method = methodLabel(tx.method);
  if (method) return method;
  return tx.value !== '0' ? 'Sent AVAX' : 'Contract call';
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ice-line/[0.05] p-4 flex flex-col gap-1">
      <span className="text-ice-muted text-[13px]">{label}</span>
      <span className="text-ice-text font-semibold tabular-nums tracking-[-0.01em] text-[20px] leading-tight">{value}</span>
      {sub && <span className="text-ice-faint text-[12px] tabular-nums">{sub}</span>}
      {children}
    </div>
  );
}

export function BlockPage() {
  const { blockNumber } = useParams<{ blockNumber: string }>();
  const number = parseInt(blockNumber ?? '', 10);
  const [block, setBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txsLoading, setTxsLoading] = useState(true);
  const [txsShown, setTxsShown] = useState(TX_PAGE);

  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(number)) {
      setError('That is not a block number');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTxs([]);
    setTxsLoading(true);
    setTxsShown(TX_PAGE);

    api
      .getBlock(number)
      .then((res) => {
        if (!cancelled) setBlock(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch block');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    api
      .getBlockTransactions(number, 43114, 200)
      .then((res) => {
        if (!cancelled) setTxs(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setTxs([]);
      })
      .finally(() => {
        if (!cancelled) setTxsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [number]);

  const nav = (
    <>
      <Link to={`/block/${number - 1}`} className="w-11 h-11 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors" aria-label="Previous block">
        <ChevronLeft className="w-5 h-5" />
      </Link>
      <Link to={`/block/${number + 1}`} className="w-11 h-11 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors" aria-label="Next block">
        <ChevronRight className="w-5 h-5" />
      </Link>
    </>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
        <DetailHeader backLabel="Explorer" backTo="/explorer" />
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
        <DetailHeader backLabel="Explorer" backTo="/explorer" trailing={Number.isFinite(number) ? nav : undefined} />
        <ErrorState message={error || `Block #${blockNumber} could not be found`} />
      </div>
    );
  }

  const gasPct = block.gas_limit > 0 ? (block.gas_used / block.gas_limit) * 100 : 0;
  const txCount = block.tx_count ?? txs.length;
  const visibleTxs = txs.slice(0, txsShown);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-2xl">
      <DetailHeader backLabel="Explorer" backTo="/explorer" trailing={nav} />

      {/* Summary */}
      <section className="rounded-2xl bg-ice-surface border border-ice-line/15 p-5 md:p-6 mb-4">
        <div className="flex items-center gap-4 mb-5">
          <span className="w-12 h-12 rounded-full bg-ice-line/[0.08] text-ice-muted flex items-center justify-center shrink-0">
            <Box className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-ice-text font-bold text-[22px] leading-tight tabular-nums">Block #{block.block_number.toLocaleString('en-US')}</h1>
            <div className="text-ice-muted text-[14px]">
              {formatTimestamp(block.block_time)} · {getRelativeTime(block.block_time)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Transactions" value={txCount.toLocaleString('en-US')} />
          <Stat label="Size" value={`${(block.size / 1024).toFixed(1)} KB`} />
          <Stat label="Gas used" value={formatGas(block.gas_used)} sub={`${gasPct.toFixed(1)}% of ${formatGas(block.gas_limit)}`}>
            <div className="mt-1.5 h-1.5 rounded-full bg-ice-line/[0.1] overflow-hidden">
              <div className="h-full rounded-full bg-ice-accent" style={{ width: `${Math.min(gasPct, 100)}%` }} />
            </div>
          </Stat>
          <Stat label="Base fee" value={`${(block.base_fee_per_gas / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} nAVAX`} />
        </div>
      </section>

      {/* Details */}
      <DetailList className="mb-4">
        <DetailRow label="Hash">
          <span className="font-mono truncate">{shortHex(block.hash, 10, 8)}</span>
          <CopyButton value={block.hash} label="Copy block hash" />
        </DetailRow>
        <DetailRow label="Parent">
          <Link to={`/block/${block.block_number - 1}`} className="font-mono truncate hover:text-ice-accent transition-colors">{shortHex(block.parent_hash, 10, 8)}</Link>
          <CopyButton value={block.parent_hash} label="Copy parent hash" />
        </DetailRow>
        {!PLACEHOLDER_COINBASE.test(block.miner) && (
          <DetailRow label="Validator">
            <AddressLink address={block.miner} />
            <CopyButton value={block.miner} label="Copy validator address" />
          </DetailRow>
        )}
        <DetailRow label="Time">{formatTimestamp(block.block_time)}</DetailRow>
        <DetailRow label="Gas limit">{block.gas_limit.toLocaleString('en-US')}</DetailRow>
      </DetailList>

      {/* Transactions in this block */}
      <DetailList className="mb-4" title={`Transactions · ${txCount.toLocaleString('en-US')}`}>
        {txsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 md:px-5 h-[60px]">
              <div className="w-9 h-9 rounded-full bg-ice-line/[0.08] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded bg-ice-line/[0.08] animate-pulse" />
                <div className="h-3 w-48 rounded bg-ice-line/[0.06] animate-pulse" />
              </div>
            </div>
          ))
        ) : txs.length === 0 ? (
          <p className="px-5 py-6 text-center text-ice-faint text-[14px]">
            {txCount > 0 ? 'Transactions for this block are not indexed yet.' : 'This block has no transactions.'}
          </p>
        ) : (
          visibleTxs.map((tx) => (
            <Link
              key={tx.hash}
              to={`/tx/${tx.hash}`}
              className="flex items-center gap-3 md:gap-4 px-4 md:px-5 min-h-[60px] py-2.5 hover:bg-ice-line/[0.05] transition-colors"
            >
              <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', tx.success ? 'bg-ice-line/[0.08] text-ice-muted' : 'bg-ice-down/10 text-ice-down')}>
                {tx.success ? <TransactionTypeIcon type={intentToType(tx.intent?.kind)} className="w-[18px] h-[18px]" /> : <XCircle className="w-[18px] h-[18px]" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-ice-text font-semibold text-[14px] truncate">{transactionTitle(tx)}</span>
                <span className="flex items-center gap-1.5 text-ice-muted text-[13px] truncate">
                  <span className={cn(!nameFor(tx, tx.from) && 'font-mono')}>{nameFor(tx, tx.from) ?? shortHex(tx.from)}</span>
                  <ArrowRight className="w-3 h-3 text-ice-faint shrink-0" />
                  <span className={cn('truncate', tx.to && !nameFor(tx, tx.to) && 'font-mono')}>{tx.to ? nameFor(tx, tx.to) ?? shortHex(tx.to) : 'contract creation'}</span>
                </span>
              </span>
              <span className="text-ice-text text-[13px] tabular-nums shrink-0">{formatWei(tx.value)}</span>
              <ChevronRight className="w-4 h-4 text-ice-faint shrink-0" />
            </Link>
          ))
        )}
        {txs.length > txsShown && (
          <button type="button" onClick={() => setTxsShown((n) => n + TX_PAGE)} className="w-full min-h-[48px] text-ice-accent text-[14px] font-medium hover:bg-ice-line/[0.05] transition-colors">
            Show {Math.min(TX_PAGE, txs.length - txsShown)} more
          </button>
        )}
      </DetailList>

      <a
        href={`https://snowtrace.io/block/${block.block_number}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 min-h-[44px] px-1 text-ice-muted hover:text-ice-text transition-colors text-[14px]"
      >
        View on Snowtrace <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
