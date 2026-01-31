import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { z } from "zod";

const PLATFORM_FEE_RATE = parseFloat(process.env.PLATFORM_FEE_RATE || "0.01");

export function registerEscrowRoutes(app: Express) {
  // Create escrow for a transaction
  app.post("/api/v1/escrow/create", authenticateAgent, async (req: any, res) => {
    const createSchema = z.object({
      transaction_id: z.string().uuid("Invalid transaction ID"),
      chain: z.enum(["solana", "base"]),
      amount_usd: z.number().positive("Amount must be positive"),
      buyer_address: z.string().min(1, "Buyer address required"),
      seller_address: z.string().min(1, "Seller address required"),
    });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { transaction_id, chain, amount_usd, buyer_address, seller_address } = parsed.data;

    // Verify transaction exists and is in valid state
    const transaction = await storage.getTransaction(transaction_id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
      });
    }

    // Buyer must be the one creating escrow
    if (transaction.buyerId !== req.agent.id) {
      return res.status(403).json({
        success: false,
        error: "Only the buyer can create escrow",
      });
    }

    // Check if escrow already exists
    const existingEscrow = await storage.getEscrowByTransaction(transaction_id);
    if (existingEscrow) {
      return res.status(400).json({
        success: false,
        error: "Escrow already exists for this transaction",
        escrow_id: existingEscrow.id,
      });
    }

    // Convert USD to lamports (USDC has 6 decimals on Solana)
    const amountLamports = Math.floor(amount_usd * 1_000_000).toString();

    const escrow = await storage.createEscrow({
      transactionId: transaction_id,
      chain,
      currency: "USDC",
      amountLamports,
      amountUsd: amount_usd.toString(),
      buyerAddress: buyer_address,
      sellerAddress: seller_address,
    });

    await storage.logEscrowEvent(
      escrow.id,
      "created",
      null,
      "pending",
      undefined,
      undefined,
      { amount_usd, chain }
    );

    await storage.logActivity({
      eventType: "escrow",
      eventAction: "created",
      agentId: req.agent.id,
      referenceId: escrow.id,
      summary: `Escrow created for ${amount_usd} USDC on ${chain}`,
      metadata: { chain, amount_usd },
    });

    return res.json({
      success: true,
      escrow: {
        id: escrow.id,
        transaction_id: escrow.transactionId,
        chain: escrow.chain,
        currency: escrow.currency,
        amount_lamports: escrow.amountLamports,
        amount_usd: escrow.amountUsd,
        buyer_address: escrow.buyerAddress,
        seller_address: escrow.sellerAddress,
        status: escrow.status,
        created_at: escrow.createdAt,
      },
      next_step: "Fund the escrow by sending USDC and submitting the transaction signature to POST /api/v1/escrow/:id/fund",
    });
  });

  // Submit funding transaction signature
  app.post("/api/v1/escrow/:id/fund", authenticateAgent, async (req: any, res) => {
    const fundSchema = z.object({
      tx_signature: z.string().min(1, "Transaction signature required"),
    });

    const parsed = fundSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { tx_signature } = parsed.data;

    const escrow = await storage.getEscrow(req.params.id);
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: "Escrow not found",
      });
    }

    const transaction = await storage.getTransaction(escrow.transactionId);
    if (!transaction || transaction.buyerId !== req.agent.id) {
      return res.status(403).json({
        success: false,
        error: "Only the buyer can fund the escrow",
      });
    }

    if (escrow.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Cannot fund escrow in '${escrow.status}' status`,
        hint: "Escrow must be in 'pending' status to fund",
      });
    }

    const updatedEscrow = await storage.updateEscrowStatus(escrow.id, "funded", {
      fundingTxSig: tx_signature,
    });

    await storage.logEscrowEvent(
      escrow.id,
      "funded",
      escrow.status,
      "funded",
      tx_signature,
      undefined,
      {}
    );

    await storage.logActivity({
      eventType: "escrow",
      eventAction: "funded",
      agentId: req.agent.id,
      referenceId: escrow.id,
      summary: `Escrow funded with ${escrow.amountUsd} USDC`,
      metadata: { tx_signature },
    });

    return res.json({
      success: true,
      escrow: {
        id: updatedEscrow!.id,
        status: updatedEscrow!.status,
        funding_tx_sig: updatedEscrow!.fundingTxSig,
        funded_at: updatedEscrow!.fundedAt,
      },
      next_step: "Escrow will be verified on-chain. Check status with GET /api/v1/escrow/:id",
    });
  });

  // Verify escrow on-chain (called by verifier service or manually)
  app.post("/api/v1/escrow/:id/verify", authenticateAgent, async (req: any, res) => {
    const verifySchema = z.object({
      block_number: z.string().optional(),
      escrow_pda: z.string().optional(),
    });

    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { block_number, escrow_pda } = parsed.data;

    const escrow = await storage.getEscrow(req.params.id);
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: "Escrow not found",
      });
    }

    if (escrow.status !== "funded") {
      return res.status(400).json({
        success: false,
        error: `Cannot verify escrow in '${escrow.status}' status`,
        hint: "Escrow must be in 'funded' status to verify",
      });
    }

    const updatedEscrow = await storage.updateEscrowStatus(escrow.id, "verified", {
      escrowPda: escrow_pda || escrow.escrowPda,
    });

    await storage.logEscrowEvent(
      escrow.id,
      "verified",
      escrow.status,
      "verified",
      escrow.fundingTxSig || undefined,
      block_number,
      { escrow_pda }
    );

    return res.json({
      success: true,
      escrow: {
        id: updatedEscrow!.id,
        status: updatedEscrow!.status,
        escrow_pda: updatedEscrow!.escrowPda,
        verified_at: updatedEscrow!.verifiedAt,
      },
      message: "Escrow verified on-chain. Funds are locked until work is completed.",
    });
  });

  // Release escrow funds to seller
  app.post("/api/v1/escrow/:id/release", authenticateAgent, async (req: any, res) => {
    const releaseSchema = z.object({
      tx_signature: z.string().optional(),
    });

    const parsed = releaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { tx_signature } = parsed.data;

    const escrow = await storage.getEscrow(req.params.id);
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: "Escrow not found",
      });
    }

    const transaction = await storage.getTransaction(escrow.transactionId);
    if (!transaction || transaction.buyerId !== req.agent.id) {
      return res.status(403).json({
        success: false,
        error: "Only the buyer can release the escrow",
      });
    }

    if (escrow.status !== "verified") {
      return res.status(400).json({
        success: false,
        error: `Cannot release escrow in '${escrow.status}' status`,
        hint: "Escrow must be in 'verified' status to release",
      });
    }

    // Calculate fee split
    const totalLamports = BigInt(escrow.amountLamports);
    const platformFeeLamports = (totalLamports * BigInt(Math.floor(PLATFORM_FEE_RATE * 10000))) / BigInt(10000);
    const sellerLamports = totalLamports - platformFeeLamports;

    const updatedEscrow = await storage.updateEscrowStatus(escrow.id, "released", {
      releaseTxSig: tx_signature,
      sellerAmount: sellerLamports.toString(),
      platformFee: platformFeeLamports.toString(),
    });

    await storage.logEscrowEvent(
      escrow.id,
      "released",
      escrow.status,
      "released",
      tx_signature,
      undefined,
      {
        seller_amount: sellerLamports.toString(),
        platform_fee: platformFeeLamports.toString(),
      }
    );

    // Award karma to seller
    await storage.addKarma(transaction.sellerId, 10, "completions");

    await storage.logActivity({
      eventType: "escrow",
      eventAction: "released",
      agentId: req.agent.id,
      targetAgentId: transaction.sellerId,
      referenceId: escrow.id,
      summary: `Escrow released: ${escrow.amountUsd} USDC`,
      metadata: {
        seller_amount_lamports: sellerLamports.toString(),
        platform_fee_lamports: platformFeeLamports.toString(),
      },
    });

    return res.json({
      success: true,
      escrow: {
        id: updatedEscrow!.id,
        status: updatedEscrow!.status,
        release_tx_sig: updatedEscrow!.releaseTxSig,
        seller_amount: updatedEscrow!.sellerAmount,
        platform_fee: updatedEscrow!.platformFee,
        released_at: updatedEscrow!.releasedAt,
      },
      message: "Escrow released. Seller has received funds minus platform fee.",
    });
  });

  // Refund escrow to buyer
  app.post("/api/v1/escrow/:id/refund", authenticateAgent, async (req: any, res) => {
    const refundSchema = z.object({
      tx_signature: z.string().optional(),
      reason: z.string().optional(),
    });

    const parsed = refundSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { tx_signature, reason } = parsed.data;

    const escrow = await storage.getEscrow(req.params.id);
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: "Escrow not found",
      });
    }

    const transaction = await storage.getTransaction(escrow.transactionId);

    // Only seller can initiate refund, or buyer if in disputed state
    const isSeller = transaction?.sellerId === req.agent.id;
    const isBuyerDisputed = transaction?.buyerId === req.agent.id && escrow.status === "disputed";

    if (!isSeller && !isBuyerDisputed) {
      return res.status(403).json({
        success: false,
        error: "Only the seller can refund the escrow",
        hint: "Buyers can only initiate refund after dispute resolution",
      });
    }

    if (!["funded", "verified", "disputed"].includes(escrow.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot refund escrow in '${escrow.status}' status`,
        hint: "Escrow must be in 'funded', 'verified', or 'disputed' status to refund",
      });
    }

    const updatedEscrow = await storage.updateEscrowStatus(escrow.id, "refunded", {
      releaseTxSig: tx_signature,
    });

    await storage.logEscrowEvent(
      escrow.id,
      "refunded",
      escrow.status,
      "refunded",
      tx_signature,
      undefined,
      { reason }
    );

    await storage.logActivity({
      eventType: "escrow",
      eventAction: "refunded",
      agentId: req.agent.id,
      targetAgentId: transaction?.buyerId,
      referenceId: escrow.id,
      summary: `Escrow refunded: ${escrow.amountUsd} USDC`,
      metadata: { reason },
    });

    return res.json({
      success: true,
      escrow: {
        id: updatedEscrow!.id,
        status: updatedEscrow!.status,
        release_tx_sig: updatedEscrow!.releaseTxSig,
        released_at: updatedEscrow!.releasedAt,
      },
      message: "Escrow refunded. Buyer has received funds back.",
    });
  });

  // Get escrow details
  app.get("/api/v1/escrow/:id", authenticateAgent, async (req: any, res) => {
    const escrow = await storage.getEscrow(req.params.id);
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: "Escrow not found",
      });
    }

    const transaction = await storage.getTransaction(escrow.transactionId);

    // Only buyer or seller can view escrow details
    if (
      transaction?.buyerId !== req.agent.id &&
      transaction?.sellerId !== req.agent.id
    ) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to view this escrow",
      });
    }

    const events = await storage.getEscrowEvents(escrow.id);

    return res.json({
      success: true,
      escrow: {
        id: escrow.id,
        transaction_id: escrow.transactionId,
        chain: escrow.chain,
        currency: escrow.currency,
        amount_lamports: escrow.amountLamports,
        amount_usd: escrow.amountUsd,
        buyer_address: escrow.buyerAddress,
        seller_address: escrow.sellerAddress,
        escrow_pda: escrow.escrowPda,
        status: escrow.status,
        funding_tx_sig: escrow.fundingTxSig,
        release_tx_sig: escrow.releaseTxSig,
        seller_amount: escrow.sellerAmount,
        platform_fee: escrow.platformFee,
        created_at: escrow.createdAt,
        funded_at: escrow.fundedAt,
        verified_at: escrow.verifiedAt,
        released_at: escrow.releasedAt,
      },
      events: events.map(e => ({
        id: e.id,
        event_type: e.eventType,
        previous_status: e.previousStatus,
        new_status: e.newStatus,
        tx_signature: e.txSignature,
        block_number: e.blockNumber,
        created_at: e.createdAt,
      })),
    });
  });

  // Get escrow by transaction ID
  app.get("/api/v1/transactions/:transactionId/escrow", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.getTransaction(req.params.transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
      });
    }

    // Only buyer or seller can view escrow
    if (
      transaction.buyerId !== req.agent.id &&
      transaction.sellerId !== req.agent.id
    ) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to view this transaction's escrow",
      });
    }

    const escrow = await storage.getEscrowByTransaction(req.params.transactionId);
    if (!escrow) {
      return res.json({
        success: true,
        escrow: null,
        message: "No escrow for this transaction",
      });
    }

    return res.json({
      success: true,
      escrow: {
        id: escrow.id,
        chain: escrow.chain,
        currency: escrow.currency,
        amount_usd: escrow.amountUsd,
        status: escrow.status,
        created_at: escrow.createdAt,
      },
    });
  });
}
