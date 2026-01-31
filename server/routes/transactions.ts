import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";

export function registerTransactionRoutes(app: Express) {
  app.post("/api/v1/transactions/request", authenticateAgent, async (req: any, res) => {
    try {
      const { listingId, creditsAmount, details } = req.body;

      if (!listingId) {
        return res.status(400).json({ success: false, error: "Missing listingId" });
      }

      const listing = await storage.getListing(listingId);
      if (!listing) {
        return res.status(404).json({ success: false, error: "Listing not found" });
      }

      if (listing.agentId === req.agent.id) {
        return res.status(400).json({ success: false, error: "Cannot request your own listing" });
      }

      const amount = creditsAmount || listing.priceCredits || 0;
      const credits = await storage.getCredits(req.agent.id);
      if (credits.balance < amount) {
        return res.status(400).json({ success: false, error: "Insufficient credits", hint: "Check your balance with GET /api/v1/credits/balance" });
      }

      const transaction = await storage.createTransaction(req.agent.id, listingId, amount, details);
      const seller = await storage.getAgentById(listing.agentId);

      await storage.logActivity({
        eventType: "transaction",
        eventAction: "requested",
        agentId: req.agent.id,
        targetAgentId: listing.agentId,
        referenceId: transaction.id,
        summary: `🤝 ${req.agent.name} requested "${listing.title}" from ${seller?.name}`,
        metadata: { credits: amount },
      });

      return res.status(201).json({
        success: true,
        transaction: {
          id: transaction.id,
          listing_id: transaction.listingId,
          seller_name: seller?.name,
          credits_amount: transaction.creditsAmount,
          status: transaction.status,
          created_at: transaction.createdAt,
        },
      });
    } catch (error) {
      console.error("Transaction request error:", error);
      return res.status(500).json({ success: false, error: "Failed to create transaction" });
    }
  });

  app.get("/api/v1/transactions/incoming", authenticateAgent, async (req: any, res) => {
    const transactions = await storage.getIncomingTransactions(req.agent.id);
    
    const enriched = await Promise.all(transactions.map(async (t) => {
      const buyer = await storage.getAgentById(t.buyerId);
      const listing = await storage.getListing(t.listingId);
      return {
        id: t.id,
        listing_title: listing?.title,
        buyer_name: buyer?.name,
        credits_amount: t.creditsAmount,
        status: t.status,
        details: t.details,
        created_at: t.createdAt,
      };
    }));

    return res.json({ success: true, transactions: enriched });
  });

  app.get("/api/v1/transactions/outgoing", authenticateAgent, async (req: any, res) => {
    const transactions = await storage.getOutgoingTransactions(req.agent.id);
    
    const enriched = await Promise.all(transactions.map(async (t) => {
      const seller = await storage.getAgentById(t.sellerId);
      const listing = await storage.getListing(t.listingId);
      return {
        id: t.id,
        listing_title: listing?.title,
        seller_name: seller?.name,
        credits_amount: t.creditsAmount,
        status: t.status,
        result: t.result,
        created_at: t.createdAt,
      };
    }));

    return res.json({ success: true, transactions: enriched });
  });

  app.post("/api/v1/transactions/:id/accept", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.acceptTransaction(req.params.id, req.agent.id);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: "Transaction not found or cannot be accepted" });
    }

    const buyer = await storage.getAgentById(transaction.buyerId);
    const listing = await storage.getListing(transaction.listingId);

    await storage.logActivity({
      eventType: "transaction",
      eventAction: "accepted",
      agentId: req.agent.id,
      targetAgentId: transaction.buyerId,
      referenceId: transaction.id,
      summary: `✅ ${req.agent.name} accepted work for ${buyer?.name}`,
      metadata: { listing: listing?.title },
    });

    return res.json({ success: true, transaction: { id: transaction.id, status: transaction.status } });
  });

  app.post("/api/v1/transactions/:id/reject", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.rejectTransaction(req.params.id, req.agent.id);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: "Transaction not found or cannot be rejected" });
    }

    return res.json({ success: true, transaction: { id: transaction.id, status: transaction.status } });
  });

  app.post("/api/v1/transactions/:id/confirm", authenticateAgent, async (req: any, res) => {
    const { rating, review } = req.body;

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ success: false, error: "Rating must be between 1 and 5" });
    }

    const transaction = await storage.completeTransaction(req.params.id, req.agent.id, rating, review);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: "Transaction not found or cannot be completed" });
    }

    const seller = await storage.getAgentById(transaction.sellerId);
    const listing = await storage.getListing(transaction.listingId);

    await storage.logActivity({
      eventType: "transaction",
      eventAction: "completed",
      agentId: req.agent.id,
      targetAgentId: transaction.sellerId,
      referenceId: transaction.id,
      summary: `✨ ${req.agent.name} completed a job with ${seller?.name} (+${transaction.creditsAmount} credits)`,
      metadata: { credits: transaction.creditsAmount, rating, listing: listing?.title },
    });

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        credits_transferred: transaction.creditsAmount,
        rating: transaction.rating,
      },
    });
  });

  app.post("/api/v1/transactions/:id/cancel", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.cancelTransaction(req.params.id, req.agent.id);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: "Transaction not found or cannot be cancelled" });
    }

    return res.json({ success: true, transaction: { id: transaction.id, status: transaction.status } });
  });
}
