// Turns an indexer transaction (with its token transfers, internal calls and approvals)
// into what one wallet saw: which assets left, which arrived, and what kind of action it was.
import { formatUnits } from 'viem';
import { getTokenByAddress, MARKETS_TOKENS } from '@/app/data/markets-tokens';
import type { TokenTransfer } from '@/app/types/api';
import { getAddressName } from '@/app/data/known-addresses';
import type { AddressLabel, Transaction as ApiTransaction, TransactionIntentKind, TransactionMethod } from '@/app/types/api';

export type TransactionType =
  | 'swap'
  | 'send'
  | 'receive'
  | 'deposit'
  | 'withdraw'
  | 'approve'
  | 'stake'
  | 'unstake'
  | 'claim'
  | 'bridge'
  | 'add_liquidity'
  | 'remove_liquidity'
  | 'suspicious'
  | 'contract';

/** Symbols a scam token borrows to look real, keyed lowercase to the one contract allowed to use them. */
const LISTED_SYMBOLS = new Map<string, string>(MARKETS_TOKENS.map((t) => [t.symbol.toLowerCase(), t.address.toLowerCase()]));
/** Below this, native AVAX in a transaction is dust: a few hundredths of a cent, sent only to put a row in someone's history. */
const DUST_WEI = 1_000_000_000_000_000n; // 0.001 AVAX

/**
 * A transfer event from a token that borrows a listed symbol (AVAX, USDC, …) without being
 * that token. Address-poisoning contracts emit these so a wallet's history shows a fake
 * "received 27 AVAX from <lookalike address>" row.
 */
export function isSuspiciousTransfer(t: TokenTransfer): boolean {
  const symbol = (t.symbol ?? t.token_label?.name ?? t.name ?? '').toLowerCase();
  if (!symbol) return false;
  const listed = LISTED_SYMBOLS.get(symbol);
  if (listed === undefined) return false;
  return listed !== t.token.toLowerCase();
}

/** True when the transaction's only real effect is dust and it carries a fake-token event. */
export function isSuspiciousTransaction(tx: ApiTransaction, legs: TransferLeg[]): boolean {
  if (!(tx.token_transfers ?? []).some(isSuspiciousTransfer)) return false;
  return legs.every((l) => l.token === NATIVE_AVAX_ADDRESS && l.raw < DUST_WEI);
}

/** Indexer intent kinds that map one-to-one onto a type. `send`, `receive` and `contract_call` are left to the local rules. */
const INTENT_TYPES: Partial<Record<TransactionIntentKind, TransactionType>> = {
  swap: 'swap',
  deposit: 'deposit',
  withdraw: 'withdraw',
  stake: 'stake',
  unstake: 'unstake',
  claim: 'claim',
  bridge: 'bridge',
  approve: 'approve',
  add_liquidity: 'add_liquidity',
  remove_liquidity: 'remove_liquidity',
};
const MIN_INTENT_CONFIDENCE = 0.5;

/** Type for an indexer intent seen from the sender's side (explorer lists). */
export function intentToType(kind: TransactionIntentKind | null | undefined): TransactionType {
  if (!kind) return 'contract';
  if (kind === 'send') return 'send';
  if (kind === 'receive') return 'receive';
  return INTENT_TYPES[kind] ?? 'contract';
}

/** Address MARKETS_TOKENS uses for native AVAX. */
export const NATIVE_AVAX_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const AVAX_LOGO = 'https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png';

export interface ProtocolInfo {
  name: string;
  logoUrl?: string;
  isSwap: boolean;
}

const JOE_LOGO = 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png';

