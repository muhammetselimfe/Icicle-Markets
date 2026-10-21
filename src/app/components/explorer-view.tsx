import { useState, useMemo, useEffect, useRef } from 'react';
import { Activity, Box, Zap, Users, Server, AlertCircle } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useBlocksWebSocket, useChainStats, useTimeSeries, useValidators, useAvaxPrice } from '@/app/hooks';
import { formatLargeNumber, formatPercentage } from '@/app/utils/formatters';
import { getChartTimeLabel } from '@/app/utils/time';
import { BlockStream } from './block-stream';
import { TransactionStream } from './transaction-stream';

// Loading skeleton component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-ice-line/[0.08] rounded ${className}`} />;
}

// Error display component
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-500 text-[14px]">
      <AlertCircle className="w-4 h-4" />
      {message}
    </div>
  );
}

// Animated block time - shows time with digit animation
function AnimatedBlockTime({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isChanged, setIsChanged] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setIsChanged(true);
      setDisplayValue(value);
      prevValueRef.current = value;

      const timer = setTimeout(() => setIsChanged(false), 500);
      return () => clearTimeout(timer);
    }
  }, [value]);

  // Format to show milliseconds for sub-second times
  const formatted = displayValue < 1
    ? `${Math.round(displayValue * 1000)}ms`
    : `${displayValue.toFixed(2)}s`;

  return (
    <span
      className={cn("text-green-500 font-medium", isChanged && "animate-pulse", 'text-[15px]')}
    >
      {formatted}
    </span>
  );
}

// Animated block counter - shows full number with digit-by-digit animation
function AnimatedBlockNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isChanged, setIsChanged] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setIsChanged(true);
      setDisplayValue(value);
      prevValueRef.current = value;

      const timer = setTimeout(() => setIsChanged(false), 500);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span
      className={cn("text-ice-text font-medium", isChanged && "animate-pulse", 'text-[15px]')}
    >
      {displayValue.toLocaleString()}
    </span>
  );
}

export function ExplorerView() {
  // Fetch data from API
  const { blocks, connected: blocksConnected, error: blocksError, lastError: blocksLastError, clearError: clearBlocksError } = useBlocksWebSocket();
  const blocksLoading = !blocksConnected && blocks.length === 0;

  // Calculate real-time block time from live blocks data
  const liveBlockTime = useMemo(() => {
    if (blocks.length < 2) return null;

    let totalTime = 0;
    let count = 0;

    for (let i = 0; i < Math.min(blocks.length - 1, 5); i++) {
      const newer = new Date(blocks[i].block_time).getTime();
      const older = new Date(blocks[i + 1].block_time).getTime();
      const diff = (newer - older) / 1000;
      if (diff > 0 && diff < 10) {
        totalTime += diff;
        count++;
      }
    }

    return count > 0 ? totalTime / count : null;
  }, [blocks]);

  const { stats, loading: statsLoading, error: statsError } = useChainStats();
  const { data: tpsData, loading: tpsLoading } = useTimeSeries('avg_tps', 'hour', 24, true);
  const { activeCount: validatorCount, loading: validatorsLoading } = useValidators(true);
  const { price: avaxPrice, change24h: avaxChange, loading: priceLoading } = useAvaxPrice();

  // Transform TPS data for chart
  const chartTpsData = tpsData.map((point) => ({
    time: getChartTimeLabel(point.period, 'hour'),
    tps: Math.round(point.value),
  })).reverse();

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      {statsError && (
        <div className="mb-4">
          <ErrorDisplay message={`Chain stats unavailable: ${statsError}`} />
        </div>
      )}
      {/* Stats + TPS Chart Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* TPS */}
          <div className="bg-ice-surface p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-ice-line/[0.08] flex items-center justify-center rounded-lg">
                <Activity className="w-5 h-5 text-ice-muted" />
              </div>
              <div>
                <div className="text-ice-muted text-[13px]">TPS</div>
                {tpsLoading ? (
                  <Skeleton className="h-5 w-12" />
                ) : (
                  <div className="text-ice-text font-medium text-[15px]">
                    {chartTpsData.length > 0 ? chartTpsData[chartTpsData.length - 1]?.tps || '-' : '-'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Block Time */}
          <div className="bg-ice-surface p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-ice-line/[0.08] flex items-center justify-center rounded-lg">
                <Zap className="w-5 h-5 text-ice-muted" />
              </div>
              <div>
                <div className="text-ice-muted text-[13px]">Block Time</div>
                {blocksLoading && blocks.length === 0 ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <AnimatedBlockTime value={liveBlockTime ?? stats?.avg_block_time_seconds ?? 0} />
                )}
              </div>
            </div>
          </div>

          {/* Latest Block */}
          <div className="bg-ice-surface p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-ice-line/[0.08] flex items-center justify-center rounded-lg">
                <Box className="w-5 h-5 text-ice-muted" />
              </div>
              <div>
                <div className="text-ice-muted text-[13px]">Latest Block</div>
                {blocksLoading && blocks.length === 0 ? (
                  <Skeleton className="h-5 w-24" />
                ) : (
                  <AnimatedBlockNumber value={blocks[0]?.block_number ?? 0} />
                )}
              </div>
            </div>
          </div>

          {/* Validators */}
          <div className="bg-ice-surface p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-ice-line/[0.08] flex items-center justify-center rounded-lg">
                <Users className="w-5 h-5 text-ice-muted" />
              </div>
              <div>
                <div className="text-ice-muted text-[13px]">Validators</div>
                {validatorsLoading ? (
                  <Skeleton className="h-5 w-14" />
                ) : (
                  <div className="text-ice-text font-medium text-[15px]">
                    {validatorCount.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Total Transactions */}
          <div className="bg-ice-surface p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-ice-line/[0.08] flex items-center justify-center rounded-lg">
                <Server className="w-5 h-5 text-ice-muted" />
              </div>
              <div>
                <div className="text-ice-muted text-[13px]">Total TXs</div>
                {statsLoading ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <div className="text-ice-text font-medium text-[15px]">
                    {stats ? formatLargeNumber(stats.total_txs) : '-'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AVAX Price */}
          <div className="bg-ice-surface p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-ice-muted text-[13px]">AVAX</div>
                {priceLoading ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <>
                    <div className="text-ice-text font-medium text-[15px]">
                      ${avaxPrice.toFixed(2)}
                    </div>
                    <div
                      className={cn("font-medium", avaxChange >= 0 ? "text-green-500" : "text-red-500", 'text-[13px]')}
                    >
                      {formatPercentage(avaxChange)}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* TPS Chart */}
        <div className="bg-ice-surface p-4 rounded-xl flex flex-col min-h-[200px] md:min-h-0">
          <div className="flex items-center justify-between mb-3">
            <div className="text-ice-muted text-[13px]">
              TPS (24H)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-500 text-[11px]">
                Live
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {tpsLoading ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-full w-full" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartTpsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9, fontFamily: "Inter, sans-serif" }} interval="preserveStartEnd" />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 9, fontFamily: "Inter, sans-serif" }} width={25} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f1535',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      fontFamily: "Inter, sans-serif",
                      fontSize: '12px'
                    }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="tps" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Side-by-side Streams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <BlockStream blocks={blocks} loading={blocksLoading} error={blocksError} lastError={blocksLastError} onClearError={clearBlocksError} connected={blocksConnected} />
        <TransactionStream />
      </div>
    </div>
  );
}
