import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { api } from '@/app/services/api';
import { coingecko } from '@/app/services/coingecko';
import type { Transaction as ApiTransaction } from '@/app/types/api';

export type TransactionType = 'swap' | 'send' | 'receive' | 'approve' | 'stake' | 'unstake' | 'contract';
export type TransactionStatus = 'success' | 'failed' | 'pending';

export interface TokenTransfer {
  symbol: string;
  amount: string;
  valueUsd: number;
  logoUrl?: string;
  direction: 'in' | 'out';
}

export interface Transaction {
  hash: string;
  timestamp: Date;
  type: TransactionType;
  status: TransactionStatus;
  protocol?: {
    name: string;
    logoUrl?: string;
  };
  transfers: TokenTransfer[];
  gasFee: {
    amount: string;
    valueUsd: number;
  };
  blockNumber: number;
  from: string;
  to: string | null;
}

export interface TransactionHistoryData {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

const AVAX_LOGO = 'https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png';

// Known protocol contracts on Avalanche
interface ProtocolInfo {
  name: string;
  logoUrl?: string;
  isSwap: boolean;
}

const KNOWN_PROTOCOLS: Record<string, ProtocolInfo> = {
  // Yield Yak
  '0xc4729e56b831d74bbc18797e0e17a295fa77488c': {
    name: 'Yield Yak',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x59414b3089ce2AF0010e7523Dea7E2b35d776ec7/logo.png',
    isSwap: true,
  },
  // Trader Joe V2.1 LB Router
  '0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30': {
    name: 'Trader Joe',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png',
    isSwap: true,
  },
  // Trader Joe V2 Router
  '0xe3ffc583dc176575eea7fd9df2a7c65f7e23f4c3': {
    name: 'Trader Joe',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png',
    isSwap: true,
  },
  // Trader Joe V1 Router
  '0x60ae616a2155ee3d9a68541ba4544862310933d4': {
    name: 'Trader Joe',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png',
    isSwap: true,
  },
  // Pangolin Router
  '0xe54ca86531e17ef3616d22ca28b0d458b6c89106': {
    name: 'Pangolin',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x60781C2586D68229fde47564546784ab3fACA982/logo.png',
    isSwap: true,
  },
  // SushiSwap Router
  '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506': {
    name: 'SushiSwap',
    logoUrl: 'https://cryptologos.cc/logos/sushiswap-sushi-logo.png',
    isSwap: true,
  },
  // ParaSwap
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': {
    name: 'ParaSwap',
    logoUrl: 'https://cdn.paraswap.io/brand/PSP_500x500.png',
    isSwap: true,
  },
  // 1inch Router V5
  '0x1111111254eeb25477b68fb85ed929f73a960582': {
    name: '1inch',
    logoUrl: 'https://cryptologos.cc/logos/1inch-1inch-logo.png',
    isSwap: true,
  },
  // BENQI Staking (sAVAX)
  '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be': {
    name: 'BENQI',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5/logo.png',
    isSwap: false,
  },
  // GoGoPool (ggAVAX / stAVAX)
  '0xa25eaf2906fa1a3a13edac9b9657108af7b703e3': {
    name: 'GoGoPool',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3/logo.png',
    isSwap: false,
  },
  // GMX Router
  '0x5f719c2f1095f7b9fc68a68e35b51194f4b6abe8': {
    name: 'GMX',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x62edc0692BD897D2295872a9FFCac5425011c661/logo.png',
    isSwap: true,
  },
  // Stargate Router
  '0x45a01e4e04f14f7a4a6702c74187c5f6222033cd': {
    name: 'Stargate',
    logoUrl: 'https://cryptologos.cc/logos/stargate-finance-stg-logo.png',
    isSwap: false,
  },
  // LFJ (Liquidity Book) Router
  '0x18556da13313f3532c54711497a8fedac273220e': {
    name: 'LFJ',
    logoUrl: 'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png',
    isSwap: true,
  },
};

// Known token contracts (for approve detection)
const KNOWN_TOKENS: Record<string, string> = {
  '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': 'USDC',
  '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7': 'USDT',
  '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': 'WAVAX',
  '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab': 'WETH.e',
  '0x152b9d0fdc40c096757f570a51e494bd4b943e50': 'BTC.b',
  '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd': 'JOE',
  '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be': 'sAVAX',
  '0xa25eaf2906fa1a3a13edac9b9657108af7b703e3': 'ggAVAX',
  '0x420fca0121dc28039145009570975747295f2329': 'COQ',
  '0xd586e7f844cea2f87f50152665bcbc2c279d8d70': 'DAI.e',
  '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664': 'USDC.e',
};

// Get protocol info from contract address
function getProtocol(toAddress: string | null): ProtocolInfo | null {
  if (!toAddress) return null;
  return KNOWN_PROTOCOLS[toAddress.toLowerCase()] || null;
}

// Check if address is a known token (for approve detection)
function isKnownToken(address: string | null): boolean {
  if (!address) return false;
  return !!KNOWN_TOKENS[address.toLowerCase()];
}

// Determine transaction type based on from/to addresses and protocol
function getTransactionType(tx: ApiTransaction, userAddress: string): TransactionType {
  const from = tx.from.toLowerCase();
  const to = tx.to?.toLowerCase();
  const user = userAddress.toLowerCase();

  // Check if it's interacting with a known protocol
  const protocol = to ? getProtocol(to) : null;

  // If going to a known DEX/swap router, it's a swap
  if (protocol?.isSwap) {
    return 'swap';
  }

  // If value is 0 and it's to a known token contract, it's likely an approve
  if (tx.value === '0' && to && isKnownToken(to)) {
    return 'approve';
  }

  // If value is 0 and going to any contract, it's a contract interaction
  if (tx.value === '0') {
    return 'contract';
  }

  // If user is sender
  if (from === user) {
    return 'send';
  }

  // If user is receiver
  if (to === user) {
    return 'receive';
  }

  return 'contract';
}

