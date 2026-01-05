/**
 * Accounts Module
 *
 * Centralized account resolution for Jupiter Perpetuals.
 *
 * Phase 3 note:
 * Many instructions require a large set of accounts. This module focuses on
 * deterministically resolving those accounts (PDAs, custodies, oracles, ATAs)
 * so that the actions layer can focus on instruction/transaction construction.
 */

import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Address } from "@solana/kit";
import { createSolanaRpc } from "@solana/kit";

import { connection, JUPITER_PERPS_POOL, JUPITER_PERPS_PROGRAM_ID } from "../config";
import {
  fetchCustody,
  fetchPerpetuals,
  fetchPool,
  fetchPosition,
} from "../../jup-perps-client-js/src";

/**
 * Token mint addresses for supported trading pairs.
 */
export const TOKEN_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  BTC: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
};

/**
 * Token decimals for supported tokens.
 *
 * Note: These are token-unit decimals (SOL=9, USDC=6, etc.).
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  ETH: 8,
  BTC: 8,
};

/**
 * DOVES oracle addresses (resolved from on-chain custodies at generation time).
 * Prefer resolving dynamically via {@link resolveCustodyInfo}.
 */
export const DOVES_ORACLE_ADDRESSES: Record<string, string> = {
  SOL: "39cWjvHrpHNz2SbXv6ME4NPhqBDBd4KsjUYv5JkHEAJU",
  USDC: "A28T5pKtscnhDo6C1Sz786Tup88aTjt8uyKewjVvPrGk",
  USDT: "AGW7q2a3WxCzh5TB2Q6yNde1Nf41g3HLaaXdybz7cbBU",
  ETH: "5URYohbPy32nxK1t3jAHVNfdWY2xTubHiFvLrE3VhXEp",
  BTC: "4HBbPx9QJdjJ7GUe6bsiJjGybvfpDhQMMPXP1UEa7VT5",
};

const PERPETUALS_SEED = "perpetuals";
const TRANSFER_AUTHORITY_SEED = "transfer_authority";
const EVENT_AUTHORITY_SEED = "__event_authority";
const POSITION_REQUEST_SEED = "position_request";

const custodyInfoBySymbol = new Map<string, ResolvedCustodyInfo>();

function getRpc() {
  return createSolanaRpc(connection.rpcEndpoint);
}

function u64ToLeBytes(value: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

/**
 * Get the mint address for a given token symbol.
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
 * Get token decimals for a given symbol.
 */
export function getTokenDecimals(symbol: string): number {
  const decimals = TOKEN_DECIMALS[symbol.toUpperCase()];
  if (decimals === undefined) {
    throw new Error(`No decimals info for symbol: ${symbol}`);
  }
  return decimals;
}

/**
 * Derive the Perpetuals config PDA.
 */
export function findPerpetualsPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PERPETUALS_SEED)],
    JUPITER_PERPS_PROGRAM_ID
  );
}

/**
 * Derive the protocol transfer authority PDA.
 */
export function findTransferAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TRANSFER_AUTHORITY_SEED)],
    JUPITER_PERPS_PROGRAM_ID
  );
}

/**
 * Derive the Anchor event authority PDA.
 */
export function findEventAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(EVENT_AUTHORITY_SEED)],
    JUPITER_PERPS_PROGRAM_ID
  );
}

/**
 * Derive the Position PDA for a user and custody.
 * Seeds: ["position", owner, custody]
 */
export function findPositionPda(owner: PublicKey, custody: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), owner.toBuffer(), custody.toBuffer()],
    JUPITER_PERPS_PROGRAM_ID
  );
}

/**
 * Derive a PositionRequest PDA.
 *
 * Seed format is inferred from on-chain conventions.
 * Seeds: ["position_request", owner, counter(u64le)]
 */
export function findPositionRequestPda(
  owner: PublicKey,
  counter: bigint
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(POSITION_REQUEST_SEED), owner.toBuffer(), u64ToLeBytes(counter)],
    JUPITER_PERPS_PROGRAM_ID
  );
}

export type ResolvedCustodyInfo = {
  symbol: string;
  address: PublicKey;
  mint: PublicKey;
  tokenAccount: PublicKey;
  decimals: number;
  dovesOracle: PublicKey;
  pythOracle: PublicKey;
};

