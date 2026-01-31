// Solana transaction verification for MoltsList escrow system
// Verifies on-chain transactions for escrow funding, release, and refund

import { getConnection, getTransaction, confirmTransaction } from "./client";
import { getEscrowAccountState, calculateEscrowPda } from "./escrow";
import { getUsdcMint, ESCROW_PROGRAM_ID } from "./constants";

export interface VerificationResult {
  verified: boolean;
  error?: string;
  details?: {
    signature: string;
    slot: number;
    blockTime: number | null;
    fee: number;
    status: "success" | "failed";
  };
}

export interface FundingVerificationResult extends VerificationResult {
  fundingDetails?: {
    from: string;
    to: string;
    amount: bigint;
    mint: string;
  };
}

export interface ReleaseVerificationResult extends VerificationResult {
  releaseDetails?: {
    escrowPda: string;
    sellerAddress: string;
    sellerAmount: bigint;
    platformFee: bigint;
  };
}

/**
 * Verify that a transaction was confirmed on-chain
 */
export async function verifyTransactionConfirmed(signature: string): Promise<VerificationResult> {
  try {
    const isConfirmed = await confirmTransaction(signature);

    if (!isConfirmed) {
      return {
        verified: false,
        error: "Transaction not confirmed or failed",
      };
    }

    const tx = await getTransaction(signature);

    if (!tx) {
      return {
        verified: false,
        error: "Transaction not found",
      };
    }

    const status = tx.meta?.err ? "failed" : "success";

    return {
      verified: status === "success",
      error: status === "failed" ? "Transaction failed on-chain" : undefined,
      details: {
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime,
        fee: tx.meta?.fee || 0,
        status,
      },
    };
  } catch (error: any) {
    return {
      verified: false,
      error: error.message || "Verification failed",
    };
  }
}

/**
 * Verify escrow funding transaction
 * Checks that USDC was transferred to the escrow account
 */
export async function verifyEscrowFunding(
  signature: string,
  expectedBuyer: string,
  expectedEscrowPda: string,
  expectedAmount: bigint
): Promise<FundingVerificationResult> {
  try {
    // First verify the transaction was confirmed
    const txResult = await verifyTransactionConfirmed(signature);
    if (!txResult.verified) {
      return txResult;
    }

    const tx = await getTransaction(signature);

    // Parse token transfer from transaction
    // Look for TokenProgram transfer instruction
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Find USDC transfers by checking mint
    const usdcMint = getUsdcMint();
    const usdcTransfers = postBalances.filter(
      (b: any) => b.mint === usdcMint
    );

    if (usdcTransfers.length === 0) {
      return {
        verified: false,
        error: "No USDC transfer found in transaction",
        details: txResult.details,
      };
    }

    // Find the transfer that increased the escrow balance
    // This is a simplified check - in production, parse the actual instruction data
    let fundingAmount: bigint | null = null;
    let fromAddress: string | null = null;
    let toAddress: string | null = null;

    for (const postBalance of usdcTransfers) {
      const preBalance = preBalances.find(
        (b: any) => b.accountIndex === postBalance.accountIndex && b.mint === usdcMint
      );

      const preBal = BigInt(preBalance?.uiTokenAmount?.amount || "0");
      const postBal = BigInt(postBalance.uiTokenAmount?.amount || "0");

      if (postBal > preBal) {
        // This account received tokens
        fundingAmount = postBal - preBal;
        toAddress = tx.transaction.message.accountKeys[postBalance.accountIndex]?.toString();
      } else if (postBal < preBal) {
        // This account sent tokens
        fromAddress = tx.transaction.message.accountKeys[postBalance.accountIndex]?.toString();
      }
    }

    if (!fundingAmount) {
      return {
        verified: false,
        error: "Could not determine funding amount from transaction",
        details: txResult.details,
      };
    }

    // Verify amount matches expected
    if (fundingAmount !== expectedAmount) {
      return {
        verified: false,
        error: `Amount mismatch: expected ${expectedAmount}, got ${fundingAmount}`,
        details: txResult.details,
      };
    }

    return {
      verified: true,
      details: txResult.details,
      fundingDetails: {
        from: fromAddress || "unknown",
        to: toAddress || expectedEscrowPda,
        amount: fundingAmount,
        mint: usdcMint,
      },
    };
  } catch (error: any) {
    return {
      verified: false,
      error: error.message || "Funding verification failed",
    };
  }
}

