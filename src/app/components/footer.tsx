import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-white/[0.02] relative z-10">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          {/* Left - Branding */}
          <div>
            <div
              className="text-white font-medium mb-1"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '14px' }}
            >
              Icicle Markets
            </div>
            <div
              className="text-slate-500"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '12px' }}
            >
              © 2026
            </div>
          </div>

          {/* Center - Navigation */}
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-slate-400 hover:text-white transition-colors"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
            >
              Markets
            </Link>
            <span className="text-slate-500">·</span>
            <Link
              to="/portfolio"
              className="text-slate-400 hover:text-white transition-colors"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
            >
              Portfolio
            </Link>
            <span className="text-slate-500">·</span>
            <Link
              to="/explorer"
              className="text-slate-400 hover:text-white transition-colors"
              style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
            >
              Explorer
            </Link>
          </div>

          {/* Right - L1Beat */}
          <div
            className="text-slate-400"
            style={{ fontFamily: "Inter, sans-serif", fontSize: '13px' }}
          >
            Built by{' '}
            <a
              href="https://l1beat.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors"
            >
              L1Beat
            </a>
            {' '}with love
          </div>
        </div>
      </div>
    </footer>
  );
}
