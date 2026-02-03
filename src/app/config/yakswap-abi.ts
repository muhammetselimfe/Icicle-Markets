export const YAK_ROUTER_ADDRESS = '0xC4729E56b831d74bBc18797e0e17A295fA77488c' as const;

export const YAK_ROUTER_ABI = [
  {
    name: 'findBestPathWithGas',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_amountIn', type: 'uint256' },
      { name: '_tokenIn', type: 'address' },
      { name: '_tokenOut', type: 'address' },
      { name: '_maxSteps', type: 'uint256' },
      { name: '_gasPrice', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'amounts', type: 'uint256[]' },
          { name: 'adapters', type: 'address[]' },
          { name: 'path', type: 'address[]' },
          { name: 'gasEstimate', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'swapNoSplit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_trade',
        type: 'tuple',
        components: [
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'path', type: 'address[]' },
          { name: 'adapters', type: 'address[]' },
        ],
      },
      { name: '_to', type: 'address' },
      { name: '_fee', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'swapNoSplitFromAVAX',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: '_trade',
        type: 'tuple',
        components: [
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'path', type: 'address[]' },
          { name: 'adapters', type: 'address[]' },
        ],
      },
      { name: '_to', type: 'address' },
      { name: '_fee', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'swapNoSplitToAVAX',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_trade',
        type: 'tuple',
        components: [
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'path', type: 'address[]' },
          { name: 'adapters', type: 'address[]' },
        ],
      },
      { name: '_to', type: 'address' },
      { name: '_fee', type: 'uint256' },
    ],
    outputs: [],
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
] as const;
