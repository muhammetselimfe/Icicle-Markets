import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  message?: string;
  action?: { label: string; onClick?: () => void; href?: string };
}

/** Centered empty-state card: icon, title, one line, optional link-style action. */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  const actionClass = 'mt-2 inline-flex items-center gap-1 min-h-[44px] text-ice-accent text-[14px] font-medium';
  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 px-6 py-10 flex flex-col items-center text-center gap-2">
      <span className="w-12 h-12 rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-muted mb-1">{icon}</span>
      <span className="text-ice-text font-semibold text-[16px]">{title}</span>
      {message && <span className="text-ice-muted text-[14px] max-w-sm">{message}</span>}
      {action &&
        (action.href ? (
          <a href={action.href} className={actionClass}>
            {action.label}
            <ChevronRight className="w-4 h-4" />
          </a>
        ) : (
          <button type="button" onClick={action.onClick} className={actionClass}>
            {action.label}
            <ChevronRight className="w-4 h-4" />
          </button>
        ))}
    </div>
  );
}