// Known protocol contracts on Avalanche, keyed by lowercase address.
export const KNOWN_PROTOCOLS: Record<string, ProtocolInfo> = {
  '0xc4729e56b831d74bbc18797e0e17a295fa77488c': {
    name: 'Yield Yak',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x59414b3089ce2AF0010e7523Dea7E2b35d776ec7/logo.png',
    isSwap: true,
  },
  '0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30': { name: 'Trader Joe', logoUrl: JOE_LOGO, isSwap: true },
  '0xe3ffc583dc176575eea7fd9df2a7c65f7e23f4c3': { name: 'Trader Joe', logoUrl: JOE_LOGO, isSwap: true },
  '0x60ae616a2155ee3d9a68541ba4544862310933d4': { name: 'Trader Joe', logoUrl: JOE_LOGO, isSwap: true },
  '0x18556da13313f3532c54711497a8fedac273220e': { name: 'LFJ', logoUrl: JOE_LOGO, isSwap: true },
  '0xe54ca86531e17ef3616d22ca28b0d458b6c89106': {
    name: 'Pangolin',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x60781C2586D68229fde47564546784ab3fACA982/logo.png',
    isSwap: true,
  },
  '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506': {
    name: 'SushiSwap',
    logoUrl: 'https://cryptologos.cc/logos/sushiswap-sushi-logo.png',
    isSwap: true,
  },
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': {
    name: 'ParaSwap',
    logoUrl: 'https://cdn.paraswap.io/brand/PSP_500x500.png',
    isSwap: true,
  },
  '0x1111111254eeb25477b68fb85ed929f73a960582': {
    name: '1inch',
    logoUrl: 'https://cryptologos.cc/logos/1inch-1inch-logo.png',
    isSwap: true,
  },
  '0x5f719c2f1095f7b9fc68a68e35b51194f4b6abe8': {
    name: 'GMX',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x62edc0692BD897D2295872a9FFCac5425011c661/logo.png',
    isSwap: true,
  },
  '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be': {
    name: 'BENQI',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5/logo.png',
    isSwap: false,
  },
  '0xa25eaf2906fa1a3a13edac9b9657108af7b703e3': {
    name: 'GoGoPool',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3/logo.png',
    isSwap: false,
  },
  '0x45a01e4e04f14f7a4a6702c74187c5f6222033cd': {
    name: 'Stargate',
    logoUrl: 'https://cryptologos.cc/logos/stargate-finance-stg-logo.png',
    isSwap: false,
  },
};

/** Receiving one of these from a non-swap protocol is a stake; sending one back is an unstake. */
const STAKED_AVAX_SYMBOLS = new Set(['SAVAX', 'GGAVAX']);

/** Label kinds whose name is a protocol, not just a contract class name. */
const PROTOCOL_KINDS = new Set<AddressLabel['kind']>(['router', 'protocol', 'bridge', 'exchange', 'pool']);

/** The protocol behind the call target: our curated table first, then the indexer's label. */
export function getProtocol(toAddress: string | null | undefined, label?: AddressLabel | null): ProtocolInfo | null {
  if (!toAddress) return null;
  const local = KNOWN_PROTOCOLS[toAddress.toLowerCase()];
  if (local) return local;
  if (!label) return null;
  const name = label.protocol ?? (PROTOCOL_KINDS.has(label.kind) ? label.name : null);
  return name ? { name, isSwap: label.kind === 'router' } : null;
}

