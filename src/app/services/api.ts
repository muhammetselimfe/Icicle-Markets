// Icicle Blockchain Indexer API Client

import type {
  ApiResponse,
  HealthResponse,
  IndexerStatus,
  Block,
  Transaction,
  ChainStats,
  TimeSeriesResponse,
  MetricInfo,
  Validator,
  Subnet,
  SubnetDetails,
  PChainTransaction,
  TxTypeCount,
  FeeStats,
  Granularity,
  MetricName,
  TokenBalance,
  NativeBalance,
  AddressLabel,
} from '../types/api';

const API_BASE = 'https://api.l1beat.io';
const DEFAULT_CHAIN_ID = 43114; // C-Chain

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new Error(retryAfter ? `Rate limited. Retry in ${retryAfter}s` : 'Rate limited. Please wait...');
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Health & Status
  async getHealth(): Promise<HealthResponse> {
    return this.fetch<HealthResponse>('/health');
  }

  async getIndexerStatus(): Promise<IndexerStatus> {
    return this.fetch<IndexerStatus>('/api/v1/metrics/indexer/status');
  }

  // EVM Blocks
  async getBlocks(
    chainId: number = DEFAULT_CHAIN_ID,
    limit: number = 20,
    offset: number = 0
  ): Promise<ApiResponse<Block[]>> {
    return this.fetch<ApiResponse<Block[]>>(
      `/api/v1/data/evm/${chainId}/blocks?limit=${limit}&offset=${offset}`
    );
  }

  async getBlock(
    blockNumber: number,
    chainId: number = DEFAULT_CHAIN_ID
  ): Promise<ApiResponse<Block>> {
    return this.fetch<ApiResponse<Block>>(
      `/api/v1/data/evm/${chainId}/blocks/${blockNumber}`
    );
  }

  // EVM Transactions
  async getTransactions(
    chainId: number = DEFAULT_CHAIN_ID,
    limit: number = 20,
    offset: number = 0
  ): Promise<ApiResponse<Transaction[]>> {
    return this.fetch<ApiResponse<Transaction[]>>(
      `/api/v1/data/evm/${chainId}/txs?limit=${limit}&offset=${offset}`
    );
  }

  /** Transactions mined in one block, newest index first as the indexer returns them. */
  async getBlockTransactions(
    blockNumber: number,
    chainId: number = DEFAULT_CHAIN_ID,
    limit: number = 50,
    offset: number = 0
  ): Promise<ApiResponse<Transaction[]>> {
    return this.fetch<ApiResponse<Transaction[]>>(
      `/api/v1/data/evm/${chainId}/txs?block_number=${blockNumber}&limit=${limit}&offset=${offset}`
    );
  }

  async getTransaction(
    hash: string,
    chainId: number = DEFAULT_CHAIN_ID
  ): Promise<ApiResponse<Transaction>> {
    return this.fetch<ApiResponse<Transaction>>(
      `/api/v1/data/evm/${chainId}/txs/${hash}`
    );
  }

  /** With `includeTransfers`, rows carry token transfers, internal calls and approvals like the single-transaction endpoint. */
  async getAddressTransactions(
    address: string,
    chainId: number = DEFAULT_CHAIN_ID,
    limit: number = 20,
    offset: number = 0,
    includeTransfers: boolean = false
  ): Promise<ApiResponse<Transaction[]>> {
    return this.fetch<ApiResponse<Transaction[]>>(
      `/api/v1/data/evm/${chainId}/address/${address}/txs?limit=${limit}&offset=${offset}${includeTransfers ? '&include=transfers' : ''}`
    );
  }

  /** Labels for up to 100 addresses; unknown addresses are left out of the map. */
  async getAddressLabels(
    addresses: string[],
    chainId: number = DEFAULT_CHAIN_ID
  ): Promise<ApiResponse<Record<string, AddressLabel>>> {
    return this.fetch<ApiResponse<Record<string, AddressLabel>>>(
      `/api/v1/data/evm/${chainId}/labels?addresses=${addresses.map((a) => a.toLowerCase()).join(',')}`
    );
  }

  async getAddressBalances(
    address: string,
    chainId: number = DEFAULT_CHAIN_ID,
    limit: number = 100,
    offset: number = 0
  ): Promise<ApiResponse<TokenBalance[]>> {
    return this.fetch<ApiResponse<TokenBalance[]>>(
      `/api/v1/data/evm/${chainId}/address/${address}/balances?limit=${limit}&offset=${offset}`
    );
  }

  async getAddressNativeBalance(
    address: string,
    chainId: number = DEFAULT_CHAIN_ID
  ): Promise<ApiResponse<NativeBalance>> {
    return this.fetch<ApiResponse<NativeBalance>>(
      `/api/v1/data/evm/${chainId}/address/${address}/native`
    );
  }

  // Chain Stats
  async getChainStats(chainId: number = DEFAULT_CHAIN_ID): Promise<ApiResponse<ChainStats>> {
    return this.fetch<ApiResponse<ChainStats>>(
      `/api/v1/metrics/evm/${chainId}/stats`
    );
  }

  // Time Series
  async getAvailableMetrics(chainId: number = DEFAULT_CHAIN_ID): Promise<ApiResponse<MetricInfo[]>> {
    return this.fetch<ApiResponse<MetricInfo[]>>(
      `/api/v1/metrics/evm/${chainId}/timeseries`
    );
  }

  async getTimeSeries(
    metric: MetricName,
    chainId: number = DEFAULT_CHAIN_ID,
    granularity: Granularity = 'day',
    limit: number = 100,
    from?: string,
    to?: string
  ): Promise<ApiResponse<TimeSeriesResponse>> {
    let url = `/api/v1/metrics/evm/${chainId}/timeseries/${metric}?granularity=${granularity}&limit=${limit}`;
    if (from) url += `&from=${from}`;
    if (to) url += `&to=${to}`;
    return this.fetch<ApiResponse<TimeSeriesResponse>>(url);
  }

  // Validators
  async getValidators(
    active?: boolean,
    subnetId?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ApiResponse<Validator[]>> {
    let url = `/api/v1/data/validators?limit=${limit}&offset=${offset}`;
    if (active !== undefined) url += `&active=${active}`;
    if (subnetId) url += `&subnet_id=${subnetId}`;
    return this.fetch<ApiResponse<Validator[]>>(url);
  }

  async getValidator(id: string): Promise<ApiResponse<Validator>> {
    return this.fetch<ApiResponse<Validator>>(`/api/v1/data/validators/${id}`);
  }

  // Subnets
  async getSubnets(
    type?: 'regular' | 'elastic' | 'l1',
    limit: number = 20,
    offset: number = 0
  ): Promise<ApiResponse<Subnet[]>> {
    let url = `/api/v1/data/subnets?limit=${limit}&offset=${offset}`;
    if (type) url += `&type=${type}`;
    return this.fetch<ApiResponse<Subnet[]>>(url);
  }

  async getSubnet(subnetId: string): Promise<ApiResponse<SubnetDetails>> {
    return this.fetch<ApiResponse<SubnetDetails>>(`/api/v1/data/subnets/${subnetId}`);
  }

  async getL1s(limit: number = 20, offset: number = 0): Promise<ApiResponse<Subnet[]>> {
    return this.fetch<ApiResponse<Subnet[]>>(
      `/api/v1/data/l1s?limit=${limit}&offset=${offset}`
    );
  }

  // P-Chain
  async getPChainTransactions(
    txType?: string,
    subnetId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<ApiResponse<PChainTransaction[]>> {
    let url = `/api/v1/data/pchain/txs?limit=${limit}&offset=${offset}`;
    if (txType) url += `&tx_type=${txType}`;
    if (subnetId) url += `&subnet_id=${subnetId}`;
    return this.fetch<ApiResponse<PChainTransaction[]>>(url);
  }

  async getPChainTransaction(txId: string): Promise<ApiResponse<PChainTransaction>> {
    return this.fetch<ApiResponse<PChainTransaction>>(`/api/v1/data/pchain/txs/${txId}`);
  }

  async getPChainTxTypes(): Promise<ApiResponse<TxTypeCount[]>> {
    return this.fetch<ApiResponse<TxTypeCount[]>>('/api/v1/data/pchain/tx-types');
  }

  // Fee Metrics
  async getFeeStats(
    subnetId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<ApiResponse<FeeStats[]>> {
    let url = `/api/v1/metrics/fees?limit=${limit}&offset=${offset}`;
    if (subnetId) url += `&subnet_id=${subnetId}`;
    return this.fetch<ApiResponse<FeeStats[]>>(url);
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing or custom instances
export { ApiClient };
