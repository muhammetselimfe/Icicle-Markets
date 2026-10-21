export function Footer() {
  return (
    <footer className="border-t border-ice-line/[0.08] bg-ice-surface/30 relative z-10 mt-12">
      <div className="container mx-auto px-6 py-5 flex items-center justify-center">
        <div className="flex items-center gap-1 text-ice-faint text-[12px]">
          Built by
          <a
            href="https://l1beat.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ice-muted hover:text-ice-text transition-colors"
          >
            L1Beat
          </a>
        </div>
      </div>
    </footer>
  );
}
