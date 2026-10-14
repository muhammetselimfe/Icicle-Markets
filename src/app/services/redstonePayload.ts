/**
 * Signed RedStone price payload for trade transactions.
 *
 * The v2.1 Core detects a RedStone payload appended to the calldata of
 * openPosition / increasePosition / decreasePosition / closePosition and
 * refreshes the market's trade oracle atomically before pricing the trade.
 * Without it, a trade prices against the keeper's last cached price and is
 * rejected when that cache is older than the trade-staleness limit.
 *
 * The payload is the same signed data the keeper and settlement use
 * (`redstone-primary-prod`, 3 unique signers). Fetch failures return null so
 * the caller can fall back to a plain transaction.
 */
import { getSignersForDataServiceId, requestRedstonePayload } from '@redstone-finance/sdk';

const DATA_SERVICE_ID = 'redstone-primary-prod';
const UNIQUE_SIGNERS = 3;
const UNSIGNED_METADATA = 'icicle-ui';
const TIMEOUT_MS = 8_000;

/** Hex payload WITHOUT the 0x prefix, ready to append to calldata. */
export async function fetchRedstonePayload(feedId: string = 'AVAX'): Promise<string | null> {
  try {
    const authorizedSigners = getSignersForDataServiceId(DATA_SERVICE_ID);
    const payload = await Promise.race([
      requestRedstonePayload(
        { dataServiceId: DATA_SERVICE_ID, dataPackagesIds: [feedId], uniqueSignersCount: UNIQUE_SIGNERS, authorizedSigners },
        UNSIGNED_METADATA,
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('redstone payload timeout')), TIMEOUT_MS)),
    ]);
    const hex = String(payload).replace(/^0x/, '');
    return /^[0-9a-fA-F]+$/.test(hex) && hex.length > 0 ? hex : null;
  } catch (err) {
    console.warn('[redstonePayload] unavailable, sending without oracle payload:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Append a payload to ABI-encoded calldata. */
export function withPayload(data: `0x${string}`, payloadHex: string | null): `0x${string}` {
  return payloadHex ? (`${data}${payloadHex}` as `0x${string}`) : data;
}
