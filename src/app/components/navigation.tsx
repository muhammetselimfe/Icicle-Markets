import { BarChart3, Wallet, Network } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const navItems = [
    { id: 'markets', label: 'Markets', icon: BarChart3 },
    { id: 'portfolio', label: 'Portfolio', icon: Wallet },
    { id: 'explorer', label: 'Explorer', icon: Network },
  ];

  return (
    <nav className="bg-[#0a0e27] py-3">
      <div className="container mx-auto px-4 md:px-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-max md:w-fit">
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
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                  style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
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
