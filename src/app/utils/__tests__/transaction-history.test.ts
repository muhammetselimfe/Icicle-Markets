import { describe, it, expect } from 'vitest';
import {
  classifyTransaction,
  collectTransferLegs,
  describeCounterparty,
  formatCounterparty,
  formatLegAmount,
  getProtocol,
  intentTitle,
  intentToType,
  isSuspiciousTransaction,
  isSuspiciousTransfer,
  methodLabel,
  NATIVE_AVAX_ADDRESS,
} from '../transaction-history';
import type { Transaction as ApiTransaction, TokenTransfer } from '@/app/types/api';

const USER = '0xAbCd000000000000000000000000000000000001';
const OTHER = '0x0000000000000000000000000000000000000002';
const YAK = '0xC4729E56b831d74bBc18797e0e17A295fA77488c';
const BENQI = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';
const USDC = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
const SAVAX = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';
const UNKNOWN_TOKEN = '0x1234567890abcdef1234567890abcdef12345678';

function tx(overrides: Partial<ApiTransaction> = {}): ApiTransaction {
  return {
    chain_id: 43114,
    hash: '0xhash',
    block_number: 1,
    block_time: '2026-10-21T00:00:00Z',
    transaction_index: 0,
    from: USER,
    to: OTHER,
    value: '0',
    gas_limit: 21000,
    gas_price: 25_000_000_000,
    gas_used: 21000,
    success: true,
    type: 2,
    ...overrides,
  };
}

function transfer(token: string, from: string, to: string, value: string, extra: Partial<TokenTransfer> = {}): TokenTransfer {
  return { token, from, to, value, decimals: 18, log_index: 0, ...extra };
}

describe('collectTransferLegs', () => {
  it('records a native send as one outgoing AVAX leg', () => {
    const legs = collectTransferLegs(tx({ value: '1500000000000000000' }), USER);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ token: NATIVE_AVAX_ADDRESS, symbol: 'AVAX', direction: 'out', raw: 1_500_000_000_000_000_000n });
  });

  it('records a native receive from the user perspective, case-insensitively', () => {
    const legs = collectTransferLegs(tx({ from: OTHER, to: USER.toLowerCase(), value: '10' }), USER.toUpperCase());
    expect(legs).toEqual([expect.objectContaining({ direction: 'in', raw: 10n })]);
  });

  it('describes an AVAX to USDC swap as AVAX out then USDC in, ignoring pool hops', () => {
    const t = tx({
      to: YAK,
      value: '2000000000000000000',
      token_transfers: [
        transfer('0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', YAK, OTHER, '2000000000000000000'), // WAVAX to a pool
        transfer(USDC, OTHER, USER, '50000000', { decimals: 6 }),
      ],
    });
    const legs = collectTransferLegs(t, USER);
    expect(legs.map((l) => [l.symbol, l.direction])).toEqual([
      ['AVAX', 'out'],
      ['USDC', 'in'],
    ]);
    expect(legs[1].decimals).toBe(6);
  });

  it('credits AVAX returned through an internal call (token to AVAX swap)', () => {
    const t = tx({
      to: YAK,
      token_transfers: [transfer(USDC, USER, OTHER, '50000000', { decimals: 6 })],
      internal_txs: [
        { block_time: '', trace_index: '0', from: YAK, to: USER, value: '1900000000000000000', gas_used: 0, call_type: 'call', success: true },
        { block_time: '', trace_index: '1', from: YAK, to: USER, value: '5', gas_used: 0, call_type: 'call', success: false },
      ],
    });
    const legs = collectTransferLegs(t, USER);
    expect(legs).toEqual([
      expect.objectContaining({ symbol: 'USDC', direction: 'out' }),
      expect.objectContaining({ symbol: 'AVAX', direction: 'in', raw: 1_900_000_000_000_000_000n }),
    ]);
  });

  it('sums split-route transfers of the same token and direction', () => {
    const t = tx({
      to: YAK,
      token_transfers: [
        transfer(USDC, OTHER, USER, '30000000', { decimals: 6 }),
        transfer(USDC, YAK, USER, '20000000', { decimals: 6 }),
      ],
    });
    const legs = collectTransferLegs(t, USER);
    expect(legs).toHaveLength(1);
    expect(legs[0].raw).toBe(50_000_000n);
  });

  it('falls back to the indexer symbol, then a short address, for unlisted tokens', () => {
    const named = collectTransferLegs(
      tx({ token_transfers: [transfer(UNKNOWN_TOKEN, OTHER, USER, '1', { symbol: 'XYZ', decimals: 9 })] }),
      USER,
    );
    expect(named[0]).toMatchObject({ symbol: 'XYZ', decimals: 9 });

    const bare = collectTransferLegs(tx({ token_transfers: [transfer(UNKNOWN_TOKEN, OTHER, USER, '1')] }), USER);
    expect(bare[0].symbol).toBe('0x1234…5678');
  });

  it('has no legs for a failed transaction', () => {
    const t = tx({ success: false, value: '5', token_transfers: [transfer(USDC, USER, OTHER, '1')] });
    expect(collectTransferLegs(t, USER)).toEqual([]);
  });

  it('ignores transfers that do not touch the user', () => {
    const t = tx({ from: OTHER, to: OTHER, token_transfers: [transfer(USDC, OTHER, YAK, '1')] });
    expect(collectTransferLegs(t, USER)).toEqual([]);
  });
});