/** "swapNoSplit" → "Swap no split"; falls back to the selector; `null` for plain transfers. */
export function methodLabel(method: TransactionMethod | null | undefined): string | null {
  if (!method) return null;
  if (!method.name) return method.selector;
  const words = method.name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A specific title the indexer gave a plain contract call, e.g. "Borrowed", "Repaid" or
 * "Deployed contract". Generic labels ("Contract call", "Called multicall") return null.
 */
export function intentTitle(tx: ApiTransaction): string | null {
  const label = tx.intent?.label;
  if (!label || tx.intent?.kind !== 'contract_call') return null;
  if (label === 'Contract call' || label.startsWith('Called ')) return null;
  return label;
}

/** A label the indexer embedded in the transaction for `address`, if any. */
export function embeddedLabel(tx: ApiTransaction, address: string | null | undefined): AddressLabel | null {
  if (!address) return null;
  const a = address.toLowerCase();
  if (tx.from.toLowerCase() === a) return tx.from_label ?? null;
  if (tx.to?.toLowerCase() === a) return tx.to_label ?? null;
  for (const t of tx.token_transfers ?? []) if (t.token.toLowerCase() === a && t.token_label) return t.token_label;
  for (const ap of tx.approvals ?? []) if (ap.token.toLowerCase() === a && ap.token_label) return ap.token_label;
  return null;
}

/** Verified-source names that only say "this is a proxy"; a short address reads better in a sentence. */
const GENERIC_CONTRACT_NAMES = /^(transparentupgradeableproxy|erc1967proxy|beaconproxy|upgradeableproxy|adminupgradeabilityproxy|proxy)$/i;

/** Best name for an address using only what is already on the client: curated list, then embedded labels. */
export function nameFor(tx: ApiTransaction, address: string | null | undefined): string | null {
  if (!address) return null;
  const curated = getAddressName(address);
  if (curated) return curated;
  const label = embeddedLabel(tx, address);
  if (!label) return null;
  if (label.kind === 'contract' && GENERIC_CONTRACT_NAMES.test(label.name)) return label.protocol;
  return label.name;
}

export interface TransferLeg {
  /** Token contract, or NATIVE_AVAX_ADDRESS. */
  token: string;
  symbol: string;
  decimals: number;
  direction: 'in' | 'out';
  /** Raw amount in the token's smallest unit. */
  raw: bigint;
  logoUrl?: string;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Every asset movement in `tx` as seen by `userAddress`, outgoing legs first.
 * Several transfers of one token in one direction (split routes) are summed into a leg.
 * A failed transaction moved nothing, so it has no legs.
 */
export function collectTransferLegs(tx: ApiTransaction, userAddress: string): TransferLeg[] {
  if (!tx.success) return [];

  const user = userAddress.toLowerCase();
  const legs = new Map<string, TransferLeg>();

  const add = (leg: Omit<TransferLeg, 'raw'>, raw: bigint) => {
    if (raw <= 0n) return;
    const key = `${leg.token}:${leg.direction}`;
    const existing = legs.get(key);
    if (existing) existing.raw += raw;
    else legs.set(key, { ...leg, raw });
  };

  const native = { token: NATIVE_AVAX_ADDRESS, symbol: 'AVAX', decimals: 18, logoUrl: AVAX_LOGO };
  const addNative = (from: string, to: string | null, value: string) => {
    if (value === '0') return;
    const raw = BigInt(value);
    if (from.toLowerCase() === user) add({ ...native, direction: 'out' }, raw);
    if (to?.toLowerCase() === user) add({ ...native, direction: 'in' }, raw);
  };

  addNative(tx.from, tx.to, tx.value);
  for (const call of tx.internal_txs ?? []) {
    if (call.success) addNative(call.from, call.to, call.value);
  }

  for (const t of tx.token_transfers ?? []) {
    if (isSuspiciousTransfer(t)) continue; // never happened, by design
    const meta = getTokenByAddress(t.token);
    const leg = {
      token: t.token.toLowerCase(),
      symbol: meta?.symbol ?? t.symbol ?? shortAddress(t.token),
      decimals: meta?.decimals ?? t.decimals,
      logoUrl: meta?.logoUrl,
    };
    const raw = BigInt(t.value);
    if (t.from.toLowerCase() === user) add({ ...leg, direction: 'out' }, raw);
    if (t.to.toLowerCase() === user) add({ ...leg, direction: 'in' }, raw);
  }

  const all = Array.from(legs.values());
  return [...all.filter((l) => l.direction === 'out'), ...all.filter((l) => l.direction === 'in')];
}

/** A plain AVAX transfer costs exactly 21,000 gas; anything more ran contract code. */
const PLAIN_TRANSFER_GAS = 21_000;

/**
 * True when the wallet sent one token straight to someone with an ERC-20 `transfer` call:
 * the call target is the token itself and the only movement is the wallet's.
 */
function isTokenTransferCall(tx: ApiTransaction, wallet: string): boolean {
  const transfers = tx.token_transfers ?? [];
  return (
    transfers.length === 1 &&
    transfers[0].from.toLowerCase() === wallet &&
    transfers[0].token.toLowerCase() === (tx.to ?? '').toLowerCase()
  );
}

/**
 * What the transaction was, seen from `wallet` (the address `legs` were collected for).
 * The sender's own calls that only pay out are withdrawals; calls that only pay in are deposits.
 */
export function classifyTransaction(tx: ApiTransaction, legs: TransferLeg[], protocol: ProtocolInfo | null, wallet?: string): TransactionType {
  const outs = legs.filter((l) => l.direction === 'out');
  const ins = legs.filter((l) => l.direction === 'in');
  const viewer = (wallet ?? tx.from).toLowerCase();
  const initiated = tx.from.toLowerCase() === viewer;
  const ranCode = tx.gas_used > PLAIN_TRANSFER_GAS;

  if (tx.success && isSuspiciousTransaction(tx, legs)) return 'suspicious';

  // The indexer reads the call from the sender's side; trust it when the viewer is the sender.
  const intent = tx.intent;
  const intentType = initiated && intent && intent.confidence >= MIN_INTENT_CONFIDENCE ? INTENT_TYPES[intent.kind] : undefined;

  if (!tx.success) {
    if (intentType) return intentType;
    if (protocol?.isSwap) return 'swap';
    return tx.value !== '0' ? 'send' : 'contract';
  }

  if (intentType && intentType !== 'approve') return intentType;

  if (outs.length > 0 && ins.length > 0) {
    if (protocol && !protocol.isSwap) {
      if (ins.some((l) => STAKED_AVAX_SYMBOLS.has(l.symbol.toUpperCase()))) return 'stake';
      if (outs.some((l) => STAKED_AVAX_SYMBOLS.has(l.symbol.toUpperCase()))) return 'unstake';
    }
    return 'swap';
  }
  if ((tx.approvals?.length ?? 0) > 0 && legs.length === 0) return 'approve';
  if (outs.length > 0) {
    if (!initiated) return 'send';
    const plainAvax = tx.value !== '0' && (tx.token_transfers?.length ?? 0) === 0 && !ranCode;
    return plainAvax || isTokenTransferCall(tx, viewer) ? 'send' : 'deposit';
  }
  if (ins.length > 0) return initiated && ranCode ? 'withdraw' : 'receive';
  if (protocol?.isSwap) return 'swap';
  return 'contract';
}

export interface Counterparty {
  relation: 'via' | 'to' | 'from' | 'into' | 'for' | 'on';
  address: string | null;
  name: string | null;
}

/** Who the viewer dealt with, phrased by what happened: "via Yield Yak", "to Binance", "from 0x1234…abcd". */
export function describeCounterparty(tx: ApiTransaction, type: TransactionType, viewer: string, protocol: ProtocolInfo | null): Counterparty {
  const v = viewer.toLowerCase();
  const transfers = tx.token_transfers ?? [];
  const viewerIsSender = tx.from.toLowerCase() === v;
  const sentTo = transfers.find((t) => t.from.toLowerCase() === v)?.to ?? tx.to;
  const receivedFrom = transfers.find((t) => t.to.toLowerCase() === v)?.from ?? tx.from;
  const target = (relation: Counterparty['relation']): Counterparty => ({ relation, address: tx.to, name: protocol?.name ?? nameFor(tx, tx.to) });
  switch (type) {
    case 'swap':
    case 'bridge':
    case 'claim':
      return target('via');
    case 'send':
      return { relation: 'to', address: sentTo, name: nameFor(tx, sentTo) };
    case 'receive': {
      const from = viewerIsSender ? receivedFrom : tx.from;
      return { relation: 'from', address: from, name: nameFor(tx, from) };
    }
    case 'deposit':
    case 'stake':
    case 'add_liquidity':
      return target('into');
    case 'withdraw':
    case 'unstake':
    case 'remove_liquidity':
      return target('from');
    case 'approve': {
      const spender = tx.approvals?.[0]?.spender ?? tx.to;
      return { relation: 'for', address: spender, name: nameFor(tx, spender) };
    }
    default:
      return viewerIsSender ? target('to') : { relation: 'from', address: tx.from, name: nameFor(tx, tx.from) };
  }
}

export function formatCounterparty(c: Counterparty): string {
  if (!c.address) return 'contract creation';
  return `${c.relation} ${c.name ?? shortAddress(c.address)}`;
}

export function formatLegAmount(raw: bigint, decimals: number): string {
  const num = parseFloat(formatUnits(raw, decimals));
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
