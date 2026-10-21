import { useMemo } from 'react';

/** Deterministic 3×3 identicon from the address. */
export function WalletAvatar({ address, size = 44 }: { address: string; size?: number }) {
  const cells = useMemo(() => {
    const hash = address.toLowerCase();
    const colors = [`#${hash.slice(2, 8)}`, `#${hash.slice(8, 14)}`, `#${hash.slice(14, 20)}`];
    return Array.from({ length: 9 }, (_, i) => ({
      x: (i % 3) * 33.34,
      y: Math.floor(i / 3) * 33.34,
      color: colors[hash.charCodeAt(i + 2) % 3],
    }));
  }, [address]);

  return (
    <div className="relative overflow-hidden rounded-full ring-1 ring-ice-line/20 shrink-0 bg-ice-surface2" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        {cells.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={33.34} height={33.34} fill={c.color} opacity={0.85} />
        ))}
      </svg>
    </div>
  );
}

