import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

/** Card that holds a live-updating list: title row with status, then a capped list with a fade. */
export function LiveListCard({
  title,
  connected,
  rate,
  children,
  notice,
}: {
  title: string;
  connected: boolean;
  /** Short throughput caption such as "1.4 blocks/s". */
  rate?: string;
  children: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-ice-surface border border-ice-line/15 overflow-hidden">
      <div className="flex items-center gap-3 px-4 md:px-5 h-12 border-b border-ice-line/10">
        <h3 className="text-ice-text font-semibold text-[15px]">{title}</h3>
        <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', connected ? 'text-ice-up' : 'text-yellow-500')}>
          <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-ice-up animate-pulse' : 'bg-yellow-500')} />
          {connected ? 'Live' : 'Connecting…'}
        </span>
        {rate && <span className="ml-auto text-ice-faint text-[12px] tabular-nums">{rate}</span>}
      </div>
      {notice}
      <div className="relative">
        <ul className="divide-y divide-ice-line/10 max-h-[560px] overflow-hidden">{children}</ul>
        <div className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-ice-surface to-transparent pointer-events-none" />
      </div>
    </section>
  );
}

/** One row of a live list. New rows get a brief accent tint and slide in. */
export function LiveRow({
  to,
  icon,
  title,
  subtitle,
  trailing,
  isNew,
  isExiting,
  delayMs = 0,
  tone = 'default',
}: {
  to: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  trailing: ReactNode;
  isNew?: boolean;
  isExiting?: boolean;
  delayMs?: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <li
      className={cn('live-row', isNew && 'live-row-enter', isExiting && 'live-row-exit')}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Link
        to={to}
        className={cn(
          'flex items-center gap-3 md:gap-4 px-4 md:px-5 min-h-[60px] py-2.5 transition-colors',
          isNew ? 'bg-ice-accent/[0.07]' : 'hover:bg-ice-line/[0.05]',
        )}
      >
        <span
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
            tone === 'danger' ? 'bg-ice-down/10 text-ice-down' : isNew ? 'bg-ice-accent/[0.15] text-ice-accent' : 'bg-ice-line/[0.08] text-ice-muted',
          )}
        >
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className={cn('block font-semibold text-[14px] tabular-nums truncate', isNew ? 'text-ice-accent' : 'text-ice-text')}>{title}</span>
          <span className="block text-ice-muted text-[13px] tabular-nums truncate">{subtitle}</span>
        </span>
        <span className="text-ice-faint text-[12px] tabular-nums shrink-0">{trailing}</span>
        <ChevronRight className="w-4 h-4 text-ice-faint shrink-0" />
      </Link>
    </li>
  );
}

/** Placeholder rows while a stream connects. */
export function LiveRowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-4 md:px-5 h-[60px]">
          <div className="w-9 h-9 rounded-full bg-ice-line/[0.08] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-28 rounded bg-ice-line/[0.08] animate-pulse" />
            <div className="h-3 w-44 rounded bg-ice-line/[0.06] animate-pulse" />
          </div>
          <div className="h-3 w-14 rounded bg-ice-line/[0.08] animate-pulse" />
        </li>
      ))}
    </>
  );
}

/** Keyframes shared by every live list; rendered once by the explorer page. */
export function LiveListStyles() {
  return (
    <style>{`
      @keyframes live-row-in { 0% { opacity: 0; transform: translateY(-14px); } 100% { opacity: 1; transform: none; } }
      @keyframes live-row-out { 0% { opacity: 1; } 100% { opacity: 0; } }
      .live-row { transition: opacity .3s ease; }
      .live-row-enter { animation: live-row-in .35s cubic-bezier(.4,0,.2,1) both; }
      .live-row-exit { animation: live-row-out .25s ease-out forwards; }
    `}</style>
  );
}
