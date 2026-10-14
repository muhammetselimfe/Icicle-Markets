import { describe, it, expect } from 'vitest';
import { historyRangeForMinutes, sliceAndDownsample, type ChartPoint } from '../redstone';

function series(n: number, stepMs = 60_000, start = 1_700_000_000_000): ChartPoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: start + i * stepMs, price: 10 + i / 1000 }));
}

describe('historyRangeForMinutes', () => {
  it('picks the smallest backend range covering the window', () => {
    expect(historyRangeForMinutes(15)).toBe(1);
    expect(historyRangeForMinutes(1440)).toBe(1);
    expect(historyRangeForMinutes(1441)).toBe(7);
    expect(historyRangeForMinutes(7 * 1440)).toBe(7);
    expect(historyRangeForMinutes(30 * 1440)).toBe(30);
  });
});

describe('sliceAndDownsample', () => {
  it('returns empty input unchanged', () => {
    expect(sliceAndDownsample([], 60)).toEqual([]);
  });

  it('keeps only the last N minutes relative to the newest point', () => {
    const pts = series(1440);
    const out = sliceAndDownsample(pts, 15, 1000);
    expect(out.length).toBe(16); // 15 minutes inclusive of both ends
    expect(out[out.length - 1]).toBe(pts[pts.length - 1]);
    expect(out[0].time).toBe(pts[pts.length - 1].time - 15 * 60_000);
  });

  it('thins long series to roughly maxPoints and always keeps the newest point', () => {
    const pts = series(1440);
    const out = sliceAndDownsample(pts, 1440, 200);
    expect(out.length).toBeGreaterThanOrEqual(200);
    expect(out.length).toBeLessThanOrEqual(210);
    expect(out[out.length - 1]).toBe(pts[pts.length - 1]);
    for (let i = 1; i < out.length; i++) expect(out[i].time).toBeGreaterThan(out[i - 1].time);
  });

  it('falls back to the newest point when the window is empty', () => {
    const pts = series(3, 60 * 60_000); // hourly points
    const out = sliceAndDownsample(pts, 0, 200);
    expect(out).toEqual([pts[2]]);
  });
});
