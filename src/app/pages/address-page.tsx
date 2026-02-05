import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { User, ArrowLeft, Copy, Check, ExternalLink, Clock, ArrowRight, Activity } from 'lucide-react';
import { api } from '@/app/services/api';
import { formatAddress, formatWei } from '@/app/utils/formatters';
import { getRelativeTime } from '@/app/utils/time';
import { getAddressName, getAddressInfo } from '@/app/data/known-addresses';
import type { Transaction, NativeBalance } from '@/app/types/api';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded-lg ${className}`} />;
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
        <div className="bg-white/[0.02] p-8 rounded-xl">
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
          className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Back</span>
        </button>

        <div className="bg-red-500/10 p-8 rounded-xl text-center">
          <User className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-red-500 font-medium mb-2" style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}>
            Address Not Found
          </h1>
          <p className="text-slate-400" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
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
        className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Back</span>
      </button>

      {/* Main container */}
      <div className="bg-white/[0.02] rounded-xl overflow-hidden mb-6">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center">
              <User className="w-7 h-7 text-slate-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}>
                  {addressLabel || 'Address'}
                </h1>
                {addressType && (
                  <span
                    className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      addressType === 'exchange' ? 'bg-yellow-500/10 text-yellow-500' :
                      addressType === 'bridge' ? 'bg-green-500/10 text-green-500' :
                      addressType === 'protocol' ? 'bg-white/10 text-white' :
                      'bg-white/10 text-slate-400'
                    }`}
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {addressType.charAt(0).toUpperCase() + addressType.slice(1)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <code className="text-white break-all" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                  {address}
                </code>
                <button
                  onClick={() => copyToClipboard(address || '', 'address')}
                  className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {copiedField === 'address' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white/5 p-4 rounded-lg">
              <div className="text-slate-400 mb-2" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                Total Transactions
              </div>
              <div className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '18px' }}>
                {stats.totalTxs}
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-lg">
              <div className="text-slate-400 mb-2" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                Sent
              </div>
              <div className="text-red-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '18px' }}>
                {stats.sent}
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-lg">
              <div className="text-slate-400 mb-2" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                Received
              </div>
              <div className="text-green-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '18px' }}>
                {stats.received}
              </div>
            </div>
          </div>

          {/* External Link */}
          <a
            href={`https://snowtrace.io/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
              View on Snowtrace
            </span>
          </a>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white/[0.02] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
            Transactions
          </h2>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
              No transactions found for this address
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/10">
              {transactions.map((tx) => {
                const isSent = tx.from.toLowerCase() === address?.toLowerCase();
                return (
                  <Link
                    key={tx.hash}
                    to={`/tx/${tx.hash}`}
                    className="block p-4 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Direction icon */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isSent ? 'bg-red-500/10' : 'bg-green-500/10'
                      }`}>
                        <ArrowRight className={`w-5 h-5 ${isSent ? 'text-red-500' : 'text-green-500 rotate-180'}`} />
                      </div>

                      {/* Transaction info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                            {formatAddress(tx.hash, 12, 8)}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            isSent ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                          }`} style={{ fontFamily: "Inter, sans-serif" }}>
                            {isSent ? 'OUT' : 'IN'}
                          </span>
                        </div>
                        <div className="text-slate-400" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                          {isSent ? (
                            <>To: {tx.to ? formatAddress(tx.to, 8, 6) : 'Contract Creation'}</>
                          ) : (
                            <>From: {formatAddress(tx.from, 8, 6)}</>
                          )}
                        </div>
                      </div>

                      {/* Value */}
                      <div className="text-right">
                        <div className={`font-medium ${isSent ? 'text-red-500' : 'text-green-500'}`} style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                          {isSent ? '-' : '+'}{formatWei(tx.value)}
                        </div>
                        <div className="flex items-center gap-1 text-slate-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '12px' }}>
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
              <div className="p-4 border-t border-white/10">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <span className="text-slate-400 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                    {loading ? 'Loading...' : 'Load More'}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
