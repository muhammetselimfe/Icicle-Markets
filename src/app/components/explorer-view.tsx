import { useMemo, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PageHeader } from '@/app/components/shell/page-header';
import { cn } from '@/app/components/ui/utils';
import { useBlocksWebSocket, useChainStats, useTimeSeries, useValidators } from '@/app/hooks';
import { formatLargeNumber } from '@/app/utils/formatters';
import { getChartTimeLabel } from '@/app/utils/time';
import { BlockStream } from './block-stream';
import { TransactionStream } from './transaction-stream';
import { LiveListStyles } from './live-list';

/** Briefly highlights when its value changes, so live numbers read as live. */
function useFlash<T>(value: T): boolean {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    prev.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 500);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

function Stat({ label, value, loading, tone }: { label: string; value: ReactNode; loading?: boolean; tone?: 'up' }) {
  const flash = useFlash(value);
  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-4 flex flex-col gap-1.5">
      <span className="text-ice-muted text-[13px]">{label}</span>
      {loading ? (
        <span className="h-6 w-20 rounded bg-ice-line/[0.08] animate-pulse" />
      ) : (
        <span
          className={cn(
            'font-semibold tabular-nums leading-none tracking-[-0.01em] text-[22px] transition-opacity',
            tone === 'up' ? 'text-ice-up' : 'text-ice-text',
            flash && 'opacity-60',
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function formatBlockTime(seconds: number): string {
  return seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(2)} s`;
}

export function ExplorerView() {
  const { blocks, connected: blocksConnected, error: blocksError, lastError: blocksLastError, clearError: clearBlocksError } = useBlocksWebSocket();
  const blocksLoading = !blocksConnected && blocks.length === 0;

  // Live block time from the last few blocks; falls back to the indexer average.
  const liveBlockTime = useMemo(() => {
    if (blocks.length < 2) return null;
    let total = 0;
    let count = 0;
    for (let i = 0; i < Math.min(blocks.length - 1, 5); i++) {
      const diff = (new Date(blocks[i].block_time).getTime() - new Date(blocks[i + 1].block_time).getTime()) / 1000;
      if (diff > 0 && diff < 10) {
        total += diff;
        count++;
      }
    }
    return count > 0 ? total / count : null;
  }, [blocks]);

  const { stats, loading: statsLoading, error: statsError } = useChainStats();
  const { data: tpsData, loading: tpsLoading } = useTimeSeries('avg_tps', 'hour', 24, true);
  const { activeCount: validatorCount, loading: validatorsLoading } = useValidators(true);

  const chartTpsData = tpsData
    .map((point) => ({ time: getChartTimeLabel(point.period, 'hour'), tps: Math.round(point.value) }))
    .reverse();
  const currentTps = chartTpsData.length > 0 ? chartTpsData[chartTpsData.length - 1]?.tps : null;
  const blockTime = liveBlockTime ?? stats?.avg_block_time_seconds ?? null;

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      <LiveListStyles />
      <PageHeader title="Explorer" subtitle="Live blocks, transactions, and network health on Avalanche" />

      {statsError && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-ice-down/[0.08] text-ice-down text-[14px]">
          <AlertTriangle className="w-[18px] h-[18px] shrink-0" />
          Chain stats are unavailable right now: {statsError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-4 mb-6">
        <div className="grid grid-cols-2 gap-3 lg:gap-4">
          <Stat label="Latest block" loading={blocksLoading} value={blocks[0] ? `#${blocks[0].block_number.toLocaleString('en-US')}` : '—'} />
          <Stat label="Block time" loading={blocksLoading && blockTime === null} value={blockTime !== null ? formatBlockTime(blockTime) : '—'} tone="up" />
          <Stat label="Transactions per second" loading={tpsLoading} value={currentTps ?? '—'} />
          <Stat label="Active validators" loading={validatorsLoading} value={validatorCount.toLocaleString('en-US')} />
        </div>

        <section className="rounded-2xl bg-ice-surface border border-ice-line/15 p-4 md:p-5 flex flex-col min-h-[220px]">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="text-ice-text font-semibold text-[15px]">Throughput, 24h</h3>
            {!statsLoading && stats && (
              <span className="text-ice-faint text-[12px] tabular-nums whitespace-nowrap">{formatLargeNumber(stats.total_txs)} txs all time</span>
            )}
          </div>
          <div className="flex-1 min-h-[150px]">
            {tpsLoading ? (
              <div className="h-full w-full rounded-xl bg-ice-line/[0.06] animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartTpsData} margin={{ top: 4, right: 0, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis dataKey="time" stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-grid)', borderRadius: 12, fontSize: 12, color: 'var(--ice-text)' }}
                    labelStyle={{ color: 'var(--ice-muted)' }}
                    formatter={(v: number) => [`${v} tps`, '']}
                  />
                  <Bar dataKey="tps" fill="var(--ice-accent)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <BlockStream blocks={blocks} loading={blocksLoading} error={blocksError} lastError={blocksLastError} onClearError={clearBlocksError} connected={blocksConnected} />
        <TransactionStream />
      </div>
    </div>
  );
}
