import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAccount, useBalance, useChainId, useReadContract, useSwitchChain } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { useTheme } from 'next-themes';
import { formatUnits, erc20Abi } from 'viem';
import { Copy, Check, LogOut, Wallet, Compass, Sun, Moon, ChevronRight, X, Loader2 } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { SegmentedControl } from './segmented-control';
import { WalletAvatar } from './wallet-avatar';
import { useSignIn } from './use-sign-in';
import { useSwapPrices } from '@/app/hooks/useSwapPrices';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { NATIVE_AVAX_ADDRESS } from '@/app/utils/transaction-history';

type Network = 'mainnet' | 'fuji';

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatAmount(raw: bigint | undefined, decimals: number): string {
  if (raw === undefined) return '—';
  const n = parseFloat(formatUnits(raw, decimals));
  if (n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  if (n >= 1_000_000) return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 });
}

/** How the person signed in, from Privy's linked accounts. */
function useSignInMethod(): string | null {
  const { user } = usePrivy();
  if (!user) return null;
  if (user.email?.address) return user.email.address;
  if (user.google?.email) return `Google · ${user.google.email}`;
  if (user.twitter?.username) return `X · @${user.twitter.username}`;
  if (user.github?.username) return `GitHub · ${user.github.username}`;
  if (user.wallet?.walletClientType && user.wallet.walletClientType !== 'privy') return user.wallet.walletClientType.replace(/_/g, ' ');
  return null;
}

function Row({ to, href, onClick, icon, label, trailing }: { to?: string; href?: string; onClick?: () => void; icon: ReactNode; label: string; trailing?: ReactNode }) {
  const className = 'w-full flex items-center gap-3 px-4 min-h-[48px] text-left text-ice-text text-[15px] hover:bg-ice-line/[0.06] transition-colors';
  const body = (
    <>
      <span className="w-8 h-8 rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-muted shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {trailing ?? <ChevronRight className="w-4 h-4 text-ice-faint" />}
    </>
  );
  if (to) return <Link to={to} onClick={onClick} className={className}>{body}</Link>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>{body}</a>;
  return <button type="button" onClick={onClick} className={className}>{body}</button>;
}

