import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/app/components/ui/utils';
import { TABS, tabForPath } from './tabs';

/** Height of the bar itself, before the home-indicator safe area is added. */
export const TAB_BAR_HEIGHT = 56;

/** Bottom tab bar for phones: four labeled destinations, always visible. */
export function TabBar() {
  const { pathname } = useLocation();
  const activeTab = tabForPath(pathname);

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-ice-line/10 bg-ice-bg/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex" style={{ height: TAB_BAR_HEIGHT }}>
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <NavLink
              key={tab.id}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
                active ? 'text-ice-accent' : 'text-ice-faint',
              )}
            >
              <tab.icon className="w-6 h-6" strokeWidth={active ? 2.25 : 1.75} />
              <span className="text-[11px] font-medium leading-none">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