/**
 * Fetch the Perpetuals config account.
 */
export async function fetchPerpetualsConfig() {
  try {
    const rpc = getRpc();
    const [perpetualsPda] = findPerpetualsPda();
    return await fetchPerpetuals(rpc, perpetualsPda.toBase58() as Address);
  } catch (error) {
    throw new Error(`Failed to fetch Perpetuals config: ${error}`);
  }
}

/**
 * Fetch pool data.
 */
export async function fetchPoolData(poolAddress: PublicKey = JUPITER_PERPS_POOL) {
  try {
    const rpc = getRpc();
    const pool = await fetchPool(rpc, poolAddress.toBase58() as Address);
    return pool;
  } catch (error) {
    throw new Error(`Failed to fetch pool data: ${error}`);
  }
}

/**
 * Resolve custody information for a symbol (custody address + oracles + token account).
 */
export async function resolveCustodyInfo(
  symbol: string,
  poolAddress: PublicKey = JUPITER_PERPS_POOL
): Promise<ResolvedCustodyInfo> {
  const normalizedSymbol = symbol.toUpperCase();
  const cached = custodyInfoBySymbol.get(normalizedSymbol);
  if (cached) return cached;

  const mint = getMintAddress(normalizedSymbol);

  const pool = await fetchPoolData(poolAddress);
  const custodies = pool.data.custodies;

  const rpc = getRpc();

  for (const custodyAddr of custodies) {
    if (!custodyAddr) continue;

    try {
      const custody = await fetchCustody(rpc, custodyAddr as Address);
      if (custody.data.mint !== mint.toBase58()) continue;

      const resolved: ResolvedCustodyInfo = {
        symbol: normalizedSymbol,
        address: new PublicKey(custodyAddr),
        mint,
        tokenAccount: new PublicKey(custody.data.tokenAccount),
        decimals: custody.data.decimals,
        dovesOracle: new PublicKey(custody.data.dovesOracle),
        pythOracle: new PublicKey(custody.data.oracle.oracleAccount),
      };

      custodyInfoBySymbol.set(normalizedSymbol, resolved);
      return resolved;
    } catch {
      continue;
    }
  }

  throw new Error(`No custody found for ${normalizedSymbol} in pool ${poolAddress.toBase58()}`);
}

/**
 * Fetch the on-chain Position account.
 */
export async function fetchPositionAccount(positionAddress: PublicKey) {
  const rpc = getRpc();
  return await fetchPosition(rpc, positionAddress.toBase58() as Address);
}

/**
 * Resolve all accounts required by the `instantIncreasePosition` instruction.
 */
