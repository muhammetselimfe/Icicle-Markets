import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, Check, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAccount } from 'wagmi';
import { api } from '@/app/services/api';
import { getRelativeTime } from '@/app/utils/time';
import { getAddressName, isProtocol, isToken } from '@/app/data/known-addresses';
import type { Transaction } from '@/app/types/api';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-ice-line/[0.08] rounded-lg ${className}`} />;
}

function formatTokenAmount(value: string, decimals: number): string {
  const amount = parseFloat(value) / Math.pow(10, decimals);
  if (amount === 0) return '0';
  if (amount < 0.000001) return '<0.000001';
  if (amount < 0.01) return amount.toFixed(6);
  if (amount < 1) return amount.toFixed(4);
  if (amount < 1000) return amount.toFixed(2);
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function getProtocolName(address: string | null): string | null {
  if (!address || !isProtocol(address)) return null;
  return getAddressName(address);
}

function getTokenName(address: string | null): string | null {
  if (!address || !isToken(address)) return null;
  return getAddressName(address);
}

function getAddressLabel(address: string | null): string | null {
  return getAddressName(address);
}

export function TransactionPage() {
  const { hash } = useParams<{ hash: string }>();
  const navigate = useNavigate();
  const { address: connectedAddress } = useAccount();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    async function fetchTransaction() {
      if (!hash) return;
      try {
        setLoading(true);
        setError(null);
        const response = await api.getTransaction(hash);
        setTx(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch transaction');
      } finally {
        setLoading(false);
      }
    }
    fetchTransaction();
  }, [hash]);

  const copyHash = () => {
    if (tx) {
      navigator.clipboard.writeText(tx.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-2xl">
        <Skeleton className="h-6 w-24 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-2xl">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 bg-ice-surface2 px-4 py-2 rounded-lg text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Back</span>
        </button>
        <div className="bg-red-500/10 p-8 rounded-xl text-center">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-red-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
            {error || 'Transaction not found'}
          </p>
        </div>
      </div>
    );
  }

  const txFee = (tx.gas_used * tx.gas_price) / 1e18;

  const userAddress = (connectedAddress || tx.from).toLowerCase();
  const isUserSender = tx.from.toLowerCase() === userAddress;
  const isUserReceiver = tx.to?.toLowerCase() === userAddress;

  let userSentAvax = 0;
  let userReceivedAvax = 0;

  if (tx.value !== '0') {
    const avaxAmount = parseFloat(tx.value) / 1e18;
    if (isUserSender) {
      userSentAvax = avaxAmount;
    }
    if (isUserReceiver) {
      userReceivedAvax = avaxAmount;
    }
  }

  let userSentToken: { symbol: string; amount: string; decimals: number } | null = null;
  let userReceivedToken: { symbol: string; amount: string; decimals: number } | null = null;

  if (tx.token_transfers && tx.token_transfers.length > 0) {
    const sent = tx.token_transfers.find(t => t.from.toLowerCase() === userAddress);
    if (sent) {
      userSentToken = { symbol: sent.symbol || 'TOKEN', amount: sent.value, decimals: sent.decimals };
    }

    const received = tx.token_transfers.filter(t => t.to.toLowerCase() === userAddress);
    if (received.length > 0) {
      const last = received[received.length - 1];
      userReceivedToken = { symbol: last.symbol || 'TOKEN', amount: last.value, decimals: last.decimals };
    }
  }

  const isApprove = tx.approvals && tx.approvals.length > 0;
  const isSwap = (userSentAvax > 0 || userSentToken) && (userReceivedAvax > 0 || userReceivedToken);
  const isSend = (userSentAvax > 0 || userSentToken) && !userReceivedAvax && !userReceivedToken && !isApprove;
  const isReceive = !userSentAvax && !userSentToken && (userReceivedAvax > 0 || userReceivedToken) && !isApprove;
  const isContract = tx.value === '0' && !userSentToken && !userReceivedToken && !isApprove;

  return (
    <div className="container mx-auto px-6 py-8 max-w-2xl">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 bg-ice-surface2 px-4 py-2 rounded-lg text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Back</span>
      </button>

      <div className="bg-ice-surface rounded-xl overflow-hidden">
        {/* Status Header */}
        <div className={`px-5 py-4 flex items-center justify-between ${tx.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <div className="flex items-center gap-2">
            {tx.success ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
            <span className={tx.success ? 'text-green-500 font-medium' : 'text-red-500 font-medium'} style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
              {tx.success ? 'Success' : 'Failed'}
            </span>
          </div>
          <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
            {getRelativeTime(tx.block_time)}
          </span>
        </div>

        <div className="p-5">
          {/* Main Action Card */}
          {isSwap && (
            <div className="bg-ice-surface2 p-5 mb-5 rounded-lg">
              <div className="text-center mb-5">
                <span className="text-ice-text font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Swap</span>
              </div>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-red-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '24px' }}>
                    {userSentAvax > 0 ? userSentAvax.toFixed(4) : userSentToken ? formatTokenAmount(userSentToken.amount, userSentToken.decimals) : '0'}
                  </div>
                  <div className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                    {userSentAvax > 0 ? 'AVAX' : userSentToken?.symbol || ''}
                  </div>
                </div>

                <ArrowRight className="w-8 h-8 text-ice-faint" />

                <div className="text-center">
                  <div className="text-green-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '24px' }}>
                    {userReceivedAvax > 0 ? userReceivedAvax.toFixed(4) : userReceivedToken ? formatTokenAmount(userReceivedToken.amount, userReceivedToken.decimals) : '0'}
                  </div>
                  <div className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                    {userReceivedAvax > 0 ? 'AVAX' : userReceivedToken?.symbol || ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isSend && (
            <div className="bg-red-500/5 p-6 mb-5 rounded-lg">
              <div className="text-center mb-4">
                <span className="text-red-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Send</span>
              </div>
              <div className="text-center">
                <div className="text-red-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '24px' }}>
                  -{userSentAvax > 0 ? userSentAvax.toFixed(4) : userSentToken ? formatTokenAmount(userSentToken.amount, userSentToken.decimals) : '0'} {userSentAvax > 0 ? 'AVAX' : userSentToken?.symbol}
                </div>
              </div>
            </div>
          )}

          {isReceive && (
            <div className="bg-green-500/5 p-6 mb-5 rounded-lg">
              <div className="text-center mb-4">
                <span className="text-green-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Receive</span>
              </div>
              <div className="text-center">
                <div className="text-green-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '24px' }}>
                  +{userReceivedAvax > 0 ? userReceivedAvax.toFixed(4) : userReceivedToken ? formatTokenAmount(userReceivedToken.amount, userReceivedToken.decimals) : '0'} {userReceivedAvax > 0 ? 'AVAX' : userReceivedToken?.symbol}
                </div>
              </div>
            </div>
          )}

          {isApprove && tx.approvals && tx.approvals.map((approval, i) => (
            <div key={i} className="bg-yellow-500/5 p-6 mb-5 rounded-lg">
              <div className="text-center mb-4">
                <span className="text-yellow-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Approve</span>
              </div>
              <div className="text-center">
                <div className="text-yellow-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '24px' }}>
                  {approval.is_unlimited ? 'Unlimited' : formatTokenAmount(approval.amount, approval.decimals)} {approval.symbol || 'TOKEN'}
                </div>
                <div className="text-ice-muted mt-3" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                  for {getProtocolName(approval.spender) || `${approval.spender.slice(0, 8)}...${approval.spender.slice(-6)}`}
                </div>
              </div>
            </div>
          ))}

          {isContract && (
            <div className="bg-ice-surface2 p-6 mb-5 rounded-lg">
              <div className="text-center mb-4">
                <span className="text-ice-muted font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Contract</span>
              </div>
              <div className="text-center">
                <div className="text-ice-text" style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}>
                  Contract Interaction
                </div>
              </div>
            </div>
          )}

          {/* Fee */}
          <div className="flex items-center justify-between py-4 border-b border-ice-line/15">
            <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Fee</span>
            <span className="text-yellow-500 font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>{txFee.toFixed(6)} AVAX</span>
          </div>

          {/* Block */}
          <div className="flex items-center justify-between py-4 border-b border-ice-line/15">
            <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Block</span>
            <Link to={`/block/${tx.block_number}`} className="text-ice-text hover:text-green-500 transition-colors font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
              #{tx.block_number.toLocaleString()}
            </Link>
          </div>

          {/* From/To */}
          <div className="flex items-center justify-between py-4 border-b border-ice-line/15">
            <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>From</span>
            <Link to={`/address/${tx.from}`} className="text-ice-text hover:text-green-500 transition-colors font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
              {getAddressLabel(tx.from) || `${tx.from.slice(0, 8)}...${tx.from.slice(-6)}`}
            </Link>
          </div>

          {tx.to && (
            <div className="flex items-center justify-between py-4 border-b border-ice-line/15">
              <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                {getProtocolName(tx.to) ? 'Protocol' : getTokenName(tx.to) ? 'Token' : 'To'}
              </span>
              {getProtocolName(tx.to) ? (
                <span className="text-ice-text font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                  {getProtocolName(tx.to)}
                </span>
              ) : getTokenName(tx.to) ? (
                <span className="text-ice-text font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                  {getTokenName(tx.to)}
                </span>
              ) : (
                <Link to={`/address/${tx.to}`} className="text-ice-text hover:text-green-500 transition-colors font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                  {getAddressLabel(tx.to) || `${tx.to.slice(0, 8)}...${tx.to.slice(-6)}`}
                </Link>
              )}
            </div>
          )}

          {/* Hash */}
          <div className="flex items-center justify-between py-4">
            <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>Hash</span>
            <div className="flex items-center gap-3">
              <span className="text-ice-text font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
              </span>
              <button onClick={copyHash} className="p-1.5 rounded-lg hover:bg-ice-line/[0.08] transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-ice-muted" />}
              </button>
            </div>
          </div>

          {/* Details Toggle */}
          {tx.token_transfers && tx.token_transfers.length > 0 && (
            <div className="mt-5">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors"
                style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
              >
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showDetails ? 'Hide' : 'Show'} {tx.token_transfers.length} token transfers
              </button>

              {showDetails && (
                <div className="mt-4 space-y-3 p-4 bg-ice-surface2 rounded-lg">
                  {tx.token_transfers.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                      <span className="text-ice-text">{formatTokenAmount(t.value, t.decimals)} {t.symbol}</span>
                      <span className="text-ice-faint">→</span>
                      <span>{t.to.slice(0, 6)}...{t.to.slice(-4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
