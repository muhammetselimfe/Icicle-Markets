import { useState, useEffect, useCallback, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import type { SwapToken } from '@/app/types/swap';
import { getQuote, parseAmount, type YakQuote } from '@/app/services/yakswap';

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
  const [quote, setQuote] = useState<YakQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchIdRef = useRef(0);

  const fetchQuote = useCallback(async () => {
    // Validate inputs
    if (!fromToken || !toToken) {
      setQuote(null);
      setError(null);
      return;
    }

    if (!fromAmount || fromAmount === '' || fromAmount === '0') {
      setQuote(null);
      setError(null);
      return;
    }

    if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
      setError('Cannot swap same token');
      setQuote(null);
      return;
    }

    if (!publicClient) {
      setError('Wallet not connected');
      setQuote(null);
      return;
    }

    // Parse amount
    let amountIn: bigint;
    try {
      amountIn = parseAmount(fromAmount, fromToken.decimals);
      if (amountIn <= 0n) {
        setQuote(null);
        setError(null);
        return;
      }
    } catch {
      setError('Invalid amount');
      setQuote(null);
      return;
    }

    const currentFetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await getQuote(publicClient, {
        amountIn,
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        maxSteps: 3,
      });

      // Check if this is still the latest request
      if (currentFetchId !== fetchIdRef.current) {
        return;
      }

      if (result) {
        setQuote(result);
        setError(null);
      } else {
        setQuote(null);
        setError('No route found for this swap');
      }
    } catch (err) {
      // Check if this is still the latest request
      if (currentFetchId !== fetchIdRef.current) {
        return;
      }

      console.error('Quote fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch quote');
      setQuote(null);
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [fromToken, toToken, fromAmount, publicClient]);

  // Debounced fetch
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchQuote();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [fetchQuote, debounceMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    quote,
    loading,
    error,
    refetch: fetchQuote,
  };
}
