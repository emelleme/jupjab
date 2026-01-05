/**
 * Accounts Module
 * 
 * This module handles the complex task of finding and deriving Program Derived Addresses (PDAs)
 * and oracle accounts required for Jupiter Perpetuals operations.
 * 
 * PDAs are deterministic addresses derived from seeds and the program ID.
 * Getting these wrong will cause transaction failures, so this module centralizes the logic.
 */

import { PublicKey } from "@solana/web3.js";
import { connection, JUPITER_PERPS_PROGRAM_ID, JUPITER_PERPS_POOL } from "../config";
import { fetchPerpetuals, fetchPool, fetchCustody } from "../../jup-perps-client-js/src";
import type { Address } from "@solana/kit";
import { createSolanaRpc } from "@solana/kit";

/**
 * Token mint addresses for supported trading pairs
 * These are the standard SPL token mints on Solana mainnet
 */
export const TOKEN_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112", // Wrapped SOL
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // Wrapped ETH (Wormhole)
  BTC: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // Wrapped BTC (Wormhole)
};

/**
 * Oracle addresses (DOVES price feeds) for supported tokens
 * Jupiter Perps uses DOVES oracles for price feeds
 * 
 * Note: These addresses may change. Verify with Jupiter's documentation.
 * You can also fetch them dynamically from the Custody account data.
 */
export const ORACLE_ADDRESSES: Record<string, string> = {
  SOL: "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG", // SOL/USD DOVES Oracle
  USDC: "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD", // USDC/USD DOVES Oracle
  USDT: "3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL", // USDT/USD DOVES Oracle
  ETH: "JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB", // ETH/USD DOVES Oracle
  BTC: "GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU", // BTC/USD DOVES Oracle
};

/**
 * Token decimals for supported tokens
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  ETH: 8,
  BTC: 8,
};

/**
 * Get the mint address for a given token symbol
 * 
 * @param symbol - Token symbol (e.g., "SOL")
 * @returns PublicKey of the token mint
 * @throws Error if symbol is not supported
 */
export function getMintAddress(symbol: string): PublicKey {
  const mint = TOKEN_MINTS[symbol.toUpperCase()];
  if (!mint) {
    throw new Error(
      `Unsupported token symbol: ${symbol}\n` +
        `Supported: ${Object.keys(TOKEN_MINTS).join(", ")}`
    );
  }
  return new PublicKey(mint);
}

/**
 * Get the oracle address for a given token symbol
 * 
 * @param symbol - Token symbol (e.g., "SOL")
 * @returns PublicKey of the oracle account
 * @throws Error if symbol is not supported
 */
export function getOracleAddress(symbol: string): PublicKey {
  const oracle = ORACLE_ADDRESSES[symbol.toUpperCase()];
  if (!oracle) {
    throw new Error(
      `No oracle found for symbol: ${symbol}\n` +
        `Supported: ${Object.keys(ORACLE_ADDRESSES).join(", ")}`
    );
  }
  return new PublicKey(oracle);
}

/**
 * Get token decimals for a given symbol
 * 
 * @param symbol - Token symbol
 * @returns Number of decimals
 */
export function getTokenDecimals(symbol: string): number {
  const decimals = TOKEN_DECIMALS[symbol.toUpperCase()];
  if (decimals === undefined) {
    throw new Error(`No decimals info for symbol: ${symbol}`);
  }
  return decimals;
}

/**
 * Fetch the Perpetuals config account
 * This is the global configuration for Jupiter Perps
 * 
 * @returns Perpetuals account data
 */
export async function fetchPerpetualsConfig() {
  try {
    const rpc = createSolanaRpc(connection.rpcEndpoint);
    const config = await fetchPerpetuals(rpc, JUPITER_PERPS_PROGRAM_ID.toBase58() as Address);
    return config;
  } catch (error) {
    throw new Error(`Failed to fetch Perpetuals config: ${error}`);
  }
}

/**
 * Fetch pool data from the Jupiter Perps pool
 * 
 * @param poolAddress - Pool account address (defaults to Jupiter Labs pool)
 * @returns Pool account data
 */
