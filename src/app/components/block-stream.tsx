import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Zap, Clock, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { formatGas } from '@/app/utils/formatters';
import { getRelativeTime } from '@/app/utils/time';
import type { Block } from '@/app/types/api';

interface BlockStreamProps {
  blocks: Block[];
  loading: boolean;
  error: string | null;
  lastError?: { message: string; timestamp: Date } | null;
  onClearError?: () => void;
  connected?: boolean;
}

// Animated block card component
function BlockCard({
  block,
  index,
  isNew,
  isExiting,
  totalBlocks,
  newBlockIndex,
}: {
  block: Block;
  index: number;
  isNew: boolean;
  isExiting: boolean;
  totalBlocks: number;
  newBlockIndex: number;
}) {
  const fadeStart = Math.max(0, totalBlocks - 3);
  const opacity = index >= fadeStart ? 1 - ((index - fadeStart + 1) / 4) * 0.7 : 1;
  const animationDelay = isNew ? `${newBlockIndex * 0.3}s` : '0s';

  return (
    <Link
      to={`/block/${block.block_number}`}
      className={cn(
        "block-item relative overflow-hidden cursor-pointer block",
        isNew && "block-item-enter",
        isExiting && "block-item-exit"
      )}
      style={{
        opacity: isExiting ? 0 : opacity,
        animationDelay: animationDelay,
      }}
    >
      <div className={cn(
        "relative bg-ice-surface2 p-3 rounded-lg transition-all duration-300",
        isNew ? "ring-1 ring-green-500/30" : "hover:bg-ice-line/[0.08]"
      )}>
        {isNew && (
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 via-transparent to-transparent rounded-lg" />
        )}

        <div className="relative z-10 flex items-center gap-3">
          <div className={cn(
            "relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-300",
            isNew ? "bg-green-500/10" : "bg-ice-line/[0.08]"
          )}>
            <Box className={cn("w-5 h-5", isNew ? "text-green-500" : "text-ice-muted")} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn("font-medium", isNew ? "text-green-500" : "text-ice-text", 'text-[14px]')}
              >
                #{block.block_number.toLocaleString()}
              </span>
              {isNew && (
                <span
                  className="px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded text-xs font-medium"
                >
                  NEW
                </span>
              )}
              <span className="text-ice-faint">•</span>
              <span className="flex items-center gap-1 text-ice-muted text-[13px]">
                <Zap className="w-3 h-3" />
                {block.tx_count ?? 0} txs
              </span>
              <span className="text-ice-faint">•</span>
              <span className="text-ice-muted text-[13px]">
                {formatGas(block.gas_used)} gas
              </span>
              <span className="text-ice-faint">•</span>
              <span className="text-ice-muted text-[13px]">
                {(block.size / 1024).toFixed(1)} KB
              </span>
            </div>
          </div>

          <div
            className={cn("flex items-center gap-1", isNew ? "text-green-500" : "text-ice-faint", 'text-[13px]')}
          >
            <Clock className="w-3 h-3" />
            {getRelativeTime(block.block_time)}
          </div>
        </div>
      </div>
    </Link>
  );
}

// Loading skeleton
function BlockSkeleton({ index }: { index: number }) {
  return (
    <div
      className="relative bg-ice-surface2 p-3 rounded-lg animate-pulse"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-ice-line/[0.08] rounded-lg" />
        <div className="flex-1 flex items-center gap-3">
          <div className="h-4 w-28 bg-ice-line/[0.08] rounded" />
          <div className="h-3 w-16 bg-ice-surface2 rounded" />
          <div className="h-3 w-20 bg-ice-surface2 rounded" />
        </div>
        <div className="h-4 w-16 bg-ice-line/[0.08] rounded" />
      </div>
    </div>
  );
}

