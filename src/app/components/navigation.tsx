import { BarChart3, Wallet, Network } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const navItems = [
    { id: 'markets', label: 'MARKETS', icon: BarChart3 },
    { id: 'portfolio', label: 'PORTFOLIO', icon: Wallet },
    { id: 'explorer', label: 'EXPLORER', icon: Network },
  ];

  return (
    <nav className="border-b-4 border-[#4db8ff]/50 bg-[#0a0e27]">
      <div className="container mx-auto px-6">
        <div className="flex gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "relative px-8 py-4 transition-all border-2 border-transparent",
                  isActive
                    ? "bg-[#8be4ff]/10 border-[#8be4ff] text-[#8be4ff] shadow-[0_0_15px_rgba(139,228,255,0.4)]"
                    : "text-[#4db8ff] hover:bg-[#4db8ff]/5 hover:border-[#4db8ff]/30"
                )}
                style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {isActive && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#8be4ff]" />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#8be4ff] blur-sm" />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
