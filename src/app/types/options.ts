export enum MarketState {
  Trading = 0,
  SettlementOpen = 1,
  PendingOps = 2,
  FinalizedPrimary = 3,
  FinalizedSecondary = 4,
  FailedPendingManual = 5,
}

export interface MarketDisplay {
  marketId: number;
  state: MarketState;
  stateLabel: string;
  isSeeded: boolean;
  minTick: bigint;
  maxTick: bigint;
  tickSpacing: bigint;
  numBins: number;
  tradingStart: number;
  tradingEnd: number;
  settlementTimestamp: number;
  minPrice: number;
  maxPrice: number;
  /** 1 for dollar-based ticks, 100 for cent-based ticks */
  tickDivisor: number;
  /** Asset symbol (e.g. 'AVAX', 'XAU', 'BTC') */
  assetSymbol: string;
  /** Asset display name (e.g. 'Avalanche', 'Gold') */
  assetName: string;
  /** Redstone feed ID */
  feedId: string;
  /** CoinGecko ID for chart data */
  coingeckoId: string | null;
  /** Asset logo URL */
  assetLogo: string;
  /** Accent color */
  accentColor: string;
  /** Price formatting decimals */
  priceDecimals: number;
}

export interface PositionDisplay {
  positionId: number;
  marketId: number;
  lowerTick: bigint;
  upperTick: bigint;
  quantity: bigint;
  costBasis: bigint;
  currentValue: bigint;
  claimed: boolean;
  marketState: MarketState;
  lowerPrice: number;
  upperPrice: number;
  /** 1 for dollar-based ticks, 100 for cent-based ticks */
  tickDivisor: number;
  /** Settlement tick (only meaningful when market is finalized) */
  settlementTick: bigint | null;
  /** Whether the position's range contains the settlement tick */
  isWinner: boolean | null;
}

export type TradeStep =
  | 'idle'
  | 'approving'
  | 'opening'
  | 'closing'
  | 'claiming'
  | 'success'
  | 'error';
