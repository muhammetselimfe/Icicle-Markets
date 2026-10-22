import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Search, Loader2, ArrowRight, Box, FileText, User, Sun, Moon, Link2, Trash2, Clock, LayoutGrid, Command, Coins, ChevronRight } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { api } from '@/app/services/api';
import { MARKETS_TOKENS, type MarketToken } from '@/app/data/markets-tokens';

// ── Items ────────────────────────────────────────────────────────────────────

type Group = 'commands' | 'recent' | 'pages' | 'tokens' | 'chain';

/** What gets remembered under Recent; rebuilt into a full item on load. */
type RecentRef = { kind: 'token'; key: string } | { kind: 'page'; key: string } | { kind: 'tx' | 'address' | 'block'; key: string };

interface Item {
  id: string;
  group: Group;
  title: string;
  subtitle: string;
  icon: ReactNode;
  badge: string;
  run: () => void | Promise<void>;
  recent?: RecentRef;
}

interface PageDef {
  id: string;
  title: string;
  subtitle: string;
  to: string;
}

const PAGES: PageDef[] = [
  { id: 'markets', title: 'Markets', subtitle: 'Prices, charts, and swaps', to: '/' },
  { id: 'predict', title: 'Predict', subtitle: 'Prediction markets', to: '/predict' },
  { id: 'portfolio', title: 'Portfolio', subtitle: 'Your holdings', to: '/portfolio' },
  { id: 'positions', title: 'Positions', subtitle: 'Your prediction-market positions', to: '/portfolio/positions' },
  { id: 'activity', title: 'Activity', subtitle: 'Your transaction history', to: '/portfolio/activity' },
  { id: 'explorer', title: 'Explorer', subtitle: 'Live blocks, transactions, validators', to: '/explorer' },
];

const GROUP_META: Record<Group, { label: string; icon: ReactNode }> = {
  commands: { label: 'Commands', icon: <Command className="w-3.5 h-3.5" /> },
  recent: { label: 'Recent', icon: <Clock className="w-3.5 h-3.5" /> },
  pages: { label: 'Pages', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  tokens: { label: 'Tokens', icon: <Coins className="w-3.5 h-3.5" /> },
  chain: { label: 'On chain', icon: <Box className="w-3.5 h-3.5" /> },
};

const GROUP_ORDER: Group[] = ['chain', 'tokens', 'commands', 'recent', 'pages'];
/** On a phone there is no keyboard to drive commands with; where you were and where you can go come first. */
const PHONE_GROUP_ORDER: Group[] = ['chain', 'tokens', 'recent', 'pages', 'commands'];
const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
const MAX_TOKENS = 6;
const MAX_RECENT = 5;
const RECENT_KEY = 'icicle-recent-searches';

function loadRecent(): RecentRef[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentRef[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: RecentRef[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode); recents just do not persist.
  }
}

type ChainHit = { kind: 'tx' | 'address' | 'block'; key: string };

function detectChainHit(query: string): ChainHit | null {
  const q = query.trim();
  if (/^0x[a-f0-9]{64}$/i.test(q)) return { kind: 'tx', key: q };
  if (/^0x[a-f0-9]{40}$/i.test(q)) return { kind: 'address', key: q };
  if (/^\d{1,12}$/.test(q)) return { kind: 'block', key: q };
  return null;
}

function matchTokens(query: string): MarketToken[] {
  const q = query.trim().toLowerCase();
  if (!q || q.startsWith('0x')) return [];
  const starts: MarketToken[] = [];
  const contains: MarketToken[] = [];
  for (const t of MARKETS_TOKENS) {
    const symbol = t.symbol.toLowerCase();
    const name = t.name.toLowerCase();
    if (symbol.startsWith(q) || name.startsWith(q)) starts.push(t);
    else if (symbol.includes(q) || name.includes(q)) contains.push(t);
  }
  return [...starts, ...contains].slice(0, MAX_TOKENS);
}

function matches(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f.toLowerCase().includes(q));
}

function short(hex: string): string {
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

const ICON_BOX = 'w-10 h-10 rounded-lg bg-ice-line/[0.08] flex items-center justify-center shrink-0 text-ice-muted';

function TokenIcon({ token }: { token: MarketToken }) {
  return token.logoUrl ? (
    <img src={token.logoUrl} alt="" className="w-10 h-10 rounded-full shrink-0" />
  ) : (
    <span className={ICON_BOX}>{token.symbol.slice(0, 2)}</span>
  );
}

// ── Trigger ──────────────────────────────────────────────────────────────────

/** The search-field-shaped button in the navigation bar. */
export function SearchTrigger({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'h-10 flex items-center gap-3 px-3 rounded-xl bg-ice-line/[0.07] hover:bg-ice-line/[0.1] text-ice-faint transition-colors text-left',
        className,
      )}
      aria-label="Search"
      aria-keyshortcuts="Meta+K Control+K"
    >
      <Search className="w-[18px] h-[18px] shrink-0" />
      <span className="flex-1 text-[14px] truncate">Search tokens, transactions, addresses, blocks</span>
      <kbd className="hidden lg:inline-flex items-center h-5 px-1.5 rounded-md border border-ice-line/20 text-[11px] font-medium">⌘K</kbd>
    </button>
  );
}

