import { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, ExternalLink, Loader2, Check, Settings } from 'lucide-react';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { cn } from '@/app/components/ui/utils';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { ERC20_ABI } from '@/app/config/options-abis';
import { useOptionsCostPreview } from '@/app/hooks/useOptionsCostPreview';
import { useOptionsTrading } from '@/app/hooks/useOptionsTrading';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { MarketState, type MarketDisplay, type PositionDisplay } from '@/app/types/options';
import { generateTicks, formatTickAsPrice, formatUsdc, parseUsdc } from '@/app/utils/options';

const SLIPPAGE_OPTIONS = [
  { label: '0.5%', value: 50 },
  { label: '1%', value: 100 },
  { label: '3%', value: 300 },
];

interface OptionsTradeModalProps {
  market: MarketDisplay | null;
  closePositionData?: PositionDisplay | null;
  onClose: () => void;
}

export function OptionsTradeModal({ market, closePositionData, onClose }: OptionsTradeModalProps) {
  const { login } = useLogin();
  const { authenticated, logout } = usePrivy();
  const { address, isConnected } = useAccount();

  const handleLogin = async () => {
    if (authenticated) {
      await logout();
    }
    login();
  };
  const chainId = useChainId();
  const { switchForTab, isSwitching } = useChainSwitch();
  const { step, txHash, error: execError, openPosition, closePosition, claimPayout, reset } = useOptionsTrading();

  const [lowerTick, setLowerTick] = useState<bigint | null>(null);
  const [upperTick, setUpperTick] = useState<bigint | null>(null);
  const [quantity, setQuantity] = useState('');
  const [slippage, setSlippage] = useState(100); // 1%
  const [showSettings, setShowSettings] = useState(false);

  const isOpen = !!market || !!closePositionData;
  const isCloseMode = !!closePositionData;
  const isClaimMode = isCloseMode && (closePositionData.marketState === MarketState.FinalizedPrimary || closePositionData.marketState === MarketState.FinalizedSecondary);
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

  // Available ticks from market params
  const availableTicks = useMemo(() => {
    if (!market) return [];
    return generateTicks(market.minTick, market.maxTick, market.tickSpacing);
  }, [market]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setLowerTick(null);
      setUpperTick(null);
      setQuantity('');
      setShowSettings(false);
      reset();
    }
  }, [isOpen, reset]);

  // USDC balance
  const { data: usdcBalance } = useReadContract({
    address: OPTIONS_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_IDS.FUJI,
    query: { enabled: !!address && isOpen && !isCloseMode },
  });

  // Cost preview for open mode
  const { cost, loading: costLoading, error: costError } = useOptionsCostPreview({
    marketId: market?.marketId ?? 0,
    lowerTick,
    upperTick,
    quantity,
  });

  // Max cost with slippage
  const maxCost = useMemo(() => {
    if (!cost) return null;
    return (cost * (10000n + BigInt(slippage))) / 10000n;
  }, [cost, slippage]);

  const hasInsufficientBalance = useMemo(() => {
    if (!maxCost || !usdcBalance) return false;
    return maxCost > (usdcBalance as bigint);
  }, [maxCost, usdcBalance]);

  // Handle open position
  const handleOpenClick = async () => {
    if (!isConnected) {
      handleLogin();
      return;
    }
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (!market || !lowerTick || !upperTick || !maxCost) return;

    const qty = parseUsdc(quantity);
    if (qty <= 0n) return;

    await openPosition({
      marketId: market.marketId,
      lowerTick,
      upperTick,
      quantity: qty,
      maxCost,
    });
  };

  // Handle close position
  const handleCloseClick = async () => {
    if (!closePositionData) return;
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (isClaimMode) {
      await claimPayout(closePositionData.positionId);
    } else {
      await closePosition(closePositionData.positionId, 0n);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Button text
  const getButtonText = () => {
    if (!isConnected) return 'Sign In';
    if (isWrongChain) return 'Switch Network';

    if (isCloseMode) {
      if (step === 'claiming') return 'Claiming...';
      if (step === 'closing') return 'Closing...';
      if (step === 'success') return 'Success!';
      if (step === 'error') return 'Try Again';
      return isClaimMode ? 'Claim Payout' : 'Close Position';
    }

    if (!lowerTick || !upperTick) return 'Select Range';
    if (!quantity || quantity === '0') return 'Enter Quantity';
    if (costLoading) return 'Calculating...';
    if (costError) return 'Cost Error';
    if (hasInsufficientBalance) return 'Insufficient USDC';
    if (step === 'approving') return 'Approving USDC...';
    if (step === 'opening') return 'Opening Position...';
    if (step === 'success') return 'Success!';
    if (step === 'error') return 'Try Again';
    return 'Open Position';
  };

  const isButtonDisabled = () => {
    if (!isConnected) return false;
    if (isWrongChain) return false;

    if (isCloseMode) {
      return step === 'closing' || step === 'claiming';
    }

    if (!lowerTick || !upperTick) return true;
    if (!quantity || quantity === '0') return true;
    if (costLoading) return true;
    if (costError) return true;
    if (hasInsufficientBalance) return true;
    if (!cost) return true;
    if (step === 'approving' || step === 'opening') return true;
    return false;
  };

  if (!isOpen) return null;

  // Success state
  if (step === 'success' && txHash) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
        <div className="relative border border-white/10 bg-[#0f1535] w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <div className="relative z-10 p-6 md:p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-green-500/10 rounded-2xl flex items-center justify-center">
              <Check className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-white font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px' }}>
              Transaction Successful
            </h2>
            <p className="text-slate-400 mb-6" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              {isCloseMode
                ? isClaimMode ? 'Payout claimed successfully' : 'Position closed successfully'
                : 'Position opened successfully'}
            </p>
            <a
              href={`https://testnet.snowtrace.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
            >
              View on Snowtrace <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={handleClose}
              className="w-full bg-white/5 hover:bg-white/10 text-white py-4 rounded-xl font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Close/Claim mode
  if (isCloseMode && closePositionData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
        <div className="relative border border-white/10 bg-[#0f1535] w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-white font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
                {isClaimMode ? 'Claim Payout' : 'Close Position'}
              </h2>
              <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Position details */}
            <div className="p-5 space-y-4">
              <div className="bg-white/5 p-4 rounded-xl space-y-3">
                <DetailRow label="Position" value={`#${closePositionData.positionId}`} />
                <DetailRow label="Market" value={`#${closePositionData.marketId}`} />
                <DetailRow label="Range" value={`${formatTickAsPrice(closePositionData.lowerTick, closePositionData.tickDivisor)} – ${formatTickAsPrice(closePositionData.upperTick, closePositionData.tickDivisor)}`} />
                <DetailRow label="Quantity" value={(Number(closePositionData.quantity) / 1e6).toFixed(2)} />
                <DetailRow label="Cost Basis" value={formatUsdc(closePositionData.costBasis)} />
                <DetailRow label="Current Value" value={formatUsdc(closePositionData.currentValue)} highlight />
              </div>
            </div>

            {/* Error */}
            {execError && (
              <div className="px-5 pb-4">
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-red-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                    {execError}
                  </span>
                </div>
              </div>
            )}

            {/* Action */}
            <div className="p-4 md:p-5">
              <button
                onClick={handleCloseClick}
                disabled={isButtonDisabled()}
                className={cn(
                  'w-full py-4 rounded-xl font-medium transition-all flex items-center justify-center gap-3 min-h-[52px]',
                  isButtonDisabled()
                    ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                    : isClaimMode
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-red-500 text-white hover:bg-red-600',
                )}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}
              >
                {(step === 'closing' || step === 'claiming') && <Loader2 className="w-5 h-5 animate-spin" />}
                {getButtonText()}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Open position mode
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
      <div className="relative border border-white/10 bg-[#0f1535] w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <h2 className="text-white font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
                Open Position
              </h2>
              {market && (
                <div className="text-slate-400 mt-0.5" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                  {market.assetSymbol}/USD — Market #{market.marketId}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  showSettings ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5',
                )}
              >
                <Settings className="w-5 h-5" />
              </button>
              <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Slippage settings */}
          {showSettings && (
            <div className="p-4 border-b border-white/10 bg-white/[0.02]">
              <div className="text-slate-400 mb-3" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                Max Cost Slippage
              </div>
              <div className="flex gap-2">
                {SLIPPAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSlippage(opt.value)}
                    className={cn(
                      'px-4 py-2 rounded-lg transition-all font-medium',
                      slippage === opt.value ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-400 hover:text-white',
                    )}
                    style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tick range selectors */}
          <div className="p-5 space-y-4">
            <div>
              <label className="text-slate-400 mb-2 block" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                Lower Bound
              </label>
              <select
                value={lowerTick?.toString() ?? ''}
                onChange={(e) => setLowerTick(e.target.value ? BigInt(e.target.value) : null)}
                className="w-full bg-white/5 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none"
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}
              >
                <option value="">Select lower tick</option>
                {availableTicks.map((t) => (
                  <option key={t.toString()} value={t.toString()}>
                    {formatTickAsPrice(t, market?.tickDivisor)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 mb-2 block" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                Upper Bound
              </label>
              <select
                value={upperTick?.toString() ?? ''}
                onChange={(e) => setUpperTick(e.target.value ? BigInt(e.target.value) : null)}
                className="w-full bg-white/5 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none"
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}
              >
                <option value="">Select upper tick</option>
                {availableTicks
                  .filter((t) => !lowerTick || t > lowerTick)
                  .map((t) => (
                    <option key={t.toString()} value={t.toString()}>
                      {formatTickAsPrice(t, market?.tickDivisor)}
                    </option>
                  ))}
              </select>
            </div>

            {/* Quantity input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                  Quantity (USDC)
                </label>
                {usdcBalance !== undefined && (
                  <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                    Balance: {formatUsdc(usdcBalance as bigint)}
                  </span>
                )}
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-white text-right focus:outline-none font-medium text-2xl"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                />
              </div>
            </div>

            {/* Cost preview */}
            {lowerTick && upperTick && quantity && (
              <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                    Estimated Cost
                  </span>
                  <span className="text-white" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                    {costLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    ) : cost ? (
                      formatUsdc(cost)
                    ) : (
                      '-'
                    )}
                  </span>
                </div>
                {maxCost && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                      Max Cost (incl. slippage)
                    </span>
                    <span className="text-white" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                      {formatUsdc(maxCost)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {(costError || execError) && (
            <div className="px-5 pb-4">
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <span className="text-red-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                  {costError || execError}
                </span>
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="p-4 md:p-5">
            <button
              onClick={handleOpenClick}
              disabled={isButtonDisabled()}
              className={cn(
                'w-full py-4 rounded-xl font-medium transition-all flex items-center justify-center gap-3 min-h-[52px]',
                hasInsufficientBalance
                  ? 'bg-red-500/10 text-red-500 cursor-not-allowed'
                  : isButtonDisabled()
                  ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                  : 'bg-green-500 text-white hover:bg-green-600',
              )}
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}
            >
              {(step === 'approving' || step === 'opening') && <Loader2 className="w-5 h-5 animate-spin" />}
              {isSwitching && <Loader2 className="w-5 h-5 animate-spin" />}
              {getButtonText()}
            </button>
          </div>

          {/* Pending tx link */}
          {txHash && (step === 'opening' || step === 'approving') && (
            <div className="px-4 pb-4 text-center">
              <a
                href={`https://testnet.snowtrace.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
              >
                View Transaction <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
        {label}
      </span>
      <span
        className={highlight ? 'text-white font-medium' : 'text-white'}
        style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
      >
        {value}
      </span>
    </div>
  );
}