// Format balance with appropriate decimals
function formatBalance(value: string, decimals: number = 18): string {
  const formatted = formatUnits(BigInt(value), decimals);
  const num = parseFloat(formatted);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function useTransactionHistory(): TransactionHistoryData {
  const { address, isConnected } = useAccount();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [avaxPrice, setAvaxPrice] = useState(0);

  const LIMIT = 20;

  const fetchTransactions = useCallback(async (pageNum: number = 0, append: boolean = false) => {
    if (!isConnected || !address) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    try {
      if (!append) {
        setLoading(true);
      }
      setError(null);

      // Fetch transactions and AVAX price in parallel
      const [txResponse, priceData] = await Promise.all([
        api.getAddressTransactions(address, 43114, LIMIT, pageNum * LIMIT),
        pageNum === 0 ? coingecko.getSimplePrice(['avalanche-2']) : Promise.resolve(null),
      ]);

      // Update AVAX price if fetched
      if (priceData) {
        setAvaxPrice(priceData['avalanche-2']?.usd ?? 0);
      }

      const apiTxs: ApiTransaction[] = txResponse.data || [];

      // Transform API transactions to UI format
      const uiTxs: Transaction[] = apiTxs.map(tx => {
        const txType = getTransactionType(tx, address);
        const isReceive = txType === 'receive';
        const protocol = getProtocol(tx.to);

        // Calculate gas fee in AVAX
        const gasFeeWei = BigInt(tx.gas_used) * BigInt(tx.gas_price);
        const gasFeeAvax = formatUnits(gasFeeWei, 18);
        const gasFeeUsd = parseFloat(gasFeeAvax) * avaxPrice;

        // Build transfers array
        const transfers: TokenTransfer[] = [];

        // Add AVAX transfer if value > 0
        if (tx.value !== '0') {
          const avaxAmount = formatBalance(tx.value);
          const avaxValueUsd = parseFloat(formatUnits(BigInt(tx.value), 18)) * avaxPrice;

          transfers.push({
            symbol: 'AVAX',
            amount: avaxAmount,
            valueUsd: avaxValueUsd,
            logoUrl: AVAX_LOGO,
            direction: isReceive ? 'in' : 'out',
          });
        }

        return {
          hash: tx.hash,
          timestamp: new Date(tx.block_time),
          type: txType,
          status: tx.success ? 'success' : 'failed',
          protocol: protocol ? { name: protocol.name, logoUrl: protocol.logoUrl } : undefined,
          transfers,
          gasFee: {
            amount: parseFloat(gasFeeAvax).toFixed(6),
            valueUsd: gasFeeUsd,
          },
          blockNumber: tx.block_number,
          from: tx.from,
          to: tx.to,
        };
      });

      if (append) {
        setTransactions(prev => [...prev, ...uiTxs]);
      } else {
        setTransactions(uiTxs);
      }

      setHasMore(apiTxs.length === LIMIT);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, avaxPrice]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTransactions(nextPage, true);
  }, [page, fetchTransactions]);

  const refetch = useCallback(() => {
    setPage(0);
    fetchTransactions(0, false);
  }, [fetchTransactions]);

  useEffect(() => {
    fetchTransactions(0, false);
  }, [address, isConnected]);

  // Refetch when AVAX price is first loaded to update USD values
  useEffect(() => {
    if (avaxPrice > 0 && transactions.length > 0) {
      // Update USD values in existing transactions
      setTransactions(prev => prev.map(tx => {
        const gasFeeUsd = parseFloat(tx.gasFee.amount) * avaxPrice;
        const updatedTransfers = tx.transfers.map(transfer => {
          if (transfer.symbol === 'AVAX') {
            return {
              ...transfer,
              valueUsd: parseFloat(transfer.amount.replace(/,/g, '').replace('<', '')) * avaxPrice,
            };
          }
          return transfer;
        });

        return {
          ...tx,
          gasFee: { ...tx.gasFee, valueUsd: gasFeeUsd },
          transfers: updatedTransfers,
        };
      }));
    }
  }, [avaxPrice]);

  return {
    transactions,
    loading,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}

// Get "active since" date (first transaction)
export function useActiveSince(): { date: Date | null; loading: boolean } {
  const { address, isConnected } = useAccount();
  const [date, setDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !address) {
      setDate(null);
      setLoading(false);
      return;
    }

    // Fetch the oldest transaction to determine "active since"
    // For now, we'll use the last transaction in a large offset query
    // A better approach would be a dedicated API endpoint
    async function fetchFirstTx() {
      try {
        // Try to get transactions with a large offset to find older ones
        // This is a workaround - ideally the API would have a "first transaction" endpoint
        const response = await api.getAddressTransactions(address, 43114, 1, 0);
        if (response.data && response.data.length > 0) {
          // For now, just use the most recent transaction date
          // The real "active since" would need pagination to the end
          setDate(new Date(response.data[0].block_time));
        }
      } catch (err) {
        console.error('Failed to fetch first transaction:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchFirstTx();
  }, [isConnected, address]);

  return { date, loading };
}
