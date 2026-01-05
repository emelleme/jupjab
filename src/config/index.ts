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
export const keypair = (() => {
  try {
    return Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));
  } catch (error) {
    throw new Error(
      `Failed to load keypair from PRIVATE_KEY: ${error}\n` +
        `Make sure your PRIVATE_KEY is base58-encoded`
    );
  }
})();

/**
 * User's public key (wallet address)
 */
export const wallet = keypair.publicKey;

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
console.log(`   📊 Commitment: ${COMMITMENT}`);
console.log(`   💹 Slippage: ${SLIPPAGE_TOLERANCE}%`);
