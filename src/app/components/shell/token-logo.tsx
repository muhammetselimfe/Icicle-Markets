import { useState } from 'react';
import { cn } from '@/app/components/ui/utils';

/** A token's logo, or its first two letters when there is none or it fails to load. */
export function TokenLogo({ symbol, logoUrl, className = 'w-10 h-10' }: { symbol: string; logoUrl?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <img src={logoUrl} alt="" className={cn('rounded-full shrink-0', className)} onError={() => setFailed(true)} />;
  }
  return (
    <span className={cn('rounded-full bg-ice-line/[0.1] flex items-center justify-center text-ice-text text-[13px] font-semibold shrink-0', className)}>
      {symbol.slice(0, 2)}
    </span>
  );
}
