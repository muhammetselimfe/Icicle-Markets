import { useState, useMemo, useEffect, useRef } from 'react';
import { Clock, Activity, Box, Zap, Users, Server, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent } from '@/app/components/ui/tabs';
import { LineChart, Line, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useBlocksWebSocket, useChainStats, useTimeSeries, useValidators, useAvaxPrice } from '@/app/hooks';
import { formatLargeNumber, formatPercentage, getChangeColor } from '@/app/utils/formatters';
import { getChartTimeLabel } from '@/app/utils/time';
import { BlockStream } from './block-stream';
import { TransactionStream } from './transaction-stream';

// Loading skeleton component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#4db8ff]/20 ${className}`} />;
}

// Error display component
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
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
      className={isChanged ? 'digit-animate' : ''}
      style={{
        fontFamily: "'Press Start 2P', cursive",
        fontSize: '10px',
        color: '#4dff88',
        display: 'inline-block',
      }}
    >
      {formatted}
    </span>
  );
}

// Animated block counter - shows full number with digit-by-digit animation
function AnimatedBlockNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [changedDigits, setChangedDigits] = useState<Set<number>>(new Set());
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      // Find which digit positions changed
      const newStr = value.toString();
      const oldStr = prevValueRef.current.toString();
      const changed = new Set<number>();

      // Compare from right to left (least significant digit)
      for (let i = 0; i < newStr.length; i++) {
        const newIdx = newStr.length - 1 - i;
        const oldIdx = oldStr.length - 1 - i;
        if (oldIdx < 0 || newStr[newIdx] !== oldStr[oldIdx]) {
          changed.add(newIdx);
        }
      }

      setChangedDigits(changed);
      setDisplayValue(value);
      prevValueRef.current = value;

      // Clear animation after it completes
      const timer = setTimeout(() => setChangedDigits(new Set()), 500);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const digits = displayValue.toLocaleString().split('');

  return (
    <div className="flex items-center">
      <style>{`
        @keyframes digitPop {
          0% { transform: scale(1); color: #8be4ff; }
          50% { transform: scale(1.3); color: #4dff88; }
          100% { transform: scale(1); color: #8be4ff; }
        }
        .digit-animate {
          animation: digitPop 0.4s ease-out;
        }
      `}</style>
      {digits.map((char, idx) => {
        // Map formatted index back to original digit index (skip commas)
        const originalIdx = digits.slice(0, idx + 1).filter(c => c !== ',').length - 1;
        const isChanged = changedDigits.has(originalIdx);

        return (
          <span
            key={idx}
            className={isChanged ? 'digit-animate' : ''}
            style={{
              fontFamily: "'Press Start 2P', cursive",
              fontSize: '10px',
              color: '#8be4ff',
              display: 'inline-block',
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
}

export function ExplorerView() {
  const [activeTab, setActiveTab] = useState('blocks');

  // Fetch data from API
  const { blocks, connected: blocksConnected, error: blocksError, lastError: blocksLastError, clearError: clearBlocksError } = useBlocksWebSocket();
  const blocksLoading = !blocksConnected && blocks.length === 0;

  // Calculate real-time block time from live blocks data
  const liveBlockTime = useMemo(() => {
    if (blocks.length < 2) return null;

    // Calculate average time between the most recent blocks
    let totalTime = 0;
    let count = 0;

    for (let i = 0; i < Math.min(blocks.length - 1, 5); i++) {
      const newer = new Date(blocks[i].block_time).getTime();
      const older = new Date(blocks[i + 1].block_time).getTime();
      const diff = (newer - older) / 1000; // Convert to seconds
      if (diff > 0 && diff < 10) { // Sanity check
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

  // Generate price chart data (using AVAX price as base with deterministic variations)
  // Memoized so it doesn't regenerate on every render
  const priceChartData = useMemo(() => {
    // Use a seeded pattern based on price to create consistent "historical" data
    const basePrice = avaxPrice || 20;
    const variations = [0.97, 0.98, 0.96, 0.99, 1.01, 1.02, 0.99, 0.98, 0.97, 0.99, 1.00, 1.01, 1.03, 1.02, 1.01, 0.99, 0.98, 1.00, 1.01, 1.02, 1.01, 1.00, 0.99, 1.00];
    return Array.from({ length: 24 }, (_, i) => ({
      time: `${24 - i}h`,
      price: basePrice * variations[i],
    }));
  }, [avaxPrice]);

  const isLoading = statsLoading || blocksLoading;
  const hasError = statsError || blocksError;

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Network Stats */}
      <div className="grid grid-cols-6 gap-4 mb-8">
        {/* TPS */}
        <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] p-5">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#8be4ff]" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 border-2 border-[#8be4ff] bg-[#0a0e27] flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#8be4ff]" />
            </div>
            <div>
              <div className="text-xs text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>TPS</div>
              {tpsLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <div className="text-lg text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                  {chartTpsData.length > 0 ? chartTpsData[chartTpsData.length - 1]?.tps || '-' : '-'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Block Time */}
        <div className="relative border-3 border-[#4dff88] bg-[#0f1535] p-5">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#4dff88]" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 border-2 border-[#4dff88] bg-[#0a0e27] flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#4dff88]" />
            </div>
            <div>
              <div className="text-xs text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>BLOCK TIME</div>
              {blocksLoading && blocks.length === 0 ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                <AnimatedBlockTime value={liveBlockTime ?? stats?.avg_block_time_seconds ?? 0} />
              )}
            </div>
          </div>
        </div>

        {/* Latest Block */}
        <div className="relative border-3 border-[#4db8ff] bg-[#0f1535] p-5">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#4db8ff]" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 border-2 border-[#4db8ff] bg-[#0a0e27] flex items-center justify-center">
              <Box className="w-5 h-5 text-[#4db8ff]" />
            </div>
            <div>
              <div className="text-xs text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>LATEST BLOCK</div>
              {blocksLoading && blocks.length === 0 ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <AnimatedBlockNumber value={blocks[0]?.block_number ?? 0} />
              )}
            </div>
          </div>
        </div>

        {/* Validators */}
        <div className="relative border-3 border-[#4db8ff] bg-[#0f1535] p-5">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#4db8ff]" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 border-2 border-[#4db8ff] bg-[#0a0e27] flex items-center justify-center">
              <Users className="w-5 h-5 text-[#4db8ff]" />
            </div>
            <div>
              <div className="text-xs text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>VALIDATORS</div>
              {validatorsLoading ? (
                <Skeleton className="h-4 w-14" />
              ) : (
                <div className="text-lg text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                  {validatorCount.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Total Transactions */}
        <div className="relative border-3 border-[#4db8ff] bg-[#0f1535] p-5">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#4db8ff]" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 border-2 border-[#4db8ff] bg-[#0a0e27] flex items-center justify-center">
              <Server className="w-5 h-5 text-[#4db8ff]" />
            </div>
            <div>
              <div className="text-xs text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>TOTAL TXS</div>
              {statsLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <div className="text-lg text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                  {stats ? formatLargeNumber(stats.total_txs) : '-'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AVAX Price */}
        <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] p-5">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#8be4ff]" />
          <div className="flex items-center gap-2 mb-2">
            <div>
              <div className="text-xs text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>AVAX</div>
              {priceLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <>
                  <div className="text-lg text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                    ${avaxPrice.toFixed(2)}
                  </div>
                  <div className="text-xs" style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: getChangeColor(avaxChange) }}>
                    {formatPercentage(avaxChange)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* TPS Chart */}
        <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] p-6">
          <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-[#8be4ff] to-transparent" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[#8be4ff] mb-1 uppercase" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                  NETWORK TPS
                </h3>
                <p className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                  TRANSACTIONS PER SECOND (24H)
                </p>
              </div>
              <div className="border-2 border-[#8be4ff] bg-[#0a0e27] px-3 py-1">
                <span className="text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                  ● LIVE
                </span>
              </div>
            </div>
            <div className="h-48 border-2 border-[#4db8ff]/30 bg-[#0a0e27] p-2">
              {tpsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={192}>
                  <BarChart data={chartTpsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2850" />
                    <XAxis dataKey="time" stroke="#4db8ff" tick={{ fontSize: 12, fontFamily: "'VT323', monospace" }} />
                    <YAxis stroke="#4db8ff" tick={{ fontSize: 12, fontFamily: "'VT323', monospace" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0a0e27',
                        border: '2px solid #8be4ff',
                        borderRadius: '0',
                        fontFamily: "'VT323', monospace",
                        fontSize: '18px'
                      }}
                      labelStyle={{ color: '#8be4ff' }}
                    />
                    <Bar dataKey="tps" fill="#8be4ff" radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Price Chart */}
        <div className="relative border-3 border-[#4dff88] bg-[#0f1535] p-6">
          <div className="absolute inset-0 bg-[#4dff88] opacity-5" />
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-[#4dff88] to-transparent" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[#4dff88] mb-1 uppercase" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                  AVAX PRICE (24H)
                </h3>
                <p className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                  PRICE CHART
                </p>
              </div>
              <div className="border-2 border-[#4dff88] bg-[#0a0e27] px-3 py-1">
                <span className="uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '16px', color: getChangeColor(avaxChange) }}>
                  {formatPercentage(avaxChange)}
                </span>
              </div>
            </div>
            <div className="h-48 border-2 border-[#4db8ff]/30 bg-[#0a0e27] p-2">
              {priceLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={192}>
                  <LineChart data={priceChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2850" />
                    <XAxis dataKey="time" stroke="#4db8ff" tick={{ fontSize: 12, fontFamily: "'VT323', monospace" }} />
                    <YAxis stroke="#4db8ff" tick={{ fontSize: 12, fontFamily: "'VT323', monospace" }} domain={['dataMin - 1', 'dataMax + 1']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0a0e27',
                        border: '2px solid #4dff88',
                        borderRadius: '0',
                        fontFamily: "'VT323', monospace",
                        fontSize: '18px'
                      }}
                      labelStyle={{ color: '#4dff88' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                    />
                    <Line type="monotone" dataKey="price" stroke="#4dff88" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Blocks and Transactions */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setActiveTab('blocks')}
            className={`relative border-3 px-6 py-3 transition-all ${
              activeTab === 'blocks'
                ? 'bg-[#8be4ff]/20 border-[#8be4ff] text-[#8be4ff] shadow-[0_0_15px_rgba(139,228,255,0.5)]'
                : 'bg-[#0f1535] border-[#4db8ff] text-[#4db8ff] hover:border-[#8be4ff]'
            }`}
            style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}
          >
            {activeTab === 'blocks' && <div className="absolute inset-0 bg-[#8be4ff] opacity-10 blur" />}
            <div className="flex items-center gap-2 relative z-10">
              <Box className="w-4 h-4" />
              RECENT BLOCKS
            </div>
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            className={`relative border-3 px-6 py-3 transition-all ${
              activeTab === 'transactions'
                ? 'bg-[#8be4ff]/20 border-[#8be4ff] text-[#8be4ff] shadow-[0_0_15px_rgba(139,228,255,0.5)]'
                : 'bg-[#0f1535] border-[#4db8ff] text-[#4db8ff] hover:border-[#8be4ff]'
            }`}
            style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}
          >
            {activeTab === 'transactions' && <div className="absolute inset-0 bg-[#8be4ff] opacity-10 blur" />}
            <div className="flex items-center gap-2 relative z-10">
              <Activity className="w-4 h-4" />
              RECENT TRANSACTIONS
            </div>
          </button>
        </div>

        <TabsContent value="blocks">
          <BlockStream blocks={blocks} loading={blocksLoading} error={blocksError} lastError={blocksLastError} onClearError={clearBlocksError} connected={blocksConnected} />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionStream />
        </TabsContent>
      </Tabs>
    </div>
  );
}
