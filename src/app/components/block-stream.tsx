import { useState, useEffect, useRef, useMemo } from 'react';
import { Box, AlertTriangle, X } from 'lucide-react';
import { formatGas } from '@/app/utils/formatters';
import { getRelativeTime } from '@/app/utils/time';
import type { Block } from '@/app/types/api';
import { LiveListCard, LiveRow, LiveRowSkeleton } from './live-list';

interface BlockStreamProps {
  blocks: Block[];
  loading: boolean;
  error: string | null;
  lastError?: { message: string; timestamp: Date } | null;
  onClearError?: () => void;
  connected?: boolean;
}

export function BlockStream({ blocks, loading, error, lastError, onClearError, connected }: BlockStreamProps) {
  const [newBlockNumbers, setNewBlockNumbers] = useState<Set<number>>(new Set());
  const [exitingBlocks, setExitingBlocks] = useState<Set<number>>(new Set());
  const prevBlocksRef = useRef<Block[]>([]);

  // The feed can deliver a block twice around a reconnect; keep one row per number.
  const uniqueBlocks = useMemo(() => {
    const seen = new Set<number>();
    return blocks.filter((b) => (seen.has(b.block_number) ? false : (seen.add(b.block_number), true)));
  }, [blocks]);

  const blocksPerSecond = useMemo(() => {
    if (uniqueBlocks.length < 2) return 0;
    let totalTime = 0;
    let count = 0;
    for (let i = 0; i < Math.min(uniqueBlocks.length - 1, 5); i++) {
      const newer = new Date(uniqueBlocks[i].block_time).getTime();
      const older = new Date(uniqueBlocks[i + 1].block_time).getTime();
      const diff = (newer - older) / 1000;
      if (diff > 0 && diff < 10) {
        totalTime += diff;
        count++;
      }
    }
    const avg = count > 0 ? totalTime / count : 0;
    return avg > 0 ? 1 / avg : 0;
  }, [uniqueBlocks]);

  useEffect(() => {
    if (uniqueBlocks.length === 0) return;
    const prevNumbers = new Set(prevBlocksRef.current.map((b) => b.block_number));
    const fresh = new Set(uniqueBlocks.filter((b) => !prevNumbers.has(b.block_number)).map((b) => b.block_number));

    if (fresh.size > 0) {
      setNewBlockNumbers(fresh);
      const current = new Set(uniqueBlocks.map((b) => b.block_number));
      setExitingBlocks(new Set(prevBlocksRef.current.filter((b) => !current.has(b.block_number)).map((b) => b.block_number)));
      const timer = setTimeout(() => {
        setNewBlockNumbers(new Set());
        setExitingBlocks(new Set());
      }, 1500);
      prevBlocksRef.current = uniqueBlocks;
      return () => clearTimeout(timer);
    }
    prevBlocksRef.current = uniqueBlocks;
  }, [uniqueBlocks]);

  const notice =
    error && uniqueBlocks.length === 0 ? (
      <div className="flex items-center gap-2 px-5 py-3 text-ice-down text-[13px] border-b border-ice-line/10">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Could not load blocks: {error}
      </div>
    ) : lastError ? (
      <div className="flex items-center gap-2 px-5 py-2.5 text-yellow-500 text-[13px] border-b border-ice-line/10">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">
          {lastError.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {lastError.message}
        </span>
        {onClearError && (
          <button type="button" onClick={onClearError} className="w-8 h-8 -mr-2 rounded-full flex items-center justify-center hover:bg-ice-line/[0.08]" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    ) : null;

  const newest = Array.from(newBlockNumbers).sort((a, b) => b - a);

  return (
    <LiveListCard title="Blocks" connected={!!connected} rate={blocksPerSecond > 0 ? `${blocksPerSecond.toFixed(1)} blocks/s` : undefined} notice={notice}>
      {loading ? (
        <LiveRowSkeleton />
      ) : (
        uniqueBlocks.map((block) => {
          const isNew = newBlockNumbers.has(block.block_number);
          return (
            <LiveRow
              key={block.block_number}
              to={`/block/${block.block_number}`}
              icon={<Box className="w-[18px] h-[18px]" />}
              title={`#${block.block_number.toLocaleString('en-US')}`}
              subtitle={`${block.tx_count ?? 0} txs · ${formatGas(block.gas_used)} gas · ${(block.size / 1024).toFixed(1)} KB`}
              trailing={getRelativeTime(block.block_time)}
              isNew={isNew}
              isExiting={exitingBlocks.has(block.block_number)}
              delayMs={isNew ? newest.indexOf(block.block_number) * 120 : 0}
            />
          );
        })
      )}
    </LiveListCard>
  );
}
