/**
 * Configuration Module
 * 
 * This module handles the core setup for interacting with Jupiter Perpetuals:
 * - Solana RPC connection
 * - Wallet/Keypair loading from environment
 * - Program constants and addresses
 * 
 * All environment variables must be set before importing this module.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

function loadKeypairFromEnv(envKey: string): Keypair {
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`Missing required environment variable: ${envKey}`);
  }

  try {
    return Keypair.fromSecretKey(bs58.decode(value));
  } catch (error) {
    throw new Error(
      `Failed to load keypair from ${envKey}: ${error}\n` +
        `Make sure your ${envKey} is base58-encoded`
    );
  }
}

// Load environment variables
dotenv.config();

/**
 * Jupiter Perpetuals Program ID
 * This is the on-chain address of the Jupiter Perps program
 */
export const JUPITER_PERPS_PROGRAM_ID = new PublicKey(
  "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"
);

/**
 * Known Jupiter Perps Pool Address
 * This is the main Jupiter Labs Perpetuals Markets pool
 */
export const JUPITER_PERPS_POOL = new PublicKey(
  "5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq"
);

/**
 * Validates that all required environment variables are set
 * @throws Error if any required environment variable is missing
 */
function validateEnvironment(): void {
  const required = ["PRIVATE_KEY", "RPC_URL"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        `Please create a .env file based on .env.example`
    );
  }
}

// Validate environment before proceeding
validateEnvironment();

/**
 * RPC Connection Configuration
 */
export const RPC_URL = process.env.RPC_URL!;
export const COMMITMENT = (process.env.COMMITMENT as any) || "confirmed";

/**
 * Solana RPC Connection
 * Used for all on-chain queries and transaction submissions
 */
export const connection = new Connection(RPC_URL, COMMITMENT);

/**
 * User Wallet Keypair
 * Loaded from base58-encoded PRIVATE_KEY environment variable
 */
export const keypair = loadKeypairFromEnv("PRIVATE_KEY");

/**
 * Keeper keypair.
 *
 * The Jupiter "instant" instructions require both `keeper` and `apiKeeper`
 * signers. In production, these are typically managed by an API/keeper service.
 *
 * If you do not have keeper keys, this defaults to the user keypair.
 */
export const keeperKeypair = process.env.KEEPER_PRIVATE_KEY
  ? loadKeypairFromEnv("KEEPER_PRIVATE_KEY")
  : keypair;

/**
 * API keeper keypair.
 *
 * If you do not have API keeper keys, this defaults to the user keypair.
 */
export const apiKeeperKeypair = process.env.API_KEEPER_PRIVATE_KEY
  ? loadKeypairFromEnv("API_KEEPER_PRIVATE_KEY")
  : keypair;

/**
 * User's public key (wallet address)
 */
export const wallet = keypair.publicKey;

export const keeper = keeperKeypair.publicKey;
export const apiKeeper = apiKeeperKeypair.publicKey;

/**
 * Slippage tolerance (percentage)
 * Used for market orders to prevent excessive slippage
 */
export const SLIPPAGE_TOLERANCE = parseFloat(
  process.env.SLIPPAGE_TOLERANCE || "0.5"
);

/**
 * Log configuration on module load (for debugging)
 */
console.log("✅ Configuration loaded:");
console.log(`   📡 RPC: ${RPC_URL}`);
console.log(`   🔑 Wallet: ${wallet.toBase58()}`);
console.log(`   🧾 Keeper: ${keeper.toBase58()}`);
console.log(`   🧾 API Keeper: ${apiKeeper.toBase58()}`);
console.log(`   📊 Commitment: ${COMMITMENT}`);
console.log(`   💹 Slippage: ${SLIPPAGE_TOLERANCE}%`);
