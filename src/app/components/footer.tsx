export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-white/[0.01] relative z-10 mt-12">
      <div className="container mx-auto px-6 py-5 flex items-center justify-center">
        <div className="flex items-center gap-1 text-slate-600" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
          Built by
          <a
            href="https://l1beat.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white transition-colors"
          >
            L1Beat
          </a>
        </div>
      </div>
    </footer>
  );
}
