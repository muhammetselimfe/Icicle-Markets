import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Box, ArrowLeft, Copy, Check, ExternalLink, Hash, Cpu, Fuel, Database, Zap, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/app/services/api';
import { formatGas, formatAddress } from '@/app/utils/formatters';
import { getRelativeTime } from '@/app/utils/time';
import type { Block } from '@/app/types/api';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#4db8ff]/20 ${className}`} />;
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
        <div className="border-3 border-[#8be4ff] bg-[#0f1535] p-8">
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
          className="flex items-center gap-2 text-[#8be4ff] hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>BACK</span>
        </button>

        <div className="border-3 border-[#ff4d4d] bg-[#0f1535] p-8 text-center">
          <Box className="w-16 h-16 text-[#ff4d4d] mx-auto mb-4" />
          <h1 className="text-[#ff4d4d] mb-2" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
            BLOCK NOT FOUND
          </h1>
          <p className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
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
        className="flex items-center gap-2 text-[#8be4ff] hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>BACK</span>
      </button>

      {/* Main container */}
      <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden">
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#4dff88] via-[#8be4ff] to-[#4dff88]" />

        <div className="relative z-10 p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 border-3 border-[#8be4ff] bg-[#0a0e27] flex items-center justify-center">
                <Box className="w-8 h-8 text-[#8be4ff]" />
              </div>
              <div>
                <h1 className="text-[#8be4ff] mb-2" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '16px' }}>
                  BLOCK #{block.block_number.toLocaleString()}
                </h1>
                <div className="flex items-center gap-2 text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                  <Clock className="w-4 h-4" />
                  {formatDate(block.block_time)}
                  <span className="text-[#4dff88]">({getRelativeTime(block.block_time)})</span>
                </div>
              </div>
            </div>

            {/* Block navigation */}
            <div className="flex items-center gap-2">
              <Link
                to={`/block/${prevBlock}`}
                className="flex items-center gap-1 px-4 py-2 border-2 border-[#4db8ff] bg-[#0a0e27] hover:border-[#8be4ff] hover:bg-[#8be4ff]/10 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-[#8be4ff]" />
                <span className="text-[#8be4ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>PREV</span>
              </Link>
              <Link
                to={`/block/${nextBlock}`}
                className="flex items-center gap-1 px-4 py-2 border-2 border-[#4db8ff] bg-[#0a0e27] hover:border-[#8be4ff] hover:bg-[#8be4ff]/10 transition-colors"
              >
                <span className="text-[#8be4ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>NEXT</span>
                <ChevronRight className="w-4 h-4 text-[#8be4ff]" />
              </Link>
            </div>
          </div>

          {/* Block Hash */}
          <div className="border-2 border-[#4db8ff]/30 bg-[#0a0e27] p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-5 h-5 text-[#4db8ff]" />
              <span className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                Block Hash
              </span>
            </div>
            <div className="flex items-center gap-3">
              <code className="flex-1 text-[#8be4ff] break-all" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                {block.hash}
              </code>
              <button
                onClick={() => copyToClipboard(block.hash, 'hash')}
                className="p-2 border-2 border-[#4db8ff]/50 hover:border-[#8be4ff] hover:bg-[#8be4ff]/10 transition-colors"
              >
                {copiedField === 'hash' ? (
                  <Check className="w-5 h-5 text-[#4dff88]" />
                ) : (
                  <Copy className="w-5 h-5 text-[#4db8ff]" />
                )}
              </button>
            </div>
          </div>

          {/* Parent Hash */}
          <div className="border-2 border-[#4db8ff]/30 bg-[#0a0e27] p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-5 h-5 text-[#4db8ff]" />
              <span className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                Parent Hash
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/block/${prevBlock}`}
                className="flex-1 text-[#8be4ff] break-all hover:text-[#4dff88] transition-colors"
                style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}
              >
                {block.parent_hash}
              </Link>
              <button
                onClick={() => copyToClipboard(block.parent_hash, 'parent')}
                className="p-2 border-2 border-[#4db8ff]/50 hover:border-[#8be4ff] hover:bg-[#8be4ff]/10 transition-colors"
              >
                {copiedField === 'parent' ? (
                  <Check className="w-5 h-5 text-[#4dff88]" />
                ) : (
                  <Copy className="w-5 h-5 text-[#4db8ff]" />
                )}
              </button>
            </div>
          </div>

          {/* Validated By */}
          <div className="border-2 border-[#4db8ff]/30 bg-[#0a0e27] p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-5 h-5 text-[#4db8ff]" />
              <span className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                Validated By
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/address/${block.miner}`}
                className="flex-1 text-[#8be4ff] break-all hover:text-[#4dff88] transition-colors"
                style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}
              >
                {block.miner}
              </Link>
              <button
                onClick={() => copyToClipboard(block.miner, 'miner')}
                className="p-2 border-2 border-[#4db8ff]/50 hover:border-[#8be4ff] hover:bg-[#8be4ff]/10 transition-colors"
              >
                {copiedField === 'miner' ? (
                  <Check className="w-5 h-5 text-[#4dff88]" />
                ) : (
                  <Copy className="w-5 h-5 text-[#4db8ff]" />
                )}
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {/* Transactions */}
            <div className="border-2 border-[#4dff88]/50 bg-[#0a0e27] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-[#4dff88]" />
                <span className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                  Transactions
                </span>
              </div>
              <div className="text-[#4dff88]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '18px' }}>
                {block.tx_count ?? 0}
              </div>
            </div>

            {/* Size */}
            <div className="border-2 border-[#8be4ff]/50 bg-[#0a0e27] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-[#8be4ff]" />
                <span className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                  Block Size
                </span>
              </div>
              <div className="text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '18px' }}>
                {(block.size / 1024).toFixed(2)} KB
              </div>
            </div>

            {/* Gas Used */}
            <div className="border-2 border-[#ffeb3b]/50 bg-[#0a0e27] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Fuel className="w-5 h-5 text-[#ffeb3b]" />
                <span className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                  Gas Used
                </span>
              </div>
              <div className="text-[#ffeb3b]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
                {formatGas(block.gas_used)}
              </div>
              <div className="mt-3 h-3 bg-[#0a0e27] border-2 border-[#4db8ff]/30">
                <div
                  className="h-full bg-gradient-to-r from-[#4dff88] to-[#ffeb3b]"
                  style={{ width: `${Math.min(parseFloat(gasPercentage), 100)}%` }}
                />
              </div>
              <div className="text-[#4db8ff] mt-1" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                {gasPercentage}% of {formatGas(block.gas_limit)}
              </div>
            </div>

            {/* Base Fee */}
            <div className="border-2 border-[#8be4ff]/50 bg-[#0a0e27] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Fuel className="w-5 h-5 text-[#8be4ff]" />
                <span className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                  Base Fee
                </span>
              </div>
              <div className="text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
                {(block.base_fee_per_gas / 1e9).toFixed(2)} GWEI
              </div>
            </div>
          </div>

          {/* External Link */}
          <a
            href={`https://snowtrace.io/block/${block.block_number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 p-4 border-2 border-[#8be4ff] bg-[#8be4ff]/10 hover:bg-[#8be4ff]/20 transition-colors"
          >
            <ExternalLink className="w-5 h-5 text-[#8be4ff]" />
            <span className="text-[#8be4ff] uppercase" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}>
              View on Snowtrace
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