export async function fetchPoolData(poolAddress: PublicKey = JUPITER_PERPS_POOL) {
  try {
    const rpc = createSolanaRpc(connection.rpcEndpoint);
    const pool = await fetchPool(rpc, poolAddress.toBase58() as Address);
    return pool;
  } catch (error) {
    throw new Error(`Failed to fetch pool data: ${error}`);
  }
}

/**
 * Find custody account for a given token in the pool
 * 
 * Custody accounts hold the actual tokens and metadata for each trading pair.
 * 
 * @param symbol - Token symbol
 * @param poolAddress - Pool account address
 * @returns Custody account address
 */
export async function findCustodyAddress(
  symbol: string,
  poolAddress: PublicKey = JUPITER_PERPS_POOL
): Promise<PublicKey> {
  try {
    const mint = getMintAddress(symbol);
    const pool = await fetchPoolData(poolAddress);

    // Iterate through custodies to find the one matching our mint
    for (const custodyAddr of pool.data.custodies) {
      if (!custodyAddr) continue;

      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const custody = await fetchCustody(rpc, custodyAddr as Address);
        
        if (custody.data.mint === mint.toBase58()) {
          return new PublicKey(custodyAddr);
        }
      } catch (err) {
        // Skip invalid custody accounts
        continue;
      }
    }

    throw new Error(`No custody found for ${symbol} in pool ${poolAddress.toBase58()}`);
  } catch (error) {
    throw new Error(`Failed to find custody for ${symbol}: ${error}`);
  }
}

/**
 * Derive Position PDA for a user and custody
 * 
 * Position accounts track a user's open position for a specific custody.
 * The PDA is derived from: ["position", owner, custody]
 * 
 * @param owner - User's wallet public key
 * @param custody - Custody account public key
 * @returns Position PDA and bump seed
 */
export function findPositionPDA(owner: PublicKey, custody: PublicKey): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      owner.toBuffer(),
      custody.toBuffer(),
    ],
    JUPITER_PERPS_PROGRAM_ID
  );

  return [pda, bump];
}

/**
 * Derive Custody PDA
 * 
 * Note: The generated client typically provides custody addresses directly
 * from the pool data. This function is here for completeness.
 * 
 * The actual derivation depends on Jupiter's implementation.
 * In practice, we fetch custodies from the Pool account.
 * 
 * @param pool - Pool public key
 * @param mint - Token mint public key
 * @returns Custody PDA and bump seed
 */
export function deriveCustodyPDA(pool: PublicKey, mint: PublicKey): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("custody"),
      pool.toBuffer(),
      mint.toBuffer(),
    ],
    JUPITER_PERPS_PROGRAM_ID
  );

  return [pda, bump];
}

/**
 * Derive Pool PDA
 * 
 * Note: Jupiter uses known pool addresses. This is for reference.
 * 
 * @param name - Pool name
 * @returns Pool PDA and bump seed
 */
export function derivePoolPDA(name: string): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(name)],
    JUPITER_PERPS_PROGRAM_ID
  );

  return [pda, bump];
}

/**
 * Get all required accounts for opening a position
 * 
 * This convenience function fetches/derives all accounts needed for the
 * instantIncreasePosition instruction.
 * 
 * @param symbol - Token symbol to trade
 * @param owner - User's wallet public key
 * @returns Object containing all required account addresses
 */
export async function getPositionAccounts(symbol: string, owner: PublicKey) {
  const mint = getMintAddress(symbol);
  const oracle = getOracleAddress(symbol);
  const custody = await findCustodyAddress(symbol);
  const [position] = findPositionPDA(owner, custody);
  const pool = JUPITER_PERPS_POOL;

  // For collateral custody (usually USDC), we need to find it separately
  // For now, we assume USDC as collateral
  const collateralCustody = await findCustodyAddress("USDC");
  const collateralOracle = getOracleAddress("USDC");

  return {
    pool,
    position,
    custody,
    oracle,
    mint,
    collateralCustody,
    collateralOracle,
  };
}
