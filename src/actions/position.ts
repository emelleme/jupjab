/**
 * Position Actions Module
 *
 * Phase 3: Core trading logic.
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import Decimal from "decimal.js";

import {
  apiKeeper,
  apiKeeperKeypair,
  connection,
  JUPITER_PERPS_PROGRAM_ID,
  keeper,
  keeperKeypair,
  keypair,
  SLIPPAGE_TOLERANCE,
  wallet,
} from "../config";
import {
  fetchPositionAccount,
  resolveCustodyInfoByAddress,
  resolveInstantCreateLimitOrderAccounts,
  resolveInstantCreateTpslAccounts,
  resolveInstantDecreasePositionAccounts,
  resolveInstantIncreasePositionAccounts,
} from "../accounts";
import { calculatePnL, calculateSizeUsd, toBN } from "../utils/math";
import type {
  CreateLimitOrderParams,
  OpenPositionParams,
  PositionState,
  TradeResult,
} from "../utils/types";
import { fetchPythOraclePrice } from "../utils/pyth";
import { sendAndConfirmTransactionWithRetries } from "../utils/transactions";

import {
  Side,
  getInstantCreateLimitOrderInstructionDataEncoder,
  getInstantCreateTpslInstructionDataEncoder,
  getInstantDecreasePositionInstructionDataEncoder,
  getInstantIncreasePositionInstructionDataEncoder,
} from "../../jup-perps-client-js/src";

const USD_DECIMALS = 6;

function fromFixedU64(value: bigint, decimals: number): number {
  return new Decimal(value.toString())
    .div(new Decimal(10).pow(decimals))
    .toNumber();
}

function toFixedU64(value: number, decimals: number): bigint {
  return BigInt(toBN(value, decimals).toString());
}

function nowI64Seconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

async function maybeCreateAtaIx(params: {
  payer: PublicKey;
  ata: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): Promise<TransactionInstruction | null> {
  const info = await connection.getAccountInfo(params.ata);
  if (info) return null;

  return createAssociatedTokenAccountInstruction(
    params.payer,
    params.ata,
    params.owner,
    params.mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

function toWeb3Instruction(params: {
  programId: PublicKey;
  keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>;
  data: Uint8Array;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: params.programId,
    keys: params.keys,
    data: Buffer.from(params.data),
  });
}

function calculateIncreasePriceLimitWithSlippage(
  currentPrice: number,
  slippageTolerancePercent: number,
  isLong: boolean
): number {
  const multiplier = 1 + slippageTolerancePercent / 100;
  return isLong ? currentPrice * multiplier : currentPrice / multiplier;
}

function calculateDecreasePriceLimitWithSlippage(
  currentPrice: number,
  slippageTolerancePercent: number,
  isLongPosition: boolean
): number {
  const multiplier = 1 + slippageTolerancePercent / 100;
  return isLongPosition ? currentPrice / multiplier : currentPrice * multiplier;
}

/**
 * Open a new perpetual position (market-style) using Jupiter's `instantIncreasePosition`.
 *
 * This resolves all required PDAs/custodies/oracles and submits a fully-signed
 * Solana transaction.
 *
 * Notes:
 * - The "instant" instructions require both `keeper` and `apiKeeper` signatures.
 *   Configure these via `KEEPER_PRIVATE_KEY` and `API_KEEPER_PRIVATE_KEY`.
 * - Collateral is assumed to be USDC.
 *
 * @param params - Trading parameters.
 * @returns A {@link TradeResult} containing the signature and derived position state.
 */
