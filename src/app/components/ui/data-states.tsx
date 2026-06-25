import { AlertCircle, RefreshCw, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared, first-class states for data-driven surfaces — consistent across the app.

export function ErrorState({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 p-10 rounded-2xl bg-ice-surface border border-ice-line/15">
      <div className="w-12 h-12 rounded-full bg-ice-down/[0.1] flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-ice-down" />
      </div>
      <div>
        <div className="text-ice-text font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
          Something went wrong
        </div>
        <div className="text-ice-muted mt-1 max-w-sm" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
          {message}
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 transition-colors disabled:opacity-60"
          style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 500 }}
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 p-12 rounded-2xl bg-ice-surface border border-ice-line/15">
      <div className="w-12 h-12 rounded-full bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
        {icon ?? <Inbox className="w-6 h-6 text-ice-accent" />}
      </div>
      <div>
        <div className="text-ice-text font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
          {title}
        </div>
        {message && (
          <div className="text-ice-muted mt-1 max-w-sm" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
            {message}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
