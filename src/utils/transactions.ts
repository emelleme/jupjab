/**
 * Transaction Utilities
 */

import type { Commitment, Connection, Keypair, Signer, Transaction } from "@solana/web3.js";
import { withRetries } from "./retry";

export type SendTransactionOptions = {
  commitment?: Commitment;
  maxAttempts?: number;
};

function uniqueSigners(signers: readonly Signer[]): Signer[] {
  const out: Signer[] = [];
  const seen = new Set<string>();

  for (const signer of signers) {
    const key = signer.publicKey.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signer);
  }

  return out;
}

export async function sendAndConfirmTransactionWithRetries(params: {
  connection: Connection;
  transaction: Transaction;
  signers: readonly (Keypair | Signer)[];
  options?: SendTransactionOptions;
}): Promise<string> {
  const { connection, transaction, signers, options } = params;
  const commitment = options?.commitment ?? "confirmed";

  const signature = await withRetries(
    async () => {
      const latestBlockhash = await connection.getLatestBlockhash(commitment);
      transaction.recentBlockhash = latestBlockhash.blockhash;

      if (!transaction.feePayer) {
        transaction.feePayer = signers[0]?.publicKey;
      }

      transaction.sign(...uniqueSigners(signers));

      const sig = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: commitment,
      });

      const confirmation = await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        commitment
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return sig;
    },
    {
      maxAttempts: options?.maxAttempts ?? 5,
      onRetry: (error, attempt, delayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `⚠️  Transaction attempt ${attempt} failed: ${message}. Retrying in ${delayMs}ms...`
        );
      },
    }
  );

  return signature;
}
