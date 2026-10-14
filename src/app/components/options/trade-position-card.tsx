import { useRef, useEffect } from 'react';
import { useChainId } from 'wagmi';
import { toast } from 'sonner';
import { cn } from '@/app/components/ui/utils';
import { CHAIN_IDS } from '@/app/config/wagmi';
import { useOptionsTrading } from '@/app/hooks/useOptionsTrading';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { MarketState, type PositionDisplay } from '@/app/types/options';
import { formatTickAsPrice, formatUsdc } from '@/app/utils/options';

const FONT = { fontFamily: 'Inter, sans-serif' };

// --- Position Card (compact card for positions grid) ---
const CLOSE_SLIPPAGE_BPS = 200n; // 2% slippage protection on close

export function PositionCard({ position: p, tickDivisor = 1 }: { position: PositionDisplay; tickDivisor?: number }) {
  const chainId = useChainId();
  const { switchForTab, isSwitching } = useChainSwitch();
  const { step, txHash, error: execError, closePosition, claimPayout, reset } = useOptionsTrading();
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;
  const prevStepRef = useRef(step);

  const isFinalized =
    p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary;
  const canClose = p.marketState === MarketState.Trading && !p.claimed;
  const canClaim = isFinalized && !p.claimed && p.isWinner === true;
  const isLoser = isFinalized && p.isWinner === false;

  // PNL calculation — after settlement, use actual payout (quantity for winners, 0 for losers)
  const hasCostBasis = p.costBasis > 0n;
  const effectiveValue = isLoser ? 0n : canClaim ? p.quantity : p.currentValue;
  const pnl = hasCostBasis ? Number(effectiveValue - p.costBasis) / 1e6 : null;
  const pnlPct = hasCostBasis && p.costBasis > 0n
    ? ((Number(effectiveValue) / Number(p.costBasis)) - 1) * 100
    : null;

  // Toast on success/error
  useEffect(() => {
    if (prevStepRef.current !== step) {
      const range = `${formatTickAsPrice(p.lowerTick, tickDivisor)} – ${formatTickAsPrice(p.upperTick, tickDivisor)}`;
      if (step === 'success' && (prevStepRef.current === 'closing' || prevStepRef.current === 'claiming')) {
        const valueStr = formatUsdc(p.currentValue);
        const pnlStr = pnl !== null
          ? ` (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`
          : '';
        const action = prevStepRef.current === 'closing' ? 'Position closed' : 'Payout claimed';
        toast.success(`${action}`, {
          description: `${range} — received ${valueStr}${pnlStr}`,
          duration: 5000,
        });
        // Auto-reset so the card shows "Close" again until it disappears on refetch
        setTimeout(() => reset(), 1500);
      } else if (step === 'error') {
        toast.error('Transaction failed', {
          description: execError || `Failed to close ${range}`,
          duration: 5000,
        });
      }
      prevStepRef.current = step;
    }
  }, [step, p, pnl, tickDivisor, execError, reset]);

  const handleAction = async () => {
    if (isWrongChain) { await switchForTab('options'); return; }
    if (step === 'error') { reset(); return; }
    if (canClaim) await claimPayout(p.positionId);
    else if (canClose) {
      const minProceeds = p.currentValue > 0n
        ? (p.currentValue * (10000n - CLOSE_SLIPPAGE_BPS)) / 10000n
        : 0n;
      await closePosition(p.positionId, minProceeds);
    }
  };

  const getActionLabel = () => {
    if (isWrongChain) return 'Switch';
    if (step === 'closing') return 'Closing…';
    if (step === 'claiming') return 'Claiming…';
    if (step === 'success') return 'Done';
    if (step === 'error') return 'Retry';
    if (canClaim) return 'Claim';
    if (canClose) return 'Close';
    return '';
  };

  const isActionDisabled = step === 'closing' || step === 'claiming' || step === 'success';
  const isBusy = step === 'closing' || step === 'claiming' || isSwitching;
  const qty = Number(p.quantity) / 1e6;

  // Open position: the headline is what it pays if it WINS (quantity x $1). The sell-back
  // value is secondary — selling early walks the price back down, so large positions in a
  // thin market quote far below their payout; that is slippage, not a loss on the bet.
  const isOpen = canClose;
  const payoutIfWin = Number(p.quantity) / 1e6;
  const costUsd = Number(p.costBasis) / 1e6;
  const winPnl = hasCostBasis ? payoutIfWin - costUsd : null;
  const winPct = hasCostBasis && costUsd > 0 ? (payoutIfWin / costUsd - 1) * 100 : null;
  const sellPnl = hasCostBasis ? Number(p.currentValue) / 1e6 - costUsd : null;
  const sellPct = hasCostBasis && costUsd > 0 ? (Number(p.currentValue) / 1e6 / costUsd - 1) * 100 : null;
  const headlinePnl = isOpen ? winPnl : pnl;
  const pnlColor = headlinePnl !== null ? (headlinePnl >= 0 ? '#4dff88' : '#ff4d4d') : undefined;
  const valueUsd = Number(effectiveValue) / 1e6;

  return (
    <div className="bg-ice-surface border border-ice-line/15 rounded-xl hover:border-[#8be4ff]/20 transition-colors relative overflow-hidden">
      {/* PNL accent bar at top */}
      {pnlColor && (
        <div className="h-[2px]" style={{ backgroundColor: pnlColor, opacity: 0.5 }} />
      )}

      <div className="p-3.5">
        {/* Row 1: Range + Position ID */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[#8be4ff] tabular-nums" style={{ ...FONT, fontSize: '13px', fontWeight: 600 }}>
            {formatTickAsPrice(p.lowerTick, tickDivisor)} – {formatTickAsPrice(p.upperTick, tickDivisor)}
          </span>
          <span className="text-ice-faint tabular-nums" style={{ ...FONT, fontSize: '11px' }}>
            #{p.positionId}
          </span>
        </div>

        {/* Row 2: Value + Cost in two columns */}
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-ice-faint" style={{ ...FONT, fontSize: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {isOpen ? 'Payout if wins' : canClaim ? 'Payout' : 'Value'}
            </div>
            <span className="text-ice-text tabular-nums font-semibold" style={{ ...FONT, fontSize: '18px' }}>
              {isOpen ? formatUsdc(p.quantity) : formatUsdc(effectiveValue)}
            </span>
          </div>
          <div className="text-right">
            <div className="text-ice-faint" style={{ ...FONT, fontSize: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Cost</div>
            <span className="text-ice-muted tabular-nums" style={{ ...FONT, fontSize: '14px' }}>
              {hasCostBasis ? formatUsdc(p.costBasis) : '—'}
            </span>
          </div>
        </div>

        {/* Row 3 (open positions): if-wins vs sell-now, side by side */}
        {isOpen && winPnl !== null && sellPnl !== null && (
          <div className="rounded-lg mb-3 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-ice-muted" style={{ ...FONT, fontSize: '11px' }}>If it wins</span>
              <span className="tabular-nums font-medium" style={{ ...FONT, fontSize: '12px', color: winPnl >= 0 ? '#4dff88' : '#ff4d4d' }}>
                {winPnl >= 0 ? '+' : ''}${winPnl.toFixed(2)}{winPct !== null && ` (${winPct >= 0 ? '+' : ''}${winPct.toFixed(1)}%)`}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-ice-line/[0.06]" title="Selling before settlement walks the price back down. Large positions in a thin market quote far below their payout when sold early — that is slippage, not the outcome of the bet.">
              <span className="text-ice-faint" style={{ ...FONT, fontSize: '11px' }}>Sell now · {formatUsdc(p.currentValue)}</span>
              <span className="tabular-nums" style={{ ...FONT, fontSize: '11px', color: sellPnl >= 0 ? '#4dff88' : '#ff4d4d', opacity: 0.85 }}>
                {sellPnl >= 0 ? '+' : ''}${sellPnl.toFixed(2)}{sellPct !== null && ` (${sellPct >= 0 ? '+' : ''}${sellPct.toFixed(1)}%)`}
              </span>
            </div>
          </div>
        )}

        {/* Row 3 (settled): realised P&L strip */}
        {!isOpen && pnl !== null && (
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg mb-3"
            style={{ backgroundColor: pnl >= 0 ? 'rgba(77,255,136,0.06)' : 'rgba(255,77,77,0.06)' }}
          >
            <span className="text-ice-muted" style={{ ...FONT, fontSize: '11px' }}>P&L</span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums font-medium" style={{ ...FONT, fontSize: '13px', color: pnlColor }}>
                {pnl >= 0 ? '+' : ''}${Math.abs(pnl) < 0.01 ? pnl.toFixed(4) : pnl.toFixed(2)}
              </span>
              {pnlPct !== null && (
                <span
                  className="tabular-nums px-1.5 py-0.5 rounded font-semibold"
                  style={{
                    ...FONT,
                    fontSize: '11px',
                    color: pnlColor,
                    backgroundColor: pnl >= 0 ? 'rgba(77,255,136,0.12)' : 'rgba(255,77,77,0.12)',
                  }}
                >
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Row 4: Action */}
        <div className="flex items-center justify-end">
          {(canClose || canClaim) && (
            <button
              onClick={handleAction}
              disabled={isActionDisabled}
              className={cn(
                'px-3.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5',
                isActionDisabled
                  ? 'bg-ice-surface2 text-ice-faint cursor-not-allowed'
                  : canClaim
                    ? 'bg-[#8be4ff]/10 text-[#8be4ff] hover:bg-[#8be4ff]/20'
                    : 'bg-ice-line/[0.06] text-ice-muted hover:bg-ice-line/[0.1] hover:text-ice-text',
              )}
              style={{ ...FONT, fontSize: '12px' }}
            >
              {isBusy && <span className="w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />}
              {getActionLabel()}
            </button>
          )}
          {isLoser && (
            <span className="px-3.5 py-1.5 rounded-lg bg-ice-down/10 text-ice-down font-medium" style={{ ...FONT, fontSize: '12px' }}>Lost</span>
          )}
          {p.claimed && (
            <span className="text-ice-faint" style={{ ...FONT, fontSize: '12px' }}>Claimed</span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Claim All Button ---
export function ClaimAllButton({ positions }: { positions: PositionDisplay[] }) {
  const chainId = useChainId();
  const { switchForTab } = useChainSwitch();
  const { step, error: execError, batchClaimPayout, reset } = useOptionsTrading();
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

  const claimable = positions.filter(
    (p) =>
      !p.claimed &&
      p.isWinner === true &&
      (p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary),
  );

  if (claimable.length <= 1) return null;

  const handleClaimAll = async () => {
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (step === 'error') {
      reset();
      return;
    }
    await batchClaimPayout(claimable.map((p) => p.positionId));
  };

  const isBusy = step === 'claiming';

  return (
    <>
      <button
        onClick={handleClaimAll}
        disabled={isBusy}
        className={cn(
          'ml-auto px-4 py-1.5 rounded-lg font-medium transition-colors',
          isBusy
            ? 'bg-ice-surface2 text-ice-faint cursor-not-allowed'
            : 'bg-ice-up/10 text-ice-up hover:bg-ice-up/20',
        )}
        style={{ ...FONT, fontSize: '13px' }}
      >
        {isBusy ? 'Claiming...' : step === 'error' ? 'Retry' : `Claim All (${claimable.length})`}
      </button>
      {step === 'error' && execError && (
        <span className="text-ice-down" style={{ ...FONT, fontSize: '12px' }}>{execError}</span>
      )}
    </>
  );
}
