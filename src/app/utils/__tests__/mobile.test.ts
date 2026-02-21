import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isMobile, getWalletDeepLink } from '../mobile';

describe('isMobile', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('returns true for iPhone', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(true);
  });

  it('returns true for Android', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 12)' },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(true);
  });

  it('returns false for desktop', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(false);
  });
});

describe('getWalletDeepLink', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { href: 'https://icicle.markets' } },
      writable: true,
      configurable: true,
    });
  });

  it('generates MetaMask deep link with unencoded URL', () => {
    const link = getWalletDeepLink('metamask');
    expect(link).toBe('metamask://dapp/https://icicle.markets');
  });

  it('generates Coinbase deep link with encoded URL', () => {
    const link = getWalletDeepLink('coinbase');
    expect(link).toBe('cbwallet://dapp?url=https%3A%2F%2Ficicle.markets');
  });

  it('generates Core deep link with encoded URL', () => {
    const link = getWalletDeepLink('core');
    expect(link).toBe('https://core.app/browse?url=https%3A%2F%2Ficicle.markets');
  });
});