// ── Palette ──────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * ⌘K command palette: one place to jump to a token, a transaction, an address, a block,
 * a page, or run an app command. Portaled to the body so header effects do not clip it.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRef[]>([]);

  // Fresh state each time it opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setError(null);
    setRecent(loadRecent());
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const remember = useCallback((ref: RecentRef) => {
    const next = [ref, ...loadRecent().filter((r) => !(r.kind === ref.kind && r.key === ref.key))].slice(0, MAX_RECENT);
    saveRecent(next);
    setRecent(next);
  }, []);

  const go = useCallback(
    (to: string, ref?: RecentRef) => {
      if (ref) remember(ref);
      navigate(to);
      onClose();
    },
    [navigate, onClose, remember],
  );

  const openChain = useCallback(
    async (hit: ChainHit) => {
      setError(null);
      if (hit.kind === 'address') return go(`/address/${hit.key}`, hit);
      // Transactions and blocks are verified first so a typo does not land on an error page.
      setBusy(true);
      try {
        if (hit.kind === 'tx') await api.getTransaction(hit.key);
        else await api.getBlock(parseInt(hit.key, 10));
        go(hit.kind === 'tx' ? `/tx/${hit.key}` : `/block/${hit.key}`, hit);
      } catch {
        setError(hit.kind === 'tx' ? 'Transaction not found' : 'Block not found');
      } finally {
        setBusy(false);
      }
    },
    [go],
  );

  const chainItem = useCallback(
    (hit: ChainHit, group: Group): Item => {
      const label = hit.kind === 'tx' ? 'Transaction' : hit.kind === 'address' ? 'Address' : 'Block';
      const value = hit.kind === 'block' ? `#${parseInt(hit.key, 10).toLocaleString('en-US')}` : short(hit.key);
      const icon = hit.kind === 'tx' ? <FileText className="w-5 h-5" /> : hit.kind === 'address' ? <User className="w-5 h-5" /> : <Box className="w-5 h-5" />;
      return {
        id: `${group}:${hit.kind}:${hit.key}`,
        group,
        title: label,
        subtitle: value,
        icon: <span className={ICON_BOX}>{icon}</span>,
        badge: hit.kind,
        run: () => openChain(hit),
      };
    },
    [openChain],
  );

  const tokenItem = useCallback(
    (token: MarketToken, group: Group): Item => ({
      id: `${group}:token:${token.address}`,
      group,
      title: token.symbol,
      subtitle: token.name,
      icon: <TokenIcon token={token} />,
      badge: 'token',
      run: () => go(`/token/${token.coingeckoId}`, { kind: 'token', key: token.coingeckoId }),
    }),
    [go],
  );

  const pageItem = useCallback(
    (page: PageDef, group: Group): Item => ({
      id: `${group}:page:${page.id}`,
      group,
      title: page.title,
      subtitle: page.subtitle,
      icon: (
        <span className={ICON_BOX}>
          <LayoutGrid className="w-5 h-5" />
        </span>
      ),
      badge: 'page',
      run: () => go(page.to, { kind: 'page', key: page.id }),
    }),
    [go],
  );

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const q = query.trim();
    const searching = q.length > 0;

    const hit = detectChainHit(q);
    if (hit) out.push(chainItem(hit, 'chain'));

    for (const token of matchTokens(q)) out.push(tokenItem(token, 'tokens'));

    const dark = resolvedTheme === 'dark';
    const commands: Item[] = [
      {
        id: 'cmd:theme',
        group: 'commands',
        title: dark ? 'Switch to light mode' : 'Switch to dark mode',
        subtitle: 'Toggle appearance',
        icon: <span className={ICON_BOX}>{dark ? <Sun className="w-5 h-5 text-ice-accent" /> : <Moon className="w-5 h-5 text-ice-accent" />}</span>,
        badge: 'cmd',
        run: () => {
          setTheme(dark ? 'light' : 'dark');
          onClose();
        },
      },
      {
        id: 'cmd:copy-url',
        group: 'commands',
        title: 'Copy current URL',
        subtitle: 'Share this page',
        icon: (
          <span className={ICON_BOX}>
            <Link2 className="w-5 h-5" />
          </span>
        ),
        badge: 'cmd',
        run: async () => {
          await navigator.clipboard.writeText(window.location.href);
          toast.success('Link copied');
          onClose();
        },
      },
      {
        id: 'cmd:clear-recent',
        group: 'commands',
        title: 'Clear recent searches',
        subtitle: 'Wipe ⌘K history on this device',
        icon: (
          <span className={ICON_BOX}>
            <Trash2 className="w-5 h-5" />
          </span>
        ),
        badge: 'cmd',
        run: () => {
          saveRecent([]);
          setRecent([]);
        },
      },
    ];
    for (const c of commands) if (matches(q, c.title, c.subtitle)) out.push(c);

    if (!searching) {
      for (const ref of recent) {
        if (ref.kind === 'token') {
          const token = MARKETS_TOKENS.find((t) => t.coingeckoId === ref.key);
          if (token) out.push(tokenItem(token, 'recent'));
        } else if (ref.kind === 'page') {
          const page = PAGES.find((p) => p.id === ref.key);
          if (page) out.push(pageItem(page, 'recent'));
        } else {
          out.push(chainItem(ref, 'recent'));
        }
      }
    }

    for (const page of PAGES) if (matches(q, page.title, page.subtitle)) out.push(pageItem(page, 'pages'));

    const order = isPhone() ? PHONE_GROUP_ORDER : GROUP_ORDER;
    return order.flatMap((g) => out.filter((i) => i.group === g));
  }, [query, recent, resolvedTheme, chainItem, tokenItem, pageItem, setTheme, onClose, location.pathname]);

  useEffect(() => setActive(0), [items.length, query]);

  // Keep the active row visible while arrowing through a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (items.length ? (i + 1) % items.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[active];
        if (item) item.run();
        else if (query.trim()) setError('No matches. Try a token, a transaction hash, an address, or a block number.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, query, onClose]);

  // Lock page scroll behind the dialog.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  // Group headers are emitted when the group changes in the flat, ordered list.
  const rows: ReactNode[] = [];
  let lastGroup: Group | null = null;
  items.forEach((item, index) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      const count = items.filter((i) => i.group === item.group).length;
      rows.push(
        <div key={`h:${item.group}`} className="flex items-center gap-2 px-5 md:px-6 pt-4 pb-2 text-ice-faint">
          {GROUP_META[item.group].icon}
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">{GROUP_META[item.group].label}</span>
          <span className="text-[12px] tabular-nums">({count})</span>
        </div>,
      );
    }
    const isActive = index === active;
    rows.push(
      <button
        key={item.id}
        type="button"
        role="option"
        aria-selected={isActive}
        data-index={index}
        onMouseEnter={() => setActive(index)}
        onClick={() => item.run()}
        className={cn(
          'w-full flex items-center gap-4 px-5 md:px-6 py-3 text-left transition-colors',
          isActive ? 'bg-ice-accent/[0.08]' : 'hover:bg-ice-line/[0.05]',
        )}
      >
        {item.icon}
        <span className="flex-1 min-w-0">
          <span className="block text-ice-text font-semibold text-[16px] truncate">{item.title}</span>
          <span className={cn('block text-[14px] truncate', item.badge === 'tx' || item.badge === 'address' ? 'font-mono text-ice-faint' : 'text-ice-muted')}>
            {item.subtitle}
          </span>
        </span>
        <span className="hidden md:flex items-center gap-3 shrink-0">
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ice-faint">{item.badge}</span>
          <ArrowRight className={cn('w-4 h-4 transition-opacity', isActive ? 'text-ice-accent opacity-100' : 'opacity-0')} />
        </span>
        <ChevronRight className="md:hidden w-4 h-4 text-ice-faint shrink-0" />
      </button>,
    );
  });

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col items-center md:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search and commands">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative flex flex-col w-full bg-ice-surface',
          'h-full md:h-auto md:max-h-[70vh] md:max-w-[860px] md:rounded-2xl md:border md:border-ice-line/15 md:shadow-2xl md:shadow-black/40',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Field */}
        <div className="flex items-center gap-3 px-5 md:px-6 h-[64px] md:h-[72px] border-b border-ice-line/10">
          {busy ? <Loader2 className="w-5 h-5 text-ice-faint animate-spin shrink-0" /> : <Search className="w-5 h-5 text-ice-faint shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Search tokens, transactions, addresses, blocks…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 min-w-0 bg-transparent text-ice-text placeholder:text-ice-faint outline-none text-[18px] md:text-[20px]"
          />
          <button
            type="button"
            onClick={onClose}
            className="md:hidden px-2 min-h-[44px] text-ice-accent text-[16px]"
          >
            Cancel
          </button>
          <kbd className="hidden md:inline-flex items-center h-7 px-2 rounded-md border border-ice-line/20 bg-ice-line/[0.06] text-ice-muted text-[12px] font-medium">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} id="command-palette-list" role="listbox" className="flex-1 overflow-y-auto pb-2">
          {error ? (
            <p className="px-6 py-5 text-ice-down text-[15px]">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-6 py-5 text-ice-faint text-[15px]">No matches</p>
          ) : (
            rows
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 md:px-6 py-3 border-t border-ice-line/10 text-ice-muted text-[13px]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="hidden md:flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              to open
            </span>
          </div>
          <span className="md:ml-auto tabular-nums">
            {items.length} {items.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-md border border-ice-line/20 bg-ice-line/[0.06] text-ice-muted text-[11px] font-medium">
      {children}
    </kbd>
  );
}

/** Opens the palette on ⌘K / Ctrl+K anywhere in the app. */
export function useCommandPaletteShortcut(setOpen: (fn: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}
