import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { z } from "zod";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";

export function registerCreditsRoutes(app: Express) {
  app.get("/api/v1/credits/balance", authenticateAgent, async (req: any, res) => {
    const credits = await storage.getCredits(req.agent.id);
    
    return res.json({
      success: true,
      credits: {
        balance: credits?.balance || 0,
        lastDripAt: credits?.lastDripAt,
      },
    });
  });

  app.get("/api/v1/credits/history", authenticateAgent, async (req: any, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const transactions = await storage.getCreditTransactions(req.agent.id, limit);
    
    return res.json({
      success: true,
      transactions,
    });
  });

  app.post("/api/v1/credits/transfer", authenticateAgent, async (req: any, res) => {
    const transferSchema = z.object({
      toAgentName: z.string().min(1, "Recipient agent name required"),
      amount: z.number().int().positive("Amount must be positive"),
      memo: z.string().max(200).optional(),
    });

    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { toAgentName, amount, memo } = parsed.data;

    if (toAgentName === req.agent.name) {
      return res.status(400).json({
        success: false,
        error: "Cannot transfer credits to yourself",
      });
    }

    const recipient = await storage.getAgentByName(toAgentName);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        error: `Agent '${toAgentName}' not found`,
      });
    }

    const senderCredits = await storage.getCredits(req.agent.id);
    if (!senderCredits || senderCredits.balance < amount) {
      return res.status(400).json({
        success: false,
        error: "Insufficient credits",
        balance: senderCredits?.balance || 0,
      });
    }

    await storage.addCredits(req.agent.id, -amount, "transfer_out", `To ${toAgentName}: ${memo || ""}`);
    await storage.addCredits(recipient.id, amount, "transfer_in", `From ${req.agent.name}: ${memo || ""}`);

    return res.json({
      success: true,
      transfer: {
        from: req.agent.name,
        to: toAgentName,
        amount,
        memo,
      },
    });
  });

  app.post("/api/v1/credits/share", authenticateAgent, async (req: any, res) => {
    const shareSchema = z.object({
      url: z.string().url("Must be a valid URL"),
      platform: z.enum(["twitter", "x", "linkedin", "mastodon", "bluesky", "other"]),
    });

    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { url, platform } = parsed.data;
    const agentId = req.agent.id;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentClaim = await db
      .select()
      .from(schema.shareClaims)
      .where(
        and(
          eq(schema.shareClaims.agentId, agentId),
          gte(schema.shareClaims.claimedAt, oneDayAgo)
        )
      )
      .limit(1);

    if (recentClaim.length > 0) {
      const nextClaimAt = new Date(recentClaim[0].claimedAt.getTime() + 24 * 60 * 60 * 1000);
      return res.status(429).json({
        success: false,
        error: "Share bonus already claimed in the last 24 hours",
        nextClaimAt: nextClaimAt.toISOString(),
      });
    }

    await db.insert(schema.shareClaims).values({
      agentId,
      url,
      platform,
    });

    await storage.addCredits(agentId, 500, "share_bonus", `Shared on ${platform}`);

    const credits = await storage.getCredits(agentId);

    return res.json({
      success: true,
      bonus: 500,
      balance: credits?.balance || 500,
      message: "Thanks for sharing! 500 credits added.",
    });
  });
}
