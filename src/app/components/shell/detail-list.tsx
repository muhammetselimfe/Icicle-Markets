import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { useAddressLabel } from '@/app/hooks/useAddressLabel';
import type { AddressLabel } from '@/app/types/api';

/** Inset grouped list, as on a settings or receipt screen. */
export function DetailList({ title, trailing, children, className }: { title?: ReactNode; trailing?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {(title || trailing) && (
        <div className="flex items-center justify-between gap-3 px-1 mb-2">
          {title && <h3 className="text-ice-text font-semibold text-[15px]">{title}</h3>}
          {trailing}
        </div>
      )}
      <div className="rounded-2xl bg-ice-surface border border-ice-line/15 divide-y divide-ice-line/10">{children}</div>
    </section>
  );
}

/** Label on the leading edge, value on the trailing edge, wraps on phones. */
export function DetailRow({ label, children, sub }: { label: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 md:px-5 min-h-[52px] py-3">
      <span className="text-ice-muted text-[14px] sm:w-32 shrink-0">{label}</span>
      <span className="flex-1 min-w-0 sm:text-right text-ice-text text-[14px] tabular-nums">
        <span className="flex sm:justify-end items-center gap-2 min-w-0">{children}</span>
        {sub && <span className="block text-ice-faint text-[12px] mt-0.5">{sub}</span>}
      </span>
    </div>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="w-8 h-8 -my-1 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors shrink-0"
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check className="w-4 h-4 text-ice-up" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export function shortHex(hex: string, head = 6, tail = 4): string {
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/**
 * Address rendered with its label when one is known, linking to the address page.
 * Pass `label` when the indexer embedded one in the row; otherwise it is looked up (batched).
 */
export function AddressLink({ address, label, className, full }: { address: string; label?: AddressLabel | null; className?: string; full?: boolean }) {
  const resolved = useAddressLabel(address, label);
  const name = resolved?.name ?? null;
  const type = resolved?.kind ?? null;
  return (
    <Link to={`/address/${address}`} className={cn('inline-flex items-center gap-2 min-w-0 hover:text-ice-accent transition-colors', className)}>
      {name ? (
        <>
          <span className="font-medium truncate">{name}</span>
          {type && <span className="px-1.5 h-5 inline-flex items-center rounded-md bg-ice-line/[0.08] text-ice-muted text-[11px] font-medium capitalize">{type}</span>}
          <span className="hidden md:inline font-mono text-ice-faint text-[12px]">{shortHex(address)}</span>
        </>
      ) : (
        <span className="font-mono truncate">{full ? address : shortHex(address, 8, 6)}</span>
      )}
    </Link>
  );
}

/** Loading placeholder shaped like a detail page. */
export function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-[140px] rounded-2xl bg-ice-line/[0.06] animate-pulse" />
      <div className="rounded-2xl bg-ice-surface border border-ice-line/15 divide-y divide-ice-line/10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 h-[52px]">
            <div className="h-3.5 w-16 rounded bg-ice-line/[0.08] animate-pulse" />
            <div className="h-3.5 w-40 rounded bg-ice-line/[0.08] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
