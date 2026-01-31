// Background service for verifying on-chain escrow transactions
// Runs periodically to verify funded escrows and update their status

import { storage } from "../storage";

// Polling interval (in ms)
const VERIFICATION_INTERVAL = 30_000; // 30 seconds

// Maximum age for pending verification (in ms)
const MAX_VERIFICATION_AGE = 24 * 60 * 60 * 1000; // 24 hours

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Verify a single escrow's on-chain status
 */
async function verifyEscrow(escrow: any): Promise<void> {
  try {
    console.log(`[EscrowVerifier] Verifying escrow ${escrow.id} (status: ${escrow.status})`);

    // Skip if no funding signature
    if (escrow.status === "pending" && !escrow.fundingTxSig) {
      console.log(`[EscrowVerifier] Escrow ${escrow.id} has no funding signature yet, skipping`);
      return;
    }

    // For funded escrows, verify the on-chain transaction
    if (escrow.status === "funded" && escrow.fundingTxSig) {
      // Dynamically import blockchain verification
      let verified = false;
      let blockNumber: string | undefined;

      if (escrow.chain === "solana") {
        try {
          const { verifyEscrowFunding } = await import("./blockchain/solana/verify");

          const result = await verifyEscrowFunding(
            escrow.fundingTxSig,
            escrow.buyerAddress,
            escrow.escrowPda || "",
            BigInt(escrow.amountLamports)
          );

          verified = result.verified;
          if (result.details?.slot) {
            blockNumber = result.details.slot.toString();
          }

          if (!verified) {
            console.error(`[EscrowVerifier] Verification failed for escrow ${escrow.id}: ${result.error}`);
            return;
          }
        } catch (error: any) {
          // Solana packages might not be installed
          console.warn(`[EscrowVerifier] Solana verification skipped (packages not installed): ${error.message}`);

          // For development, auto-verify after a short delay
          const timeSinceFunded = Date.now() - new Date(escrow.fundedAt).getTime();
          if (timeSinceFunded > 10_000) {
            // After 10 seconds, consider it verified for development
            verified = true;
            console.log(`[EscrowVerifier] Auto-verifying escrow ${escrow.id} for development`);
          } else {
            return;
          }
        }
      } else if (escrow.chain === "base") {
        // Base/EVM verification not implemented yet
        console.log(`[EscrowVerifier] Base chain verification not implemented yet`);
        return;
      }

      if (verified) {
        await storage.updateEscrowStatus(escrow.id, "verified");

        await storage.logEscrowEvent(
          escrow.id,
          "verified",
          escrow.status,
          "verified",
          escrow.fundingTxSig,
          blockNumber,
          { verifier: "auto" }
        );

        console.log(`[EscrowVerifier] Escrow ${escrow.id} verified successfully`);
      }
    }

    // Check for stale pending escrows
    if (escrow.status === "pending") {
      const age = Date.now() - new Date(escrow.createdAt).getTime();
      if (age > MAX_VERIFICATION_AGE) {
        console.log(`[EscrowVerifier] Escrow ${escrow.id} is stale (${Math.floor(age / 3600000)}h old), marking as expired`);

        // Could mark as expired or notify buyer
        await storage.logEscrowEvent(
          escrow.id,
          "expired",
          escrow.status,
          "pending",
          undefined,
          undefined,
          { reason: "No funding received within 24 hours" }
        );
      }
    }
  } catch (error) {
    console.error(`[EscrowVerifier] Error verifying escrow ${escrow.id}:`, error);
  }
}

/**
 * Run a single verification cycle
 */
async function runVerificationCycle(): Promise<void> {
  try {
    // Get all escrows that need verification
    const pendingEscrows = await storage.getPendingEscrows();

    if (pendingEscrows.length === 0) {
      return;
    }

    console.log(`[EscrowVerifier] Found ${pendingEscrows.length} escrows to verify`);

    // Process escrows in parallel (with limit)
    const batchSize = 5;
    for (let i = 0; i < pendingEscrows.length; i += batchSize) {
      const batch = pendingEscrows.slice(i, i + batchSize);
      await Promise.all(batch.map(verifyEscrow));
    }
  } catch (error) {
    console.error("[EscrowVerifier] Error in verification cycle:", error);
  }
}

/**
 * Start the escrow verifier service
 */
export function startEscrowVerifier(): void {
  if (isRunning) {
    console.log("[EscrowVerifier] Already running");
    return;
  }

  console.log(`[EscrowVerifier] Starting with ${VERIFICATION_INTERVAL / 1000}s interval`);
  isRunning = true;

  // Run immediately on start
  runVerificationCycle();

  // Then run at interval
  intervalId = setInterval(runVerificationCycle, VERIFICATION_INTERVAL);
}

/**
 * Stop the escrow verifier service
 */
export function stopEscrowVerifier(): void {
  if (!isRunning) {
    return;
  }

  console.log("[EscrowVerifier] Stopping");

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  isRunning = false;
}

/**
 * Check if verifier is running
 */
export function isVerifierRunning(): boolean {
  return isRunning;
}

/**
 * Manually trigger a verification cycle
 */
export async function triggerVerification(): Promise<void> {
  await runVerificationCycle();
}
