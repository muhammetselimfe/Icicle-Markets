import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, ShieldAlert, Layers, FileCode, HandCoins, Waypoints, Droplets, Droplet } from 'lucide-react';
import type { TransactionType } from '@/app/utils/transaction-history';

/** Past-tense, sentence-case titles for every transaction type. */
export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  swap: 'Swap',
  send: 'Sent',
  receive: 'Received',
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  approve: 'Approval',
  stake: 'Stake',
  unstake: 'Unstake',
  claim: 'Claim',
  bridge: 'Bridge',
  add_liquidity: 'Added liquidity',
  remove_liquidity: 'Removed liquidity',
  suspicious: 'Suspicious',
  contract: 'Contract call',
};

const ICONS: Record<TransactionType, typeof ArrowRightLeft> = {
  swap: ArrowRightLeft,
  send: ArrowUpRight,
  receive: ArrowDownLeft,
  deposit: ArrowDownToLine,
  withdraw: ArrowUpFromLine,
  approve: ShieldCheck,
  stake: Layers,
  unstake: Layers,
  claim: HandCoins,
  bridge: Waypoints,
  add_liquidity: Droplets,
  remove_liquidity: Droplet,
  suspicious: ShieldAlert,
  contract: FileCode,
};

export function TransactionTypeIcon({ type, className = 'w-5 h-5' }: { type: TransactionType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className} />;
}
