import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { notifyTransactionEvent, loadTransactionData } from "../services/notifications";

const requestTransactionSchema = z.object({
  listingId: z.string().min(1, "listingId is required"),
  creditsAmount: z.number().optional(),
  details: z.string().optional(),
  taskPayload: z.any().optional(), // Free-form structured data
});

const progressSchema = z.object({
  progress: z.number().min(0).max(100, "Progress must be between 0 and 100"),
  statusMessage: z.string().optional(),
});

const deliverSchema = z.object({
  taskResult: z.any(), // Free-form structured result
  result: z.string().optional(), // Legacy text result
});

const revisionSchema = z.object({
  reason: z.string().optional(),
});

const confirmSchema = z.object({
  rating: z.number().min(1).max(5).optional(),
  review: z.string().optional(),
});

export function registerTransactionRoutes(app: Express) {
  // Request a transaction (buyer)
  app.post("/api/v1/transactions/request", authenticateAgent, async (req: any, res) => {
    try {
      const parsed = requestTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const { listingId, creditsAmount, details, taskPayload } = parsed.data;

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
        return res.status(400).json({
          success: false,
          error: "Insufficient credits",
          hint: "Check your balance with GET /api/v1/credits/balance",
        });
      }

      const transaction = await storage.createTransaction(
        req.agent.id,
        listingId,
        amount,
        details,
        taskPayload
      );

      // Send notifications
      const data = await loadTransactionData(transaction.id);
      if (data) {
        await notifyTransactionEvent("transaction.requested", data);
      }

      const seller = await storage.getAgentById(listing.agentId);

      return res.status(201).json({
        success: true,
        transaction: {
          id: transaction.id,
          listing_id: transaction.listingId,
          seller_name: seller?.name,
          credits_amount: transaction.creditsAmount,
          status: transaction.status,
          task_payload: transaction.taskPayload,
          created_at: transaction.createdAt,
        },
      });
    } catch (error) {
      console.error("Transaction request error:", error);
      return res.status(500).json({ success: false, error: "Failed to create transaction" });
    }
  });

  // Get transaction details
  app.get("/api/v1/transactions/:id", authenticateAgent, async (req: any, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);

      if (!transaction) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }

      // Only buyer or seller can view
      if (transaction.buyerId !== req.agent.id && transaction.sellerId !== req.agent.id) {
        return res.status(403).json({ success: false, error: "Not authorized to view this transaction" });
      }

      const [listing, buyer, seller] = await Promise.all([
        storage.getListing(transaction.listingId),
        storage.getAgentById(transaction.buyerId),
        storage.getAgentById(transaction.sellerId),
      ]);

      return res.json({
        success: true,
        transaction: {
          id: transaction.id,
          listing_id: transaction.listingId,
          listing_title: listing?.title,
          buyer_id: transaction.buyerId,
          buyer_name: buyer?.name,
          seller_id: transaction.sellerId,
          seller_name: seller?.name,
          status: transaction.status,
          credits_amount: transaction.creditsAmount,
          details: transaction.details,
          task_payload: transaction.taskPayload,
          result: transaction.result,
          task_result: transaction.taskResult,
          progress: transaction.progress,
          status_message: transaction.statusMessage,
          rating: transaction.rating,
          review: transaction.review,
          created_at: transaction.createdAt,
          accepted_at: transaction.acceptedAt,
          started_at: transaction.startedAt,
          delivered_at: transaction.deliveredAt,
          completed_at: transaction.completedAt,
        },
      });
    } catch (error) {
      console.error("Get transaction error:", error);
      return res.status(500).json({ success: false, error: "Failed to get transaction" });
    }
  });

  // List incoming transactions (seller view)
  app.get("/api/v1/transactions/incoming", authenticateAgent, async (req: any, res) => {
    const transactions = await storage.getIncomingTransactions(req.agent.id);

    const enriched = await Promise.all(
      transactions.map(async (t) => {
        const buyer = await storage.getAgentById(t.buyerId);
        const listing = await storage.getListing(t.listingId);
        return {
          id: t.id,
          listing_title: listing?.title,
          buyer_name: buyer?.name,
          credits_amount: t.creditsAmount,
          status: t.status,
          details: t.details,
          task_payload: t.taskPayload,
          progress: t.progress,
          status_message: t.statusMessage,
          created_at: t.createdAt,
          accepted_at: t.acceptedAt,
          started_at: t.startedAt,
        };
      })
    );

    return res.json({ success: true, transactions: enriched });
  });

  // List outgoing transactions (buyer view)
  app.get("/api/v1/transactions/outgoing", authenticateAgent, async (req: any, res) => {
    const transactions = await storage.getOutgoingTransactions(req.agent.id);

    const enriched = await Promise.all(
      transactions.map(async (t) => {
        const seller = await storage.getAgentById(t.sellerId);
        const listing = await storage.getListing(t.listingId);
        return {
          id: t.id,
          listing_title: listing?.title,
          seller_name: seller?.name,
          credits_amount: t.creditsAmount,
          status: t.status,
          result: t.result,
          task_result: t.taskResult,
          progress: t.progress,
          status_message: t.statusMessage,
          created_at: t.createdAt,
          delivered_at: t.deliveredAt,
          completed_at: t.completedAt,
        };
      })
    );

    return res.json({ success: true, transactions: enriched });
  });

  // Accept a transaction (seller)
  app.post("/api/v1/transactions/:id/accept", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.acceptTransaction(req.params.id, req.agent.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot be accepted",
        hint: "Transaction must be in 'requested' status",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.accepted", data);
    }

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        accepted_at: transaction.acceptedAt,
      },
      next_step: "Call POST /transactions/:id/start when you begin work",
    });
  });

  // Reject a transaction (seller)
  app.post("/api/v1/transactions/:id/reject", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.rejectTransaction(req.params.id, req.agent.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot be rejected",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.rejected", data);
    }

    return res.json({
      success: true,
      transaction: { id: transaction.id, status: transaction.status },
    });
  });

  // Start work on a transaction (seller)
  app.post("/api/v1/transactions/:id/start", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.startTransaction(req.params.id, req.agent.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot be started",
        hint: "Transaction must be in 'accepted' status",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.started", data);
    }

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        started_at: transaction.startedAt,
        progress: transaction.progress,
      },
      next_steps: [
        "Call POST /transactions/:id/progress to update progress (optional)",
        "Call POST /transactions/:id/deliver when work is complete",
      ],
    });
  });

  // Update progress (seller)
  app.post("/api/v1/transactions/:id/progress", authenticateAgent, async (req: any, res) => {
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { progress, statusMessage } = parsed.data;
    const transaction = await storage.updateTransactionProgress(
      req.params.id,
      req.agent.id,
      progress,
      statusMessage
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot update progress",
        hint: "Transaction must be in 'in_progress' status",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.progress", data);
    }

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        progress: transaction.progress,
        status_message: transaction.statusMessage,
      },
    });
  });

  // Deliver result (seller)
  app.post("/api/v1/transactions/:id/deliver", authenticateAgent, async (req: any, res) => {
    const parsed = deliverSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { taskResult, result } = parsed.data;
    const transaction = await storage.deliverTransaction(
      req.params.id,
      req.agent.id,
      taskResult,
      result
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot deliver",
        hint: "Transaction must be in 'in_progress' status",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.delivered", data);
    }

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        delivered_at: transaction.deliveredAt,
        task_result: transaction.taskResult,
      },
      message: "Awaiting buyer confirmation",
    });
  });

  // Request revision (buyer)
  app.post("/api/v1/transactions/:id/request-revision", authenticateAgent, async (req: any, res) => {
    const parsed = revisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { reason } = parsed.data;
    const transaction = await storage.requestRevision(req.params.id, req.agent.id, reason);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot request revision",
        hint: "Transaction must be in 'delivered' status",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.revision_requested", data);
    }

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        status_message: transaction.statusMessage,
      },
      message: "Revision requested, seller will be notified",
    });
  });

  // Confirm/complete transaction (buyer)
  app.post("/api/v1/transactions/:id/confirm", authenticateAgent, async (req: any, res) => {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { rating, review } = parsed.data;
    const transaction = await storage.completeTransaction(req.params.id, req.agent.id, rating, review);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot be completed",
        hint: "Transaction must be in 'accepted' or 'delivered' status",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.completed", data);
    }

    return res.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        credits_transferred: transaction.creditsAmount,
        rating: transaction.rating,
        completed_at: transaction.completedAt,
      },
      message: `${transaction.creditsAmount} credits transferred to seller`,
    });
  });

  // Cancel transaction (buyer)
  app.post("/api/v1/transactions/:id/cancel", authenticateAgent, async (req: any, res) => {
    const transaction = await storage.cancelTransaction(req.params.id, req.agent.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found or cannot be cancelled",
        hint: "Only 'requested' transactions can be cancelled",
      });
    }

    // Send notifications
    const data = await loadTransactionData(transaction.id);
    if (data) {
      await notifyTransactionEvent("transaction.cancelled", data);
    }

    return res.json({
      success: true,
      transaction: { id: transaction.id, status: transaction.status },
    });
  });
}
