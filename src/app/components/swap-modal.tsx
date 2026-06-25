import { useState, useEffect, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, Settings, AlertTriangle, ExternalLink, Loader2, Check } from 'lucide-react';
import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { erc20Abi } from 'viem';
import { formatUnits } from 'viem';
import { cn } from '@/app/components/ui/utils';
import type { SwapToken } from '@/app/types/swap';
import { SLIPPAGE_OPTIONS, DEFAULT_SLIPPAGE, MIN_SLIPPAGE, MAX_SLIPPAGE } from '@/app/types/swap';
import { getTokensByChainId, getDefaultFromToken, getDefaultToToken, getTokenByAddress, isTokenListed } from '@/app/data/swap-tokens';
import { useSwapQuote } from '@/app/hooks/useSwapQuote';
import { useSwapExecution } from '@/app/hooks/useSwapExecution';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { CHAIN_IDS } from '@/app/config/wagmi';
import { formatAmount, getAdapterName, WAVAX_ADDRESS } from '@/app/services/yakswap';

// Token logo with fallback
function TokenLogo({ token, size = 'md' }: { token: { symbol: string; logoUrl?: string }; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  if (token.logoUrl) {
    return (
      <img
        src={token.logoUrl}
        alt={token.symbol}
        className={`${sizeClass} rounded-full bg-ice-line/[0.08]`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-muted text-sm font-medium`}>
      {token.symbol.slice(0, 2)}
    </div>
  );
}

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialToToken?: { symbol: string; address?: string };
}

export function SwapModal({ isOpen, onClose, initialToToken }: SwapModalProps) {
  const { login } = useLogin();
  const { authenticated, logout } = usePrivy();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();

  const { switchForTab, isSwitching } = useChainSwitch();
  const isWrongChain = isConnected && chainId !== CHAIN_IDS.MAINNET;

  const handleLogin = async () => {
    if (authenticated) {
      await logout();
    }
    login();
  };

  const tokens = useMemo(() => getTokensByChainId(chainId), [chainId]);

  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [fromToken, setFromToken] = useState<SwapToken>(getDefaultFromToken(chainId));
  const [toToken, setToToken] = useState<SwapToken>(getDefaultToToken(chainId));
  const [fromAmount, setFromAmount] = useState('');
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);
  const [customSlippage, setCustomSlippage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [showTokenSelect, setShowTokenSelect] = useState<'from' | 'to' | null>(null);
  const [tokenSearch, setTokenSearch] = useState('');
  const [showAllTokens, setShowAllTokens] = useState(false);

  // Reset to defaults when modal opens
  useEffect(() => {
    if (isOpen && tokens.length > 0) {
      setMode('buy');
      setFromAmount('');
      setShowSettings(false);
      setShowRoute(false);

      const defaultFrom = getDefaultFromToken(chainId);
      const defaultTo = getDefaultToToken(chainId);

      if (initialToToken) {
        let matchingToken = initialToToken.address
          ? tokens.find(t => t.address.toLowerCase() === initialToToken.address!.toLowerCase())
          : null;

        if (!matchingToken) {
          matchingToken = tokens.find(
            t => t.symbol.toLowerCase() === initialToToken.symbol.toLowerCase()
          ) || null;
        }

        if (matchingToken) {
          setToToken(matchingToken);
          if (matchingToken.address.toLowerCase() === defaultFrom.address.toLowerCase()) {
            setFromToken(defaultTo);
          } else {
            setFromToken(defaultFrom);
          }
        } else {
          setFromToken(defaultFrom);
          setToToken(defaultTo);
        }
      } else {
        setFromToken(defaultFrom);
        setToToken(defaultTo);
      }
    }
  }, [isOpen, chainId, initialToToken, tokens]);

  // Fetch quote
  const { quote, loading: quoteLoading, error: quoteError } = useSwapQuote({
    fromToken,
    toToken,
    fromAmount,
  });

  // Swap execution
  const { step, txHash, error: execError, execute, reset: resetExecution } = useSwapExecution();

  // Check if token is native AVAX
  const isFromNative = fromToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

  // Fetch native AVAX balance
  const { data: nativeBalance } = useBalance({
    address,
    query: {
      enabled: !!address,
    },
  });

  // Fetch ERC20 balance directly via contract call
  const { data: erc20BalanceRaw } = useReadContract({
    address: fromToken.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !isFromNative && !!address,
    },
  });

  // Combine into a consistent format
  const fromBalance = useMemo(() => {
    if (isFromNative) {
      return nativeBalance;
    }
    if (erc20BalanceRaw !== undefined) {
      return {
        value: erc20BalanceRaw,
        decimals: fromToken.decimals,
        symbol: fromToken.symbol,
        formatted: formatUnits(erc20BalanceRaw, fromToken.decimals),
      };
    }
    return undefined;
  }, [isFromNative, nativeBalance, erc20BalanceRaw, fromToken]);

  const toAmount = useMemo(() => {
    if (!quote?.amounts || quote.amounts.length === 0) return '';
    const outputAmount = quote.amounts[quote.amounts.length - 1];
    return formatAmount(outputAmount, toToken.decimals);
  }, [quote, toToken.decimals]);

  const minReceived = useMemo(() => {
    if (!quote?.amounts || quote.amounts.length === 0) return '';
    const outputAmount = quote.amounts[quote.amounts.length - 1];
    const minAmount = outputAmount - (outputAmount * BigInt(slippage)) / BigInt(10000);
    return formatAmount(minAmount, toToken.decimals);
  }, [quote, toToken.decimals, slippage]);

  const exchangeRate = useMemo(() => {
    if (!fromAmount || !toAmount || parseFloat(fromAmount) === 0) return null;
    const rate = parseFloat(toAmount) / parseFloat(fromAmount);
    return rate;
  }, [fromAmount, toAmount]);

  // Get route path with token symbols and adapters
  const routeSteps = useMemo(() => {
    if (!quote?.path || quote.path.length === 0 || !quote.adapters) return [];

    const steps: Array<{
      fromToken: { symbol: string; logoUrl?: string };
      toToken: { symbol: string; logoUrl?: string };
      protocol: string;
    }> = [];

    const getTokenInfo = (addr: string) => {
      const isWavax = addr.toLowerCase() === WAVAX_ADDRESS.toLowerCase();
      const token = getTokenByAddress(chainId, addr);

      if (token) {
        return { symbol: token.symbol, logoUrl: token.logoUrl };
      }
      if (isWavax) {
        return { symbol: 'WAVAX', logoUrl: 'https://assets.coingecko.com/coins/images/15075/small/wrapped-avax.png' };
      }
      return { symbol: `${addr.slice(0, 6)}...`, logoUrl: undefined };
    };

    for (let i = 0; i < quote.adapters.length; i++) {
      steps.push({
        fromToken: getTokenInfo(quote.path[i]),
        toToken: getTokenInfo(quote.path[i + 1]),
        protocol: getAdapterName(quote.adapters[i]),
      });
    }

    return steps;
  }, [quote, chainId]);

  // Check if user has sufficient balance
  const hasInsufficientBalance = useMemo(() => {
    if (!fromBalance || !fromAmount || fromAmount === '') return false;
    const amountWei = BigInt(Math.floor(parseFloat(fromAmount) * 10 ** fromToken.decimals));
    return amountWei > fromBalance.value;
  }, [fromBalance, fromAmount, fromToken.decimals]);

  const handleModeChange = (newMode: 'buy' | 'sell') => {
    if (newMode !== mode) {
      setMode(newMode);
      const temp = fromToken;
      setFromToken(toToken);
      setToToken(temp);
      setFromAmount('');
    }
  };

  const handleMaxClick = () => {
    if (fromBalance) {
      const formatted = formatUnits(fromBalance.value, fromBalance.decimals);
      if (fromToken.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
        const max = Math.max(0, parseFloat(formatted) - 0.1);
        setFromAmount(max.toFixed(6));
      } else {
        setFromAmount(formatted);
      }
    }
  };

  const handleSlippageChange = (value: number) => {
    setSlippage(value);
    setCustomSlippage('');
  };

  const handleCustomSlippageChange = (value: string) => {
    setCustomSlippage(value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const bps = Math.round(num * 100);
      if (bps >= MIN_SLIPPAGE && bps <= MAX_SLIPPAGE) {
        setSlippage(bps);
      }
    }
  };

  const handleSelectToken = (token: SwapToken) => {
    if (showTokenSelect === 'from') {
      if (token.address === toToken.address) {
        setToToken(fromToken);
      }
      setFromToken(token);
    } else {
      if (token.address === fromToken.address) {
        setFromToken(toToken);
      }
      setToToken(token);
    }
    setShowTokenSelect(null);
    setTokenSearch('');
    setShowAllTokens(false);
  };

  const handleSwapClick = async () => {
    if (!isConnected) {
      handleLogin();
      return;
    }
    if (isWrongChain) {
      await switchForTab('markets');
      return;
    }
    if (!quote) return;
    await execute(quote, fromToken, toToken, slippage);
  };

  const handleClose = () => {
    resetExecution();
    onClose();
  };

  const filteredTokens = useMemo(() => {
    const excludeAddress = showTokenSelect === 'from' ? toToken.address : fromToken.address;
    let filtered = tokens.filter(t => t.address.toLowerCase() !== excludeAddress.toLowerCase());

    if (!showAllTokens && !tokenSearch) {
      filtered = filtered.filter(t => isTokenListed(t.symbol));
    }

    if (tokenSearch) {
      const search = tokenSearch.toLowerCase();
      filtered = filtered.filter(
        t => t.symbol.toLowerCase().includes(search) || t.name.toLowerCase().includes(search)
      );
    }
    return filtered;
  }, [tokens, tokenSearch, showTokenSelect, fromToken.address, toToken.address, showAllTokens]);

  const allTokensCount = useMemo(() => {
    const excludeAddress = showTokenSelect === 'from' ? toToken.address : fromToken.address;
    return tokens.filter(t => t.address.toLowerCase() !== excludeAddress.toLowerCase()).length;
  }, [tokens, showTokenSelect, fromToken.address, toToken.address]);

  const getButtonText = () => {
    if (!isConnected) return 'Sign In';
    if (isWrongChain) return isSwitching ? 'Switching...' : 'Switch to Avalanche';
    if (!fromAmount || fromAmount === '0') return 'Enter Amount';
    if (hasInsufficientBalance) return 'Insufficient Balance';
    if (quoteLoading) return 'Getting Quote...';
    if (quoteError) return 'No Route Found';
    if (step === 'approving') return 'Approving...';
    if (step === 'swapping') return 'Processing...';
    if (step === 'success') return 'Success!';
    if (step === 'error') return 'Try Again';
    return mode === 'buy' ? `Buy ${toToken.symbol}` : `Sell ${fromToken.symbol}`;
  };

  const isButtonDisabled = () => {
    if (!isConnected) return false;
    if (isWrongChain) return isSwitching;
    if (!fromAmount || fromAmount === '0') return true;
    if (hasInsufficientBalance) return true;
    if (quoteLoading) return true;
    if (quoteError) return true;
    if (!quote) return true;
    if (step === 'approving' || step === 'swapping') return true;
    return false;
  };

  if (!isOpen) return null;

  // Success state
  if (step === 'success' && txHash) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
        <div className="relative border border-ice-line/15 bg-ice-surface w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <div className="relative z-10 p-6 md:p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-green-500/10 rounded-2xl flex items-center justify-center">
              <Check className="w-10 h-10 text-green-500" />
            </div>
            <h2
              className="text-ice-text font-medium mb-2"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '20px' }}
            >
              Transaction Successful
            </h2>
            <p
              className="text-ice-muted mb-6"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}
            >
              Your swap has been confirmed
            </p>

            <a
              href={`https://snowtrace.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors mb-8"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
            >
              View on Snowtrace <ExternalLink className="w-4 h-4" />
            </a>

            <button
              onClick={handleClose}
              className="w-full bg-ice-surface2 hover:bg-ice-line/[0.08] text-ice-text py-4 rounded-xl font-medium transition-colors"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Token select modal
  if (showTokenSelect) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={() => { setShowTokenSelect(null); setShowAllTokens(false); }} />
        <div className="relative border border-ice-line/15 bg-ice-surface w-full max-w-md rounded-2xl max-h-[90vh] flex flex-col">
          <div className="relative z-10 flex flex-col max-h-full">
            <div className="flex items-center justify-between p-5 border-b border-ice-line/15">
              <h2
                className="text-ice-text font-medium"
                style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}
              >
                Select Token
              </h2>
              <button
                onClick={() => { setShowTokenSelect(null); setShowAllTokens(false); }}
                className="text-ice-muted hover:text-ice-text transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <input
                type="text"
                value={tokenSearch}
                onChange={(e) => setTokenSearch(e.target.value)}
                placeholder="Search token..."
                className="w-full bg-ice-surface2 px-4 py-3 rounded-xl text-ice-text placeholder:text-ice-faint focus:outline-none focus:ring-1 focus:ring-white/20"
                style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}
              />
            </div>

            <div className="flex-1 overflow-y-auto max-h-80 md:max-h-96">
              {filteredTokens.map((token) => (
                <button
                  key={token.address}
                  onClick={() => handleSelectToken(token)}
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-ice-line/[0.06] transition-colors min-h-[56px]"
                >
                  <TokenLogo token={token} size="md" />
                  <div className="text-left">
                    <div className="text-ice-text font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}>
                      {token.symbol}
                    </div>
                    <div className="text-ice-faint" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                      {token.name}
                    </div>
                  </div>
                </button>
              ))}

              {!tokenSearch && !showAllTokens && filteredTokens.length < allTokensCount && (
                <button
                  onClick={() => setShowAllTokens(true)}
                  className="w-full py-4 text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.06] transition-colors border-t border-ice-line/15"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                >
                  Show all {allTokensCount} tokens
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
      <div className="relative border border-ice-line/15 bg-ice-surface w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="relative z-10">
          {/* Header with Buy/Sell toggle */}
          <div className="flex items-center justify-between p-4 border-b border-ice-line/15">
            <div className="flex gap-1 p-1 bg-ice-surface2 rounded-xl">
              <button
                onClick={() => handleModeChange('buy')}
                className={cn(
                  "px-6 py-2 rounded-lg transition-all font-medium",
                  mode === 'buy'
                    ? "bg-green-500/20 text-green-500"
                    : "text-ice-muted hover:text-ice-text"
                )}
                style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
              >
                Buy
              </button>
              <button
                onClick={() => handleModeChange('sell')}
                className={cn(
                  "px-6 py-2 rounded-lg transition-all font-medium",
                  mode === 'sell'
                    ? "bg-red-500/20 text-red-500"
                    : "text-ice-muted hover:text-ice-text"
                )}
                style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
              >
                Sell
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  showSettings ? "text-ice-text bg-ice-line/[0.08]" : "text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.06]"
                )}
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={handleClose}
                className="text-ice-muted hover:text-ice-text transition-colors p-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 border-b border-ice-line/15 bg-ice-surface">
              <div className="text-ice-muted mb-3" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                Slippage Tolerance
              </div>
              <div className="flex gap-2">
                {SLIPPAGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSlippageChange(option.value)}
                    className={cn(
                      "px-4 py-2 rounded-lg transition-all font-medium",
                      slippage === option.value && !customSlippage
                        ? "bg-ice-line/[0.08] text-ice-text"
                        : "bg-ice-surface2 text-ice-muted hover:text-ice-text"
                    )}
                    style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                  >
                    {option.label}
                  </button>
                ))}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={customSlippage}
                    onChange={(e) => handleCustomSlippageChange(e.target.value)}
                    placeholder="Custom"
                    className="w-full bg-ice-surface2 rounded-lg px-3 py-2 text-ice-text placeholder:text-ice-faint focus:outline-none focus:ring-1 focus:ring-white/20"
                    style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ice-faint" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>%</span>
                </div>
              </div>
            </div>
          )}

          {/* Pay Section */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                {mode === 'buy' ? 'You pay' : 'You sell'}
              </span>
              {fromBalance && (
                <button
                  onClick={handleMaxClick}
                  className="text-ice-muted hover:text-ice-text transition-colors"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
                >
                  Balance: {parseFloat(formatUnits(fromBalance.value, fromBalance.decimals)).toFixed(4)}
                </button>
              )}
            </div>
            <div className="bg-ice-surface2 p-4 rounded-xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowTokenSelect('from')}
                  className="flex items-center gap-3 bg-ice-line/[0.08] px-4 py-2.5 rounded-lg hover:bg-ice-line/[0.1] transition-colors"
                >
                  <TokenLogo token={fromToken} size="sm" />
                  <span className="text-ice-text font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}>
                    {fromToken.symbol}
                  </span>
                  <ChevronDown className="w-4 h-4 text-ice-muted" />
                </button>
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-ice-text text-right focus:outline-none min-w-0 font-medium text-2xl md:text-3xl"
                  style={{ fontFamily: "Inter, sans-serif" }}
                />
              </div>
            </div>
          </div>

          {/* Receive Section */}
          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                {mode === 'buy' ? 'You receive' : 'You get'}
              </span>
            </div>
            <div className="bg-ice-surface2 p-4 rounded-xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowTokenSelect('to')}
                  className="flex items-center gap-3 bg-ice-line/[0.08] px-4 py-2.5 rounded-lg hover:bg-ice-line/[0.1] transition-colors"
                >
                  <TokenLogo token={toToken} size="sm" />
                  <span className="text-ice-text font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: '16px' }}>
                    {toToken.symbol}
                  </span>
                  <ChevronDown className="w-4 h-4 text-ice-muted" />
                </button>
                <div className="flex-1 text-right min-w-0">
                  {quoteLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin ml-auto text-ice-muted" />
                  ) : (
                    <span
                      className={cn("font-medium text-2xl md:text-3xl", toAmount ? "text-ice-text" : "text-ice-faint")}
                      style={{ fontFamily: "Inter, sans-serif" }}
                    >
                      {toAmount || '0'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quote Summary */}
          {quote && fromAmount && !quoteLoading && (
            <div className="px-5 pb-4">
              <div className="bg-ice-surface border border-ice-line/[0.06] p-4 rounded-xl space-y-3">
                {exchangeRate && (
                  <div className="flex items-center justify-between">
                    <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                      Rate
                    </span>
                    <span className="text-ice-text" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                      1 {fromToken.symbol} = {exchangeRate.toFixed(4)} {toToken.symbol}
                    </span>
                  </div>
                )}

                {minReceived && (
                  <div className="flex items-center justify-between">
                    <span className="text-ice-muted" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                      Min. received
                    </span>
                    <span className="text-ice-text" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                      {minReceived} {toToken.symbol}
                    </span>
                  </div>
                )}

                {/* Collapsible Route */}
                {routeSteps.length > 0 && (
                  <div className="pt-3 border-t border-ice-line/[0.06]">
                    <button
                      onClick={() => setShowRoute(!showRoute)}
                      className="flex items-center justify-between w-full text-ice-muted hover:text-ice-text transition-colors"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
                    >
                      <span>Route ({routeSteps.length} {routeSteps.length === 1 ? 'hop' : 'hops'})</span>
                      {showRoute ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showRoute && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {routeSteps.map((step, index) => (
                          <div key={index} className="flex items-center gap-1">
                            {index === 0 && (
                              <span className="text-ice-text px-2" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                                {step.fromToken.symbol}
                              </span>
                            )}
                            <span className="text-ice-muted px-2 py-1 bg-ice-surface2 rounded" style={{ fontFamily: "Inter, sans-serif", fontSize: '12px' }}>
                              {step.protocol}
                            </span>
                            <span className="text-ice-text px-2" style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}>
                              {step.toToken.symbol}
                            </span>
                            {index < routeSteps.length - 1 && <span className="text-ice-faint">→</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Wrong Network Warning */}
          {isWrongChain && (
            <div className="px-5 pb-4">
              <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                <span className="text-yellow-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                  Switch to Avalanche network to trade
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {!isWrongChain && (quoteError || execError) && (
            <div className="px-5 pb-4">
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <span className="text-red-500" style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}>
                  {quoteError || execError}
                </span>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="p-4 md:p-5">
            <button
              onClick={handleSwapClick}
              disabled={isButtonDisabled()}
              className={cn(
                "w-full py-4 rounded-xl font-medium transition-all flex items-center justify-center gap-3 min-h-[52px]",
                hasInsufficientBalance
                  ? "bg-red-500/10 text-red-500 cursor-not-allowed"
                  : isButtonDisabled()
                  ? "bg-ice-surface2 text-ice-faint cursor-not-allowed"
                  : mode === 'buy'
                  ? "bg-green-500 text-ice-text hover:bg-green-600"
                  : "bg-red-500 text-ice-text hover:bg-red-600"
              )}
              style={{ fontFamily: "Inter, sans-serif", fontSize: '15px' }}
            >
              {(step === 'approving' || step === 'swapping') && <Loader2 className="w-5 h-5 animate-spin" />}
              {getButtonText()}
            </button>
          </div>

          {/* Transaction Link */}
          {txHash && step === 'swapping' && (
            <div className="px-4 pb-4 text-center">
              <a
                href={`https://snowtrace.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors"
                style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
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
