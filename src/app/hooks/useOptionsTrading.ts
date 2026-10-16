import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { encodeFunctionData, decodeErrorResult } from 'viem';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI, ERC20_ABI } from '@/app/config/options-abis';
import { fetchRedstonePayload, withPayload } from '@/app/services/redstonePayload';
import type { TradeStep } from '@/app/types/options';

/** Safety margin over the fresh quote, on top of the user's slippage (bps). */
const VIEW_EXECUTE_BUFFER_BPS = 200n;

export function useOptionsTrading() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_IDS.FUJI });
  const queryClient = useQueryClient();

  const [step, setStep] = useState<TradeStep>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidateOptions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['optionsMarkets'] });
    queryClient.invalidateQueries({ queryKey: ['optionsPositions'] });
    queryClient.invalidateQueries({ queryKey: ['optionsUsdcBalance'] });
  }, [queryClient]);

  const ensureAllowance = useCallback(
    async (amount: bigint): Promise<boolean> => {
      if (!address || !publicClient || !walletClient) return false;
      try {
        const allowance = await publicClient.readContract({
          address: OPTIONS_CONTRACTS.usdc,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, OPTIONS_CONTRACTS.core],
        });
        if ((allowance as bigint) >= amount) return true;

        setStep('approving');
        const approveGas = await publicClient.estimateContractGas({
          address: OPTIONS_CONTRACTS.usdc,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [OPTIONS_CONTRACTS.core, amount],
          account: address,
        });
        const hash = await walletClient.writeContract({
          address: OPTIONS_CONTRACTS.usdc,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [OPTIONS_CONTRACTS.core, amount],
          gas: approveGas + approveGas / 4n, // 25% buffer
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return true;
      } catch (err) {
        if (err instanceof Error && (err.message.includes('User rejected') || err.message.includes('user rejected'))) {
          setError('Approval rejected');
        } else {
          setError('Approval failed');
        }
        return false;
      }
    },
    [address, publicClient, walletClient],
  );

  /**
   * Send a Core trade with the signed RedStone price appended to the calldata (v2.1):
   * the Core refreshes the market's trade oracle atomically before pricing, so the
   * trade never fails the staleness gate and prices against a price seconds old.
   * Falls back to a plain call if the payload cannot be fetched.
   */
  const lastQtyRef = useRef<bigint | null>(null);
  const sendTradeTx = useCallback(
    async (functionName: 'openPosition' | 'closePosition', args: readonly unknown[], feedId: string) => {
      if (!address || !walletClient || !publicClient) throw new Error('Wallet not connected');
      const base = encodeFunctionData({ abi: CORE_ABI, functionName, args } as any);
      const data = withPayload(base, await fetchRedstonePayload(feedId));
      const gas = await publicClient.estimateGas({ account: address, to: OPTIONS_CONTRACTS.core, data });
      return walletClient.sendTransaction({ to: OPTIONS_CONTRACTS.core, data, gas: gas + gas / 4n });
    },
    [address, walletClient, publicClient],
  );

  const openPosition = useCallback(
    async (params: {
      marketId: number;
      lowerTick: bigint;
      upperTick: bigint;
      quantity: bigint;
      maxCost: bigint;
      /** When set, the quote is refreshed right before sending and maxCost is rebuilt from it. */
      slippageBps?: number;
      /** RedStone feed to attach (defaults to AVAX). */
      feedId?: string;
    }) => {
      if (!address || !walletClient || !publicClient) {
        setError('Wallet not connected');
        setStep('error');
        return;
      }

      setStep('idle');
      setError(null);
      setTxHash(null);

      try {
        // Re-quote immediately before submitting: on dynamic markets the quote decays
        // with time (σ narrows toward settlement), so a quote that is 20–30 s old can
        // already exceed the slippage buffer.
        let maxCost = params.maxCost;
        if (params.slippageBps !== undefined) {
          const fresh = (await publicClient.readContract({
            address: OPTIONS_CONTRACTS.core,
            abi: CORE_ABI,
            functionName: 'calculateOpenCost',
            args: [BigInt(params.marketId), params.lowerTick, params.upperTick, params.quantity],
          })) as bigint;
          const rebuilt = (fresh * (10000n + BigInt(params.slippageBps) + VIEW_EXECUTE_BUFFER_BPS)) / 10000n;
          if (rebuilt > maxCost) maxCost = rebuilt;
        }

        const approved = await ensureAllowance(maxCost);
        if (!approved) {
          setStep('error');
          return;
        }

        setStep('opening');
        lastQtyRef.current = params.quantity;
        const hash = await sendTradeTx(
          'openPosition',
          [BigInt(params.marketId), params.lowerTick, params.upperTick, params.quantity, maxCost],
          params.feedId ?? 'AVAX',
        );

        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setStep('success');
        invalidateOptions();
      } catch (err: any) {
        // Deep-log raw error for debugging
        console.error('[openPosition] RAW ERROR:', err);
        console.error('[openPosition] error.data:', err?.data);
        console.error('[openPosition] error.cause:', err?.cause);
        console.error('[openPosition] error.details:', err?.details);
        if (err?.cause?.data) console.error('[openPosition] cause.data:', err.cause.data);
        if (err?.walk) {
          const walked = err.walk();
          console.error('[openPosition] walked error:', walked);
          console.error('[openPosition] walked.data:', walked?.data);
        }
        handleTxError(err);
      }
    },
    [address, walletClient, publicClient, ensureAllowance, invalidateOptions, sendTradeTx],
  );

  const closePosition = useCallback(
    async (positionId: number, minProceeds: bigint = 0n, feedId: string = 'AVAX') => {
      if (!address || !walletClient || !publicClient) {
        setError('Wallet not connected');
        setStep('error');
        return;
      }

      setStep('idle');
      setError(null);
      setTxHash(null);

      try {
        setStep('closing');
        const hash = await sendTradeTx('closePosition', [BigInt(positionId), minProceeds], feedId);

        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setStep('success');
        invalidateOptions();
      } catch (err) {
        handleTxError(err);
      }
    },
    [address, walletClient, publicClient, invalidateOptions],
  );

  const claimPayout = useCallback(
    async (positionId: number) => {
      if (!address || !walletClient || !publicClient) {
        setError('Wallet not connected');
        setStep('error');
        return;
      }

      setStep('idle');
      setError(null);
      setTxHash(null);

      try {
        setStep('claiming');
        const claimGas = await publicClient.estimateContractGas({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'claimPayout',
          args: [BigInt(positionId)],
          account: address,
        });
        const hash = await walletClient.writeContract({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'claimPayout',
          args: [BigInt(positionId)],
          gas: claimGas + claimGas / 4n,
        });

        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setStep('success');
        invalidateOptions();
      } catch (err) {
        handleTxError(err);
      }
    },
    [address, walletClient, publicClient, invalidateOptions],
  );

  const batchClaimPayout = useCallback(
    async (positionIds: number[]) => {
      if (!address || !walletClient || !publicClient) {
        setError('Wallet not connected');
        setStep('error');
        return;
      }
      if (positionIds.length === 0) return;

      setStep('idle');
      setError(null);
      setTxHash(null);

      try {
        setStep('claiming');
        const ids = positionIds.map((id) => BigInt(id));
        const gas = await publicClient.estimateContractGas({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'batchClaimPayout',
          args: [ids],
          account: address,
        });
        const hash = await walletClient.writeContract({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'batchClaimPayout',
          args: [ids],
          gas: gas + gas / 4n,
        });

        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setStep('success');
        invalidateOptions();
      } catch (err) {
        handleTxError(err);
      }
    },
    [address, walletClient, publicClient, invalidateOptions],
  );

  function handleTxError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Extract decoded error name from viem's error chain
    // viem includes "errorName" in ContractFunctionRevertedError
    let errorName = extractErrorName(err);
    let errorArgs: readonly unknown[] | undefined;
    if (!errorName) {
      // Raw-calldata sends (payload-attached trades) surface the revert as hex data; decode it ourselves
      const data = findRevertData(err);
      if (data) {
        try {
          const decoded = decodeErrorResult({ abi: CORE_ABI, data });
          errorName = decoded.errorName;
          errorArgs = decoded.args as readonly unknown[] | undefined;
        } catch { /* not one of ours */ }
      }
    }
    if (errorName === 'BinExposureCapExceeded' && errorArgs && lastQtyRef.current !== null) {
      // args: marketId, bin, attempted, cap — headroom = cap - (attempted - quantity)
      const attempted = BigInt(errorArgs[2] as bigint), cap = BigInt(errorArgs[3] as bigint);
      const headroom = cap - (attempted - lastQtyRef.current);
      const units = Number(headroom > 0n ? headroom : 0n) / 1e6;
      setError(`One bin in this range can only take ${units.toFixed(0)} more payout units (limit ${(Number(cap) / 1e6).toLocaleString()} per bin). Try a smaller amount, or a range that avoids the full bin.`);
      setStep('error');
      return;
    }

    if (msg.includes('User rejected') || msg.includes('user rejected')) {
      setError('Transaction rejected');
    } else if (errorName === 'InsufficientBalance' || msg.includes('insufficient funds') || msg.includes('InsufficientBalance')) {
      setError('Insufficient USDC balance');
    } else if (errorName === 'CostExceedsMaximum' || msg.includes('CostExceedsMaximum')) {
      setError('Price moved while submitting. Try again or increase slippage.');
    } else if (errorName === 'InvalidQuantity' || msg.includes('InvalidQuantity')) {
      setError('Invalid quantity - enter a valid amount');
    } else if (errorName === 'MarketNotStarted' || msg.includes('MarketNotStarted')) {
      setError('Market has not started trading yet');
    } else if (errorName === 'MarketNotSeeded' || msg.includes('MarketNotSeeded')) {
      setError('Market is not ready yet');
    } else if (errorName === 'MarketExpired' || msg.includes('MarketExpired')) {
      setError('Market has expired');
    } else if (errorName === 'InvalidTick' || errorName === 'InvalidTickRange' || errorName === 'InvalidTickSpacing' || msg.includes('InvalidTickRange') || msg.includes('TickOutOfRange')) {
      setError('Invalid price range selected');
    } else if (errorName === 'PositionNotFound' || msg.includes('PositionNotFound')) {
      setError('Position not found');
    } else if (errorName === 'UnauthorizedCaller' || msg.includes('UnauthorizedCaller')) {
      setError('You do not own this position');
    } else if (errorName === 'MarketNotSettled' || msg.includes('MarketNotSettled')) {
      setError('Market has not settled yet');
    } else if (errorName === 'PayoutAlreadyClaimed' || msg.includes('PayoutAlreadyClaimed')) {
      setError('Payout already claimed');
    } else if (errorName === 'NoPayout' || msg.includes('NoPayout')) {
      setError('No payout - position did not win');
    } else if (errorName === 'ProceedsBelowMinimum' || msg.includes('ProceedsBelowMinimum')) {
      setError('Sell price too low - try reducing slippage protection');
    } else if (errorName === 'ClaimTooEarly' || msg.includes('ClaimTooEarly')) {
      setError('Too early to claim - wait for the claim window to open');
    } else if (errorName === 'InsufficientPositionQuantity' || msg.includes('InsufficientPositionQuantity')) {
      setError('Insufficient position quantity');
    } else if (errorName === 'AlphaExceedsLimit' || msg.includes('AlphaExceedsLimit')) {
      setError('Market liquidity limit reached');
    } else if (errorName === 'PerTicketCapExceeded' || errorName === 'PerAccountCapExceeded') {
      setError('Position size exceeds market cap - try a smaller amount');
    } else if (errorName === 'InsufficientFreeBalance') {
      setError('Market has insufficient liquidity for this trade');
    } else if (errorName === 'FeeExceedsBase') {
      setError('Fee calculation error - try a different amount');
    } else if (errorName === 'BinExposureCapExceeded' || msg.includes('BinExposureCapExceeded')) {
      setError('This price range is at its exposure limit - try a smaller amount or another range');
    } else if (errorName === 'TradingHalted' || msg.includes('TradingHalted')) {
      setError('Trading is paused on this market after a sharp price move - try again shortly');
    } else if (errorName === 'OracleStaleForTrade' || errorName === 'OracleNotInitializedForTrade' || msg.includes('OracleStaleForTrade') || msg.includes('OracleNotInitializedForTrade')) {
      setError('Live price unavailable for this market right now - try again in a few seconds');
    } else if (msg.includes('execution reverted')) {
      setError('Transaction failed - try a smaller amount');
    } else {
      setError(msg.slice(0, 100).split('\n')[0]);
    }
    setStep('error');
  }

  /** Walk viem's error chain for raw revert data (0x… custom-error selector + args) */
  function findRevertData(err: unknown, depth = 0): `0x${string}` | null {
    if (!err || typeof err !== 'object' || depth > 6) return null;
    const e = err as Record<string, unknown>;
    const candidates = [e.data, (e.data as Record<string, unknown> | undefined)?.data, e.raw];
    for (const c of candidates) if (typeof c === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(c) && c !== '0x') return c as `0x${string}`;
    return findRevertData(e.cause, depth + 1);
  }

  /** Walk viem's error chain to find the decoded error name */
  function extractErrorName(err: unknown): string | null {
    if (!err || typeof err !== 'object') return null;
    const e = err as Record<string, unknown>;
    // viem ContractFunctionRevertedError has .data.errorName
    if (e.cause && typeof e.cause === 'object') {
      const cause = e.cause as Record<string, unknown>;
      if (typeof cause.name === 'string' && cause.name === 'ContractFunctionRevertedError') {
        if (cause.data && typeof cause.data === 'object') {
          const data = cause.data as Record<string, unknown>;
          if (typeof data.errorName === 'string') return data.errorName;
        }
      }
      // Recurse one more level
      return extractErrorName(cause);
    }
    return null;
  }

  const reset = useCallback(() => {
    setStep('idle');
    setTxHash(null);
    setError(null);
  }, []);

  return { step, txHash, error, openPosition, closePosition, claimPayout, batchClaimPayout, reset };
}
