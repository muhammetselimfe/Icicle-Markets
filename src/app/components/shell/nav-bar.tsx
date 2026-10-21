import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { Search } from 'lucide-react';
import { WalletAvatar } from './wallet-avatar';
import { cn } from '@/app/components/ui/utils';
import { BRAND } from '@/app/constants/brand';
import { CHAIN_IDS } from '@/app/config/wagmi';
import { TABS, tabForPath } from './tabs';
import { useSignIn } from './use-sign-in';
import { CommandPalette, SearchTrigger, useCommandPaletteShortcut } from './command-palette';
import { AccountMenu } from './account-menu';

const ICON_BUTTON =
  'w-10 h-10 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors';

/**
 * Top navigation bar: brand, the four tabs (wide screens), one search for everything,
 * appearance toggle and account. Phones get a search sheet and the bottom TabBar.
 */
export function NavBar() {
  const { pathname } = useLocation();
  const activeTab = tabForPath(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  useCommandPaletteShortcut(setSearchOpen);

  // Leaving the page closes the palette.
  useEffect(() => setSearchOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-ice-line/10 bg-ice-bg/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center gap-3 md:gap-8">
        <Link to="/" className="flex items-center shrink-0" aria-label={`${BRAND.fullName} home`}>
          <img src={BRAND.logos.main} alt="" className="h-8 md:h-10" />
        </Link>

        <nav className="hidden md:flex items-stretch self-stretch gap-6" aria-label="Primary">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center text-[15px] transition-colors',
                  active ? 'text-ice-text font-semibold' : 'text-ice-muted font-medium hover:text-ice-text',
                  // Active indicator sits on the bar's bottom edge.
                  active && 'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-ice-accent',
                )}
              >
                {tab.label}
              </NavLink>
            );
          })}
        </nav>

        <SearchTrigger onOpen={() => setSearchOpen(true)} className="hidden md:flex flex-1 max-w-xl ml-auto" />

        <div className="ml-auto md:ml-0 flex items-center gap-1 md:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={cn(ICON_BUTTON, 'md:hidden')}
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>
          <AccountControl />
        </div>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

function AccountControl() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signIn } = useSignIn();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onFuji = chainId === CHAIN_IDS.FUJI;

  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => signIn()}
        className="h-9 md:h-10 px-4 rounded-full bg-ice-accent text-[14px] font-semibold transition-opacity hover:opacity-90"
        style={{ color: '#06223a' }}
      >
        Sign In
      </button>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative w-10 h-10 rounded-full flex items-center justify-center transition-shadow',
          'ring-2 ring-transparent hover:ring-ice-line/30',
          open && 'ring-ice-accent/60',
        )}
        aria-label="Account"
        aria-expanded={open}
        title={onFuji ? 'On Fuji testnet' : undefined}
      >
        <WalletAvatar address={address} size={34} />
        {onFuji && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-500 ring-2 ring-ice-bg" aria-hidden="true" />}
      </button>
      <AccountMenu open={open} onClose={() => setOpen(false)} anchor={buttonRef} />
    </>
  );
}
