// Solana escrow program interactions for MoltsList
// Handles creating, funding, releasing, and refunding escrows

import {
  ESCROW_PROGRAM_ID,
  PLATFORM_WALLET,
  PLATFORM_FEE_BPS,
  USDC_DECIMALS,
  getUsdcMint,
} from "./constants";
import { getConnection, deriveEscrowPda, getTransaction } from "./client";

// Escrow account state as stored on-chain
export interface EscrowAccountState {
  buyer: string;
  seller: string;
  amount: bigint;
  isInitialized: boolean;
  isFunded: boolean;
  isReleased: boolean;
  isRefunded: boolean;
  createdAt: number;
  fundedAt: number | null;
  releasedAt: number | null;
}

/**
 * Calculate escrow PDA for a transaction
 */
export async function calculateEscrowPda(
  buyerAddress: string,
  sellerAddress: string,
  transactionId: string
): Promise<string> {
  return deriveEscrowPda(buyerAddress, sellerAddress, transactionId);
}

/**
 * Parse escrow account data from on-chain
 * Note: This is a placeholder - actual implementation depends on the Anchor program IDL
 */
export async function getEscrowAccountState(escrowPda: string): Promise<EscrowAccountState | null> {
  try {
    const conn = await getConnection();
    const { PublicKey } = await import("@solana/web3.js");

    const accountInfo = await conn.getAccountInfo(new PublicKey(escrowPda));

    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    // TODO: Implement proper deserialization based on Anchor IDL
    // This is a placeholder structure
    // In production, use @coral-xyz/anchor to deserialize:
    // const program = new Program(idl, ESCROW_PROGRAM_ID, provider);
    // const escrowAccount = await program.account.escrow.fetch(escrowPda);

    return null;
  } catch (error) {
    console.error("Error fetching escrow account:", error);
    return null;
  }
}

/**
 * Build instruction to initialize escrow (unsigned)
 * Returns the transaction that the buyer needs to sign
 */
export async function buildInitializeEscrowIx(
  buyerAddress: string,
  sellerAddress: string,
  amountLamports: bigint,
  transactionId: string
): Promise<{
  escrowPda: string;
  instructions: string; // Serialized instructions for client to sign
}> {
  const escrowPda = await calculateEscrowPda(buyerAddress, sellerAddress, transactionId);

  // TODO: Implement actual instruction building
  // In production:
  // const program = new Program(idl, ESCROW_PROGRAM_ID, provider);
  // const ix = await program.methods
  //   .initialize(new BN(amountLamports.toString()))
  //   .accounts({
  //     buyer: buyerAddress,
  //     seller: sellerAddress,
  //     escrow: escrowPda,
  //     usdcMint: getUsdcMint(),
  //     buyerTokenAccount: buyerAta,
  //     escrowTokenAccount: escrowAta,
  //     systemProgram: SystemProgram.programId,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //     associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //   })
  //   .instruction();

  return {
    escrowPda,
    instructions: "placeholder - implement with Anchor",
  };
}

/**
 * Build instruction to fund escrow (buyer deposits USDC)
 */
export async function buildFundEscrowIx(
  buyerAddress: string,
  escrowPda: string,
  amountLamports: bigint
): Promise<{
  instructions: string;
}> {
  // TODO: Implement actual funding instruction
  // The buyer will transfer USDC to the escrow's token account

  return {
    instructions: "placeholder - implement with Anchor",
  };
}

/**
 * Build instruction to release escrow (buyer approves, funds go to seller)
 */
export async function buildReleaseEscrowIx(
  buyerAddress: string,
  sellerAddress: string,
  escrowPda: string
): Promise<{
  instructions: string;
  sellerAmount: bigint;
  platformFee: bigint;
}> {
  // Get escrow state to determine amount
  const escrowState = await getEscrowAccountState(escrowPda);

  if (!escrowState) {
    throw new Error("Escrow account not found");
  }

  // Calculate fee split
  const totalAmount = escrowState.amount;
  const platformFee = (totalAmount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  const sellerAmount = totalAmount - platformFee;

  // TODO: Implement actual release instruction
  // In production:
  // const ix = await program.methods
  //   .release()
  //   .accounts({
  //     buyer: buyerAddress,
  //     seller: sellerAddress,
  //     escrow: escrowPda,
  //     sellerTokenAccount: sellerAta,
  //     platformWallet: PLATFORM_WALLET,
  //     platformTokenAccount: platformAta,
  //     escrowTokenAccount: escrowAta,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //   })
  //   .instruction();

  return {
    instructions: "placeholder - implement with Anchor",
    sellerAmount,
    platformFee,
  };
}

/**
 * Build instruction to refund escrow (seller cancels, funds return to buyer)
 */
export async function buildRefundEscrowIx(
  buyerAddress: string,
  sellerAddress: string,
  escrowPda: string
): Promise<{
  instructions: string;
  refundAmount: bigint;
}> {
  const escrowState = await getEscrowAccountState(escrowPda);

  if (!escrowState) {
    throw new Error("Escrow account not found");
  }

  // TODO: Implement actual refund instruction

  return {
    instructions: "placeholder - implement with Anchor",
    refundAmount: escrowState.amount,
  };
}

/**
 * Convert USD amount to USDC lamports (6 decimals)
 */
export function usdToLamports(usdAmount: number): bigint {
  return BigInt(Math.floor(usdAmount * Math.pow(10, USDC_DECIMALS)));
}

/**
 * Convert USDC lamports to USD amount
 */
export function lamportsToUsd(lamports: bigint): number {
  return Number(lamports) / Math.pow(10, USDC_DECIMALS);
}

/**
 * Calculate platform fee from total amount
 */
export function calculatePlatformFee(totalLamports: bigint): {
  sellerAmount: bigint;
  platformFee: bigint;
} {
  const platformFee = (totalLamports * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  const sellerAmount = totalLamports - platformFee;
  return { sellerAmount, platformFee };
}
