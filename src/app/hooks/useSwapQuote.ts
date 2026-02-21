import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import type { SwapToken } from '@/app/types/swap';
import { getQuote, parseAmount, type YakQuote } from '@/app/services/yakswap';
import { queryKeys } from './queryKeys';

interface UseSwapQuoteOptions {
  fromToken: SwapToken | null;
  toToken: SwapToken | null;
  fromAmount: string;
  debounceMs?: number;
}

interface UseSwapQuoteResult {
  quote: YakQuote | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSwapQuote({
  fromToken,
  toToken,
  fromAmount,
  debounceMs = 500,
}: UseSwapQuoteOptions): UseSwapQuoteResult {
  const publicClient = usePublicClient();
  const [debouncedAmount, setDebouncedAmount] = useState(fromAmount);

  // Debounce the amount input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(fromAmount);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [fromAmount, debounceMs]);

  // Validate inputs before enabling query
  const sameToken = fromToken && toToken && fromToken.address.toLowerCase() === toToken.address.toLowerCase();
  const hasValidAmount = !!debouncedAmount && debouncedAmount !== '' && debouncedAmount !== '0';
  const hasTokens = !!fromToken && !!toToken;

  let parsedAmount: bigint | null = null;
  let parseError: string | null = null;
  if (hasValidAmount && fromToken) {
    try {
      parsedAmount = parseAmount(debouncedAmount, fromToken.decimals);
      if (parsedAmount <= 0n) parsedAmount = null;
    } catch {
      parseError = 'Invalid amount';
    }
  }

  const enabled = hasTokens && !sameToken && !!publicClient && !!parsedAmount && !parseError;

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: queryKeys.swapQuote(
      fromToken?.address ?? '',
      toToken?.address ?? '',
      debouncedAmount,
    ),
    queryFn: async () => {
      const result = await getQuote(publicClient!, {
        amountIn: parsedAmount!,
        tokenIn: fromToken!.address,
        tokenOut: toToken!.address,
        maxSteps: 3,
      });

      if (!result) {
        throw new Error('No route found for this swap');
      }
      return result;
    },
    enabled,
    staleTime: 10_000,
    gcTime: 30_000,
    retry: 1,
  });

  // Determine error message
  let errorMessage: string | null = null;
  if (sameToken) {
    errorMessage = 'Cannot swap same token';
  } else if (!publicClient && hasTokens) {
    errorMessage = 'Wallet not connected';
  } else if (parseError) {
    errorMessage = parseError;
  } else if (error) {
    errorMessage = error instanceof Error ? error.message : 'Failed to fetch quote';
  }

  return {
    quote: enabled ? (data ?? null) : null,
    loading: isFetching,
    error: errorMessage,
    refetch: () => { refetch(); },
  };
}
