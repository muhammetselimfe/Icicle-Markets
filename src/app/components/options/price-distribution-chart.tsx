import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';

// --- Market Chart Chart (horizontal bar chart with draggable range) ---
export function PriceDistributionChart({
  bins,
  chartData,
  currentPrice,
  syncedPrice,
  selectedMin,
  selectedMax,
  minPrice,
  maxPrice,
  tickSpacing,
  numBins,
  priceDecimals = 2,
  timeframeMinutes = 1440,
  windowStart,
  windowEnd,
  capacity,
  onRangeChange,
}: {
  bins: { tick: bigint; price: number; probability: number }[];
  chartData: { time: number; price: number }[];
  currentPrice: number;
  /** the contract's last synced oracle price, shown only when it sits in a different bin than currentPrice */
  syncedPrice?: number;
  selectedMin: number;
  selectedMax: number;
  minPrice: number;
  maxPrice: number;
  tickSpacing: number;
  numBins: number;
  priceDecimals?: number;
  timeframeMinutes?: number;
  /** Trading window (ms) — shaded on the time axis when it overlaps the view */
  windowStart?: number;
  windowEnd?: number;
  /** bin price → fraction of the per-bin exposure cap already used (0..1) */
  capacity?: Map<number, number>;
  onRangeChange: (newMin: number, newMax: number) => void;
}) {
  const fmtPrice = (p: number) => priceDecimals === 0 ? `$${Math.round(p).toLocaleString()}` : `$${p.toFixed(priceDecimals)}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(700);
  const svgH = 420;
  const uid = useId();

  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  const [hoverBin, setHoverBin] = useState<number | null>(null);
  const [hoverChartIdx, setHoverChartIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSvgW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setSvgW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Layout: price labels left, bars fill rest, small right margin
  // Wider left padding for large price labels (e.g. $5,118 vs $9.00)
  const padL = priceDecimals === 0 && maxPrice > 1000 ? 72 : 52;
  const padR = 12, padT = 8, padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  // The implied-odds ladder gets its own lane on the right, aligned to the price axis,
  // so bars are never mistaken for price levels.
  const ladderW = Math.max(72, Math.min(120, Math.round(plotW * 0.16)));
  const laneGap = 14;
  const chartW = plotW - ladderW - laneGap;
  const ladderX = padL + chartW + laneGap;

  // Auto-zoom: focus on the range that matters (current price, selected range, active bins)
  // Instead of showing full $7-$11, zoom to where the action is
  const { viewMin, viewMax } = useMemo(() => {
    // Find the range of bins with meaningful probability
    const threshold = 0.001; // 0.1% minimum to be "meaningful"
    let probLo = maxPrice, probHi = minPrice;
    for (const b of bins) {
      if (b.probability > threshold) {
        probLo = Math.min(probLo, b.price);
        probHi = Math.max(probHi, b.price + tickSpacing);
      }
    }
    // If no meaningful bins, fall back to current price area
    if (probLo >= probHi) {
      probLo = currentPrice - tickSpacing * 5;
      probHi = currentPrice + tickSpacing * 5;
    }

    // Ensure selected range and current price are visible
    const lo = Math.min(probLo, selectedMin, currentPrice - tickSpacing);
    const hi = Math.max(probHi, selectedMax, currentPrice + tickSpacing);

    // Add padding (~20% on each side, at least 5 bins)
    const span = hi - lo;
    const pad = Math.max(span * 0.2, tickSpacing * 5);
    return {
      viewMin: Math.max(minPrice, Math.floor((lo - pad) / tickSpacing) * tickSpacing),
      viewMax: Math.min(maxPrice + tickSpacing, Math.ceil((hi + pad) / tickSpacing) * tickSpacing),
    };
  }, [bins, currentPrice, selectedMin, selectedMax, minPrice, maxPrice, tickSpacing]);

  const priceRange = viewMax - viewMin || 1;

  // Y scale: price → pixel (uses zoomed view range)
  const toY = useCallback(
    (price: number) => padT + plotH * (1 - (price - viewMin) / priceRange),
    [plotH, viewMin, priceRange],
  );
  const fromY = useCallback(
    (y: number) => viewMin + (1 - (y - padT) / plotH) * priceRange,
    [plotH, viewMin, priceRange],
  );

  const snapToTick = useCallback(
    (rawPrice: number) => {
      const snapped = Math.round((rawPrice - minPrice) / tickSpacing) * tickSpacing + minPrice;
      return Math.max(minPrice, Math.min(maxPrice + tickSpacing, snapped));
    },
    [minPrice, maxPrice, tickSpacing],
  );

  const clientToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * svgW,
        y: ((clientY - rect.top) / rect.height) * svgH,
      };
    },
    [svgW, svgH],
  );

  // Time → X scale (needed early for hover logic)
  const hasData = chartData.length > 0;
  const tMin = hasData ? chartData[0].time : Date.now() - 86400000;
  const tMax = hasData ? chartData[chartData.length - 1].time : Date.now();
  const tRange = tMax - tMin || 1;
  const toX = useCallback(
    (t: number) => padL + ((t - tMin) / tRange) * chartW,
    [padL, tMin, tRange, chartW],
  );

  // Drag handlers
  const handlePointerDown = useCallback(
    (handle: 'min' | 'max') => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      setDragging(handle);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const svgPt = clientToSvg(e.clientX, e.clientY);

      if (dragging) {
        const rawPrice = fromY(svgPt.y);
        const snapped = snapToTick(rawPrice);
        if (dragging === 'max') {
          const newMax = Math.max(snapped, selectedMin + tickSpacing);
          if (newMax !== selectedMax) onRangeChange(selectedMin, newMax);
        } else {
          const newMin = Math.min(snapped, selectedMax - tickSpacing);
          if (newMin !== selectedMin) onRangeChange(newMin, selectedMax);
        }
        setHoverChartIdx(null);
      } else {
        // Find hovered bin
        const price = fromY(svgPt.y);
        const idx = bins.findIndex((b) => price >= b.price && price < b.price + tickSpacing);
        setHoverBin(idx >= 0 && svgPt.x >= ladderX - laneGap / 2 ? idx : null);

        // Find nearest chart data point by X position (chart lane only)
        if (chartData.length > 0 && svgPt.x >= padL && svgPt.x <= padL + chartW) {
          let closest = 0;
          let closestDist = Infinity;
          for (let i = 0; i < chartData.length; i++) {
            const cx = toX(chartData[i].time);
            const dist = Math.abs(cx - svgPt.x);
            if (dist < closestDist) { closestDist = dist; closest = i; }
          }
          setHoverChartIdx(closestDist < 40 ? closest : null);
        } else {
          setHoverChartIdx(null);
        }
      }
    },
    [dragging, clientToSvg, fromY, snapToTick, selectedMin, selectedMax, tickSpacing, onRangeChange, bins, padL, chartData, chartW, ladderX, laneGap, toX],
  );

  const handlePointerLeave = useCallback(() => { setDragging(null); setHoverBin(null); setHoverChartIdx(null); }, []);
  const handlePointerUp = useCallback(() => { setDragging(null); }, []);

  // Probability scaling — use relative scaling so small differences are visible
  const maxProb = useMemo(() => Math.max(...bins.map((b) => b.probability), 0.001), [bins]);
  const minProb = useMemo(() => Math.min(...bins.filter(b => b.probability > 0).map(b => b.probability), maxProb), [bins, maxProb]);
  // If distribution is nearly flat, scale from min to max so differences pop out
  // Always show a minimum bar width (15% of plot) so bins aren't invisible
  const probSpread = maxProb - minProb;
  const isFlat = probSpread < maxProb * 0.3; // less than 30% variation = "flat"

  // Bin pixel height
  const binH = Math.abs(toY(0) - toY(tickSpacing));
  const gap = Math.max(0.5, binH * 0.08);

  // Y axis: adapt tick step to zoomed view range
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const raw = priceRange / 8;
    // Dynamic step size that works for both small prices ($9) and large prices ($5,100)
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.01))));
    const norm = raw / mag;
    const nice = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10;
    const step = nice * mag;
    for (let p = Math.ceil(viewMin / step) * step; p <= viewMax + 0.001; p += step) {
      ticks.push(Math.round(p * 100) / 100);
    }
    return ticks;
  }, [viewMin, viewMax, priceRange]);

  const selMinY = toY(selectedMin);
  const selMaxY = toY(selectedMax);
  const curY = toY(currentPrice);
  const syncY = syncedPrice !== undefined ? toY(syncedPrice) : null;

  // Handle dimensions
  const handleBarW = 50;
  const handleBarH = 6;
  const handleHitH = 24;
  const handleCx = padL + chartW * 0.5;

  const clipId = `${uid}-clip`;
  const gradId = `${uid}-priceFill`;

  // Price history SVG path
  const pricePath = useMemo(() => {
    if (!hasData) return '';
    return chartData
      .map((d, i) => {
        const x = Math.max(padL, Math.min(padL + chartW, toX(d.time)));
        const y = Math.max(padT, Math.min(padT + plotH, toY(d.price)));
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join('');
  }, [chartData, hasData, padL, padT, chartW, plotH, toX, toY]);

  // Area fill path (closed shape under the price line)
  const priceAreaPath = useMemo(() => {
    if (!hasData || !pricePath) return '';
    const firstX = Math.max(padL, Math.min(padL + chartW, toX(chartData[0].time)));
    const lastX = Math.max(padL, Math.min(padL + chartW, toX(chartData[chartData.length - 1].time)));
    const bottomY = padT + plotH;
    return `${pricePath}L${lastX.toFixed(1)},${bottomY.toFixed(1)}L${firstX.toFixed(1)},${bottomY.toFixed(1)}Z`;
  }, [pricePath, hasData, chartData, padL, chartW, plotH, padT, toX]);

  // Time axis labels
  const timeLabels = useMemo(() => {
    if (!hasData) return [];
    const count = 6;
    const labels: { time: number; x: number; label: string }[] = [];
    for (let i = 0; i < count; i++) {
      const t = tMin + (tRange * i) / (count - 1);
      const x = toX(t);
      const d = new Date(t);
      let label: string;
      if (timeframeMinutes <= 240) {
        // 15m, 1H, 4H — show HH:MM
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else {
        // 1D+ — show "Mon HH:MM" or just HH:MM if same day
        const now = new Date();
        if (d.getDate() !== now.getDate() || d.getMonth() !== now.getMonth()) {
          label = d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        } else {
          label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      }
      labels.push({ time: t, x, label });
    }
    return labels;
  }, [hasData, tMin, tRange, toX, timeframeMinutes]);

  const lastPt = hasData ? chartData[chartData.length - 1] : null;

  // Hovered bin data for tooltip
  const hoveredBin = hoverBin !== null ? bins[hoverBin] : null;

  return (
    <div ref={containerRef} style={{ width: '100%', overflow: 'hidden', userSelect: dragging ? 'none' : undefined }}>
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        style={{ display: 'block', overflow: 'hidden', maxWidth: '100%', cursor: dragging ? 'ns-resize' : undefined }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ff6b6b" stopOpacity={0} />
          </linearGradient>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* Probability bars — full width horizontal */}
          {bins.map((b, i) => {
            const y = toY(b.price + tickSpacing);
            const h = binH - gap;
            if (h <= 0 || b.probability <= 0) return null;
            const isSel = b.price >= selectedMin && b.price < selectedMax;
            const isHov = hoverBin === i;
            // Relative scaling: when distribution is flat, stretch differences
            // so the highest bin fills ~85% and lowest fills ~15%
            const ratio = isFlat && probSpread > 0
              ? 0.15 + 0.7 * ((b.probability - minProb) / probSpread)
              : b.probability / maxProb;
            const barW = Math.max(ratio * (ladderW - 30), 2);
            const pct = b.probability * 100;
            return (
              <g key={b.price}>
                <rect
                  x={ladderX}
                  y={y}
                  width={barW}
                  height={Math.max(h, 1)}
                  fill={isSel ? 'var(--ice-accent)' : 'var(--chart-bar)'}
                  opacity={isHov ? 0.95 : isSel ? 0.55 + 0.4 * ratio : 0.25 + 0.5 * ratio}
                  rx={2}
                  style={{ transition: 'width 300ms ease, opacity 200ms ease' }}
                />
                {capacity && (capacity.get(b.price) ?? 0) > 0.02 && h >= 6 && (() => {
                  const used = Math.min(1, capacity.get(b.price) ?? 0);
                  return <rect x={ladderX} y={y + Math.max(h, 1) - 1.5} width={Math.max(used * (ladderW - 30), 1)} height={1.5} fill={used >= 0.9 ? '#fbbf24' : 'var(--chart-axis)'} opacity={used >= 0.9 ? 0.9 : 0.5} />;
                })()}
                {(isSel || isHov) && h >= 9 && (
                  <text x={ladderX + barW + 4} y={y + h / 2 + 0.5} dominantBaseline="middle"
                    fill={isSel ? 'var(--ice-accent)' : 'var(--chart-axis)'} fontSize={9} fontWeight={600} fontFamily="Inter, sans-serif">
                    {pct >= 10 ? pct.toFixed(0) : pct >= 1 ? pct.toFixed(1) : pct.toFixed(2)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Selected range background */}
          <rect
            x={padL}
            y={selMaxY}
            width={plotW}
            height={Math.max(selMinY - selMaxY, 0)}
            fill="var(--ice-accent)"
            opacity={0.06}
          />

          {/* Selected range border lines */}
          <line x1={padL} y1={selMaxY} x2={padL + plotW} y2={selMaxY} stroke="var(--ice-accent2)" strokeWidth={1.5} />
          <line x1={padL} y1={selMinY} x2={padL + plotW} y2={selMinY} stroke="var(--ice-accent2)" strokeWidth={1.5} />

          {/* Price history area fill */}
          {priceAreaPath && (
            <path d={priceAreaPath} fill={`url(#${gradId})`} />
          )}

          {/* Price history line */}
          {pricePath && (
            <path d={pricePath} fill="none" stroke="#ff6b6b" strokeWidth={2} strokeLinejoin="round" opacity={0.9} />
          )}

          {/* Last price dot */}
          {lastPt && <circle cx={toX(lastPt.time)} cy={toY(lastPt.price)} r={3.5} fill="#ff6b6b" />}

          {/* Current price dashed reference line */}
          <line
            x1={padL} y1={curY} x2={padL + chartW} y2={curY}
            stroke="#ef4444" strokeWidth={0.75} strokeDasharray="4,3" opacity={0.4}
          />

          {/* Trading window shading (this market's life on the time axis) */}
          {hasData && windowStart !== undefined && windowEnd !== undefined && windowEnd > tMin && windowStart < tMax && (() => {
            const x0 = Math.max(padL, toX(Math.max(windowStart, tMin)));
            const x1 = Math.min(padL + chartW, toX(Math.min(windowEnd, tMax)));
            return (
              <g>
                <rect x={x0} y={padT} width={Math.max(x1 - x0, 1)} height={plotH} fill="var(--ice-accent)" opacity={0.05} />
                <line x1={x0} y1={padT} x2={x0} y2={padT + plotH} stroke="var(--ice-accent)" strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />
                {windowEnd <= tMax && <line x1={x1} y1={padT} x2={x1} y2={padT + plotH} stroke="var(--ice-accent)" strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />}
              </g>
            );
          })()}

          {/* Ladder lane separator + header */}
          <line x1={ladderX - laneGap / 2} y1={padT} x2={ladderX - laneGap / 2} y2={padT + plotH} stroke="var(--chart-grid)" strokeWidth={0.75} opacity={0.6} />
        </g>
        <text x={ladderX} y={padT + plotH + 16} fill="var(--chart-axis)" fontSize={10} fontFamily="Inter, sans-serif" letterSpacing="0.05em">IMPLIED ODDS</text>

        {/* Time axis labels and vertical gridlines */}
        {timeLabels.map((tl, i) => (
          <g key={i}>
            <line x1={tl.x} y1={padT} x2={tl.x} y2={padT + plotH} stroke="var(--chart-grid)" strokeWidth={0.5} strokeDasharray="3,4" opacity={0.4} />
            <text x={tl.x} y={padT + plotH + 16} textAnchor="middle" dominantBaseline="middle"
              fill="var(--chart-axis)" fontSize={10} fontFamily="Inter, sans-serif">
              {tl.label}
            </text>
          </g>
        ))}

        {/* Draggable MAX handle */}
        <g onPointerDown={handlePointerDown('max')} style={{ cursor: 'ns-resize' }}>
          <rect x={handleCx - handleBarW / 2 - 30} y={selMaxY - handleHitH / 2} width={handleBarW + 60} height={handleHitH} fill="transparent" />
          <rect x={handleCx - handleBarW / 2} y={selMaxY - handleBarH / 2} width={handleBarW} height={handleBarH} rx={handleBarH / 2}
            fill={dragging === 'max' ? 'var(--ice-accent)' : 'var(--ice-accent2)'} />
        </g>

        {/* Draggable MIN handle */}
        <g onPointerDown={handlePointerDown('min')} style={{ cursor: 'ns-resize' }}>
          <rect x={handleCx - handleBarW / 2 - 30} y={selMinY - handleHitH / 2} width={handleBarW + 60} height={handleHitH} fill="transparent" />
          <rect x={handleCx - handleBarW / 2} y={selMinY - handleBarH / 2} width={handleBarW} height={handleBarH} rx={handleBarH / 2}
            fill={dragging === 'min' ? 'var(--ice-accent)' : 'var(--ice-accent2)'} />
        </g>

        {/* Synced (on-chain) price: what the odds are centred on while it lags the live price */}
        {syncY !== null && (
          <g>
            <line x1={padL} x2={padL + chartW} y1={syncY} y2={syncY} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
            <rect x={padL + chartW - 64} y={syncY - 9} width={52} height={18} rx={4} fill="#f59e0b" opacity={0.9} />
            <text x={padL + chartW - 38} y={syncY + 1} textAnchor="middle" dominantBaseline="middle"
              fill="#1a1205" fontSize={9} fontWeight={600} fontFamily="Inter, sans-serif">
              synced {fmtPrice(syncedPrice!)}
            </text>
          </g>
        )}
        {/* Current price pill */}
        <g>
          <rect x={padL + chartW - 64} y={curY - 10} width={52} height={20} rx={4} fill="#ef4444" />
          <text x={padL + chartW - 38} y={curY + 1} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif">
            {fmtPrice(currentPrice)}
          </text>
        </g>

        {/* Selected max price label */}
        <g>
          <rect x={padL + chartW - 64} y={selMaxY - 10} width={52} height={20} rx={10} fill="var(--ice-accent2)" />
          <text x={padL + chartW - 38} y={selMaxY + 1} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif">
            {fmtPrice(selectedMax)}
          </text>
        </g>

        {/* Selected min price label */}
        <g>
          <rect x={padL + chartW - 64} y={selMinY - 10} width={52} height={20} rx={10} fill="var(--ice-accent2)" />
          <text x={padL + chartW - 38} y={selMinY + 1} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif">
            {fmtPrice(selectedMin)}
          </text>
        </g>

        {/* Y axis price labels (left side) */}
        {yTicks.map((p) => (
          <text key={p} x={padL - 6} y={toY(p)} textAnchor="end" dominantBaseline="middle"
            fill="var(--chart-axis)" fontSize={11} fontFamily="Inter, sans-serif">
            {fmtPrice(p)}
          </text>
        ))}

        {/* Price line hover crosshair + tooltip */}
        {!dragging && hoverChartIdx !== null && chartData[hoverChartIdx] && (() => {
          const d = chartData[hoverChartIdx];
          const hx = toX(d.time);
          const hy = toY(d.price);
          const dt = new Date(d.time);
          const dateStr = dt.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
          const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
          // Find which bin this price falls into
          const binIdx = bins.findIndex((b) => d.price >= b.price && d.price < b.price + tickSpacing);
          const binProb = binIdx >= 0 ? (bins[binIdx].probability * 100) : null;

          const tipW = 170, tipH = binProb !== null ? 72 : 54;
          let tx = hx + 12;
          if (tx + tipW > padL + chartW) tx = hx - tipW - 12;
          let ty = hy - tipH / 2;
          if (ty < padT) ty = padT;
          if (ty + tipH > padT + plotH) ty = padT + plotH - tipH;

          return (
            <g>
              {/* Vertical crosshair */}
              <line x1={hx} y1={padT} x2={hx} y2={padT + plotH} stroke="var(--chart-axis)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6} />
              {/* Horizontal crosshair */}
              <line x1={padL} y1={hy} x2={padL + chartW} y2={hy} stroke="var(--chart-axis)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6} />
              {/* Dot on the price line */}
              <circle cx={hx} cy={hy} r={4} fill="#ff6b6b" stroke="var(--ice-surface)" strokeWidth={2} />
              {/* Tooltip card */}
              <rect x={tx} y={ty} width={tipW} height={tipH} rx={6} fill="var(--chart-tooltip-bg)" stroke="var(--chart-grid)" strokeWidth={0.5} opacity={0.95} />
              {/* Date + Time header */}
              <text x={tx + 10} y={ty + 16} fill="#94a3b8" fontSize={10} fontFamily="Inter, sans-serif">{dateStr}</text>
              <text x={tx + tipW - 10} y={ty + 16} textAnchor="end" fill="#94a3b8" fontSize={10} fontFamily="Inter, sans-serif">{timeStr}</text>
              {/* Price row */}
              <circle cx={tx + 14} cy={ty + 34} r={3.5} fill="#4dff88" />
              <text x={tx + 22} y={ty + 37} fill="#94a3b8" fontSize={11} fontFamily="Inter, sans-serif">Price:</text>
              <text x={tx + tipW - 10} y={ty + 37} textAnchor="end" fill="#e2e8f0" fontSize={12} fontWeight={600} fontFamily="Inter, sans-serif">
                {fmtPrice(d.price)}
              </text>
              {/* Probability row */}
              {binProb !== null && (
                <>
                  <circle cx={tx + 14} cy={ty + 54} r={3.5} fill="var(--ice-accent)" />
                  <text x={tx + 22} y={ty + 57} fill="#94a3b8" fontSize={11} fontFamily="Inter, sans-serif">Prob:</text>
                  <text x={tx + tipW - 10} y={ty + 57} textAnchor="end" fill="#e2e8f0" fontSize={12} fontWeight={600} fontFamily="Inter, sans-serif">
                    {binProb.toFixed(2)}% odds
                  </text>
                </>
              )}
            </g>
          );
        })()}

        {/* Bin hover tooltip (hidden when price line tooltip is active) */}
        {!dragging && hoverChartIdx === null && hoveredBin && (() => {
          const by = toY(hoveredBin.price + tickSpacing / 2);
          const pct = (hoveredBin.probability * 100);
          const tipW = 128, tipH = 44;
          let tx = ladderX - laneGap - tipW - 6; // sits in the chart lane, left of the ladder
          if (tx < padL) tx = padL;
          let ty = by - tipH / 2;
          if (ty < padT) ty = padT;
          if (ty + tipH > padT + plotH) ty = padT + plotH - tipH;
          return (
            <g>
              <rect x={tx} y={ty} width={tipW} height={tipH} rx={4} fill="var(--chart-tooltip-bg)" opacity={0.95} />
              <text x={tx + tipW / 2} y={ty + 12} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontWeight={600} fontFamily="Inter, sans-serif">
                {fmtPrice(hoveredBin.price)} – {fmtPrice(hoveredBin.price + tickSpacing)}
              </text>
              <text x={tx + tipW / 2} y={ty + 25} textAnchor="middle" fill="#94a3b8" fontSize={10} fontFamily="Inter, sans-serif">
                {pct.toFixed(2)}% implied odds{capacity && (capacity.get(hoveredBin.price) ?? 0) > 0 ? `, ${Math.round((capacity.get(hoveredBin.price) ?? 0) * 100)}% of cap used` : ''}
              </text>
              <text x={tx + tipW / 2} y={ty + 37} textAnchor="middle" fill="#94a3b8" fontSize={10} fontFamily="Inter, sans-serif">
                ${hoveredBin.probability.toFixed(hoveredBin.probability < 0.01 ? 4 : 2)} per $1 payout
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
