import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, ChevronRight, Target } from 'lucide-react';
import { PageHeader } from '@/app/components/shell/page-header';
import { EmptyState } from '@/app/components/shell/empty-state';
import { SegmentedControl } from '@/app/components/shell/segmented-control';
import { ErrorState } from '@/app/components/ui/data-states';
import { useAccount, useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import { cn } from '@/app/components/ui/utils';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { MarketState, type MarketDisplay } from '@/app/types/options';
import { formatUsdc, formatTickAsPrice } from '@/app/utils/options';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { useChainId } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { ERC20_ABI } from '@/app/config/options-abis';
import { OptionMarketCard, AssetLogo, MarketStateBadge } from '@/app/components/option-market-card';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse bg-ice-line/[0.08] rounded', className)} />;
}

function formatWhen(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Filter = 'live' | 'settled';
const SETTLED_PAGE = 10;

export function OptionsView() {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { markets, loading, error, refetch } = useOptionsMarkets();

  const live = useMemo(
    () => markets.filter((m) => m.state === MarketState.Trading).sort((a, b) => b.marketId - a.marketId),
    [markets],
  );
  const settled = useMemo(
    () => markets.filter((m) => m.state !== MarketState.Trading).sort((a, b) => b.marketId - a.marketId),
    [markets],
  );

  // Start on Live; if nothing is live once data lands, show what exists.
  const [filter, setFilter] = useState<Filter | null>(null);
  const activeFilter: Filter = filter ?? (live.length === 0 && settled.length > 0 ? 'settled' : 'live');
  const [settledShown, setSettledShown] = useState(SETTLED_PAGE);

  const open = (id: number) => navigate(`/predict/${id}`);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      <PageHeader title="Predict" subtitle="Pick a price range for an asset, trade it, and get paid if it lands there.">
        {!error && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <SegmentedControl
              aria-label="Market filter"
              value={activeFilter}
              onChange={setFilter}
              segments={[
                { id: 'live', label: 'Live', badge: loading ? undefined : live.length },
                { id: 'settled', label: 'Settled', badge: loading ? undefined : settled.length },
              ]}
            />
            <TestnetRow signedIn={isConnected} />
          </div>
        )}
      </PageHeader>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-ice-surface border border-ice-line/15 p-5 rounded-2xl space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-1.5" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-[64px] w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      ) : activeFilter === 'live' ? (
        live.length === 0 ? (
          <EmptyState
            icon={<Target className="w-6 h-6" />}
            title="No live markets right now"
            message={settled.length > 0 ? 'New markets open daily. Settled markets are a tap away.' : 'New markets open daily. Check back soon.'}
            action={settled.length > 0 ? { label: `See ${settled.length} settled`, onClick: () => setFilter('settled') } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {live.map((m) => (
              <OptionMarketCard key={m.marketId} market={m} onClick={() => open(m.marketId)} />
            ))}
          </div>
        )
      ) : settled.length === 0 ? (
        <EmptyState icon={<Target className="w-6 h-6" />} title="Nothing settled yet" message="Markets show up here once trading ends and the oracle reports a price." />
      ) : (
        <div className="rounded-2xl bg-ice-surface border border-ice-line/15 overflow-hidden">
          <ul className="divide-y divide-ice-line/10">
            {settled.slice(0, settledShown).map((m) => (
              <li key={m.marketId}>
                <SettledMarketRow market={m} onOpen={() => open(m.marketId)} />
              </li>
            ))}
          </ul>
          {settled.length > settledShown && (
            <button
              type="button"
              onClick={() => setSettledShown((n) => n + SETTLED_PAGE)}
              className="w-full min-h-[48px] border-t border-ice-line/10 text-ice-accent text-[14px] font-medium hover:bg-ice-line/[0.05] transition-colors"
            >
              Show {Math.min(SETTLED_PAGE, settled.length - settledShown)} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** One settled market, as a grouped-list row. */
function SettledMarketRow({ market: m, onOpen }: { market: MarketDisplay; onOpen: () => void }) {
  const range = `${formatTickAsPrice(m.minTick, m.tickDivisor)} – ${formatTickAsPrice(m.maxTick, m.tickDivisor)}`;
  const settledAt =
    m.settlementPrice !== null && m.settlementPrice > 0
      ? m.priceDecimals === 0
        ? `$${Math.round(m.settlementPrice).toLocaleString('en-US')}`
        : `$${m.settlementPrice.toFixed(2)}`
      : null;
  // In a list of settled markets the final price is the result; a badge only earns its
  // place when the market is still waiting on the oracle or needs manual settlement.
  const finalized = m.state === MarketState.FinalizedPrimary || m.state === MarketState.FinalizedSecondary;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-5 min-h-[64px] py-3 text-left hover:bg-ice-line/[0.05] transition-colors"
    >
      <AssetLogo src={m.assetLogo} symbol={m.assetSymbol} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-ice-text font-semibold text-[15px]">{m.assetSymbol}/USD</span>
          <span className="text-ice-faint text-[12px] tabular-nums">#{m.marketId}</span>
        </span>
        <span className="block text-ice-muted text-[13px] truncate tabular-nums">
          {formatWhen(m.tradingEnd)}
          <span className="hidden sm:inline"> · {range}</span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 shrink-0">
        {settledAt && (
          <span className="text-ice-text text-[14px] tabular-nums">
            <span className="hidden sm:inline">Settled at </span>
            <span className="font-semibold">{settledAt}</span>
          </span>
        )}
        {!finalized && <MarketStateBadge state={m.state} label={m.stateLabel} />}
      </span>
      <ChevronRight className="w-4 h-4 text-ice-faint shrink-0" />
    </button>
  );
}

/** Compact testnet notice; signed-in users also get the faucet here. */
function TestnetRow({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex items-center gap-3 sm:ml-auto min-h-[44px] px-3 rounded-xl bg-ice-line/[0.05] text-[13px]">
      <span className="inline-flex items-center gap-2 text-ice-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
        Fuji testnet · trades use test USDC
      </span>
      {signedIn && <ClaimTestUsdcButton />}
    </div>
  );
}

const FAUCET_AMOUNT = 1000n * 1_000_000n; // 1000 USDC (6 decimals)

export function ClaimTestUsdcButton() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchForTab, isSwitching } = useChainSwitch();
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_IDS.FUJI });

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: OPTIONS_CONTRACTS.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_IDS.FUJI,
    query: { enabled: !!address },
  });

  const [mintState, setMintState] = useState<'idle' | 'pending' | 'confirming' | 'success'>('idle');

  const handleClaim = async () => {
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (!address || !publicClient || !walletClient) return;
    try {
      setMintState('pending');
      const gas = await publicClient.estimateContractGas({
        address: OPTIONS_CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [address, FAUCET_AMOUNT],
        account: address,
      });
      const hash = await walletClient.writeContract({
        address: OPTIONS_CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [address, FAUCET_AMOUNT],
        gas: gas + gas / 4n,
      });
      setMintState('confirming');
      await publicClient.waitForTransactionReceipt({ hash });
      setMintState('success');
      refetchBalance();
      setTimeout(() => setMintState('idle'), 3000);
    } catch {
      setMintState('idle');
    }
  };

  const balanceStr = balance !== undefined ? formatUsdc(balance as bigint) : '…';
  const isSuccess = mintState === 'success';
  const isBusy = (mintState !== 'idle' && mintState !== 'success') || isSwitching;

  return (
    <div className="flex items-center gap-3 ml-auto">
      <span className="text-ice-muted text-[13px] whitespace-nowrap">
        <span className="text-ice-text font-medium tabular-nums">{balanceStr}</span> USDC
      </span>
      <button
        type="button"
        onClick={handleClaim}
        disabled={isBusy}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap',
          isSuccess
            ? 'bg-ice-up/10 text-ice-up'
            : isBusy
              ? 'bg-ice-line/[0.08] text-ice-faint cursor-not-allowed'
              : 'bg-ice-accent/[0.12] text-ice-accent hover:bg-ice-accent/20',
        )}
      >
        {isBusy && !isSuccess && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
        {isSuccess ? 'Claimed' : isWrongChain ? 'Switch to Fuji' : (
          <>
            <Coins className="w-3.5 h-3.5" />
            Get 1,000 test USDC
          </>
        )}
      </button>
    </div>
  );
}
