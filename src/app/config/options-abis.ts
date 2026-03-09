// ABIs derived from v1-contract/contracts/interfaces/ (source of truth)
// Delegatecall-based read functions marked as view for viem readContract compatibility

export const CORE_ABI = [
  // Public storage variable — market counter for enumeration
  {
    name: 'nextMarketId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Public mapping — returns full Market struct (24 fields)
  {
    name: 'markets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'isSeeded', type: 'bool' },
      { name: 'settled', type: 'bool' },
      { name: 'snapshotChunksDone', type: 'bool' },
      { name: 'failed', type: 'bool' },
      { name: 'numBins', type: 'uint32' },
      { name: 'openPositionCount', type: 'uint32' },
      { name: 'snapshotChunkCursor', type: 'uint32' },
      { name: 'seedCursor', type: 'uint32' },
      { name: 'startTimestamp', type: 'uint64' },
      { name: 'endTimestamp', type: 'uint64' },
      { name: 'settlementTimestamp', type: 'uint64' },
      { name: 'settlementFinalizedAt', type: 'uint64' },
      { name: 'minTick', type: 'int256' },
      { name: 'maxTick', type: 'int256' },
      { name: 'tickSpacing', type: 'int256' },
      { name: 'settlementTick', type: 'int256' },
      { name: 'settlementValue', type: 'int256' },
      { name: 'liquidityParameter', type: 'uint256' },
      { name: 'feePolicy', type: 'address' },
      { name: 'seedData', type: 'address' },
      { name: 'initialRootSum', type: 'uint256' },
      { name: 'accumulatedFees', type: 'uint256' },
      { name: 'minFactor', type: 'uint256' },
      { name: 'deltaEt', type: 'uint256' },
    ],
  },
  // Delegatecall reads — marked view for frontend
  {
    name: 'getMarketState',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'getSettlementWindows',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'tradingStart', type: 'uint64' },
      { name: 'tradingEnd', type: 'uint64' },
      { name: 'settlementStart', type: 'uint64' },
      { name: 'settlementEnd', type: 'uint64' },
    ],
  },
  {
    name: 'calculateOpenCost',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'lowerTick', type: 'int256' },
      { name: 'upperTick', type: 'int256' },
      { name: 'quantity', type: 'uint128' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'calculateCloseProceeds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'calculatePositionValue',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getSettlementPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'price', type: 'int256' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
  // Write functions
  {
    name: 'openPosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'lowerTick', type: 'int256' },
      { name: 'upperTick', type: 'int256' },
      { name: 'quantity', type: 'uint128' },
      { name: 'maxCost', type: 'uint256' },
    ],
    outputs: [{ name: 'positionId', type: 'uint256' }],
  },
  {
    name: 'closePosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'uint256' },
      { name: 'minProceeds', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'claimPayout',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  // Events
  {
    name: 'PositionOpened',
    type: 'event',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'trader', type: 'address', indexed: true },
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'lowerTick', type: 'int256', indexed: false },
      { name: 'upperTick', type: 'int256', indexed: false },
      { name: 'quantity', type: 'uint128', indexed: false },
      { name: 'cost', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const POSITION_ABI = [
  {
    name: 'getPosition',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      {
        name: 'position',
        type: 'tuple',
        components: [
          { name: 'marketId', type: 'uint256' },
          { name: 'lowerTick', type: 'int256' },
          { name: 'upperTick', type: 'int256' },
          { name: 'quantity', type: 'uint128' },
          { name: 'createdAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    name: 'getPositionsByOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getUserPositionsInMarket',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'marketId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;
