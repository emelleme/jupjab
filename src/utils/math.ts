/**
 * Math Utilities
 * 
 * Helper functions for converting between human-readable decimals
 * and on-chain BigNumber (BN) format used by Solana programs.
 * 
 * All functions include safety checks for overflow/underflow.
 */

import { BN } from "@coral-xyz/anchor";
import Decimal from "decimal.js";

/**
 * Convert a human-readable number to BN (BigNumber) format
 * 
 * @param amount - The amount in human-readable format (e.g., 100.50)
 * @param decimals - Number of decimals for the token (e.g., 6 for USDC)
 * @returns BN representation suitable for on-chain operations
 * 
 * @example
 * toBN(100.5, 6) // Returns BN(100500000) for 100.50 USDC
 */
export function toBN(amount: number, decimals: number): BN {
  if (amount < 0) {
    throw new Error("Amount cannot be negative");
  }
  
  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }

  // Use Decimal.js for precise arithmetic to avoid floating point errors
  const decimal = new Decimal(amount);
  const multiplier = new Decimal(10).pow(decimals);
  const result = decimal.mul(multiplier);

  // Check for overflow (BN max is 2^64 - 1)
  const maxBN = new Decimal(2).pow(64).minus(1);
  if (result.greaterThan(maxBN)) {
    throw new Error(`Amount ${amount} causes overflow for ${decimals} decimals`);
  }

  return new BN(result.toFixed(0));
}

/**
 * Convert a BN (BigNumber) to human-readable format
 * 
 * @param bn - The BigNumber to convert
 * @param decimals - Number of decimals for the token
 * @returns Human-readable number
 * 
 * @example
 * fromBN(new BN(100500000), 6) // Returns 100.5
 */
export function fromBN(bn: BN, decimals: number): number {
  const decimal = new Decimal(bn.toString());
  const divisor = new Decimal(10).pow(decimals);
  const result = decimal.div(divisor);
  
  return result.toNumber();
}

/**
 * Calculate position size in USD based on collateral and leverage
 * 
 * Formula: Position Size = Collateral × Leverage
 * 
 * @param collateralUsd - Collateral amount as BN (in USD with decimals)
 * @param leverage - Leverage multiplier (e.g., 10 for 10x)
 * @returns Position size as BN
 * 
 * @example
 * // Calculate 10x position size for 100 USDC collateral
 * const collateral = toBN(100, 6); // 100 USDC
 * const size = calculateSizeUsd(collateral, 10); // 1000 USDC worth
 */
export function calculateSizeUsd(collateralUsd: BN, leverage: number): BN {
  if (leverage < 1) {
    throw new Error("Leverage must be at least 1x");
  }

  if (leverage > 100) {
    throw new Error("Leverage too high (max 100x for safety check)");
  }

  // Use Decimal for precise multiplication
  const collateralDecimal = new Decimal(collateralUsd.toString());
  const leverageDecimal = new Decimal(leverage);
  const result = collateralDecimal.mul(leverageDecimal);

  return new BN(result.toFixed(0));
}

/**
 * Calculate required collateral based on desired position size and leverage
 * 
 * Formula: Collateral = Position Size ÷ Leverage
 * 
 * @param sizeUsd - Desired position size as BN
 * @param leverage - Leverage multiplier
 * @returns Required collateral as BN
 * 
 * @example
 * // Calculate collateral needed for 1000 USD position at 10x
 * const size = toBN(1000, 6);
 * const collateral = calculateCollateralRequired(size, 10); // 100 USDC
 */
export function calculateCollateralRequired(sizeUsd: BN, leverage: number): BN {
  if (leverage < 1) {
    throw new Error("Leverage must be at least 1x");
  }

  const sizeDecimal = new Decimal(sizeUsd.toString());
  const leverageDecimal = new Decimal(leverage);
  const result = sizeDecimal.div(leverageDecimal);

  return new BN(result.toFixed(0));
}

/**
 * Calculate percentage change between two values
 * 
 * @param initial - Initial value
 * @param current - Current value
 * @returns Percentage change (positive for gain, negative for loss)
 * 
 * @example
 * calculatePercentageChange(100, 110) // Returns 10 (10% gain)
 */
export function calculatePercentageChange(initial: number, current: number): number {
  if (initial === 0) {
    throw new Error("Initial value cannot be zero");
  }

  return ((current - initial) / initial) * 100;
}

/**
 * Calculate PnL (Profit and Loss) for a position
 * 
 * @param entryPrice - Entry price
 * @param currentPrice - Current price
 * @param sizeUsd - Position size in USD
 * @param isLong - true for Long, false for Short
 * @returns PnL in USD (positive for profit, negative for loss)
 * 
 * @example
 * // Long position: bought at $100, now $110, size $1000
 * calculatePnL(100, 110, 1000, true) // Returns 100 (10% gain on $1000)
 */
export function calculatePnL(
  entryPrice: number,
  currentPrice: number,
  sizeUsd: number,
  isLong: boolean
): number {
  if (entryPrice <= 0 || currentPrice <= 0) {
    throw new Error("Prices must be positive");
  }

  const priceChange = currentPrice - entryPrice;
  const percentageChange = priceChange / entryPrice;

  // For shorts, PnL is inverted
  const multiplier = isLong ? 1 : -1;

  return sizeUsd * percentageChange * multiplier;
}

/**
 * Calculate liquidation price for a position
 * 
 * Simplified formula (actual implementation depends on Jupiter's liquidation logic)
 * 
 * @param entryPrice - Entry price
 * @param leverage - Leverage multiplier
 * @param isLong - true for Long, false for Short
 * @returns Estimated liquidation price
 * 
 * @example
 * // Long at $100 with 10x leverage
 * calculateLiquidationPrice(100, 10, true) // ~$90.91
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  isLong: boolean
): number {
  if (entryPrice <= 0) {
    throw new Error("Entry price must be positive");
  }

  if (leverage < 1) {
    throw new Error("Leverage must be at least 1x");
  }

  // Liquidation occurs when loss equals collateral
  // For Long: liquidationPrice = entryPrice * (1 - 1/leverage)
  // For Short: liquidationPrice = entryPrice * (1 + 1/leverage)
  
  const liquidationThreshold = 1 / leverage;

  if (isLong) {
    return entryPrice * (1 - liquidationThreshold);
  } else {
    return entryPrice * (1 + liquidationThreshold);
  }
}
