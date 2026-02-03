import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Box, Zap, Clock, AlertTriangle, X } from 'lucide-react';
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
  newBlockIndex: number; // Position among new blocks (for staggered animation)
}) {
  // Calculate opacity based on position (fade out towards bottom)
  const fadeStart = Math.max(0, totalBlocks - 3); // Start fading last 3 blocks
  const opacity = index >= fadeStart ? 1 - ((index - fadeStart + 1) / 4) * 0.7 : 1;

  // Stagger delay for new blocks (each new block animates 0.3s after the previous)
  const animationDelay = isNew ? `${newBlockIndex * 0.3}s` : '0s';

  return (
    <Link
      to={`/block/${block.block_number}`}
      className={`
        block-item relative overflow-hidden cursor-pointer block
        ${isNew ? 'block-item-enter' : ''}
        ${isExiting ? 'block-item-exit' : ''}
      `}
      style={{
        opacity: isExiting ? 0 : opacity,
        animationDelay: animationDelay,
      }}
    >
      {/* Main card */}
      <div className={`
        relative border-2 bg-[#0a0e27] p-3 transition-all duration-300
        ${isNew
          ? 'border-[#4dff88] glow-pulse'
          : 'border-[#4db8ff]/50 hover:border-[#8be4ff] hover:shadow-[0_0_15px_rgba(139,228,255,0.3)]'
        }
      `}>
        {/* New block glow effect */}
        {isNew && (
          <div className="absolute inset-0 bg-gradient-to-r from-[#4dff88]/20 via-transparent to-transparent" />
        )}

        <div className="relative z-10 flex items-center gap-3">
          {/* Block icon */}
          <div className={`
            relative w-10 h-10 border-2 flex items-center justify-center transition-all duration-300
            ${isNew
              ? 'border-[#4dff88] bg-[#4dff88]/10'
              : 'border-[#8be4ff] bg-[#0f1535]'
            }
          `}>
            <Box className={`w-5 h-5 ${isNew ? 'text-[#4dff88]' : 'text-[#8be4ff]'}`} />
          </div>

          {/* Block info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`font-bold ${isNew ? 'text-[#4dff88]' : 'text-[#8be4ff]'}`}
                style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}
              >
                #{block.block_number.toLocaleString()}
              </span>
              {isNew && (
                <span
                  className="px-1.5 py-0.5 bg-[#4dff88]/20 border border-[#4dff88] text-[#4dff88] uppercase"
                  style={{ fontFamily: "'VT323', monospace", fontSize: '12px' }}
                >
                  NEW
                </span>
              )}
              <span className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>•</span>
              <span className="flex items-center gap-1 text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                <Zap className="w-3 h-3" />
                {block.tx_count ?? 0} TXS
              </span>
              <span className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>•</span>
              <span className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>{formatGas(block.gas_used)} GAS</span>
              <span className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>•</span>
              <span className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>{(block.size / 1024).toFixed(1)} KB</span>
            </div>
          </div>

          {/* Time */}
          <div
            className={`flex items-center gap-1 ${isNew ? 'text-[#4dff88]' : 'text-[#8be4ff]'}`}
            style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
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
      className="relative border-2 border-[#4db8ff]/30 bg-[#0a0e27] p-3 animate-pulse"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 border-2 border-[#4db8ff]/30 bg-[#0f1535]" />
        <div className="flex-1 flex items-center gap-3">
          <div className="h-4 w-28 bg-[#4db8ff]/20" />
          <div className="h-3 w-16 bg-[#4db8ff]/10" />
          <div className="h-3 w-20 bg-[#4db8ff]/10" />
        </div>
        <div className="h-4 w-16 bg-[#4db8ff]/20" />
      </div>
    </div>
  );
}

export function BlockStream({ blocks, loading, error, lastError, onClearError, connected }: BlockStreamProps) {
  const [newBlockNumbers, setNewBlockNumbers] = useState<Set<number>>(new Set());
  const [exitingBlocks, setExitingBlocks] = useState<Set<number>>(new Set());
  const prevBlocksRef = useRef<Block[]>([]);
  const [blocksPerSecond, setBlocksPerSecond] = useState(0);
  const blockTimestamps = useRef<number[]>([]);

  // Format error timestamp
  const formatErrorTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Track new blocks and calculate blocks per second
  useEffect(() => {
    if (blocks.length > 0) {
      const prevNumbers = new Set(prevBlocksRef.current.map(b => b.block_number));
      const newNumbers = new Set<number>();

      blocks.forEach(block => {
        if (!prevNumbers.has(block.block_number)) {
          newNumbers.add(block.block_number);
          blockTimestamps.current.push(Date.now());
        }
      });

      // Calculate blocks per second (last 10 seconds)
      const now = Date.now();
      blockTimestamps.current = blockTimestamps.current.filter(t => now - t < 10000);
      setBlocksPerSecond(blockTimestamps.current.length / 10);

      if (newNumbers.size > 0) {
        setNewBlockNumbers(newNumbers);

        // Mark old blocks as exiting
        const currentNumbers = new Set(blocks.map(b => b.block_number));
        const exiting = new Set<number>();
        prevBlocksRef.current.forEach(block => {
          if (!currentNumbers.has(block.block_number)) {
            exiting.add(block.block_number);
          }
        });
        setExitingBlocks(exiting);

        // Clear "new" status after animation
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

  // Only show full error state if we have no blocks at all
  if (error && blocks.length === 0) {
    return (
      <div className="relative border-3 border-[#ff4d4d] bg-[#0f1535] p-6">
        <div className="flex items-center gap-2 text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
          <Box className="w-5 h-5" />
          Error loading blocks: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Persistent error banner - shows last error even after recovery */}
      {lastError && (
        <div className="mb-3 relative border-2 border-[#ff4d4d] bg-[#ff4d4d]/10 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#ff4d4d]" />
              <span className="text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                ERROR @ {formatErrorTime(lastError.timestamp)}: {lastError.message}
              </span>
            </div>
            {onClearError && (
              <button
                onClick={onClearError}
                className="p-1 hover:bg-[#ff4d4d]/20 transition-colors"
              >
                <X className="w-4 h-4 text-[#ff4d4d]" />
              </button>
            )}
          </div>
        </div>
      )}
      {/* Inject animations */}
      <style>{`
        @keyframes slideInFromTop {
          0% {
            opacity: 0;
            transform: translateY(-60px);
            max-height: 0;
            margin-bottom: 0;
            padding: 0;
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
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(20px);
          }
        }

        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(77, 255, 136, 0.4);
          }
          50% {
            box-shadow: 0 0 40px rgba(77, 255, 136, 0.6);
          }
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

        .glow-pulse {
          animation: glowPulse 1s ease-in-out infinite;
        }
      `}</style>

      {/* Header with live indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3
            className="text-[#8be4ff] uppercase"
            style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}
          >
            LIVE BLOCKS
          </h3>
          <div className={`flex items-center gap-2 px-3 py-1 border-2 ${
            connected
              ? 'border-[#4dff88] bg-[#4dff88]/10'
              : 'border-[#ffeb3b] bg-[#ffeb3b]/10'
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              connected ? 'bg-[#4dff88]' : 'bg-[#ffeb3b]'
            }`} />
            <span
              className={`uppercase ${connected ? 'text-[#4dff88]' : 'text-[#ffeb3b]'}`}
              style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}
            >
              {connected ? 'LIVE' : 'CONNECTING...'}
            </span>
          </div>
        </div>

        {/* Speed indicator */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 border-2 border-[#8be4ff] bg-[#0a0e27]">
            <span
              className="text-[#8be4ff]"
              style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
            >
              ~{blocksPerSecond.toFixed(1)} BLOCKS/SEC
            </span>
          </div>
          <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
            SUB-SECOND FINALITY
          </div>
        </div>
      </div>

      {/* Block stream container */}
      <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden">
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#4dff88] via-[#8be4ff] to-[#4dff88]" />

        {/* Animated background grid */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, #8be4ff 1px, transparent 1px),
                linear-gradient(to bottom, #8be4ff 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative z-10 p-4 space-y-2 max-h-[520px] overflow-hidden">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <BlockSkeleton key={i} index={i} />
            ))
          ) : (
            blocks.map((block, index) => {
              const isNew = newBlockNumbers.has(block.block_number);
              // Calculate position among new blocks for staggered animation
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

        {/* Fade out gradient at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0f1535] to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