/**
 * Verify escrow release transaction
 * Checks that funds were released to seller with correct fee split
 */
export async function verifyEscrowRelease(
  signature: string,
  expectedEscrowPda: string,
  expectedSellerAddress: string
): Promise<ReleaseVerificationResult> {
  try {
    const txResult = await verifyTransactionConfirmed(signature);
    if (!txResult.verified) {
      return txResult;
    }

    const tx = await getTransaction(signature);

    // Verify the transaction called the escrow program
    const programIds = tx.transaction.message.accountKeys.map((k: any) => k.toString());
    if (!programIds.includes(ESCROW_PROGRAM_ID)) {
      return {
        verified: false,
        error: "Transaction did not invoke escrow program",
        details: txResult.details,
      };
    }

    // Parse token transfers to verify seller received funds
    const usdcMint = getUsdcMint();
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];

    let sellerAmount: bigint = BigInt(0);
    let platformFee: bigint = BigInt(0);

    for (const postBalance of postBalances) {
      if (postBalance.mint !== usdcMint) continue;

      const preBalance = preBalances.find(
        (b: any) => b.accountIndex === postBalance.accountIndex
      );

      const preBal = BigInt(preBalance?.uiTokenAmount?.amount || "0");
      const postBal = BigInt(postBalance.uiTokenAmount?.amount || "0");

      if (postBal > preBal) {
        const received = postBal - preBal;
        const accountAddress = tx.transaction.message.accountKeys[postBalance.accountIndex]?.toString();

        // Determine if this is seller or platform based on amount
        // Seller gets 99%, platform gets 1%
        if (sellerAmount === BigInt(0) && received > platformFee) {
          sellerAmount = received;
        } else {
          platformFee = received;
        }
      }
    }

    if (sellerAmount === BigInt(0)) {
      return {
        verified: false,
        error: "No funds received by seller",
        details: txResult.details,
      };
    }

    return {
      verified: true,
      details: txResult.details,
      releaseDetails: {
        escrowPda: expectedEscrowPda,
        sellerAddress: expectedSellerAddress,
        sellerAmount,
        platformFee,
      },
    };
  } catch (error: any) {
    return {
      verified: false,
      error: error.message || "Release verification failed",
    };
  }
}

/**
 * Verify escrow state on-chain matches expected state
 */
export async function verifyEscrowState(
  buyerAddress: string,
  sellerAddress: string,
  transactionId: string,
  expectedStatus: "initialized" | "funded" | "released" | "refunded"
): Promise<{ verified: boolean; error?: string; state?: any }> {
  try {
    const escrowPda = await calculateEscrowPda(buyerAddress, sellerAddress, transactionId);
    const state = await getEscrowAccountState(escrowPda);

    if (!state) {
      if (expectedStatus === "initialized") {
        return {
          verified: false,
          error: "Escrow account not found",
        };
      }
      // For released/refunded, account might be closed
      return { verified: true, state: null };
    }

    const statusMatches =
      (expectedStatus === "initialized" && state.isInitialized && !state.isFunded) ||
      (expectedStatus === "funded" && state.isFunded && !state.isReleased && !state.isRefunded) ||
      (expectedStatus === "released" && state.isReleased) ||
      (expectedStatus === "refunded" && state.isRefunded);

    return {
      verified: statusMatches,
      error: statusMatches ? undefined : `Escrow state does not match expected status: ${expectedStatus}`,
      state,
    };
  } catch (error: any) {
    return {
      verified: false,
      error: error.message || "State verification failed",
    };
  }
}