describe('classifyTransaction', () => {
  const legsOf = (t: ApiTransaction) => collectTransferLegs(t, USER);

  it('out and in is a swap', () => {
    const t = tx({ to: YAK, value: '1', token_transfers: [transfer(USDC, OTHER, USER, '1')] });
    expect(classifyTransaction(t, legsOf(t), getProtocol(t.to))).toBe('swap');
  });

  it('AVAX in, sAVAX out at a non-swap protocol is a stake, the reverse an unstake', () => {
    const stake = tx({ to: BENQI, value: '1', token_transfers: [transfer(SAVAX, BENQI, USER, '1')] });
    expect(classifyTransaction(stake, legsOf(stake), getProtocol(stake.to))).toBe('stake');

    const unstake = tx({
      to: BENQI,
      token_transfers: [transfer(SAVAX, USER, BENQI, '1')],
      internal_txs: [{ block_time: '', trace_index: '0', from: BENQI, to: USER, value: '1', gas_used: 0, call_type: 'call', success: true }],
    });
    expect(classifyTransaction(unstake, legsOf(unstake), getProtocol(unstake.to))).toBe('unstake');
  });

  it('only out is a send, only in is a receive', () => {
    const send = tx({ value: '1' });
    expect(classifyTransaction(send, legsOf(send), null, USER)).toBe('send');
    const receive = tx({ from: OTHER, to: USER, value: '1' });
    expect(classifyTransaction(receive, legsOf(receive), null, USER)).toBe('receive');
  });

  it('an ERC-20 transfer call is a send, not a deposit', () => {
    const t = tx({ to: USDC, gas_used: 52_000, token_transfers: [transfer(USDC, USER, OTHER, '5', { decimals: 6 })] });
    expect(classifyTransaction(t, legsOf(t), null, USER)).toBe('send');
  });

  it('feeding a contract is a deposit, pulling several assets out of one is a withdrawal', () => {
    const vault = '0xee9d947e164b459ea1abb0d49dfaadb20d6fca06';
    const deposit = tx({ to: vault, gas_used: 180_000, token_transfers: [transfer(USDC, USER, vault, '5', { decimals: 6 })] });
    expect(classifyTransaction(deposit, legsOf(deposit), null, USER)).toBe('deposit');

    const withdraw = tx({
      to: vault,
      gas_used: 250_000,
      token_transfers: [transfer(USDC, vault, USER, '5', { decimals: 6 }), transfer(UNKNOWN_TOKEN, vault, USER, '7', { symbol: 'BTC.b', decimals: 8 })],
      internal_txs: [{ block_time: '', trace_index: '0', from: vault, to: USER, value: '3', gas_used: 0, call_type: 'call', success: true }],
    });
    expect(classifyTransaction(withdraw, legsOf(withdraw), null, USER)).toBe('withdraw');
    // The same transaction seen by someone else who was paid is a receive.
    const paid = tx({ from: OTHER, to: vault, gas_used: 250_000, token_transfers: [transfer(USDC, vault, USER, '5', { decimals: 6 })] });
    expect(classifyTransaction(paid, legsOf(paid), null, USER)).toBe('receive');
  });

  it('an approval with no movement is an approve', () => {
    const t = tx({
      to: USDC,
      approvals: [{ token: USDC, decimals: 6, owner: USER, spender: YAK, amount: '1', is_unlimited: true, log_index: 0 }],
    });
    expect(classifyTransaction(t, legsOf(t), null)).toBe('approve');
  });

  it('a failed call to a swap router is still labelled a swap, other failures by value', () => {
    const failedSwap = tx({ to: YAK, success: false, value: '1' });
    expect(classifyTransaction(failedSwap, legsOf(failedSwap), getProtocol(failedSwap.to))).toBe('swap');
    const failedSend = tx({ success: false, value: '1' });
    expect(classifyTransaction(failedSend, legsOf(failedSend), null)).toBe('send');
    const failedCall = tx({ success: false });
    expect(classifyTransaction(failedCall, legsOf(failedCall), null)).toBe('contract');
  });

  it('nothing moved and no approval is a contract call', () => {
    const t = tx();
    expect(classifyTransaction(t, legsOf(t), null)).toBe('contract');
  });
});

