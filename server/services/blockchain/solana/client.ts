// Solana RPC client for MoltsList escrow system
// Note: Requires @solana/web3.js to be installed

import {
  SOLANA_RPC_URL,
  DEFAULT_COMMITMENT,
  CONFIRMATION_TIMEOUT,
  MAX_RETRIES,
  getUsdcMint,
} from "./constants";
import type { Connection as SolanaConnection } from "@solana/web3.js";

// Lazy-loaded connection instance
let connection: SolanaConnection | null = null;

/**
 * Get or create a Solana RPC connection
 */
export async function getConnection(): Promise<SolanaConnection> {
  if (connection) {
    return connection;
  }

  try {
    // Dynamic import to avoid issues if package isn't installed
    const { Connection } = await import("@solana/web3.js");
    connection = new Connection(SOLANA_RPC_URL, {
      commitment: DEFAULT_COMMITMENT,
      confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT,
    });
    return connection;
  } catch (error) {
    throw new Error(
      "Solana web3.js is not installed. Run: npm install @solana/web3.js @solana/spl-token bs58"
    );
  }
}

/**
 * Get SOL balance for an address
 */
export async function getSolBalance(address: string): Promise<number> {
  const conn = await getConnection();
  const { PublicKey } = await import("@solana/web3.js");
  const pubkey = new PublicKey(address);
  const balance = await conn.getBalance(pubkey, DEFAULT_COMMITMENT);
  return balance / 1e9; // Convert lamports to SOL
}

/**
 * Get USDC balance for an address
 */
export async function getUsdcBalance(ownerAddress: string): Promise<number> {
  try {
    const conn = await getConnection();
    const { PublicKey } = await import("@solana/web3.js");
    const { getAssociatedTokenAddress } = await import("@solana/spl-token");

    const owner = new PublicKey(ownerAddress);
    const mint = new PublicKey(getUsdcMint());

    const ata = await getAssociatedTokenAddress(mint, owner);
    const accountInfo = await conn.getTokenAccountBalance(ata, DEFAULT_COMMITMENT);

    return Number(accountInfo.value.uiAmount || 0);
  } catch (error: any) {
    // Account might not exist yet
    if (error.message?.includes("could not find account")) {
      return 0;
    }
    throw error;
  }
}

/**
 * Check if an address is valid Solana address
 */
export async function isValidAddress(address: string): Promise<boolean> {
  try {
    const { PublicKey } = await import("@solana/web3.js");
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get transaction details by signature
 */
export async function getTransaction(signature: string): Promise<any> {
  const conn = await getConnection();

  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const tx = await conn.getTransaction(signature, {
        commitment: DEFAULT_COMMITMENT,
        maxSupportedTransactionVersion: 0,
      });
      return tx;
    } catch (error: any) {
      retries++;
      if (retries >= MAX_RETRIES) {
        throw error;
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
}

/**
 * Confirm a transaction with timeout
 */
export async function confirmTransaction(signature: string): Promise<boolean> {
  const conn = await getConnection();

  try {
    const result = await conn.confirmTransaction(signature, DEFAULT_COMMITMENT);
    return !result.value.err;
  } catch (error) {
    console.error("Transaction confirmation failed:", error);
    return false;
  }
}

/**
 * Get current slot/block height
 */
export async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const conn = await getConnection();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash(DEFAULT_COMMITMENT);
  return { blockhash, lastValidBlockHeight };
}

/**
 * Derive PDA for escrow account
 */
export async function deriveEscrowPda(
  buyer: string,
  seller: string,
  transactionId: string
): Promise<string> {
  const { PublicKey } = await import("@solana/web3.js");
  const { ESCROW_PROGRAM_ID } = await import("./constants");

  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      new PublicKey(buyer).toBuffer(),
      new PublicKey(seller).toBuffer(),
      Buffer.from(transactionId.slice(0, 32)), // Use first 32 chars of transaction ID
    ],
    new PublicKey(ESCROW_PROGRAM_ID)
  );

  return pda.toBase58();
}
