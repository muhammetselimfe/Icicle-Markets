import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient, useWaitForTransactionReceipt } from 'wagmi';
import type { SwapStep, SwapToken } from '@/app/types/swap';
import {
  YAK_ROUTER_ADDRESS,
  YAK_ROUTER_ABI,
  ERC20_ABI,
} from '@/app/config/yakswap-abi';
import {
  type YakQuote,
  buildTrade,
  getSwapType,
  isNativeAvax,
} from '@/app/services/yakswap';

interface UseSwapExecutionResult {
  step: SwapStep;
  txHash: string | null;
  error: string | null;
  execute: (
    quote: YakQuote,
    fromToken: SwapToken,
    toToken: SwapToken,
    slippageBps: number
  ) => Promise<void>;
  reset: () => void;
}

export function useSwapExecution(): UseSwapExecutionResult {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<SwapStep>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { isSuccess: isConfirmed, isError: isReverted } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  // Move to success/error once the receipt lands. This must be an effect, not inline in
  // render: setting state during render re-renders in a loop and double-fires under StrictMode.
  useEffect(() => {
    if (!txHash || step !== 'swapping') return;
    if (isConfirmed) {
      setStep('success');
      // Invalidate portfolio and transaction history so they refresh immediately
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['transactionHistory'] });
    } else if (isReverted) {
      setError('Swap transaction reverted on-chain');
      setStep('error');
    }
  }, [txHash, step, isConfirmed, isReverted, queryClient]);

  const checkAndApprove = useCallback(
    async (tokenAddress: string, amount: bigint): Promise<boolean> => {
      if (!address || !publicClient || !walletClient) return false;

      // Skip approval for native AVAX
      if (isNativeAvax(tokenAddress)) return true;

      try {
        // Check current allowance
        const allowance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, YAK_ROUTER_ADDRESS],
        });

        if (allowance >= amount) {
          return true;
        }

        // Need approval
        setStep('approving');

        const approveTx = await walletClient.writeContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [YAK_ROUTER_ADDRESS, amount],
        });

        // Wait for approval confirmation
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        return true;
      } catch (err) {
        console.error('Approval error:', err);
        if (err instanceof Error) {
          if (err.message.includes('User rejected') || err.message.includes('user rejected')) {
            setError('Approval rejected by user');
          } else {
            setError(`Approval failed: ${err.message}`);
          }
        } else {
          setError('Approval failed');
        }
        return false;
      }
    },
    [address, publicClient, walletClient]
  );

  const execute = useCallback(
    async (
      quote: YakQuote,
      fromToken: SwapToken,
      toToken: SwapToken,
      slippageBps: number
    ) => {
      if (!address || !walletClient || !publicClient) {
        setError('Wallet not connected');
        setStep('error');
        return;
      }

      setStep('idle');
      setError(null);
      setTxHash(null);

      try {
        // Build trade with slippage
        const trade = buildTrade(quote, slippageBps);
        const swapType = getSwapType(fromToken.address, toToken.address);

        // Handle approval if needed
        if (!isNativeAvax(fromToken.address)) {
          const approved = await checkAndApprove(fromToken.address, trade.amountIn);
          if (!approved) {
            setStep('error');
            return;
          }
        }

        setStep('swapping');

        let hash: `0x${string}`;

        if (swapType === 'swapNoSplitFromAVAX') {
          // Swap from native AVAX
          hash = await walletClient.writeContract({
            address: YAK_ROUTER_ADDRESS,
            abi: YAK_ROUTER_ABI,
            functionName: 'swapNoSplitFromAVAX',
            args: [trade, address, 0n],
            value: trade.amountIn,
          });
        } else if (swapType === 'swapNoSplitToAVAX') {
          // Swap to native AVAX
          hash = await walletClient.writeContract({
            address: YAK_ROUTER_ADDRESS,
            abi: YAK_ROUTER_ABI,
            functionName: 'swapNoSplitToAVAX',
            args: [trade, address, 0n],
          });
        } else {
          // ERC20 to ERC20 swap
          hash = await walletClient.writeContract({
            address: YAK_ROUTER_ADDRESS,
            abi: YAK_ROUTER_ABI,
            functionName: 'swapNoSplit',
            args: [trade, address, 0n],
          });
        }

        setTxHash(hash);
        // Step will be updated to 'success' when transaction is confirmed
      } catch (err) {
        console.error('Swap execution error:', err);

        if (err instanceof Error) {
          if (err.message.includes('User rejected') || err.message.includes('user rejected')) {
            setError('Transaction rejected by user');
          } else if (err.message.includes('insufficient funds')) {
            setError('Insufficient balance for transaction');
          } else if (err.message.includes('execution reverted') || err.message.includes('Unable to calculate gas')) {
            setError('Swap failed - try a smaller amount or different token pair');
          } else if (err.message.includes('allowance')) {
            setError('Token approval needed - please try again');
          } else {
            // Show shortened error
            const shortMsg = err.message.slice(0, 100);
            setError(shortMsg.includes('\n') ? shortMsg.split('\n')[0] : shortMsg);
          }
        } else {
          setError('Failed to execute swap');
        }

        setStep('error');
      }
    },
    [address, walletClient, publicClient, checkAndApprove]
  );

  const reset = useCallback(() => {
    setStep('idle');
    setTxHash(null);
    setError(null);
  }, []);

  return {
    step,
    txHash,
    error,
    execute,
    reset,
  };
}