describe('formatLegAmount', () => {
  it('formats with four decimals below 1000 and grouping above', () => {
    expect(formatLegAmount(0n, 18)).toBe('0');
    expect(formatLegAmount(1n, 18)).toBe('<0.0001');
    expect(formatLegAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5000');
    expect(formatLegAmount(1_234_567_890n, 6)).toBe('1,234.5679');
  });
});

describe('indexer enrichment', () => {
  const legsOf = (t: ApiTransaction, who: string) => collectTransferLegs(t, who);
  const vault = '0xee9d947e164b459ea1abb0d49dfaadb20d6fca06';
  const label = (name: string, kind: 'router' | 'contract' | 'token' | 'pool' = 'contract', protocol: string | null = null) => ({
    name,
    kind,
    protocol,
    is_contract: true,
    verified: true,
    implementation: null,
  });

  it('uses the intent when the viewer is the sender, but not for the other party', () => {
    const t = tx({
      to: vault,
      gas_used: 250_000,
      intent: { kind: 'remove_liquidity', label: 'Removed liquidity', protocol: null, confidence: 0.9 },
      token_transfers: [transfer(USDC, vault, USER, '5', { decimals: 6 }), transfer(UNKNOWN_TOKEN, vault, USER, '7', { symbol: 'BTC.b', decimals: 8 })],
    });
    expect(classifyTransaction(t, legsOf(t, USER), null, USER)).toBe('remove_liquidity');
    const paid = { ...t, from: OTHER };
    expect(classifyTransaction(paid, legsOf(paid, USER), null, USER)).toBe('receive');
  });

  it('ignores low-confidence and send/receive/contract_call intents', () => {
    const weak = tx({ to: vault, gas_used: 250_000, value: '1', intent: { kind: 'bridge', label: 'Bridged', protocol: null, confidence: 0.2 } });
    expect(classifyTransaction(weak, legsOf(weak, USER), null, USER)).toBe('deposit');
    const call = tx({ intent: { kind: 'contract_call', label: 'Called transmit', protocol: null, confidence: 0.9 } });
    expect(classifyTransaction(call, legsOf(call, USER), null, USER)).toBe('contract');
  });

  it('labels a failed transaction by its intent', () => {
    const t = tx({ to: vault, success: false, intent: { kind: 'swap', label: 'Swapped', protocol: null, confidence: 0.75 } });
    expect(classifyTransaction(t, [], null, USER)).toBe('swap');
  });

  it('derives a protocol from the indexer label when the address is not in our table', () => {
    expect(getProtocol(vault, label('LFJ Router (v1)', 'router', 'LFJ'))).toEqual({ name: 'LFJ', isSwap: true });
    expect(getProtocol(vault, label('Vault', 'pool'))).toEqual({ name: 'Vault', isSwap: false });
    expect(getProtocol(vault, label('TransparentUpgradeableProxy'))).toBeNull();
    expect(getProtocol(YAK, label('YakRouter', 'router'))?.name).toBe('Yield Yak');
  });

  it('turns method names into words', () => {
    expect(methodLabel({ selector: '0x6bf2df86', name: 'swapNoSplit', signature: 'swapNoSplit(...)' })).toBe('Swap no split');
    expect(methodLabel({ selector: '0x1234abcd', name: 'postStateList_V2', signature: null })).toBe('Post state list v2');
    expect(methodLabel({ selector: '0x1234abcd', name: null, signature: null })).toBe('0x1234abcd');
    expect(methodLabel(null)).toBeNull();
  });

  it('maps intent kinds to types for explorer lists', () => {
    expect(intentToType('send')).toBe('send');
    expect(intentToType('add_liquidity')).toBe('add_liquidity');
    expect(intentToType('contract_call')).toBe('contract');
    expect(intentToType(null)).toBe('contract');
  });

  it('describes the counterparty with curated, then embedded, names', () => {
    const swap = tx({ to: YAK, value: '1', token_transfers: [transfer(USDC, OTHER, USER, '1')] });
    expect(formatCounterparty(describeCounterparty(swap, 'swap', USER, getProtocol(YAK)))).toBe('via Yield Yak');
    const send = tx({ to: UNKNOWN_TOKEN, to_label: label('Some Token', 'token'), token_transfers: [transfer(UNKNOWN_TOKEN, USER, OTHER, '1')] });
    expect(formatCounterparty(describeCounterparty(send, 'send', USER, null))).toBe('to 0x0000…0002');
    const call = tx({ to: vault, to_label: label('Pharaoh Vault', 'pool', 'Pharaoh') });
    expect(formatCounterparty(describeCounterparty(call, 'contract', USER, getProtocol(vault, call.to_label)))).toBe('to Pharaoh');
    expect(formatCounterparty(describeCounterparty(call, 'contract', OTHER, null))).toBe('from 0xAbCd…0001');
    expect(formatCounterparty(describeCounterparty(tx({ to: null }), 'contract', USER, null))).toBe('contract creation');
    const proxy = tx({ to: vault, to_label: label('TransparentUpgradeableProxy') });
    expect(formatCounterparty(describeCounterparty(proxy, 'remove_liquidity', USER, null))).toBe('from 0xee9d…ca06');
  });
});

describe('intentTitle', () => {
  it('keeps specific contract-call labels and drops generic ones', () => {
    const intent = (kind: 'contract_call' | 'swap', label: string) => ({ kind, label, protocol: null, confidence: 0.9 });
    expect(intentTitle(tx({ intent: intent('contract_call', 'Borrowed') }))).toBe('Borrowed');
    expect(intentTitle(tx({ intent: intent('contract_call', 'Deployed contract') }))).toBe('Deployed contract');
    expect(intentTitle(tx({ intent: intent('contract_call', 'Called multicall') }))).toBeNull();
    expect(intentTitle(tx({ intent: intent('contract_call', 'Contract call') }))).toBeNull();
    expect(intentTitle(tx({ intent: intent('swap', 'Swapped') }))).toBeNull();
    expect(intentTitle(tx())).toBeNull();
  });
});

describe('address poisoning', () => {
  const FAKE_AVAX = '0x7782f1dcedc66821fd5bdb95465d13093569e7c7';
  const WAVAX = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';
  const SPAM = '0xafa1a3a8e8db888003ab0a1d2b55c5e0eac534c5';
  const VICTIM = '0xc002f5aa6d79f4ac30d8e8d0beee7a6c05f85efa';
  const poison = (overrides: Partial<ApiTransaction> = {}) =>
    tx({
      from: OTHER,
      to: SPAM,
      value: '63500003150000',
      gas_used: 181_017,
      token_transfers: [transfer(FAKE_AVAX, UNKNOWN_TOKEN, VICTIM, '27649021508554907465', { symbol: 'AVAX' })],
      internal_txs: [{ block_time: '', trace_index: '0', from: SPAM, to: VICTIM, value: '63500003150000', gas_used: 0, call_type: 'CALL', success: true }],
      ...overrides,
    });

  it('flags a transfer whose symbol belongs to a listed token at another address', () => {
    expect(isSuspiciousTransfer(transfer(FAKE_AVAX, OTHER, USER, '1', { symbol: 'AVAX' }))).toBe(true);
    expect(isSuspiciousTransfer(transfer(UNKNOWN_TOKEN, OTHER, USER, '1', { symbol: 'usdc', decimals: 6 }))).toBe(true);
    expect(isSuspiciousTransfer(transfer(WAVAX, OTHER, USER, '1', { symbol: 'WAVAX' }))).toBe(false);
    expect(isSuspiciousTransfer(transfer(USDC, OTHER, USER, '1', { symbol: 'USDC', decimals: 6 }))).toBe(false);
    expect(isSuspiciousTransfer(transfer(UNKNOWN_TOKEN, OTHER, USER, '1', { symbol: 'XYZ' }))).toBe(false);
  });

  it('never turns a fake transfer into a leg, from either side', () => {
    expect(collectTransferLegs(poison(), VICTIM)).toEqual([expect.objectContaining({ symbol: 'AVAX', direction: 'in', raw: 63_500_003_150_000n })]);
    expect(collectTransferLegs(poison(), OTHER)).toEqual([expect.objectContaining({ direction: 'out' })]);
  });

  it('classifies dust plus a fake event as suspicious for both the victim and the sender', () => {
    const t = poison();
    expect(classifyTransaction(t, collectTransferLegs(t, VICTIM), null, VICTIM)).toBe('suspicious');
    expect(classifyTransaction(t, collectTransferLegs(t, OTHER), null, OTHER)).toBe('suspicious');
    expect(isSuspiciousTransaction(t, collectTransferLegs(t, VICTIM))).toBe(true);
  });

  it('does not flag a real transfer that happens to carry a fake event', () => {
    const t = poison({
      value: '5000000000000000000',
      internal_txs: [{ block_time: '', trace_index: '0', from: SPAM, to: VICTIM, value: '5000000000000000000', gas_used: 0, call_type: 'CALL', success: true }],
    });
    expect(classifyTransaction(t, collectTransferLegs(t, VICTIM), null, VICTIM)).toBe('receive');
  });
});
