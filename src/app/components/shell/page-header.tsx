import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Controls aligned to the trailing edge of the title row. */
  trailing?: ReactNode;
  /** Content below the title row, such as a search field or segmented control. */
  children?: ReactNode;
  className?: string;
}

/** Large-title header for a tab root. */
export function PageHeader({ title, subtitle, trailing, children, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-ice-text text-[28px] md:text-[34px] font-bold tracking-[-0.02em] leading-[1.1]">{title}</h1>
          {subtitle && <p className="text-ice-muted text-[15px] mt-1.5">{subtitle}</p>}
        </div>
        {/* Trailing controls sit on the title line, matching a navigation bar's trailing items */}
        {trailing && <div className="shrink-0 flex items-center gap-2 min-h-[31px] md:min-h-[37px]">{trailing}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

interface BackButtonProps {
  /** Label of the place the user came from, shown next to the chevron. */
  label: string;
  /** Where to go when there is no in-app history to return to. */
  fallback: string;
  className?: string;
}

/** Navigation-bar style back control: goes back in history, or to `fallback` on a cold load. */
export function BackButton({ label, fallback, className }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // React Router gives the first entry of a session the key "default".
  const hasHistory = location.key !== 'default';

  return (
    <button
      type="button"
      onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}
      className={cn(
        'inline-flex items-center gap-0.5 -ml-2 pl-1 pr-3 min-h-[44px] rounded-lg text-ice-accent hover:bg-ice-line/[0.06] transition-colors text-[16px]',
        className,
      )}
    >
      <ChevronLeft className="w-5 h-5" />
      {label}
    </button>
  );
}

interface DetailHeaderProps {
  backLabel: string;
  backTo: string;
  title?: ReactNode;
  trailing?: ReactNode;
}

/** Header for a pushed page: back control on the leading edge, optional title and actions. */
export function DetailHeader({ backLabel, backTo, title, trailing }: DetailHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
      <BackButton label={backLabel} fallback={backTo} />
      {title && <div className="text-ice-text font-semibold text-[17px] truncate">{title}</div>}
      <div className="flex items-center gap-2 min-w-[44px] justify-end">{trailing}</div>
    </div>
  );
}
