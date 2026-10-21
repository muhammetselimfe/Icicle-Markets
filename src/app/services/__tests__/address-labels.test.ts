import { describe, it, expect, vi } from 'vitest';
import { AddressLabelService, resolveLabel } from '../address-labels';
import type { AddressLabel } from '@/app/types/api';

const YAK = '0xC4729E56b831d74bBc18797e0e17A295fA77488c';
const USDC = '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e';
const NOBODY = '0x0000000000000000000000000000000000000002';

const label = (name: string, extra: Partial<AddressLabel> = {}): AddressLabel => ({
  name,
  kind: 'contract',
  protocol: null,
  is_contract: true,
  verified: true,
  implementation: null,
  ...extra,
});

describe('AddressLabelService', () => {
  it('coalesces lookups made in one window into a single lowercase request', async () => {
    const fetcher = vi.fn(async (_addrs: string[]) => ({ [YAK.toLowerCase()]: label('YakRouter'), [USDC]: label('USD Coin') }));
    const svc = new AddressLabelService(fetcher, 0);
    const [a, b, c, again] = await Promise.all([svc.get(YAK), svc.get(USDC), svc.get(NOBODY), svc.get(YAK.toUpperCase().replace('0X', '0x'))]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toEqual([YAK.toLowerCase(), USDC, NOBODY]);
    expect(a?.name).toBe('YakRouter');
    expect(b?.name).toBe('USD Coin');
    expect(c).toBeNull();
    expect(again?.name).toBe('YakRouter');
  });

  it('serves repeat lookups, including unknown addresses, from cache', async () => {
    const fetcher = vi.fn(async () => ({}));
    const svc = new AddressLabelService(fetcher, 0);
    await svc.get(NOBODY);
    await svc.get(NOBODY);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(svc.peek(NOBODY)).toBeNull();
    expect(svc.peek(YAK)).toBeUndefined();
  });

  it('splits more than 100 addresses across requests', async () => {
    const fetcher = vi.fn(async (_addrs: string[]) => ({}));
    const svc = new AddressLabelService(fetcher, 0);
    await Promise.all(Array.from({ length: 150 }, (_, i) => svc.get(`0x${i.toString(16).padStart(40, '0')}`)));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toHaveLength(100);
    expect(fetcher.mock.calls[1][0]).toHaveLength(50);
  });

  it('rejects the waiters of a failed request and does not cache them', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ [NOBODY]: label('Later') });
    const svc = new AddressLabelService(fetcher, 0);
    await expect(svc.get(NOBODY)).rejects.toThrow('down');
    expect(svc.peek(NOBODY)).toBeUndefined();
    await expect(svc.get(NOBODY)).resolves.toMatchObject({ name: 'Later' });
  });

  it('primed labels short-circuit the fetch', async () => {
    const fetcher = vi.fn(async () => ({}));
    const svc = new AddressLabelService(fetcher, 0);
    svc.prime(YAK, label('YakRouter', { kind: 'router' }));
    await expect(svc.get(YAK)).resolves.toMatchObject({ kind: 'router' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('resolveLabel', () => {
  it('prefers the curated name and keeps the indexer facts', () => {
    const r = resolveLabel(YAK, label('YakRouter', { kind: 'router', implementation: null }));
    expect(r).toMatchObject({ name: 'Yield Yak', kind: 'protocol', verified: true, source: 'curated' });
  });

  it('falls back to the indexer label, then to nothing', () => {
    expect(resolveLabel(NOBODY, label('Vault', { kind: 'pool', protocol: 'Pharaoh' }))).toMatchObject({ name: 'Vault', protocol: 'Pharaoh', source: 'indexer' });
    expect(resolveLabel(NOBODY, null)).toBeNull();
    expect(resolveLabel(NOBODY)).toBeNull();
    expect(resolveLabel(null)).toBeNull();
  });
});
