import { useState, useEffect, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, Settings, AlertTriangle, ExternalLink, Loader2, Check } from 'lucide-react';
import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { formatUnits } from 'viem';
import type { SwapToken } from '@/app/types/swap';
import { SLIPPAGE_OPTIONS, DEFAULT_SLIPPAGE, MIN_SLIPPAGE, MAX_SLIPPAGE } from '@/app/types/swap';
import { getTokensByChainId, getDefaultFromToken, getDefaultToToken, getTokenByAddress, isTokenListed } from '@/app/data/swap-tokens';
import { useSwapQuote } from '@/app/hooks/useSwapQuote';
import { useSwapExecution } from '@/app/hooks/useSwapExecution';
import { formatAmount, getAdapterName, WAVAX_ADDRESS } from '@/app/services/yakswap';

// Token logo with fallback
function TokenLogo({ token, size = 'md' }: { token: { symbol: string; logoUrl?: string }; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const textSize = size === 'sm' ? 'text-sm' : 'text-base';

  if (token.logoUrl) {
    return (
      <img
        src={token.logoUrl}
        alt={token.symbol}
        className={`${sizeClass} rounded-full bg-[#1a2744]`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-[#1a2744] border border-[#8be4ff]/30 flex items-center justify-center text-[#8be4ff] ${textSize} font-bold`}>
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
  const chainId = useChainId();
  const { address, isConnected } = useAccount();

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

      const defaultFrom = getDefaultFromToken(chainId); // AVAX
      const defaultTo = getDefaultToToken(chainId); // USDC

      if (initialToToken) {
        // Try to find by address first (more reliable), then by symbol
        let matchingToken = initialToToken.address
          ? tokens.find(t => t.address.toLowerCase() === initialToToken.address!.toLowerCase())
          : null;

        if (!matchingToken) {
          matchingToken = tokens.find(
            t => t.symbol.toLowerCase() === initialToToken.symbol.toLowerCase()
          ) || null;
        }

        if (matchingToken) {
          // User wants to buy this token
          setToToken(matchingToken);
          // If the token they want to buy is the same as default from, use USDC as from instead
          if (matchingToken.address.toLowerCase() === defaultFrom.address.toLowerCase()) {
            setFromToken(defaultTo); // Pay with USDC to buy AVAX
          } else {
            setFromToken(defaultFrom); // Pay with AVAX
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
      // Swap tokens when switching modes
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
    if (!quote) return;
    await execute(quote, fromToken, toToken, slippage);
  };

  const handleClose = () => {
    resetExecution();
    onClose();
  };

  const filteredTokens = useMemo(() => {
    // Exclude the token already selected in the other field
    const excludeAddress = showTokenSelect === 'from' ? toToken.address : fromToken.address;
    let filtered = tokens.filter(t => t.address.toLowerCase() !== excludeAddress.toLowerCase());

    // Show only listed tokens by default (unless searching or showing all)
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

  // Count of all tokens (excluding the currently selected opposite token)
  const allTokensCount = useMemo(() => {
    const excludeAddress = showTokenSelect === 'from' ? toToken.address : fromToken.address;
    return tokens.filter(t => t.address.toLowerCase() !== excludeAddress.toLowerCase()).length;
  }, [tokens, showTokenSelect, fromToken.address, toToken.address]);

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet';
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
    if (!isConnected) return true;
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
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
        <div className="relative border-4 border-[#4dff88] bg-[#0f1535] w-full max-w-md mx-4 shadow-[0_0_30px_rgba(77,255,136,0.5)]">
          <div className="absolute inset-0 bg-[#4dff88] opacity-5" />

          <div className="relative z-10 p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 border-4 border-[#4dff88] flex items-center justify-center">
              <Check className="w-10 h-10 text-[#4dff88]" />
            </div>
            <h2
              className="text-[#4dff88] mb-3"
              style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '16px' }}
            >
              SUCCESS!
            </h2>
            <p
              className="text-[#8be4ff] mb-6"
              style={{ fontFamily: "'VT323', monospace", fontSize: '24px' }}
            >
              Transaction confirmed
            </p>

            <a
              href={`https://snowtrace.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[#8be4ff] hover:text-white transition-colors mb-8"
              style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}
            >
              View on Snowtrace <ExternalLink className="w-5 h-5" />
            </a>

            <button
              onClick={handleClose}
              className="w-full border-3 border-[#8be4ff] bg-[#0f1535] px-6 py-4 hover:bg-[#8be4ff] hover:text-[#0a0e27] transition-all"
              style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Token select modal
  if (showTokenSelect) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70" onClick={() => { setShowTokenSelect(null); setShowAllTokens(false); }} />
        <div className="relative border-4 border-[#8be4ff] bg-[#0f1535] w-full max-w-md mx-4 shadow-[0_0_30px_rgba(139,228,255,0.5)]">
          <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />

          <div className="relative z-10">
            <div className="flex items-center justify-between p-5 border-b-2 border-[#8be4ff]/30">
              <h2
                className="text-[#8be4ff]"
                style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}
              >
                SELECT TOKEN
              </h2>
              <button
                onClick={() => { setShowTokenSelect(null); setShowAllTokens(false); }}
                className="text-[#8be4ff] hover:text-white transition-colors p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4">
              <input
                type="text"
                value={tokenSearch}
                onChange={(e) => setTokenSearch(e.target.value)}
                placeholder="Search token..."
                className="w-full border-2 border-[#4db8ff] bg-[#0a0e27] px-4 py-3 text-white placeholder:text-[#4db8ff]/50 focus:outline-none focus:border-[#8be4ff]"
                style={{ fontFamily: "'VT323', monospace", fontSize: '22px' }}
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {filteredTokens.map((token) => (
                <button
                  key={token.address}
                  onClick={() => handleSelectToken(token)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#8be4ff]/10 transition-colors"
                >
                  <TokenLogo token={token} size="md" />
                  <div className="text-left">
                    <div className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '24px' }}>
                      {token.symbol}
                    </div>
                    <div className="text-[#6b7280]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                      {token.name}
                    </div>
                  </div>
                </button>
              ))}

              {/* Show all tokens toggle */}
              {!tokenSearch && !showAllTokens && filteredTokens.length < allTokensCount && (
                <button
                  onClick={() => setShowAllTokens(true)}
                  className="w-full py-4 text-[#8be4ff] hover:bg-[#8be4ff]/10 transition-colors border-t border-[#8be4ff]/20"
                  style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
      <div className="relative border-4 border-[#8be4ff] bg-[#0f1535] w-full max-w-md mx-4 shadow-[0_0_30px_rgba(139,228,255,0.5)]">
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />

        <div className="relative z-10">
          {/* Header with Buy/Sell tabs */}
          <div className="flex items-center justify-between p-4 border-b-2 border-[#8be4ff]/30">
            <div className="flex gap-2">
              <button
                onClick={() => handleModeChange('buy')}
                className={`px-6 py-3 transition-all ${
                  mode === 'buy'
                    ? 'bg-[#4dff88]/20 text-[#4dff88] border-2 border-[#4dff88]'
                    : 'text-[#6b7280] hover:text-white border-2 border-transparent'
                }`}
                style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}
              >
                BUY
              </button>
              <button
                onClick={() => handleModeChange('sell')}
                className={`px-6 py-3 transition-all ${
                  mode === 'sell'
                    ? 'bg-[#ff4d4d]/20 text-[#ff4d4d] border-2 border-[#ff4d4d]'
                    : 'text-[#6b7280] hover:text-white border-2 border-transparent'
                }`}
                style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}
              >
                SELL
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 transition-colors ${showSettings ? 'text-[#8be4ff]' : 'text-[#6b7280] hover:text-[#8be4ff]'}`}
              >
                <Settings className="w-6 h-6" />
              </button>
              <button
                onClick={handleClose}
                className="text-[#6b7280] hover:text-white transition-colors p-2"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 border-b-2 border-[#8be4ff]/30 bg-[#0a0e27]/50">
              <div className="text-[#6b7280] mb-3" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                Slippage Tolerance
              </div>
              <div className="flex gap-2">
                {SLIPPAGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSlippageChange(option.value)}
                    className={`px-4 py-2 border-2 transition-all ${
                      slippage === option.value && !customSlippage
                        ? 'border-[#8be4ff] bg-[#8be4ff]/20 text-white'
                        : 'border-[#4db8ff]/50 text-[#6b7280] hover:border-[#4db8ff]'
                    }`}
                    style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
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
                    className="w-full border-2 border-[#4db8ff]/50 bg-transparent px-3 py-2 text-white placeholder:text-[#4db8ff]/50 focus:outline-none focus:border-[#8be4ff]"
                    style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>%</span>
                </div>
              </div>
            </div>
          )}

          {/* Pay Section */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6b7280]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                {mode === 'buy' ? 'You pay' : 'You sell'}
              </span>
              {fromBalance && (
                <button
                  onClick={handleMaxClick}
                  className="text-[#8be4ff] hover:text-white transition-colors"
                  style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
                >
                  Balance: {parseFloat(formatUnits(fromBalance.value, fromBalance.decimals)).toFixed(4)}
                </button>
              )}
            </div>
            <div className="border-2 border-[#4db8ff] bg-[#0a0e27] p-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowTokenSelect('from')}
                  className="flex items-center gap-3 bg-[#0f1535] border-2 border-[#8be4ff]/50 px-4 py-3 hover:bg-[#8be4ff]/10 transition-colors"
                >
                  <TokenLogo token={fromToken} size="sm" />
                  <span className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '24px' }}>
                    {fromToken.symbol}
                  </span>
                  <ChevronDown className="w-5 h-5 text-[#8be4ff]" />
                </button>
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-white text-right focus:outline-none min-w-0"
                  style={{ fontFamily: "'VT323', monospace", fontSize: '36px' }}
                />
              </div>
            </div>
          </div>

          {/* Receive Section */}
          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6b7280]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                {mode === 'buy' ? 'You receive' : 'You get'}
              </span>
            </div>
            <div className="border-2 border-[#4db8ff] bg-[#0a0e27] p-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowTokenSelect('to')}
                  className="flex items-center gap-3 bg-[#0f1535] border-2 border-[#8be4ff]/50 px-4 py-3 hover:bg-[#8be4ff]/10 transition-colors"
                >
                  <TokenLogo token={toToken} size="sm" />
                  <span className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '24px' }}>
                    {toToken.symbol}
                  </span>
                  <ChevronDown className="w-5 h-5 text-[#8be4ff]" />
                </button>
                <div className="flex-1 text-right min-w-0">
                  {quoteLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin ml-auto text-[#8be4ff]" />
                  ) : (
                    <span
                      className={toAmount ? 'text-white' : 'text-[#6b7280]'}
                      style={{ fontFamily: "'VT323', monospace", fontSize: '36px' }}
                    >
                      {toAmount || '0'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quote Summary - Simplified */}
          {quote && fromAmount && !quoteLoading && (
            <div className="px-5 pb-4">
              <div className="bg-[#0a0e27]/50 border border-[#4db8ff]/30 p-4 space-y-3">
                {exchangeRate && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6b7280]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                      Rate
                    </span>
                    <span className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                      1 {fromToken.symbol} = {exchangeRate.toFixed(4)} {toToken.symbol}
                    </span>
                  </div>
                )}

                {minReceived && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6b7280]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                      Min. received
                    </span>
                    <span className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                      {minReceived} {toToken.symbol}
                    </span>
                  </div>
                )}

                {/* Collapsible Route */}
                {routeSteps.length > 0 && (
                  <div className="pt-3 border-t border-[#4db8ff]/20">
                    <button
                      onClick={() => setShowRoute(!showRoute)}
                      className="flex items-center justify-between w-full text-[#6b7280] hover:text-[#8be4ff] transition-colors"
                      style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
                    >
                      <span>Route ({routeSteps.length} {routeSteps.length === 1 ? 'hop' : 'hops'})</span>
                      {showRoute ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>

                    {showRoute && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {routeSteps.map((step, index) => (
                          <div key={index} className="flex items-center gap-1">
                            {index === 0 && (
                              <span className="text-[#8be4ff] px-2" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                                {step.fromToken.symbol}
                              </span>
                            )}
                            <span className="text-[#4dff88] px-2 py-1 bg-[#4dff88]/10" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                              {step.protocol}
                            </span>
                            <span className="text-[#8be4ff] px-2" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                              {step.toToken.symbol}
                            </span>
                            {index < routeSteps.length - 1 && <span className="text-[#4db8ff]">→</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {(quoteError || execError) && (
            <div className="px-5 pb-4">
              <div className="flex items-center gap-3 p-3 bg-[#ff4d4d]/10 border border-[#ff4d4d]/50">
                <AlertTriangle className="w-5 h-5 text-[#ff4d4d] shrink-0" />
                <span className="text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                  {quoteError || execError}
                </span>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="p-5">
            <button
              onClick={handleSwapClick}
              disabled={isButtonDisabled()}
              className={`w-full border-3 px-6 py-5 transition-all flex items-center justify-center gap-3 ${
                hasInsufficientBalance
                  ? 'border-[#ff4d4d]/50 bg-[#ff4d4d]/10 text-[#ff4d4d] cursor-not-allowed'
                  : isButtonDisabled()
                  ? 'border-[#4db8ff]/50 bg-[#0f1535] text-[#4db8ff]/50 cursor-not-allowed'
                  : mode === 'buy'
                  ? 'border-[#4dff88] bg-[#4dff88]/10 text-[#4dff88] hover:bg-[#4dff88] hover:text-[#0a0e27] shadow-[0_0_20px_rgba(77,255,136,0.3)]'
                  : 'border-[#ff4d4d] bg-[#ff4d4d]/10 text-[#ff4d4d] hover:bg-[#ff4d4d] hover:text-white shadow-[0_0_20px_rgba(255,77,77,0.3)]'
              }`}
              style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}
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
                className="inline-flex items-center gap-2 text-[#8be4ff] hover:text-white transition-colors"
                style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}
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