export async function resolveInstantIncreasePositionAccounts(
  symbol: string,
  owner: PublicKey,
  collateralSymbol: string = "USDC"
) {
  const custody = await resolveCustodyInfo(symbol);
  const collateralCustody = await resolveCustodyInfo(collateralSymbol);
  const [position] = findPositionPda(owner, custody.address);
  const [perpetuals] = findPerpetualsPda();
  const [eventAuthority] = findEventAuthorityPda();

  const fundingAccount = getAssociatedTokenAddressSync(
    collateralCustody.mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return {
    perpetuals,
    pool: JUPITER_PERPS_POOL,
    position,
    custody,
    collateralCustody,
    fundingAccount,
    eventAuthority,
  };
}

/**
 * Resolve all accounts required by the `instantDecreasePosition` instruction.
 */
export async function resolveInstantDecreasePositionAccounts(
  positionAddress: PublicKey,
  owner: PublicKey,
  desiredMintSymbol: string = "USDC"
) {
  const position = await fetchPositionAccount(positionAddress);
  const custodySymbol = position.data.custody;
  const collateralCustodySymbol = position.data.collateralCustody;

  const custody = await resolveCustodyInfoByAddress(custodySymbol);
  const collateralCustody = await resolveCustodyInfoByAddress(collateralCustodySymbol);

  const desiredMint = getMintAddress(desiredMintSymbol);
  const receivingAccount = getAssociatedTokenAddressSync(
    desiredMint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const [perpetuals] = findPerpetualsPda();
  const [transferAuthority] = findTransferAuthorityPda();
  const [eventAuthority] = findEventAuthorityPda();

  return {
    perpetuals,
    transferAuthority,
    eventAuthority,
    position,
    positionAddress,
    custody,
    collateralCustody,
    receivingAccount,
    desiredMint,
    pool: JUPITER_PERPS_POOL,
  };
}

/**
 * Resolve custody information from an on-chain custody address.
 */
export async function resolveCustodyInfoByAddress(
  custodyAddress: string,
  symbolHint?: string
): Promise<ResolvedCustodyInfo> {
  const rpc = getRpc();
  const custody = await fetchCustody(rpc, custodyAddress as Address);

  const mint = new PublicKey(custody.data.mint);
  const resolved: ResolvedCustodyInfo = {
    symbol: symbolHint ?? custody.data.mint,
    address: new PublicKey(custodyAddress),
    mint,
    tokenAccount: new PublicKey(custody.data.tokenAccount),
    decimals: custody.data.decimals,
    dovesOracle: new PublicKey(custody.data.dovesOracle),
    pythOracle: new PublicKey(custody.data.oracle.oracleAccount),
  };

  return resolved;
}

/**
 * Resolve accounts for `instantCreateLimitOrder`.
 */
export async function resolveInstantCreateLimitOrderAccounts(
  symbol: string,
  owner: PublicKey,
  counter: bigint,
  collateralSymbol: string = "USDC"
) {
  const custody = await resolveCustodyInfo(symbol);
  const collateralCustody = await resolveCustodyInfo(collateralSymbol);
  const [perpetuals] = findPerpetualsPda();
  const [eventAuthority] = findEventAuthorityPda();
  const [position] = findPositionPda(owner, custody.address);
  const [positionRequest] = findPositionRequestPda(owner, counter);

  const fundingAccount = getAssociatedTokenAddressSync(
    collateralCustody.mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const positionRequestAta = getAssociatedTokenAddressSync(
    collateralCustody.mint,
    positionRequest,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return {
    perpetuals,
    eventAuthority,
    pool: JUPITER_PERPS_POOL,
    custody,
    collateralCustody,
    position,
    positionRequest,
    positionRequestAta,
    fundingAccount,
    inputMint: collateralCustody.mint,
  };
}

/**
 * Resolve accounts for `instantCreateTpsl`.
 */
export async function resolveInstantCreateTpslAccounts(
  positionAddress: PublicKey,
  owner: PublicKey,
  counter: bigint,
  desiredMintSymbol: string = "USDC"
) {
  const position = await fetchPositionAccount(positionAddress);

  const custody = await resolveCustodyInfoByAddress(position.data.custody);
  const collateralCustody = await resolveCustodyInfoByAddress(position.data.collateralCustody);
  const [perpetuals] = findPerpetualsPda();
  const [eventAuthority] = findEventAuthorityPda();
  const [positionRequest] = findPositionRequestPda(owner, counter);

  const desiredMint = getMintAddress(desiredMintSymbol);
  const receivingAccount = getAssociatedTokenAddressSync(
    desiredMint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const positionRequestAta = getAssociatedTokenAddressSync(
    desiredMint,
    positionRequest,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return {
    position,
    positionAddress,
    custody,
    collateralCustody,
    desiredMint,
    receivingAccount,
    positionRequest,
    positionRequestAta,
    pool: JUPITER_PERPS_POOL,
    perpetuals,
    eventAuthority,
  };
}

/**
 * Backwards-compatible helper used by earlier phases.
 * Prefer using the `resolveInstant*` helpers.
 */
export async function getPositionAccounts(symbol: string, owner: PublicKey) {
  const custody = await resolveCustodyInfo(symbol);
  const collateralCustody = await resolveCustodyInfo("USDC");
  const [position] = findPositionPda(owner, custody.address);

  return {
    pool: JUPITER_PERPS_POOL,
    position,
    custody: custody.address,
    oracle: custody.dovesOracle,
    mint: custody.mint,
    collateralCustody: collateralCustody.address,
    collateralOracle: collateralCustody.dovesOracle,
  };
}
