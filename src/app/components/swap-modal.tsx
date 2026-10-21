import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp, ArrowDown, AlertTriangle, ExternalLink, Loader2, Check, Search, SlidersHorizontal } from 'lucide-react';
import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { formatUnits } from 'viem';
import { cn } from '@/app/components/ui/utils';
import { SegmentedControl } from '@/app/components/shell/segmented-control';
import { useSignIn } from '@/app/components/shell/use-sign-in';
import type { SwapToken } from '@/app/types/swap';
import { SLIPPAGE_OPTIONS, DEFAULT_SLIPPAGE, MIN_SLIPPAGE, MAX_SLIPPAGE } from '@/app/types/swap';
import { getTokensByChainId, getDefaultFromToken, getDefaultToToken, getTokenByAddress, isTokenListed } from '@/app/data/swap-tokens';
import { useSwapQuote } from '@/app/hooks/useSwapQuote';
import { useSwapExecution } from '@/app/hooks/useSwapExecution';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { useSwapPrices } from '@/app/hooks/useSwapPrices';
import { CHAIN_IDS } from '@/app/config/wagmi';
import { formatAmount, getAdapterName, WAVAX_ADDRESS, calculatePriceImpact } from '@/app/services/yakswap';

// Price impact thresholds (percent). Above WARN the number turns yellow; above HIGH the
// swap is blocked until the user explicitly accepts the loss.
const WARN_IMPACT_PCT = 3;
const HIGH_IMPACT_PCT = 15;

const NATIVE_AVAX = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function formatUsdApprox(value: number): string {
  if (value < 0.01) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBalance(value: bigint, decimals: number): string {
  const n = parseFloat(formatUnits(value, decimals));
  if (n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 4 });
}

function TokenLogo({ token, className }: { token: { symbol: string; logoUrl?: string }; className?: string }) {
  if (token.logoUrl) {
    return <img src={token.logoUrl} alt="" className={cn('rounded-full bg-ice-line/[0.08] shrink-0', className)} />;
  }
  return (
    <div className={cn('rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-muted text-[12px] font-semibold shrink-0', className)}>
      {token.symbol.slice(0, 2)}
    </div>
  );
}

// ── Sheet chrome ─────────────────────────────────────────────────────────────

const ICON_BUTTON = 'w-9 h-9 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors';

/** Centered dialog on wide screens, bottom sheet on phones. */
function Sheet({ onDismiss, children, label }: { onDismiss: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onDismiss]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDismiss} />
      <div
        className="relative w-full md:max-w-[440px] max-h-[92vh] flex flex-col bg-ice-surface rounded-t-2xl md:rounded-2xl border border-ice-line/15 shadow-2xl shadow-black/40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function SheetHeader({ leading, trailing }: { leading: ReactNode; trailing: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 h-16 border-b border-ice-line/10 shrink-0">
      {leading}
      <div className="flex items-center gap-1">{trailing}</div>
    </div>
  );
}

/** Inset grouped list row, as in a settings screen. */
function DetailRow({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' | 'danger' }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 min-h-[40px]">
      <span className="text-ice-muted text-[14px]">{label}</span>
      <span className={cn('text-[14px] tabular-nums text-right', tone === 'danger' ? 'text-ice-down font-semibold' : tone === 'warn' ? 'text-yellow-500' : 'text-ice-text')}>
        {value}
      </span>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'danger'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl text-[14px] leading-snug',
        tone === 'danger' ? 'bg-ice-down/[0.08] text-ice-down' : 'bg-yellow-500/[0.08] text-yellow-500',
      )}
    >
      <AlertTriangle className="w-[18px] h-[18px] shrink-0 mt-px" />
      <span className="flex-1">{children}</span>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialToToken?: { symbol: string; address?: string };
}

