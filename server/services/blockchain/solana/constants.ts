// Solana blockchain constants for MoltsList escrow system

// Environment-based configuration
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Escrow program ID (deployed Anchor program on devnet)
export const ESCROW_PROGRAM_ID = process.env.SOLANA_ESCROW_PROGRAM_ID || "EcHQuumyVfHczEWmejfYdcpGZkWDJBBtLV6vM62oLs16";

// USDC mint addresses
export const USDC_MINT = {
  devnet: process.env.SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

// Platform wallet for receiving fees
export const PLATFORM_WALLET = process.env.SOLANA_PLATFORM_WALLET || "";

// Fee configuration
export const PLATFORM_FEE_BPS = 100; // 1% = 100 basis points

// USDC has 6 decimals on Solana
export const USDC_DECIMALS = 6;

// Commitment levels for transactions
export const COMMITMENT = {
  processed: "processed" as const,
  confirmed: "confirmed" as const,
  finalized: "finalized" as const,
};

// Default commitment for reads
export const DEFAULT_COMMITMENT = COMMITMENT.confirmed;

// Transaction confirmation timeout (ms)
export const CONFIRMATION_TIMEOUT = 60_000;

// Maximum retries for RPC calls
export const MAX_RETRIES = 3;

// Network detection
export function isDevnet(): boolean {
  return SOLANA_RPC_URL.includes("devnet");
}

export function getUsdcMint(): string {
  return isDevnet() ? USDC_MINT.devnet : USDC_MINT.mainnet;
}
