// Names for addresses, from two layers: the curated list shipped with the app and the
// indexer's label table (verified source names, token metadata, proxy implementations).
// Lookups made in the same tick are coalesced into one request of up to 100 addresses.
import { api } from './api';
import { getAddressInfo } from '@/app/data/known-addresses';
import type { AddressLabel, AddressLabelKind } from '@/app/types/api';

export const BATCH_WINDOW_MS = 20;
export const MAX_PER_REQUEST = 100;

type Fetcher = (addresses: string[]) => Promise<Record<string, AddressLabel>>;

interface Waiter {
  resolve: (label: AddressLabel | null) => void;
  reject: (err: unknown) => void;
}

export class AddressLabelService {
  private cache = new Map<string, AddressLabel | null>();
  private queue = new Map<string, Waiter[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fetcher: Fetcher,
    private batchWindowMs = BATCH_WINDOW_MS,
  ) {}

  /** Cached value: `null` for an address the indexer has no label for, `undefined` when never looked up. */
  peek(address: string): AddressLabel | null | undefined {
    return this.cache.get(address.toLowerCase());
  }

  /** Seed the cache with a label that arrived embedded in another response. */
  prime(address: string, label: AddressLabel | null): void {
    this.cache.set(address.toLowerCase(), label);
  }

  get(address: string): Promise<AddressLabel | null> {
    const key = address.toLowerCase();
    const cached = this.cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      const waiters = this.queue.get(key);
      if (waiters) waiters.push({ resolve, reject });
      else this.queue.set(key, [{ resolve, reject }]);
      if (!this.timer) this.timer = setTimeout(() => this.flush(), this.batchWindowMs);
    });
  }

  private flush(): void {
    this.timer = null;
    const batch = this.queue;
    this.queue = new Map();
    const keys = Array.from(batch.keys());
    for (let i = 0; i < keys.length; i += MAX_PER_REQUEST) {
      const chunk = keys.slice(i, i + MAX_PER_REQUEST);
      this.fetcher(chunk).then(
        (labels) => {
          for (const key of chunk) {
            const label = labels[key] ?? null;
            this.cache.set(key, label);
            for (const w of batch.get(key) ?? []) w.resolve(label);
          }
        },
        (err) => {
          for (const key of chunk) for (const w of batch.get(key) ?? []) w.reject(err);
        },
      );
    }
  }
}

export const addressLabels = new AddressLabelService(async (addresses) => {
  const res = await api.getAddressLabels(addresses);
  return res.data ?? {};
});

/** One label with both layers merged: the curated name wins, the indexer fills in the rest. */
export interface ResolvedLabel {
  name: string;
  kind: AddressLabelKind;
  protocol: string | null;
  isContract: boolean;
  verified: boolean;
  implementation: string | null;
  source: 'curated' | 'indexer';
}

export function resolveLabel(address: string | null | undefined, indexer?: AddressLabel | null): ResolvedLabel | null {
  if (!address) return null;
  const curated = getAddressInfo(address);
  if (curated) {
    return {
      name: curated.name,
      kind: curated.type,
      protocol: indexer?.protocol ?? null,
      isContract: indexer?.is_contract ?? curated.type !== 'exchange',
      verified: indexer?.verified ?? false,
      implementation: indexer?.implementation ?? null,
      source: 'curated',
    };
  }
  if (!indexer) return null;
  return {
    name: indexer.name,
    kind: indexer.kind,
    protocol: indexer.protocol,
    isContract: indexer.is_contract,
    verified: indexer.verified,
    implementation: indexer.implementation,
    source: 'indexer',
  };
}
