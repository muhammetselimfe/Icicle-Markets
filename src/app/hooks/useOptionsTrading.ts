import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI, ERC20_ABI } from '@/app/config/options-abis';
import type { TradeStep } from '@/app/types/options';

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

  const openPosition = useCallback(
    async (params: {
      marketId: number;
      lowerTick: bigint;
      upperTick: bigint;
      quantity: bigint;
      maxCost: bigint;
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
        const approved = await ensureAllowance(params.maxCost);
        if (!approved) {
          setStep('error');
          return;
        }

        setStep('opening');
        console.log('[openPosition] args:', {
          marketId: BigInt(params.marketId).toString(),
          lowerTick: params.lowerTick.toString(),
          upperTick: params.upperTick.toString(),
          quantity: params.quantity.toString(),
          maxCost: params.maxCost.toString(),
          types: {
            marketId: typeof params.marketId,
            lowerTick: typeof params.lowerTick,
            upperTick: typeof params.upperTick,
            quantity: typeof params.quantity,
            maxCost: typeof params.maxCost,
          },
        });
        const openGas = await publicClient.estimateContractGas({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'openPosition',
          args: [
            BigInt(params.marketId),
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost,
          ],
          account: address,
        });
        const hash = await walletClient.writeContract({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'openPosition',
          args: [
            BigInt(params.marketId),
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost,
          ],
          gas: openGas + openGas / 4n,
        });

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
    [address, walletClient, publicClient, ensureAllowance, invalidateOptions],
  );

  const closePosition = useCallback(
    async (positionId: number, minProceeds: bigint = 0n) => {
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
        const closeGas = await publicClient.estimateContractGas({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'closePosition',
          args: [BigInt(positionId), minProceeds],
          account: address,
        });
        const hash = await walletClient.writeContract({
          address: OPTIONS_CONTRACTS.core,
          abi: CORE_ABI,
          functionName: 'closePosition',
          args: [BigInt(positionId), minProceeds],
          gas: closeGas + closeGas / 4n,
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
    const errorName = extractErrorName(err);

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
    } else if (msg.includes('execution reverted')) {
      setError('Transaction failed - try a smaller amount');
    } else {
      setError(msg.slice(0, 100).split('\n')[0]);
    }
    setStep('error');
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