export function BlockStream({ blocks, loading, error, lastError, onClearError, connected }: BlockStreamProps) {
  const [newBlockNumbers, setNewBlockNumbers] = useState<Set<number>>(new Set());
  const [exitingBlocks, setExitingBlocks] = useState<Set<number>>(new Set());
  const prevBlocksRef = useRef<Block[]>([]);

  const formatErrorTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Calculate blocks per second from actual block timestamps
  const blocksPerSecond = useMemo(() => {
    if (blocks.length < 2) return 0;

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

    const avgBlockTime = count > 0 ? totalTime / count : 0;
    return avgBlockTime > 0 ? 1 / avgBlockTime : 0;
  }, [blocks]);

  useEffect(() => {
    if (blocks.length > 0) {
      const prevNumbers = new Set(prevBlocksRef.current.map(b => b.block_number));
      const newNumbers = new Set<number>();

      blocks.forEach(block => {
        if (!prevNumbers.has(block.block_number)) {
          newNumbers.add(block.block_number);
        }
      });

      if (newNumbers.size > 0) {
        setNewBlockNumbers(newNumbers);

        const currentNumbers = new Set(blocks.map(b => b.block_number));
        const exiting = new Set<number>();
        prevBlocksRef.current.forEach(block => {
          if (!currentNumbers.has(block.block_number)) {
            exiting.add(block.block_number);
          }
        });
        setExitingBlocks(exiting);

        const timer = setTimeout(() => {
          setNewBlockNumbers(new Set());
          setExitingBlocks(new Set());
        }, 2000);

        prevBlocksRef.current = blocks;
        return () => clearTimeout(timer);
      }

      prevBlocksRef.current = blocks;
    }
  }, [blocks]);

  if (error && blocks.length === 0) {
    return (
      <div className="bg-red-500/10 p-5 rounded-xl">
        <div className="flex items-center gap-2 text-red-500 text-[14px]">
          <Box className="w-4 h-4" />
          Error loading blocks: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {lastError && (
        <div className="mb-3 bg-red-500/10 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-red-500 text-[13px]">
                Error @ {formatErrorTime(lastError.timestamp)}: {lastError.message}
              </span>
            </div>
            {onClearError && (
              <button
                onClick={onClearError}
                className="p-1 hover:bg-ice-line/[0.06] transition-colors rounded"
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInFromTop {
          0% {
            opacity: 0;
            transform: translateY(-60px);
            max-height: 0;
            margin-bottom: 0;
          }
          30% {
            max-height: 100px;
            margin-bottom: 8px;
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            max-height: 100px;
            margin-bottom: 8px;
          }
        }

        @keyframes fadeOut {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(20px); }
        }

        .block-item {
          transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .block-item-enter {
          animation: slideInFromTop 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
        }

        .block-item-exit {
          animation: fadeOut 0.3s ease-out forwards;
        }
      `}</style>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-ice-text font-medium text-[14px]">
            Live Blocks
          </h3>
          <div className={cn(
            "flex items-center gap-2 px-2.5 py-1 rounded-lg",
            connected ? "bg-green-500/10" : "bg-yellow-500/10"
          )}>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full animate-pulse",
              connected ? "bg-green-500" : "bg-yellow-500"
            )} />
            <span
              className={cn(connected ? "text-green-500" : "text-yellow-500", 'text-[12px]')}
            >
              {connected ? 'Live' : 'Connecting...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 bg-ice-surface2 rounded-lg">
            <span className="text-ice-muted text-[13px]">
              ~{blocksPerSecond.toFixed(1)} blocks/sec
            </span>
          </div>
        </div>
      </div>

      <div className="relative bg-ice-surface overflow-hidden rounded-xl">
        <div className="relative z-10 p-4 space-y-2 max-h-[520px] overflow-hidden">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <BlockSkeleton key={i} index={i} />
            ))
          ) : (
            blocks.map((block, index) => {
              const isNew = newBlockNumbers.has(block.block_number);
              const newBlockIndex = isNew
                ? Array.from(newBlockNumbers).sort((a, b) => b - a).indexOf(block.block_number)
                : 0;
              return (
                <BlockCard
                  key={block.block_number}
                  block={block}
                  index={index}
                  isNew={isNew}
                  isExiting={exitingBlocks.has(block.block_number)}
                  totalBlocks={blocks.length}
                  newBlockIndex={newBlockIndex}
                />
              );
            })
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-ice-bg to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
