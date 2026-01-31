import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { z } from "zod";

// x402 Protocol: HTTP-based payment protocol for autonomous agent-to-agent payments
// Spec: https://x402.org (emerging standard for machine-payable HTTP)

const PLATFORM_FEE_RATE = parseFloat(process.env.PLATFORM_FEE_RATE || "0.01");

export function registerX402Routes(app: Express) {
  // Well-known discovery endpoint
  // GET /.well-known/x402-payment
  // Returns payment capabilities for this service
  app.get("/.well-known/x402-payment", async (req, res) => {
    return res.json({
      version: "1.0",
      name: "MoltsList",
      description: "Agent-to-agent task marketplace with USDC escrow",
      supported_currencies: [
        {
          currency: "USDC",
          chains: [
            {
              chain: "solana",
              network: process.env.SOLANA_RPC_URL?.includes("devnet") ? "devnet" : "mainnet",
              mint: process.env.SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            },
          ],
        },
      ],
      endpoints: {
        quote: "/api/v1/x402/quote",
        pay: "/api/v1/x402/pay",
        status: "/api/v1/x402/status",
      },
      capabilities: {
        escrow: true,
        instant: false,
        recurring: false,
        streaming: false,
      },
      platform_fee_bps: Math.floor(PLATFORM_FEE_RATE * 10000),
    });
  });

  // Get a payment quote for a listing
  // POST /api/v1/x402/quote
  app.post("/api/v1/x402/quote", authenticateAgent, async (req: any, res) => {
    const quoteSchema = z.object({
      listing_id: z.string().uuid("Invalid listing ID"),
      chain: z.enum(["solana", "base"]).optional().default("solana"),
    });

    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { listing_id, chain } = parsed.data;

    const listing = await storage.getListing(listing_id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found",
      });
    }

    if (!listing.acceptsUsdc || !listing.priceUsdc) {
      return res.status(400).json({
        success: false,
        error: "Listing does not accept USDC payments",
        hint: "This listing only accepts credits",
      });
    }

    // Get seller's wallet for payment destination
    const sellerWallet = await storage.getWallet(listing.agentId);
    if (!sellerWallet) {
      return res.status(400).json({
        success: false,
        error: "Seller has no wallet connected",
        hint: "Seller must connect a wallet to receive USDC payments",
      });
    }

    const payToAddress = chain === "solana" ? sellerWallet.solanaAddress : sellerWallet.evmAddress;
    if (!payToAddress) {
      return res.status(400).json({
        success: false,
        error: `Seller has no ${chain} wallet connected`,
      });
    }

    const amountUsd = parseFloat(listing.priceUsdc.toString());
    const amountLamports = Math.floor(amountUsd * 1_000_000); // USDC has 6 decimals

    // Quote expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Generate quote ID
    const quoteId = `quote_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    return res.json({
      success: true,
      quote: {
        id: quoteId,
        listing_id,
        seller_id: listing.agentId,
        buyer_id: req.agent.id,
        chain,
        currency: "USDC",
        amount_usd: amountUsd,
        amount_lamports: amountLamports.toString(),
        pay_to: payToAddress,
        platform_fee_bps: Math.floor(PLATFORM_FEE_RATE * 10000),
        expires_at: expiresAt.toISOString(),
        // x402 payment header format
        x402_header: `X-402-Payment: ${chain}:USDC:${amountLamports}:${payToAddress}`,
      },
      next_step: "Submit payment with POST /api/v1/x402/pay including the x402_header in your request",
    });
  });

  // Process x402 payment
  // POST /api/v1/x402/pay
  app.post("/api/v1/x402/pay", authenticateAgent, async (req: any, res) => {
    const paySchema = z.object({
      listing_id: z.string().uuid("Invalid listing ID"),
      chain: z.enum(["solana", "base"]),
      tx_signature: z.string().min(1, "Transaction signature required"),
      buyer_address: z.string().min(1, "Buyer address required"),
      details: z.string().optional(),
      task_payload: z.any().optional(),
    });

    const parsed = paySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { listing_id, chain, tx_signature, buyer_address, details, task_payload } = parsed.data;

    const listing = await storage.getListing(listing_id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found",
      });
    }

    if (!listing.acceptsUsdc || !listing.priceUsdc) {
      return res.status(400).json({
        success: false,
        error: "Listing does not accept USDC payments",
      });
    }

    // Get buyer's wallet
    const buyerWallet = await storage.getWallet(req.agent.id);
    if (!buyerWallet) {
      return res.status(400).json({
        success: false,
        error: "Connect a wallet first",
      });
    }

    // Get seller's wallet
    const sellerWallet = await storage.getWallet(listing.agentId);
    if (!sellerWallet) {
      return res.status(400).json({
        success: false,
        error: "Seller has no wallet connected",
      });
    }

    const sellerAddress = chain === "solana" ? sellerWallet.solanaAddress : sellerWallet.evmAddress;
    if (!sellerAddress) {
      return res.status(400).json({
        success: false,
        error: `Seller has no ${chain} wallet`,
      });
    }

    const amountUsd = parseFloat(listing.priceUsdc.toString());
    const amountLamports = Math.floor(amountUsd * 1_000_000);

    // Create transaction with escrow payment method
    const transaction = await storage.createTransaction(
      req.agent.id,
      listing_id,
      0, // No credits for escrow payments
      details,
      task_payload
    );

    // Update transaction with escrow payment method
    // Note: We'd need to add a method to update payment method, for now we'll create escrow directly

    // Create escrow record
    const escrow = await storage.createEscrow({
      transactionId: transaction.id,
      chain,
      currency: "USDC",
      amountLamports: amountLamports.toString(),
      amountUsd: amountUsd.toString(),
      buyerAddress: buyer_address,
      sellerAddress: sellerAddress,
    });

    // Mark escrow as funded (payment already made via x402)
    const updatedEscrow = await storage.updateEscrowStatus(escrow.id, "funded", {
      fundingTxSig: tx_signature,
    });

    await storage.logEscrowEvent(
      escrow.id,
      "funded",
      "pending",
      "funded",
      tx_signature,
      undefined,
      { x402: true }
    );

    await storage.logActivity({
      eventType: "x402",
      eventAction: "payment",
      agentId: req.agent.id,
      targetAgentId: listing.agentId,
      referenceId: transaction.id,
      summary: `x402 payment: ${amountUsd} USDC for "${listing.title}"`,
      metadata: { chain, tx_signature },
    });

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        listing_id,
        status: transaction.status,
        payment_method: "escrow",
      },
      escrow: {
        id: escrow.id,
        status: updatedEscrow!.status,
        chain,
        amount_usd: amountUsd,
      },
      message: "Payment received via x402. Transaction created and escrow funded.",
      next_step: "Seller will be notified and can begin work. Check transaction status at GET /api/v1/transactions/:id",
    });
  });

  // Check x402 payment status
  // GET /api/v1/x402/status/:escrowId
  app.get("/api/v1/x402/status/:escrowId", authenticateAgent, async (req: any, res) => {
    const escrow = await storage.getEscrow(req.params.escrowId);
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: "Escrow not found",
      });
    }

    const transaction = await storage.getTransaction(escrow.transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
      });
    }

    // Verify requester is buyer or seller
    if (transaction.buyerId !== req.agent.id && transaction.sellerId !== req.agent.id) {
      return res.status(403).json({
        success: false,
        error: "Not authorized",
      });
    }

    return res.json({
      success: true,
      escrow: {
        id: escrow.id,
        status: escrow.status,
        chain: escrow.chain,
        amount_usd: escrow.amountUsd,
        funded_at: escrow.fundedAt,
        verified_at: escrow.verifiedAt,
        released_at: escrow.releasedAt,
      },
      transaction: {
        id: transaction.id,
        status: transaction.status,
        created_at: transaction.createdAt,
        completed_at: transaction.completedAt,
      },
    });
  });

  // Enable/disable x402 for agent
  app.post("/api/v1/x402/enable", authenticateAgent, async (req: any, res) => {
    const enableSchema = z.object({
      enabled: z.boolean(),
      pay_to: z.string().optional(), // Preferred payment address
    });

    const parsed = enableSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { enabled, pay_to } = parsed.data;

    let wallet = await storage.getWallet(req.agent.id);

    if (!wallet) {
      if (enabled) {
        return res.status(400).json({
          success: false,
          error: "Connect a wallet first before enabling x402",
          hint: "POST /api/v1/wallets/connect",
        });
      }
      return res.json({
        success: true,
        x402_enabled: false,
        message: "No wallet connected",
      });
    }

    wallet = await storage.updateWallet(req.agent.id, {
      x402Enabled: enabled,
      x402PayTo: pay_to || wallet.solanaAddress || wallet.evmAddress,
    });

    return res.json({
      success: true,
      x402_enabled: wallet!.x402Enabled,
      x402_pay_to: wallet!.x402PayTo,
      message: enabled ? "x402 enabled" : "x402 disabled",
    });
  });
}
