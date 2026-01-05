/**
 * Pyth price parsing utilities.
 *
 * This implements a minimal subset of the Pyth "price" account parsing logic.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import type { OraclePrice } from "./types";
import { withRetries } from "./retry";

const PYTH_PRICE_EXPO_OFFSET = 20;
const PYTH_AGG_PRICE_OFFSET = 208;
const PYTH_AGG_CONF_OFFSET = 216;

function readI64LE(buffer: Buffer, offset: number): bigint {
  return buffer.readBigInt64LE(offset);
}

function readU64LE(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

export async function fetchPythOraclePrice(
  connection: Connection,
  priceAccount: PublicKey
): Promise<OraclePrice> {
  const info = await withRetries(
    async () => await connection.getAccountInfo(priceAccount),
    {
      maxAttempts: 3,
      baseDelayMs: 250,
      maxDelayMs: 1_500,
    }
  );

  if (!info?.data) {
    throw new Error(`Missing Pyth price account: ${priceAccount.toBase58()}`);
  }

  const buffer = Buffer.from(info.data);

  const expo = buffer.readInt32LE(PYTH_PRICE_EXPO_OFFSET);
  const price = readI64LE(buffer, PYTH_AGG_PRICE_OFFSET);
  const conf = readU64LE(buffer, PYTH_AGG_CONF_OFFSET);

  const decimalPrice = new Decimal(price.toString()).mul(
    new Decimal(10).pow(expo)
  );

  return {
    price: decimalPrice.toNumber(),
    confidence: new Decimal(conf.toString()).mul(new Decimal(10).pow(expo)).toNumber(),
    timestamp: new Date(),
  };
}
