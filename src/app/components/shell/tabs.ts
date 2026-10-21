import { BarChart3, Target, Wallet, Compass, type LucideIcon } from 'lucide-react';

export type TabId = 'markets' | 'predict' | 'portfolio' | 'explorer';

export interface TabDef {
  id: TabId;
  label: string;
  to: string;
  icon: LucideIcon;
}

// The four top-level destinations. Order matters: it is the order in both tab bars.
export const TABS: TabDef[] = [
  { id: 'markets', label: 'Markets', to: '/', icon: BarChart3 },
  { id: 'predict', label: 'Predict', to: '/predict', icon: Target },
  { id: 'portfolio', label: 'Portfolio', to: '/portfolio', icon: Wallet },
  { id: 'explorer', label: 'Explorer', to: '/explorer', icon: Compass },
];

/** Which tab a path belongs to, so detail pages keep their parent tab highlighted. */
export function tabForPath(pathname: string): TabId {
  if (pathname === '/predict' || pathname.startsWith('/predict/')) return 'predict';
  if (pathname === '/portfolio' || pathname.startsWith('/portfolio/')) return 'portfolio';
  if (
    pathname === '/explorer' ||
    pathname.startsWith('/block/') ||
    pathname.startsWith('/tx/') ||
    pathname.startsWith('/address/')
  ) {
    return 'explorer';
  }
  return 'markets';
}
