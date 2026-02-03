import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { User, ArrowLeft, Copy, Check, ExternalLink, Clock, ArrowRight, Activity } from 'lucide-react';
import { api } from '@/app/services/api';
import { formatAddress, formatWei } from '@/app/utils/formatters';
import { getRelativeTime } from '@/app/utils/time';
import { getAddressName, getAddressInfo } from '@/app/data/known-addresses';
import type { Transaction, NativeBalance } from '@/app/types/api';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#4db8ff]/20 ${className}`} />;
}

export function AddressPage() {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nativeData, setNativeData] = useState<NativeBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 25;
  const addressInfo = getAddressInfo(address);
  const addressLabel = addressInfo?.name || null;
  const addressType = addressInfo?.type || null;

  useEffect(() => {
    async function fetchAddressData() {
      if (!address) return;

      try {
        setLoading(true);
        setError(null);

        // Fetch transactions and native balance in parallel (only native on first page)
        const promises: Promise<any>[] = [
          api.getAddressTransactions(address, 43114, LIMIT, page * LIMIT)
        ];

        if (page === 0) {
          promises.push(api.getAddressNativeBalance(address).catch(() => null));
        }

        const [txResponse, nativeResponse] = await Promise.all(promises);

        if (page === 0) {
          setTransactions(txResponse.data);
          if (nativeResponse?.data) {
            setNativeData(nativeResponse.data);
          }
        } else {
          setTransactions(prev => [...prev, ...txResponse.data]);
        }
        setHasMore(txResponse.data.length === LIMIT);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch address data');
      } finally {
        setLoading(false);
      }
    }

    fetchAddressData();
  }, [address, page]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const loadMore = () => {
    setPage(prev => prev + 1);
  };

  // Calculate stats - use native data if available
  const stats = {
    totalTxs: nativeData?.tx_count !== undefined
      ? nativeData.tx_count.toLocaleString()
      : transactions.length + (hasMore ? '+' : ''),
    sent: transactions.filter(tx => tx.from.toLowerCase() === address?.toLowerCase()).length,
    received: transactions.filter(tx => tx.to?.toLowerCase() === address?.toLowerCase()).length,
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="border-3 border-[#8be4ff] bg-[#0f1535] p-8">
          <div className="space-y-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error && transactions.length === 0) {
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
          <User className="w-16 h-16 text-[#ff4d4d] mx-auto mb-4" />
          <h1 className="text-[#ff4d4d] mb-2" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
            ADDRESS NOT FOUND
          </h1>
          <p className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

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
      <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden mb-6">
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#4dff88] via-[#8be4ff] to-[#4dff88]" />

        <div className="relative z-10 p-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 border-3 border-[#8be4ff] bg-[#0a0e27] flex items-center justify-center">
              <User className="w-8 h-8 text-[#8be4ff]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
                  {addressLabel || 'ADDRESS'}
                </h1>
                {addressType && (
                  <span
                    className={`px-2 py-1 border ${
                      addressType === 'exchange' ? 'bg-[#ffeb3b]/20 border-[#ffeb3b] text-[#ffeb3b]' :
                      addressType === 'bridge' ? 'bg-[#4dff88]/20 border-[#4dff88] text-[#4dff88]' :
                      addressType === 'protocol' ? 'bg-[#8be4ff]/20 border-[#8be4ff] text-[#8be4ff]' :
                      'bg-[#4db8ff]/20 border-[#4db8ff] text-[#4db8ff]'
                    }`}
                    style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}
                  >
                    {addressType.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <code className="text-[#8be4ff] break-all" style={{ fontFamily: "'VT323', monospace", fontSize: '22px' }}>
                  {address}
                </code>
                <button
                  onClick={() => copyToClipboard(address || '', 'address')}
                  className="p-2 border-2 border-[#4db8ff]/50 hover:border-[#8be4ff] hover:bg-[#8be4ff]/10 transition-colors"
                >
                  {copiedField === 'address' ? (
                    <Check className="w-5 h-5 text-[#4dff88]" />
                  ) : (
                    <Copy className="w-5 h-5 text-[#4db8ff]" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border-2 border-[#8be4ff]/50 bg-[#0a0e27] p-4">
              <div className="text-[#4db8ff] uppercase mb-2" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                Total Transactions
              </div>
              <div className="text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '16px' }}>
                {stats.totalTxs}
              </div>
            </div>
            <div className="border-2 border-[#ff4d4d]/50 bg-[#0a0e27] p-4">
              <div className="text-[#4db8ff] uppercase mb-2" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                Sent
              </div>
              <div className="text-[#ff4d4d]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '16px' }}>
                {stats.sent}
              </div>
            </div>
            <div className="border-2 border-[#4dff88]/50 bg-[#0a0e27] p-4">
              <div className="text-[#4db8ff] uppercase mb-2" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                Received
              </div>
              <div className="text-[#4dff88]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '16px' }}>
                {stats.received}
              </div>
            </div>
          </div>

          {/* External Link */}
          <a
            href={`https://snowtrace.io/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 p-3 border-2 border-[#8be4ff] bg-[#8be4ff]/10 hover:bg-[#8be4ff]/20 transition-colors"
          >
            <ExternalLink className="w-5 h-5 text-[#8be4ff]" />
            <span className="text-[#8be4ff] uppercase" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
              View on Snowtrace
            </span>
          </a>
        </div>
      </div>

      {/* Transactions List */}
      <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden">
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />

        <div className="relative z-10">
          <div className="p-4 border-b-2 border-[#4db8ff]/30">
            <h2 className="text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}>
              TRANSACTIONS
            </h2>
          </div>

          {transactions.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="w-12 h-12 text-[#4db8ff] mx-auto mb-4" />
              <p className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                No transactions found for this address
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#4db8ff]/20">
                {transactions.map((tx) => {
                  const isSent = tx.from.toLowerCase() === address?.toLowerCase();
                  return (
                    <Link
                      key={tx.hash}
                      to={`/tx/${tx.hash}`}
                      className="block p-4 hover:bg-[#8be4ff]/5 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {/* Direction icon */}
                        <div className={`w-10 h-10 border-2 flex items-center justify-center ${
                          isSent ? 'border-[#ff4d4d] bg-[#ff4d4d]/10' : 'border-[#4dff88] bg-[#4dff88]/10'
                        }`}>
                          <ArrowRight className={`w-5 h-5 ${isSent ? 'text-[#ff4d4d]' : 'text-[#4dff88] rotate-180'}`} />
                        </div>

                        {/* Transaction info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[#8be4ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                              {formatAddress(tx.hash, 12, 8)}
                            </span>
                            <span className={`px-2 py-0.5 text-xs ${
                              isSent ? 'bg-[#ff4d4d]/20 text-[#ff4d4d]' : 'bg-[#4dff88]/20 text-[#4dff88]'
                            }`} style={{ fontFamily: "'VT323', monospace" }}>
                              {isSent ? 'OUT' : 'IN'}
                            </span>
                          </div>
                          <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                            {isSent ? (
                              <>To: {tx.to ? formatAddress(tx.to, 8, 6) : 'Contract Creation'}</>
                            ) : (
                              <>From: {formatAddress(tx.from, 8, 6)}</>
                            )}
                          </div>
                        </div>

                        {/* Value */}
                        <div className="text-right">
                          <div className={`${isSent ? 'text-[#ff4d4d]' : 'text-[#4dff88]'}`} style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                            {isSent ? '-' : '+'}{formatWei(tx.value)}
                          </div>
                          <div className="flex items-center gap-1 text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                            <Clock className="w-3 h-3" />
                            {getRelativeTime(tx.block_time)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="p-4 border-t-2 border-[#4db8ff]/30">
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full p-3 border-2 border-[#8be4ff] bg-[#8be4ff]/10 hover:bg-[#8be4ff]/20 transition-colors disabled:opacity-50"
                  >
                    <span className="text-[#8be4ff] uppercase" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
                      {loading ? 'Loading...' : 'Load More'}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