export async function openPosition(params: OpenPositionParams): Promise<TradeResult> {
  const { symbol, collateralUsd, leverage, isLong, priceLimit } = params;

  console.log(`\n🚀 Opening ${leverage}x ${isLong ? "Long" : "Short"} ${symbol}...`);
  console.log(`   💰 Collateral: $${collateralUsd} (assumed USDC)`);

  const accounts = await resolveInstantIncreasePositionAccounts(symbol, wallet, "USDC");

  const collateralBn = toBN(collateralUsd, USD_DECIMALS);
  const sizeUsdBn = calculateSizeUsd(collateralBn, leverage);

  const sizeUsdDelta = BigInt(sizeUsdBn.toString());
  const collateralTokenDelta = BigInt(collateralBn.toString());

  const currentOraclePrice = await fetchPythOraclePrice(
    connection,
    accounts.custody.pythOracle
  );

  const resolvedPriceLimit =
    priceLimit ??
    calculateIncreasePriceLimitWithSlippage(
      currentOraclePrice.price,
      SLIPPAGE_TOLERANCE,
      isLong
    );

  const priceSlippage = toFixedU64(resolvedPriceLimit, USD_DECIMALS);

  const preInstructions: TransactionInstruction[] = [];

  const maybeFundingAtaIx = await maybeCreateAtaIx({
    payer: keypair.publicKey,
    ata: accounts.fundingAccount,
    owner: wallet,
    mint: accounts.collateralCustody.mint,
  });
  if (maybeFundingAtaIx) preInstructions.push(maybeFundingAtaIx);

  const data = getInstantIncreasePositionInstructionDataEncoder().encode({
    sizeUsdDelta,
    collateralTokenDelta,
    side: isLong ? Side.Long : Side.Short,
    priceSlippage,
    requestTime: nowI64Seconds(),
  });

  const placeholderOptional = JUPITER_PERPS_PROGRAM_ID;

  const ix = toWeb3Instruction({
    programId: JUPITER_PERPS_PROGRAM_ID,
    data,
    keys: [
      { pubkey: keeper, isSigner: true, isWritable: false },
      { pubkey: apiKeeper, isSigner: true, isWritable: false },
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: accounts.fundingAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.perpetuals, isSigner: false, isWritable: false },
      { pubkey: accounts.pool, isSigner: false, isWritable: true },
      { pubkey: accounts.position, isSigner: false, isWritable: true },
      { pubkey: accounts.custody.address, isSigner: false, isWritable: true },
      { pubkey: accounts.custody.dovesOracle, isSigner: false, isWritable: false },
      { pubkey: accounts.custody.pythOracle, isSigner: false, isWritable: false },
      {
        pubkey: accounts.collateralCustody.address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: accounts.collateralCustody.dovesOracle,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: accounts.collateralCustody.pythOracle,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: accounts.collateralCustody.tokenAccount,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: placeholderOptional, isSigner: false, isWritable: false },
      { pubkey: placeholderOptional, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: accounts.eventAuthority, isSigner: false, isWritable: false },
      { pubkey: JUPITER_PERPS_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });

  const tx = new Transaction().add(...preInstructions, ix);
  tx.feePayer = keeper;

  const signature = await sendAndConfirmTransactionWithRetries({
    connection,
    transaction: tx,
    signers: [keeperKeypair, apiKeeperKeypair, keypair],
  });

  const positionState = await getPositionState(accounts.position.toBase58());

  return {
    signature,
    positionAddress: accounts.position.toBase58(),
    position: positionState,
    timestamp: new Date(),
  };
}

/**
 * Close (decrease) an open position using Jupiter's `instantDecreasePosition`.
 *
 * @param positionAddress - The position PDA address.
 * @param amountPercent - Percent of the position to close (1-100).
 * @returns A {@link TradeResult} including the transaction signature.
 */
export async function closePosition(
  positionAddress: string,
  amountPercent: number = 100
): Promise<TradeResult> {
  if (amountPercent <= 0 || amountPercent > 100) {
    throw new Error(`amountPercent must be in (0, 100], got ${amountPercent}`);
  }

  const positionPubkey = new PublicKey(positionAddress);

  const accounts = await resolveInstantDecreasePositionAccounts(
    positionPubkey,
    wallet,
    "USDC"
  );

  const position = accounts.position.data;
  const isLongPosition = position.side === Side.Long;

  const sizeUsd = new Decimal(position.sizeUsd.toString())
    .mul(amountPercent)
    .div(100)
    .toFixed(0);
  const collateralUsd = new Decimal(position.collateralUsd.toString())
    .mul(amountPercent)
    .div(100)
    .toFixed(0);

  const sizeUsdDelta = BigInt(sizeUsd);
  const collateralUsdDelta = BigInt(collateralUsd);

  const currentOraclePrice = await fetchPythOraclePrice(
    connection,
    accounts.custody.pythOracle
  );

  const priceLimit = calculateDecreasePriceLimitWithSlippage(
    currentOraclePrice.price,
    SLIPPAGE_TOLERANCE,
    isLongPosition
  );

  const priceSlippage = toFixedU64(priceLimit, USD_DECIMALS);

  const preInstructions: TransactionInstruction[] = [];

  const maybeReceivingAtaIx = await maybeCreateAtaIx({
    payer: keypair.publicKey,
    ata: accounts.receivingAccount,
    owner: wallet,
    mint: accounts.desiredMint,
  });
  if (maybeReceivingAtaIx) preInstructions.push(maybeReceivingAtaIx);

  const placeholderOptional = JUPITER_PERPS_PROGRAM_ID;

  const data = getInstantDecreasePositionInstructionDataEncoder().encode({
    collateralUsdDelta,
    sizeUsdDelta,
    priceSlippage,
    entirePosition: amountPercent === 100 ? true : null,
    requestTime: nowI64Seconds(),
  });

  const ix = toWeb3Instruction({
    programId: JUPITER_PERPS_PROGRAM_ID,
    data,
    keys: [
      { pubkey: keeper, isSigner: true, isWritable: false },
      { pubkey: apiKeeper, isSigner: true, isWritable: false },
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: accounts.receivingAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.transferAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.perpetuals, isSigner: false, isWritable: false },
      { pubkey: accounts.pool, isSigner: false, isWritable: true },
      { pubkey: positionPubkey, isSigner: false, isWritable: true },
      { pubkey: accounts.custody.address, isSigner: false, isWritable: true },
      { pubkey: accounts.custody.dovesOracle, isSigner: false, isWritable: false },
      { pubkey: accounts.custody.pythOracle, isSigner: false, isWritable: false },
      {
        pubkey: accounts.collateralCustody.address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: accounts.collateralCustody.dovesOracle,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: accounts.collateralCustody.pythOracle,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: accounts.collateralCustody.tokenAccount,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: accounts.desiredMint, isSigner: false, isWritable: false },
      { pubkey: placeholderOptional, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: accounts.eventAuthority, isSigner: false, isWritable: false },
      { pubkey: JUPITER_PERPS_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });

  const tx = new Transaction().add(...preInstructions, ix);
  tx.feePayer = keeper;

  const signature = await sendAndConfirmTransactionWithRetries({
    connection,
    transaction: tx,
    signers: [keeperKeypair, apiKeeperKeypair, keypair],
  });

  let positionState: PositionState;
  try {
    positionState = await getPositionState(positionAddress);
  } catch {
    positionState = {
      direction: isLongPosition ? "long" : "short",
      sizeUsd: 0,
      collateralUsd: 0,
      entryPrice: 0,
    };
  }

  return {
    signature,
    positionAddress,
    position: positionState,
    timestamp: new Date(),
  };
}

/**
 * Create a limit order request using Jupiter's `instantCreateLimitOrder`.
 *
 * This creates a `PositionRequest` PDA plus its ATA (if missing) and submits the
 * request for later execution.
 *
 * @param params - Limit order parameters.
 * @returns The transaction signature.
 */
export async function createLimitOrder(params: CreateLimitOrderParams): Promise<string> {
  const { symbol, collateralUsd, leverage, isLong, triggerPrice } = params;

  const collateralBn = toBN(collateralUsd, USD_DECIMALS);
  const sizeUsdBn = calculateSizeUsd(collateralBn, leverage);

  const sizeUsdDelta = BigInt(sizeUsdBn.toString());
  const collateralTokenDelta = BigInt(collateralBn.toString());

  const counter = BigInt(Date.now());

  const accounts = await resolveInstantCreateLimitOrderAccounts(
    symbol,
    wallet,
    counter,
    "USDC"
  );

  const preInstructions: TransactionInstruction[] = [];

  const maybeFundingAtaIx = await maybeCreateAtaIx({
    payer: keypair.publicKey,
    ata: accounts.fundingAccount,
    owner: wallet,
    mint: accounts.inputMint,
  });
  if (maybeFundingAtaIx) preInstructions.push(maybeFundingAtaIx);

  const maybeRequestAtaIx = await maybeCreateAtaIx({
    payer: keypair.publicKey,
    ata: accounts.positionRequestAta,
    owner: accounts.positionRequest,
    mint: accounts.inputMint,
  });
  if (maybeRequestAtaIx) preInstructions.push(maybeRequestAtaIx);

  const data = getInstantCreateLimitOrderInstructionDataEncoder().encode({
    sizeUsdDelta,
    collateralTokenDelta,
    side: isLong ? Side.Long : Side.Short,
    triggerPrice: toFixedU64(triggerPrice, USD_DECIMALS),
    triggerAboveThreshold: !isLong,
    counter,
    requestTime: nowI64Seconds(),
  });

  const placeholderOptional = JUPITER_PERPS_PROGRAM_ID;

  const ix = toWeb3Instruction({
    programId: JUPITER_PERPS_PROGRAM_ID,
    data,
    keys: [
      { pubkey: keeper, isSigner: true, isWritable: false },
      { pubkey: apiKeeper, isSigner: true, isWritable: false },
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: accounts.fundingAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.perpetuals, isSigner: false, isWritable: false },
      { pubkey: accounts.pool, isSigner: false, isWritable: false },
      { pubkey: accounts.position, isSigner: false, isWritable: true },
      { pubkey: accounts.positionRequest, isSigner: false, isWritable: true },
      { pubkey: accounts.positionRequestAta, isSigner: false, isWritable: true },
      { pubkey: accounts.custody.address, isSigner: false, isWritable: false },
      { pubkey: accounts.custody.dovesOracle, isSigner: false, isWritable: false },
      { pubkey: accounts.custody.pythOracle, isSigner: false, isWritable: false },
      {
        pubkey: accounts.collateralCustody.address,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: accounts.inputMint, isSigner: false, isWritable: false },
      { pubkey: placeholderOptional, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: accounts.eventAuthority, isSigner: false, isWritable: false },
      { pubkey: JUPITER_PERPS_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });

  const tx = new Transaction().add(...preInstructions, ix);
  tx.feePayer = keeper;

  return await sendAndConfirmTransactionWithRetries({
    connection,
    transaction: tx,
    signers: [keeperKeypair, apiKeeperKeypair, keypair],
  });
}

/**
 * Create stop-loss and/or take-profit requests using Jupiter's `instantCreateTpsl`.
 *
 * If both `stopLoss` and `takeProfit` are provided, this will submit both
 * instructions in a single transaction.
 *
 * @param positionAddress - The position PDA address.
 * @param stopLoss - Optional stop loss trigger price (USD).
 * @param takeProfit - Optional take profit trigger price (USD).
 * @returns The transaction signature.
 */
export async function createTPSL(
  positionAddress: string,
  stopLoss?: number,
  takeProfit?: number
): Promise<string> {
  if (stopLoss === undefined && takeProfit === undefined) {
    throw new Error("At least one of stopLoss or takeProfit must be provided");
  }

  const positionPubkey = new PublicKey(positionAddress);
  const positionAccount = await fetchPositionAccount(positionPubkey);

  const isLongPosition = positionAccount.data.side === Side.Long;
  const sizeUsdDelta = positionAccount.data.sizeUsd;
  const collateralUsdDelta = positionAccount.data.collateralUsd;

  const createdAtas = new Set<string>();

  const buildForTrigger = async (
    triggerPrice: number,
    triggerAboveThreshold: boolean,
    counter: bigint
  ) => {
    const accounts = await resolveInstantCreateTpslAccounts(
      positionPubkey,
      wallet,
      counter,
      "USDC"
    );

    const preInstructions: TransactionInstruction[] = [];

    const maybeReceivingAtaIx = await maybeCreateAtaIx({
      payer: keypair.publicKey,
      ata: accounts.receivingAccount,
      owner: wallet,
      mint: accounts.desiredMint,
    });
    if (maybeReceivingAtaIx) {
      const key = accounts.receivingAccount.toBase58();
      if (!createdAtas.has(key)) {
        createdAtas.add(key);
        preInstructions.push(maybeReceivingAtaIx);
      }
    }

    const maybeRequestAtaIx = await maybeCreateAtaIx({
      payer: keypair.publicKey,
      ata: accounts.positionRequestAta,
      owner: accounts.positionRequest,
      mint: accounts.desiredMint,
    });
    if (maybeRequestAtaIx) preInstructions.push(maybeRequestAtaIx);

    const data = getInstantCreateTpslInstructionDataEncoder().encode({
      collateralUsdDelta,
      sizeUsdDelta,
      triggerPrice: toFixedU64(triggerPrice, USD_DECIMALS),
      triggerAboveThreshold,
      entirePosition: true,
      counter,
      requestTime: nowI64Seconds(),
    });

    const placeholderOptional = JUPITER_PERPS_PROGRAM_ID;

    const ix = toWeb3Instruction({
      programId: JUPITER_PERPS_PROGRAM_ID,
      data,
      keys: [
        { pubkey: keeper, isSigner: true, isWritable: false },
        { pubkey: apiKeeper, isSigner: true, isWritable: false },
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: accounts.receivingAccount, isSigner: false, isWritable: true },
        { pubkey: accounts.perpetuals, isSigner: false, isWritable: false },
        { pubkey: accounts.pool, isSigner: false, isWritable: true },
        { pubkey: positionPubkey, isSigner: false, isWritable: false },
        { pubkey: accounts.positionRequest, isSigner: false, isWritable: true },
        { pubkey: accounts.positionRequestAta, isSigner: false, isWritable: true },
        { pubkey: accounts.custody.address, isSigner: false, isWritable: false },
        { pubkey: accounts.custody.dovesOracle, isSigner: false, isWritable: false },
        { pubkey: accounts.custody.pythOracle, isSigner: false, isWritable: false },
        {
          pubkey: accounts.collateralCustody.address,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: accounts.desiredMint, isSigner: false, isWritable: false },
        { pubkey: placeholderOptional, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: accounts.eventAuthority, isSigner: false, isWritable: false },
        { pubkey: JUPITER_PERPS_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
    });

    return { preInstructions, ix };
  };

  const tx = new Transaction();
  tx.feePayer = keeper;

  if (stopLoss !== undefined) {
    const counter = BigInt(Date.now());
    const triggerAboveThreshold = isLongPosition ? false : true;
    const built = await buildForTrigger(stopLoss, triggerAboveThreshold, counter);
    tx.add(...built.preInstructions, built.ix);
  }

  if (takeProfit !== undefined) {
    const counter = BigInt(Date.now() + 1);
    const triggerAboveThreshold = isLongPosition ? true : false;
    const built = await buildForTrigger(takeProfit, triggerAboveThreshold, counter);
    tx.add(...built.preInstructions, built.ix);
  }

  return await sendAndConfirmTransactionWithRetries({
    connection,
    transaction: tx,
    signers: [keeperKeypair, apiKeeperKeypair, keypair],
  });
}

/**
 * Fetch and compute a human-readable position state.
 *
 * This fetches the on-chain {@link Position} account (generated client) and reads
 * the latest Pyth price for the position's custody.
 *
 * @param positionAddress - The position PDA address.
 */
export async function getPositionState(positionAddress: string): Promise<PositionState> {
  const positionPubkey = new PublicKey(positionAddress);
  const positionAccount = await fetchPositionAccount(positionPubkey);

  const custody = await resolveCustodyInfoByAddress(positionAccount.data.custody);

  const entryPrice = fromFixedU64(positionAccount.data.price, USD_DECIMALS);
  const sizeUsd = fromFixedU64(positionAccount.data.sizeUsd, USD_DECIMALS);
  const collateralUsd = fromFixedU64(positionAccount.data.collateralUsd, USD_DECIMALS);

  const currentOraclePrice = await fetchPythOraclePrice(
    connection,
    custody.pythOracle
  );

  const isLong = positionAccount.data.side === Side.Long;

  const unrealizedPnl = calculatePnL(entryPrice, currentOraclePrice.price, sizeUsd, isLong);

  return {
    direction: isLong ? "long" : "short",
    sizeUsd,
    collateralUsd,
    entryPrice,
    currentPrice: currentOraclePrice.price,
    unrealizedPnl,
  };
}