export function SwapModal({ isOpen, onClose, initialToToken }: SwapModalProps) {
  const { signIn } = useSignIn();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();

  const { switchForTab, isSwitching } = useChainSwitch();
  const isWrongChain = isConnected && chainId !== CHAIN_IDS.MAINNET;

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

  const isFromNative = fromToken.address.toLowerCase() === NATIVE_AVAX;

  const { data: nativeBalance } = useBalance({
    address,
    query: { enabled: !!address },
  });

  const { data: erc20BalanceRaw } = useReadContract({
    address: fromToken.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !isFromNative && !!address },
  });

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
    return parseFloat(toAmount) / parseFloat(fromAmount);
  }, [fromAmount, toAmount]);

  // USD reference prices (CoinGecko) for dollar values and price impact
  const { priceOf } = useSwapPrices([fromToken.address, toToken.address]);
  const fromPriceUsd = priceOf(fromToken.address);
  const toPriceUsd = priceOf(toToken.address);
  const fromAmountNum = parseFloat(fromAmount);
  const fromUsd = fromPriceUsd !== null && fromAmountNum > 0 ? fromAmountNum * fromPriceUsd : null;
  const toUsd = toPriceUsd !== null && toAmount ? parseFloat(toAmount) * toPriceUsd : null;

  // How far the quoted rate sits below the market rate. null when either side has no
  // reference price (unlisted token), in which case the UI simply omits the row.
  const priceImpact = useMemo(() => {
    if (!quote?.amounts?.length || fromPriceUsd === null || toPriceUsd === null) return null;
    const marketRate = fromPriceUsd / toPriceUsd; // toToken units per 1 fromToken
    return calculatePriceImpact(
      quote.amounts[0],
      quote.amounts[quote.amounts.length - 1],
      fromToken.decimals,
      toToken.decimals,
      marketRate,
    );
  }, [quote, fromPriceUsd, toPriceUsd, fromToken.decimals, toToken.decimals]);

  const isHighImpact = priceImpact !== null && priceImpact >= HIGH_IMPACT_PCT;
  const [highImpactAccepted, setHighImpactAccepted] = useState(false);
  // A new quote means a new decision
  useEffect(() => { setHighImpactAccepted(false); }, [quote]);

  // Route path with token symbols and adapters
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

  const hasInsufficientBalance = useMemo(() => {
    if (!fromBalance || !fromAmount || fromAmount === '') return false;
    const amountWei = BigInt(Math.floor(parseFloat(fromAmount) * 10 ** fromToken.decimals));
    return amountWei > fromBalance.value;
  }, [fromBalance, fromAmount, fromToken.decimals]);

  const swapDirection = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount('');
  };

  const handleModeChange = (newMode: 'buy' | 'sell') => {
    if (newMode !== mode) {
      setMode(newMode);
      swapDirection();
    }
  };

  const handleMaxClick = () => {
    if (fromBalance) {
      const formatted = formatUnits(fromBalance.value, fromBalance.decimals);
      if (isFromNative) {
        // Keep some AVAX back for gas.
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
      signIn();
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
    if (!isConnected) return 'Sign In to Trade';
    if (isWrongChain) return isSwitching ? 'Switching…' : 'Switch to Avalanche';
    if (!fromAmount || fromAmount === '0') return 'Enter an amount';
    if (hasInsufficientBalance) return `Not enough ${fromToken.symbol}`;
    if (quoteLoading) return 'Getting quote…';
    if (quoteError) return 'No route found';
    if (isHighImpact && !highImpactAccepted) return 'Price impact too high';
    if (step === 'approving') return `Approving ${fromToken.symbol}…`;
    if (step === 'swapping') return 'Confirming…';
    if (step === 'success') return 'Done';
    if (step === 'error') return 'Try again';
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
    if (isHighImpact && !highImpactAccepted) return true;
    if (step === 'approving' || step === 'swapping') return true;
    return false;
  };

  if (!isOpen) return null;

  const slippageLabel = `${(slippage / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

  // ── Success ──────────────────────────────────────────────────────────────
  if (step === 'success' && txHash) {
    return (
      <Sheet onDismiss={handleClose} label="Swap complete">
        <div className="p-6 md:p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-ice-up/[0.12] flex items-center justify-center">
            <Check className="w-8 h-8 text-ice-up" strokeWidth={2.5} />
          </div>
          <h2 className="text-ice-text font-bold text-[22px] mb-1.5">Swap complete</h2>
          <p className="text-ice-muted text-[15px] mb-7">
            {fromAmount} {fromToken.symbol} for {toAmount || '…'} {toToken.symbol}
          </p>
          <div className="space-y-2.5">
            <button
              onClick={handleClose}
              className="w-full min-h-[52px] rounded-xl bg-ice-accent font-semibold text-[16px] transition-opacity hover:opacity-90"
              style={{ color: '#06223a' }}
            >
              Done
            </button>
            <a
              href={`https://snowtrace.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[48px] rounded-xl inline-flex items-center justify-center gap-2 text-ice-accent hover:bg-ice-line/[0.06] transition-colors text-[15px] font-medium"
            >
              View on Snowtrace <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </Sheet>
    );
  }

  // ── Token picker ─────────────────────────────────────────────────────────
  if (showTokenSelect) {
    const dismiss = () => {
      setShowTokenSelect(null);
      setShowAllTokens(false);
      setTokenSearch('');
    };
    return (
      <Sheet onDismiss={dismiss} label="Choose a token">
        <SheetHeader
          leading={<h2 className="text-ice-text font-semibold text-[17px]">{showTokenSelect === 'from' ? 'Pay with' : 'Receive'}</h2>}
          trailing={
            <button onClick={dismiss} className={ICON_BUTTON} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          }
        />
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ice-faint pointer-events-none" />
            <input
              type="text"
              value={tokenSearch}
              onChange={(e) => setTokenSearch(e.target.value)}
              placeholder="Search"
              autoFocus
              aria-label="Search tokens"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full bg-ice-line/[0.07] focus:bg-ice-surface2 rounded-xl pl-11 pr-4 min-h-[44px] text-ice-text placeholder:text-ice-faint outline-none transition-colors text-[16px]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 min-h-[240px] max-h-[60vh]">
          {filteredTokens.length === 0 && <p className="px-5 py-6 text-center text-ice-faint text-[14px]">No tokens match</p>}
          {filteredTokens.map((token) => (
            <button
              key={token.address}
              onClick={() => handleSelectToken(token)}
              className="w-full flex items-center gap-4 px-5 min-h-[56px] hover:bg-ice-line/[0.06] transition-colors text-left"
            >
              <TokenLogo token={token} className="w-9 h-9" />
              <span className="flex-1 min-w-0">
                <span className="block text-ice-text font-semibold text-[15px]">{token.symbol}</span>
                <span className="block text-ice-faint text-[13px] truncate">{token.name}</span>
              </span>
            </button>
          ))}
          {!tokenSearch && !showAllTokens && filteredTokens.length < allTokensCount && (
            <button
              onClick={() => setShowAllTokens(true)}
              className="w-full min-h-[48px] text-ice-accent hover:bg-ice-line/[0.06] transition-colors text-[14px] font-medium"
            >
              Show all {allTokensCount} tokens
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  // ── Trade ────────────────────────────────────────────────────────────────
  const disabled = isButtonDisabled();
  const working = step === 'approving' || step === 'swapping';

  return (
    <Sheet onDismiss={handleClose} label="Trade">
      <SheetHeader
        leading={
          <SegmentedControl
            tone="elevated"
            aria-label="Trade direction"
            value={mode}
            onChange={handleModeChange}
            segments={[
              { id: 'buy', label: 'Buy' },
              { id: 'sell', label: 'Sell' },
            ]}
            className="min-h-[40px]"
          />
        }
        trailing={
          <>
            <button
              onClick={() => setShowSettings(!showSettings)}
              aria-expanded={showSettings}
              className={cn(
                'h-9 pl-2.5 pr-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium transition-colors',
                showSettings ? 'bg-ice-line/[0.12] text-ice-text' : 'text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08]',
              )}
              aria-label={`Slippage tolerance ${slippageLabel}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="tabular-nums">{slippageLabel}</span>
            </button>
            <button onClick={handleClose} className={ICON_BUTTON} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {showSettings && (
          <div className="px-4 pt-4">
            <div className="rounded-xl bg-ice-line/[0.05] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-ice-text text-[14px] font-medium">Slippage tolerance</span>
                <span className="text-ice-faint text-[12px]">Max price movement you accept</span>
              </div>
              <div className="flex gap-2">
                {SLIPPAGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSlippageChange(option.value)}
                    className={cn(
                      'flex-1 min-h-[40px] rounded-lg text-[14px] font-medium transition-colors tabular-nums',
                      slippage === option.value && !customSlippage
                        ? 'bg-ice-accent/[0.15] text-ice-accent'
                        : 'bg-ice-line/[0.07] text-ice-muted hover:text-ice-text',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
                <div className="relative flex-[1.4]">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customSlippage}
                    onChange={(e) => handleCustomSlippageChange(e.target.value)}
                    placeholder="Custom"
                    aria-label="Custom slippage percent"
                    className={cn(
                      'w-full min-h-[40px] rounded-lg pl-3 pr-8 text-[14px] text-ice-text placeholder:text-ice-faint outline-none tabular-nums transition-colors',
                      customSlippage ? 'bg-ice-accent/[0.15]' : 'bg-ice-line/[0.07] focus:bg-ice-surface2',
                    )}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ice-faint text-[13px]">%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Amount cards */}
        <div className="px-4 pt-4 relative">
          <AmountCard
            label={mode === 'buy' ? 'You pay' : 'You sell'}
            token={fromToken}
            onPickToken={() => setShowTokenSelect('from')}
            usd={fromUsd}
            aside={
              fromBalance ? (
                <button onClick={handleMaxClick} className="flex items-center gap-1.5 text-ice-muted hover:text-ice-text transition-colors text-[13px]">
                  <span className="tabular-nums">{formatBalance(fromBalance.value, fromBalance.decimals)} {fromToken.symbol}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-ice-accent/[0.15] text-ice-accent text-[11px] font-semibold">MAX</span>
                </button>
              ) : null
            }
          >
            <input
              type="text"
              inputMode="decimal"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              aria-label="Amount to pay"
              className={cn(
                'w-full bg-transparent text-ice-text placeholder:text-ice-faint outline-none min-w-0 font-semibold tabular-nums tracking-[-0.02em] text-[32px] leading-none',
                hasInsufficientBalance && 'text-ice-down',
              )}
            />
          </AmountCard>

          {/* Direction */}
          <div className="relative h-3 z-10">
            <button
              type="button"
              onClick={swapDirection}
              aria-label="Swap direction"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-ice-surface border-[3px] border-ice-surface ring-1 ring-ice-line/15 flex items-center justify-center text-ice-muted hover:text-ice-text transition-colors"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>

          <AmountCard
            label={mode === 'buy' ? 'You receive' : 'You get'}
            token={toToken}
            onPickToken={() => setShowTokenSelect('to')}
            usd={quoteLoading ? null : toUsd}
          >
            {quoteLoading ? (
              <div className="h-8 flex items-center">
                <Loader2 className="w-6 h-6 animate-spin text-ice-faint" />
              </div>
            ) : (
              <div className={cn('font-semibold tabular-nums tracking-[-0.02em] text-[32px] leading-none truncate', toAmount ? 'text-ice-text' : 'text-ice-faint')}>
                {toAmount || '0'}
              </div>
            )}
          </AmountCard>
        </div>

        {/* Quote details */}
        {quote && fromAmount && !quoteLoading && (
          <div className="px-4 pt-3">
            <div className="rounded-xl bg-ice-line/[0.05] py-1 divide-y divide-ice-line/[0.06]">
              {exchangeRate && (
                <DetailRow label="Rate" value={`1 ${fromToken.symbol} = ${exchangeRate.toFixed(4)} ${toToken.symbol}`} />
              )}
              {priceImpact !== null && (
                <DetailRow
                  label="Price impact"
                  tone={priceImpact >= HIGH_IMPACT_PCT ? 'danger' : priceImpact >= WARN_IMPACT_PCT ? 'warn' : undefined}
                  value={priceImpact < 0.01 ? '<0.01%' : `-${priceImpact.toFixed(2)}%`}
                />
              )}
              {minReceived && <DetailRow label={`Min. received (${slippageLabel} slippage)`} value={`${minReceived} ${toToken.symbol}`} />}
              {routeSteps.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowRoute(!showRoute)}
                    aria-expanded={showRoute}
                    className="w-full flex items-center justify-between gap-4 px-4 min-h-[40px] text-[14px] text-ice-muted hover:text-ice-text transition-colors"
                  >
                    <span>Route</span>
                    <span className="flex items-center gap-1.5 text-ice-text">
                      {routeSteps.length} {routeSteps.length === 1 ? 'hop' : 'hops'}
                      {showRoute ? <ChevronUp className="w-4 h-4 text-ice-faint" /> : <ChevronDown className="w-4 h-4 text-ice-faint" />}
                    </span>
                  </button>
                  {showRoute && (
                    <div className="px-4 pb-3 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px]">
                      {routeSteps.map((s, index) => (
                        <span key={index} className="flex items-center gap-1.5">
                          {index === 0 && <span className="text-ice-text font-medium">{s.fromToken.symbol}</span>}
                          <span className="text-ice-faint">→</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-ice-line/[0.08] text-ice-muted text-[12px]">{s.protocol}</span>
                          <span className="text-ice-faint">→</span>
                          <span className="text-ice-text font-medium">{s.toToken.symbol}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notices */}
        <div className="px-4 pt-3 space-y-2.5 empty:hidden">
          {isHighImpact && !isWrongChain && !quoteLoading && (
            <label className="flex items-start gap-3 px-4 py-3 rounded-xl bg-ice-down/[0.08] cursor-pointer">
              <input
                type="checkbox"
                checked={highImpactAccepted}
                onChange={(e) => setHighImpactAccepted(e.target.checked)}
                className="mt-0.5 accent-[#ff5c7a] shrink-0 w-4 h-4"
              />
              <span className="text-ice-down text-[14px] leading-snug">
                This trade moves the price by about {priceImpact?.toFixed(1)}%, so you would receive well below market value.
                Try a smaller amount, or tick to proceed anyway.
              </span>
            </label>
          )}
          {isWrongChain && <Notice tone="warn">Your wallet is on another network. Switch to Avalanche to trade.</Notice>}
          {!isWrongChain && (quoteError || execError) && <Notice tone="danger">{quoteError || execError}</Notice>}
        </div>
      </div>

      {/* Action */}
      <div className="p-4 shrink-0">
        <button
          onClick={handleSwapClick}
          disabled={disabled}
          className={cn(
            'w-full min-h-[52px] rounded-xl font-semibold text-[16px] flex items-center justify-center gap-2 transition-opacity',
            disabled ? 'bg-ice-line/[0.08] text-ice-faint cursor-not-allowed' : 'bg-ice-accent hover:opacity-90',
          )}
          style={disabled ? undefined : { color: '#06223a' }}
        >
          {working && <Loader2 className="w-5 h-5 animate-spin" />}
          {getButtonText()}
        </button>
        {txHash && step === 'swapping' && (
          <a
            href={`https://snowtrace.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 text-ice-muted hover:text-ice-text transition-colors text-[13px]"
          >
            View transaction <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </Sheet>
  );
}

/** One side of the trade: label row, big amount, token pill, USD line. */
function AmountCard({
  label,
  token,
  onPickToken,
  usd,
  aside,
  children,
}: {
  label: string;
  token: SwapToken;
  onPickToken: () => void;
  usd: number | null;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-ice-line/[0.05] border border-ice-line/[0.08] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-ice-muted text-[13px]">{label}</span>
        {aside}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">{children}</div>
        <button
          type="button"
          onClick={onPickToken}
          className="shrink-0 flex items-center gap-2 pl-1.5 pr-2.5 h-10 rounded-full bg-ice-surface border border-ice-line/15 hover:border-ice-line/40 transition-colors"
          aria-label={`Change token, currently ${token.symbol}`}
        >
          <TokenLogo token={token} className="w-7 h-7" />
          <span className="text-ice-text font-semibold text-[15px]">{token.symbol}</span>
          <ChevronDown className="w-4 h-4 text-ice-muted" />
        </button>
      </div>
      <div className="h-5 mt-1.5 text-ice-faint text-[13px] tabular-nums">{usd !== null ? `≈ ${formatUsdApprox(usd)}` : ''}</div>
    </div>
  );
}
