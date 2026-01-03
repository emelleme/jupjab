/**
 * Type Definitions
 * 
 * Core TypeScript interfaces and types for the Jupiter Perps Bot.
 * All types use strict typing with no implicit any.
 */

/**
 * Parameters for opening a position
 */
export interface OpenPositionParams {
  /** Trading symbol (e.g., "SOL", "ETH", "BTC") */
  symbol: string;
  /** Collateral amount in USD (e.g., 100 for $100 USDC) */
  collateralUsd: number;
  /** Leverage multiplier (e.g., 10 for 10x) */
  leverage: number;
  /** Position direction: true = Long, false = Short */
  isLong: boolean;
  /** Optional price limit in USD for slippage protection */
  priceLimit?: number;
}

/**
 * Current state of an open position
 */
export interface PositionState {
  /** Position direction */
  direction: "long" | "short";
  /** Position size in USD */
  sizeUsd: number;
  /** Collateral amount in USD */
  collateralUsd: number;
  /** Entry price */
  entryPrice: number;
  /** Current price */
  currentPrice?: number;
  /** Unrealized PnL */
  unrealizedPnl?: number;
  /** Liquidation price */
  liquidationPrice?: number;
}

/**
 * Result of a successful trade execution
 */
export interface TradeResult {
  /** Transaction signature */
  signature: string;
  /** Position account address */
  positionAddress: string;
  /** Position state at time of execution */
  position: PositionState;
  /** Timestamp of execution */
  timestamp: Date;
}

/**
 * Bot configuration settings
 */
export interface BotConfig {
  /** Solana RPC URL */
  rpcUrl: string;
  /** Commitment level for transactions */
  commitment: "processed" | "confirmed" | "finalized";
  /** Slippage tolerance as percentage (e.g., 0.5 for 0.5%) */
  slippageTolerance: number;
  /** Whether to enable verbose logging */
  verbose?: boolean;
}

/**
 * Token metadata for oracle and mint resolution
 */
export interface TokenInfo {
  /** Token symbol (e.g., "SOL") */
  symbol: string;
  /** Token mint address */
  mint: string;
  /** Oracle address (DOVES or Pythnet) */
  oracle: string;
  /** Token decimals */
  decimals: number;
}

/**
 * Oracle price data
 */
export interface OraclePrice {
  /** Price in USD with decimals */
  price: number;
  /** Confidence interval */
  confidence?: number;
  /** Timestamp of price */
  timestamp: Date;
}

/**
 * Position close parameters
 * TODO: Implement in Phase 3
 */
export interface ClosePositionParams {
  /** Position account address */
  positionAddress: string;
  /** Amount to close (percentage or absolute) */
  amount?: number;
  /** Whether to close entire position */
  closeAll?: boolean;
}

/**
 * Limit order parameters
 * TODO: Implement in Phase 3
 */
export interface CreateLimitOrderParams {
  /** Trading symbol */
  symbol: string;
  /** Order direction */
  isLong: boolean;
  /** Collateral amount in USD */
  collateralUsd: number;
  /** Leverage multiplier */
  leverage: number;
  /** Trigger price */
  triggerPrice: number;
}

/**
 * Stop Loss / Take Profit parameters
 * TODO: Implement in Phase 3
 */
export interface CreateTPSLParams {
  /** Position account address */
  positionAddress: string;
  /** Stop loss price (optional) */
  stopLoss?: number;
  /** Take profit price (optional) */
  takeProfit?: number;
}
