import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Box, ArrowLeft, Copy, Check, ExternalLink, Hash, Cpu, Fuel, Database, Zap, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/app/services/api';
import { formatGas } from '@/app/utils/formatters';
import { getRelativeTime } from '@/app/utils/time';
import type { Block } from '@/app/types/api';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-ice-line/[0.08] rounded-lg ${className}`} />;
}

export function BlockPage() {
  const { blockNumber } = useParams<{ blockNumber: string }>();
  const navigate = useNavigate();
  const [block, setBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBlock() {
      if (!blockNumber) return;

      try {
        setLoading(true);
        setError(null);
        const response = await api.getBlock(parseInt(blockNumber, 10));
        setBlock(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch block');
      } finally {
        setLoading(false);
      }
    }

    fetchBlock();
  }, [blockNumber]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="bg-ice-surface p-8 rounded-xl">
          <div className="space-y-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="container mx-auto px-6 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 bg-ice-surface2 px-4 py-2 rounded-lg text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[14px]">Back</span>
        </button>

        <div className="bg-red-500/10 p-8 rounded-xl text-center">
          <Box className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-red-500 font-medium mb-2 text-[16px]">
            Block Not Found
          </h1>
          <p className="text-ice-muted text-[14px]">
            {error || `Block #${blockNumber} could not be found`}
          </p>
        </div>
      </div>
    );
  }

  const gasPercentage = ((block.gas_used / block.gas_limit) * 100).toFixed(1);
  const prevBlock = block.block_number - 1;
  const nextBlock = block.block_number + 1;

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 bg-ice-surface2 px-4 py-2 rounded-lg text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-[14px]">Back</span>
      </button>

      {/* Main container */}
      <div className="bg-ice-surface rounded-xl overflow-hidden">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-ice-line/[0.08] rounded-xl flex items-center justify-center">
                <Box className="w-7 h-7 text-ice-muted" />
              </div>
              <div>
                <h1 className="text-ice-text font-medium mb-1 text-[18px]">
                  Block #{block.block_number.toLocaleString()}
                </h1>
                <div className="flex items-center gap-2 text-ice-muted text-[14px]">
                  <Clock className="w-4 h-4" />
                  {formatDate(block.block_time)}
                  <span className="text-green-500">({getRelativeTime(block.block_time)})</span>
                </div>
              </div>
            </div>

            {/* Block navigation */}
            <div className="flex items-center gap-2">
              <Link
                to={`/block/${prevBlock}`}
                className="flex items-center gap-1 px-4 py-2 bg-ice-surface2 rounded-lg hover:bg-ice-line/[0.08] transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-ice-muted" />
                <span className="text-ice-muted text-[14px]">Prev</span>
              </Link>
              <Link
                to={`/block/${nextBlock}`}
                className="flex items-center gap-1 px-4 py-2 bg-ice-surface2 rounded-lg hover:bg-ice-line/[0.08] transition-colors"
              >
                <span className="text-ice-muted text-[14px]">Next</span>
                <ChevronRight className="w-4 h-4 text-ice-muted" />
              </Link>
            </div>
          </div>

          {/* Block Hash */}
          <div className="bg-ice-surface2 p-4 mb-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-ice-muted" />
              <span className="text-ice-muted text-[13px]">
                Block Hash
              </span>
            </div>
            <div className="flex items-center gap-3">
              <code className="flex-1 text-ice-text break-all text-[14px]">
                {block.hash}
              </code>
              <button
                onClick={() => copyToClipboard(block.hash, 'hash')}
                className="p-2 bg-ice-surface2 rounded-lg hover:bg-ice-line/[0.08] transition-colors"
              >
                {copiedField === 'hash' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-ice-muted" />
                )}
              </button>
            </div>
          </div>

          {/* Parent Hash */}
          <div className="bg-ice-surface2 p-4 mb-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-ice-muted" />
              <span className="text-ice-muted text-[13px]">
                Parent Hash
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/block/${prevBlock}`}
                className="flex-1 text-ice-text break-all hover:text-green-500 transition-colors text-[14px]"
              >
                {block.parent_hash}
              </Link>
              <button
                onClick={() => copyToClipboard(block.parent_hash, 'parent')}
                className="p-2 bg-ice-surface2 rounded-lg hover:bg-ice-line/[0.08] transition-colors"
              >
                {copiedField === 'parent' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-ice-muted" />
                )}
              </button>
            </div>
          </div>

          {/* Validated By */}
          <div className="bg-ice-surface2 p-4 mb-6 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-ice-muted" />
              <span className="text-ice-muted text-[13px]">
                Validated By
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/address/${block.miner}`}
                className="flex-1 text-ice-text break-all hover:text-green-500 transition-colors text-[14px]"
              >
                {block.miner}
              </Link>
              <button
                onClick={() => copyToClipboard(block.miner, 'miner')}
                className="p-2 bg-ice-surface2 rounded-lg hover:bg-ice-line/[0.08] transition-colors"
              >
                {copiedField === 'miner' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-ice-muted" />
                )}
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {/* Transactions - Links to Snowtrace */}
            <a
              href={`https://snowtrace.io/block/${block.block_number}/txs`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-ice-surface2 p-4 rounded-lg hover:bg-ice-line/[0.08] transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-ice-muted" />
                  <span className="text-ice-muted text-[13px]">
                    Transactions
                  </span>
                </div>
                <ExternalLink className="w-3 h-3 text-ice-faint" />
              </div>
              <div className="text-ice-text font-medium text-[18px]">
                {block.tx_count ?? 0}
              </div>
            </a>

            {/* Size */}
            <div className="bg-ice-surface2 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-ice-muted" />
                <span className="text-ice-muted text-[13px]">
                  Block Size
                </span>
              </div>
              <div className="text-ice-text font-medium text-[18px]">
                {(block.size / 1024).toFixed(2)} KB
              </div>
            </div>

            {/* Gas Used */}
            <div className="bg-ice-surface2 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Fuel className="w-4 h-4 text-ice-muted" />
                <span className="text-ice-muted text-[13px]">
                  Gas Used
                </span>
              </div>
              <div className="text-ice-text font-medium text-[16px]">
                {formatGas(block.gas_used)}
              </div>
              <div className="mt-3 h-2 bg-ice-line/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-yellow-500 rounded-full"
                  style={{ width: `${Math.min(parseFloat(gasPercentage), 100)}%` }}
                />
              </div>
              <div className="text-ice-faint mt-1 text-[12px]">
                {gasPercentage}% of {formatGas(block.gas_limit)}
              </div>
            </div>

            {/* Base Fee */}
            <div className="bg-ice-surface2 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Fuel className="w-4 h-4 text-ice-muted" />
                <span className="text-ice-muted text-[13px]">
                  Base Fee
                </span>
              </div>
              <div className="text-ice-text font-medium text-[16px]">
                {(block.base_fee_per_gas / 1e9).toFixed(2)} GWEI
              </div>
            </div>
          </div>

          {/* External Link */}
          <a
            href={`https://snowtrace.io/block/${block.block_number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 p-4 bg-ice-surface2 rounded-lg hover:bg-ice-line/[0.08] transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-ice-muted" />
            <span className="text-ice-muted font-medium text-[14px]">
              View on Snowtrace
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
