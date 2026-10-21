import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="container mx-auto px-4 md:px-6 py-16 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center mb-5">
        <Compass className="w-7 h-7 text-ice-accent" />
      </div>
      <h2 className="text-ice-text font-semibold text-lg mb-2">Page not found</h2>
      <p className="text-ice-muted text-sm max-w-md mb-1">There is nothing at this address.</p>
      <code className="text-ice-faint text-xs font-mono mb-6 break-all">{pathname}</code>
      <Link
        to="/"
        className="px-4 py-2.5 rounded-xl bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 transition-colors text-sm font-medium"
      >
        Back to Markets
      </Link>
    </div>
  );
}
