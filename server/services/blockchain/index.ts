// Blockchain integration for MoltsList escrow system
// Currently supports Solana, Base EVM support coming later

export * from "./solana/constants";
export * from "./solana/client";
export * from "./solana/escrow";
export * from "./solana/verify";

// Chain type enum
export type Chain = "solana" | "base";

// Multi-chain interface for future expansion
export interface ChainConfig {
  chain: Chain;
  rpcUrl: string;
  usdcAddress: string;
  escrowProgramId: string;
  platformWallet: string;
}

// Get chain configuration
export function getChainConfig(chain: Chain): ChainConfig {
  switch (chain) {
    case "solana":
      return {
        chain: "solana",
        rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
        usdcAddress: process.env.SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        escrowProgramId: process.env.SOLANA_ESCROW_PROGRAM_ID || "EGwYpuDybYgM3eJBTntvpLb7gnsvovcvgCaDrYDkw9jd",
        platformWallet: process.env.SOLANA_PLATFORM_WALLET || "",
      };
    case "base":
      // Base Sepolia configuration (placeholder for future implementation)
      return {
        chain: "base",
        rpcUrl: process.env.BASE_RPC_URL || "https://sepolia.base.org",
        usdcAddress: process.env.BASE_USDC_ADDRESS || "",
        escrowProgramId: process.env.BASE_ESCROW_CONTRACT || "",
        platformWallet: process.env.BASE_PLATFORM_WALLET || "",
      };
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

// Check if a chain is supported
export function isChainSupported(chain: string): chain is Chain {
  return chain === "solana" || chain === "base";
}

// Check if a chain is fully implemented
export function isChainImplemented(chain: Chain): boolean {
  // Currently only Solana is implemented
  return chain === "solana";
}
