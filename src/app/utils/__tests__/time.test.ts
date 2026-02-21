import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRelativeTime,
  getShortRelativeTime,
  isToday,
  getStartOfPeriod,
} from '../time';

describe('getRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for future dates', () => {
    expect(getRelativeTime(new Date('2025-06-15T12:01:00Z'))).toBe('just now');
  });

  it('returns seconds ago', () => {
    expect(getRelativeTime(new Date('2025-06-15T11:59:30Z'))).toBe('30 secs ago');
  });

  it('returns singular "1 sec ago"', () => {
    expect(getRelativeTime(new Date('2025-06-15T11:59:59Z'))).toBe('1 sec ago');
  });

  it('returns minutes ago', () => {
    expect(getRelativeTime(new Date('2025-06-15T11:55:00Z'))).toBe('5 mins ago');
  });

  it('returns singular "1 min ago"', () => {
    expect(getRelativeTime(new Date('2025-06-15T11:59:00Z'))).toBe('1 min ago');
  });

  it('returns hours ago', () => {
    expect(getRelativeTime(new Date('2025-06-15T09:00:00Z'))).toBe('3 hours ago');
  });

  it('returns singular "1 hour ago"', () => {
    expect(getRelativeTime(new Date('2025-06-15T11:00:00Z'))).toBe('1 hour ago');
  });

  it('returns days ago', () => {
    expect(getRelativeTime(new Date('2025-06-10T12:00:00Z'))).toBe('5 days ago');
  });

  it('returns months ago', () => {
    expect(getRelativeTime(new Date('2025-03-15T12:00:00Z'))).toBe('3 months ago');
  });

  it('returns years ago', () => {
    expect(getRelativeTime(new Date('2023-06-15T12:00:00Z'))).toBe('2 years ago');
  });

  it('accepts ISO string input', () => {
    expect(getRelativeTime('2025-06-15T11:55:00Z')).toBe('5 mins ago');
  });
});

describe('getShortRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "now" for future dates', () => {
    expect(getShortRelativeTime(new Date('2025-06-15T12:01:00Z'))).toBe('now');
  });

  it('returns seconds', () => {
    expect(getShortRelativeTime(new Date('2025-06-15T11:59:30Z'))).toBe('30s');
  });

  it('returns minutes', () => {
    expect(getShortRelativeTime(new Date('2025-06-15T11:55:00Z'))).toBe('5m');
  });

  it('returns hours', () => {
    expect(getShortRelativeTime(new Date('2025-06-15T09:00:00Z'))).toBe('3h');
  });

  it('returns days', () => {
    expect(getShortRelativeTime(new Date('2025-06-10T12:00:00Z'))).toBe('5d');
  });

  it('returns months', () => {
    expect(getShortRelativeTime(new Date('2025-03-15T12:00:00Z'))).toBe('3mo');
  });

  it('returns years', () => {
    expect(getShortRelativeTime(new Date('2023-06-15T12:00:00Z'))).toBe('2y');
  });
});

describe('isToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for today', () => {
    expect(isToday(new Date('2025-06-15T05:00:00Z'))).toBe(true);
  });

  it('returns false for yesterday', () => {
    expect(isToday(new Date('2025-06-14T06:00:00Z'))).toBe(false);
  });

  it('accepts string input', () => {
    expect(isToday('2025-06-15T20:00:00Z')).toBe(true);
  });
});

describe('getStartOfPeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday, June 18, 2025
    vi.setSystemTime(new Date('2025-06-18T15:30:45Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns start of day', () => {
    const result = getStartOfPeriod('day');
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('returns start of week (Sunday)', () => {
    const result = getStartOfPeriod('week');
    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getHours()).toBe(0);
  });

  it('returns start of month', () => {
    const result = getStartOfPeriod('month');
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
  });
});
