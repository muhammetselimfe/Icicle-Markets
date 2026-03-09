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
      } catch (err) {
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

  function handleTxError(err: unknown) {
    if (err instanceof Error) {
      if (err.message.includes('User rejected') || err.message.includes('user rejected')) {
        setError('Transaction rejected');
      } else if (err.message.includes('insufficient funds')) {
        setError('Insufficient balance');
      } else if (err.message.includes('execution reverted')) {
        setError('Transaction reverted — check parameters');
      } else {
        setError(err.message.slice(0, 100).split('\n')[0]);
      }
    } else {
      setError('Transaction failed');
    }
    setStep('error');
  }

  const reset = useCallback(() => {
    setStep('idle');
    setTxHash(null);
    setError(null);
  }, []);

  return { step, txHash, error, openPosition, closePosition, claimPayout, reset };
}
