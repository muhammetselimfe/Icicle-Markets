import { Loader2 } from 'lucide-react';

/** Shown while a lazily loaded route chunk is downloading. */
export function RouteFallback() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-24 flex items-center justify-center text-ice-muted">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}
