// Icicle API Response Types

export interface ApiResponse<T> {
  data: T;
  meta?: {
    limit: number;
    offset: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// Health & Status
export interface HealthResponse {
  status: string;
  database: string;
}

export interface EVMChainStatus {
  chain_id: number;
  name: string;
  current_block: number;
  latest_block: number;
  blocks_behind: number;
  last_sync: string;
  is_synced: boolean;
}

export interface PChainStatus {
  current_block: number;
  latest_block: number;
  blocks_behind: number;
  last_sync: string;
  is_synced: boolean;
}

export interface IndexerStatus {
  healthy: boolean;
  evm: EVMChainStatus[];
  pchain: PChainStatus;
  last_update: string;
}

// EVM Data
export interface Block {
  chain_id: number;
  block_number: number;
  hash: string;
  parent_hash: string;
  block_time: string;
  miner: string;
  size: number;
  gas_limit: number;
  gas_used: number;
  base_fee_per_gas: number;
  tx_count?: number;
}

export interface InternalTransaction {
  block_time: string;
  trace_index: string;
  from: string;
  to: string;
  value: string;
  gas_used: number;
  call_type: string;
  success: boolean;
}

export interface TokenTransfer {
  token: string;
  name?: string;
  symbol?: string;
  decimals: number;
  from: string;
  to: string;
  value: string;
  log_index: number;
}

export interface Approval {
  token: string;
  name?: string;
  symbol?: string;
  decimals: number;
  owner: string;
  spender: string;
  amount: string;
  is_unlimited: boolean;
  log_index: number;
}

export interface Transaction {
  chain_id: number;
  hash: string;
  block_number: number;
  block_time: string;
  transaction_index: number;
  from: string;
  to: string | null;
  value: string;
  gas_limit: number;
  gas_price: number;
  gas_used: number;
  success: boolean;
  type: number;
  internal_txs?: InternalTransaction[];
  token_transfers?: TokenTransfer[];
  approvals?: Approval[];
}

// Chain Stats
export interface ChainStats {
  chain_id: number;
  chain_name: string;
  latest_block: number;
  total_blocks: number;
  total_txs: number;
  last_block_time: string;
  avg_block_time_seconds: number;
  avg_gas_used: number;
  total_gas_used: number;
}

// Time Series
export interface TimeSeriesDataPoint {
  period: string;
  value: number;
}

export interface TimeSeriesResponse {
  chain_id: number;
  metric_name: string;
  granularity: string;
  data: TimeSeriesDataPoint[];
}

export interface MetricInfo {
  metric_name: string;
  granularities: string[];
  latest_period: string;
  data_points: number;
}

// Validators
export interface Validator {
  subnet_id: string;
  validation_id: string;
  node_id: string;
  balance: number;
  weight: number;
  start_time: string;
  end_time: string;
  uptime_percentage: number;
  active: boolean;
  initial_deposit: number;
  total_topups: number;
  refund_amount: number;
  fees_paid: number;
}

// Subnets
export interface Subnet {
  subnet_id: string;
  subnet_type: 'regular' | 'elastic' | 'l1';
  created_block: number;
  created_time: string;
  chain_id?: string;
  converted_block?: number;
  converted_time?: string;
}

export interface Chain {
  chain_id: string;
  subnet_id: string;
  chain_name: string;
  vm_id: string;
  created_block: number;
  created_time: string;
}

export interface SubnetRegistry {
  subnet_id: string;
  name: string;
  description: string;
  logo_url: string;
  website_url: string;
}

export interface SubnetDetails {
  subnet: Subnet;
  chains: Chain[];
  registry?: SubnetRegistry;
}

// P-Chain
export interface PChainTransaction {
  tx_id: string;
  tx_type: string;
  block_number: number;
  block_time: string;
  tx_data: Record<string, unknown>;
}

export interface TxTypeCount {
  tx_type: string;
  count: number;
}

// Fee Metrics
export interface FeeStats {
  subnet_id: string;
  total_deposited: number;
  initial_deposits: number;
  top_up_deposits: number;
  total_refunded: number;
  current_balance: number;
  total_fees_paid: number;
  deposit_tx_count: number;
  validator_count: number;
}

// Granularity options
export type Granularity = 'hour' | 'day' | 'week' | 'month';

// Available metrics
export type MetricName =
  | 'tx_count'
  | 'active_addresses'
  | 'active_senders'
  | 'fees_paid'
  | 'gas_used'
  | 'contracts'
  | 'deployers'
  | 'avg_tps'
  | 'max_tps'
  | 'avg_gps'
  | 'max_gps'
  | 'avg_gas_price'
  | 'max_gas_price'
  | 'icm_total'
  | 'icm_sent'
  | 'icm_received'
  | 'usdc_volume'
  | 'cumulative_tx_count'
  | 'cumulative_addresses'
  | 'cumulative_contracts'
  | 'cumulative_deployers';

// Token Balance (from address balances endpoint)
export interface TokenBalance {
  token: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  balance: string;
  total_in: string;
  total_out: string;
  last_updated_block: number;
}

// Native Balance (from address native endpoint)
export interface NativeBalance {
  balance: string;
  total_in: string;
  total_out: string;
  total_gas: string;
  last_updated_block: number;
  tx_count: number;
  first_tx_time: string | null;
  last_tx_time: string | null;
}
