import { BarChart3, Target, Wallet } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const navItems = [
    { id: 'markets', label: 'Markets', icon: BarChart3 },
    { id: 'options', label: 'Options', icon: Target },
    { id: 'positions', label: 'Positions', icon: Wallet },
  ];

  return (
    <nav className="py-3 relative z-10">
      <div className="container mx-auto px-4 md:px-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
          <div className="flex gap-1 p-1 bg-ice-surface border border-ice-line/15 rounded-xl w-max md:w-fit">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 md:px-5 md:py-2.5 rounded-lg transition-all font-medium min-h-[44px]",
                    isActive
                      ? "bg-ice-accent/10 text-ice-accent"
                      : "text-ice-muted hover:text-ice-text", 'text-[14px]')}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