/** Account sheet: who is signed in, what they hold, which network they are on, and the exits. */
export function AccountMenu({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null> }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { signOut } = useSignIn();
  const { resolvedTheme, setTheme } = useTheme();
  const method = useSignInMethod();
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const onFuji = chainId === CHAIN_IDS.FUJI;
  const { data: avax } = useBalance({ address, chainId: CHAIN_IDS.MAINNET, query: { enabled: !!address && open && !onFuji } });
  const { data: fujiAvax } = useBalance({ address, chainId: CHAIN_IDS.FUJI, query: { enabled: !!address && open && onFuji } });
  const { data: testUsdc } = useReadContract({
    address: OPTIONS_CONTRACTS.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_IDS.FUJI,
    query: { enabled: !!address && open && onFuji },
  });
  const { priceOf } = useSwapPrices(open && !onFuji ? [NATIVE_AVAX_ADDRESS] : []);
  const avaxPrice = priceOf(NATIVE_AVAX_ADDRESS);
  const avaxUsd = avax && avaxPrice ? parseFloat(formatUnits(avax.value, 18)) * avaxPrice : null;

  const network: Network = chainId === CHAIN_IDS.FUJI ? 'fuji' : 'mainnet';

  // Anchor under the account button on wide screens; the phone layout is a bottom sheet.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, anchor]);

  if (!open || !address) return null;

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const changeNetwork = async (next: Network) => {
    if (next === network) return;
    try {
      await switchChainAsync({ chainId: next === 'fuji' ? CHAIN_IDS.FUJI : CHAIN_IDS.MAINNET });
    } catch {
      // Rejected in the wallet; the control snaps back to the real chain.
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] md:pointer-events-none" role="dialog" aria-label="Account">
      <div className="absolute inset-0 bg-black/50 md:hidden" onClick={onClose} />
      <div
        ref={panelRef}
        className={cn(
          'pointer-events-auto absolute bg-ice-surface border border-ice-line/15 shadow-2xl shadow-black/40 overflow-hidden',
          'inset-x-0 bottom-0 rounded-t-2xl md:inset-auto md:w-[340px] md:rounded-2xl',
        )}
        style={pos && window.innerWidth >= 768 ? { top: pos.top, right: pos.right } : { paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Identity */}
        <div className="flex items-center gap-3 p-4 border-b border-ice-line/10">
          <WalletAvatar address={address} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-ice-text font-semibold font-mono text-[15px]">{shortAddress(address)}</span>
              <button type="button" onClick={copy} className="w-7 h-7 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08]" aria-label="Copy address">
                {copied ? <Check className="w-3.5 h-3.5 text-ice-up" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <Link to={`/address/${address}`} onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08]" aria-label="Open this wallet in Explorer">
                <Compass className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="text-ice-muted text-[13px] truncate">{method ? `Signed in with ${method}` : 'Signed in'}</div>
          </div>
          <button type="button" onClick={onClose} className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-ice-muted hover:bg-ice-line/[0.08]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balances for the network you are on */}
        <div className="grid grid-cols-2 gap-2 p-3 border-b border-ice-line/10">
          {network === 'mainnet' ? (
            <div className="col-span-2 rounded-xl bg-ice-line/[0.05] p-3 flex items-baseline justify-between gap-3">
              <div>
                <div className="text-ice-muted text-[12px]">AVAX balance</div>
                <div className="text-ice-text font-semibold tabular-nums text-[20px] leading-tight">{formatAmount(avax?.value, 18)}</div>
              </div>
              <div className="text-ice-faint text-[13px] tabular-nums">{avaxUsd !== null ? `$${avaxUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''}</div>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-ice-line/[0.05] p-3">
                <div className="text-ice-muted text-[12px]">Test USDC</div>
                <div className="text-ice-text font-semibold tabular-nums text-[17px] leading-tight">{formatAmount(testUsdc as bigint | undefined, 6)}</div>
                <div className="text-ice-faint text-[12px] h-4">for Predict</div>
              </div>
              <div className="rounded-xl bg-ice-line/[0.05] p-3">
                <div className="text-ice-muted text-[12px]">AVAX · Fuji</div>
                <div className="text-ice-text font-semibold tabular-nums text-[17px] leading-tight">{formatAmount(fujiAvax?.value, 18)}</div>
                <div className="text-ice-faint text-[12px] h-4">for gas</div>
              </div>
            </>
          )}
        </div>

        {/* Network */}
        <div className="px-4 py-3 border-b border-ice-line/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-ice-muted text-[13px]">Network</span>
            {switching && <Loader2 className="w-3.5 h-3.5 text-ice-faint animate-spin" />}
          </div>
          <SegmentedControl
            aria-label="Network"
            fullWidth
            tone="elevated"
            value={network}
            onChange={changeNetwork}
            segments={[
              { id: 'mainnet', label: 'Avalanche' },
              { id: 'fuji', label: 'Fuji testnet' },
            ]}
          />
          <p className="text-ice-faint text-[12px] mt-2">Markets and swaps use Avalanche. Predict runs on Fuji.</p>
        </div>

        {/* Links */}
        <div className="py-1 border-b border-ice-line/10">
          <Row to="/portfolio" onClick={onClose} icon={<Wallet className="w-4 h-4" />} label="Portfolio" />
        </div>

        {/* Appearance + sign out */}
        <div className="py-1">
          <Row
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            icon={resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            label="Appearance"
            trailing={
              <span className="flex items-center gap-1 text-ice-faint text-[13px]">
                {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
                <ChevronRight className="w-4 h-4" />
              </span>
            }
          />
          <button
            type="button"
            onClick={async () => {
              await signOut();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left text-ice-down text-[15px] hover:bg-ice-down/[0.06] transition-colors"
          >
            <span className="w-8 h-8 rounded-full bg-ice-down/10 flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4" />
            </span>
            Sign out
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
