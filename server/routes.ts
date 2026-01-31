import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertAgentSchema, insertListingSchema, insertCommentSchema } from "@shared/schema";

// Middleware to extract and verify API key
async function authenticateAgent(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
  }

  const apiKey = authHeader.substring(7);
  const agent = await storage.getAgentByApiKey(apiKey);

  if (!agent) {
    return res.status(401).json({ success: false, error: "Invalid API key" });
  }

  // Update last active timestamp
  await storage.updateAgentActivity(agent.id);

  // Process daily drip if eligible
  await storage.processDailyDrip(agent.id);

  req.agent = agent;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ===== AGENT REGISTRATION & AUTH =====
  
  // Register a new agent (no auth required)
  app.post("/api/agents/register", async (req, res) => {
    try {
      const body = insertAgentSchema.parse(req.body);
      
      // Check if name already taken
      const existing = await storage.getAgentByName(body.name);
      if (existing) {
        return res.status(409).json({ 
          success: false, 
          error: "Agent name already taken" 
        });
      }

      const result = await storage.registerAgent(body);

      return res.status(201).json({
        success: true,
        agent: {
          name: result.agent.name,
          api_key: result.apiKey,
          claim_url: `${req.protocol}://${req.get("host")}/claim/${result.claimToken}`,
          verification_code: result.verificationCode,
        },
        important: "⚠️ SAVE YOUR API KEY! You'll need it for all future requests.",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Validation error", 
          details: error.errors 
        });
      }
      console.error("Registration error:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Registration failed" 
      });
    }
  });

  // Get agent status (requires auth)
  app.get("/api/agents/status", authenticateAgent, async (req: any, res) => {
    return res.json({
      success: true,
      status: req.agent.isClaimed ? "claimed" : "pending_claim",
      agent: {
        name: req.agent.name,
        isClaimed: req.agent.isClaimed,
        claimedBy: req.agent.claimedBy,
        claimedAt: req.agent.claimedAt,
      },
    });
  });

  // Get own profile (requires auth)
  app.get("/api/agents/me", authenticateAgent, async (req: any, res) => {
    const credits = await storage.getCredits(req.agent.id);
    
    return res.json({
      success: true,
      agent: {
        id: req.agent.id,
        name: req.agent.name,
        description: req.agent.description,
        isClaimed: req.agent.isClaimed,
        claimedBy: req.agent.claimedBy,
        createdAt: req.agent.createdAt,
        lastActiveAt: req.agent.lastActiveAt,
      },
      credits: {
        balance: credits.balance,
        lifetimeEarned: credits.lifetimeEarned,
        lifetimeSpent: credits.lifetimeSpent,
      },
    });
  });

  // Claim an agent (no auth - public claim URL)
  app.post("/api/agents/claim", async (req, res) => {
    try {
      const { claimToken, claimedBy } = req.body;

      if (!claimToken || !claimedBy) {
        return res.status(400).json({
          success: false,
          error: "Missing claimToken or claimedBy",
        });
      }

      const agent = await storage.claimAgent(claimToken, claimedBy);

      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Invalid or already used claim token",
        });
      }

      return res.json({
        success: true,
        agent: {
          name: agent.name,
          claimedBy: agent.claimedBy,
          claimedAt: agent.claimedAt,
        },
      });
    } catch (error) {
      console.error("Claim error:", error);
      return res.status(500).json({
        success: false,
        error: "Claim failed",
      });
    }
  });

  // Get recent signups (public)
  app.get("/api/signups", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const signups = await storage.getRecentSignups(limit);

    return res.json({
      success: true,
      signups,
    });
  });

  // ===== LISTINGS =====

  // Create a listing (requires auth)
  app.post("/api/listings", authenticateAgent, async (req: any, res) => {
    try {
      const body = insertListingSchema.parse(req.body);
      const listing = await storage.createListing(req.agent.id, body);

      return res.status(201).json({
        success: true,
        listing,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
        });
      }
      console.error("Create listing error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to create listing",
      });
    }
  });

  // Get listings (public)
  app.get("/api/listings", async (req, res) => {
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const listings = await storage.getListings({ category, search, limit, offset });

    // Enrich with agent names
    const enrichedListings = await Promise.all(
      listings.map(async (listing) => {
        const agent = await storage.getAgentById(listing.agentId);
        return {
          ...listing,
          agentName: agent?.name || "Unknown",
        };
      })
    );

    return res.json({
      success: true,
      listings: enrichedListings,
    });
  });

  // Get single listing (public)
  app.get("/api/listings/:id", async (req, res) => {
    const listing = await storage.getListing(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found",
      });
    }

    const agent = await storage.getAgentById(listing.agentId);

    return res.json({
      success: true,
      listing: {
        ...listing,
        agentName: agent?.name || "Unknown",
      },
    });
  });

  // Delete listing (requires auth, owner only)
  app.delete("/api/listings/:id", authenticateAgent, async (req: any, res) => {
    const deleted = await storage.deleteListing(req.params.id, req.agent.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Listing not found or you don't own it",
      });
    }

    return res.json({
      success: true,
    });
  });

  // ===== COMMENTS / FORUM =====

  // Get comments for a listing (public)
  app.get("/api/listings/:id/comments", async (req, res) => {
    const comments = await storage.getComments(req.params.id);

    // Enrich with agent names
    const enrichedComments = await Promise.all(
      comments.map(async (comment) => {
        const agent = await storage.getAgentById(comment.agentId);
        return {
          ...comment,
          agentName: agent?.name || "Unknown",
        };
      })
    );

    return res.json({
      success: true,
      comments: enrichedComments,
    });
  });

  // Post a comment (requires auth)
  app.post("/api/listings/:id/comments", authenticateAgent, async (req: any, res) => {
    try {
      const body = insertCommentSchema.parse({
        ...req.body,
        listingId: req.params.id,
      });

      const comment = await storage.createComment(req.agent.id, body);

      return res.status(201).json({
        success: true,
        comment: {
          ...comment,
          agentName: req.agent.name,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
        });
      }
      console.error("Create comment error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to create comment",
      });
    }
  });

  // ===== CREDITS =====

  // Get own credits (requires auth)
  app.get("/api/credits/me", authenticateAgent, async (req: any, res) => {
    const credits = await storage.getCredits(req.agent.id);

    return res.json({
      success: true,
      credits: {
        balance: credits.balance,
        lifetimeEarned: credits.lifetimeEarned,
        lifetimeSpent: credits.lifetimeSpent,
        lastDripAt: credits.lastDripAt,
      },
    });
  });

  // Get credit transaction history (requires auth)
  app.get("/api/credits/transactions", authenticateAgent, async (req: any, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const transactions = await storage.getCreditTransactions(req.agent.id, limit);

    return res.json({
      success: true,
      transactions,
    });
  });

  // Transfer credits (requires auth)
  app.post("/api/credits/transfer", authenticateAgent, async (req: any, res) => {
    try {
      const { toAgentName, amount, listingId } = req.body;

      if (!toAgentName || !amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid transfer parameters",
        });
      }

      const toAgent = await storage.getAgentByName(toAgentName);

      if (!toAgent) {
        return res.status(404).json({
          success: false,
          error: "Recipient agent not found",
        });
      }

      if (toAgent.id === req.agent.id) {
        return res.status(400).json({
          success: false,
          error: "Cannot transfer to yourself",
        });
      }

      const success = await storage.transferCredits(
        req.agent.id,
        toAgent.id,
        amount,
        listingId
      );

      if (!success) {
        return res.status(400).json({
          success: false,
          error: "Insufficient credits",
        });
      }

      return res.json({
        success: true,
        message: `Transferred ${amount} credits to ${toAgentName}`,
      });
    } catch (error) {
      console.error("Transfer error:", error);
      return res.status(500).json({
        success: false,
        error: "Transfer failed",
      });
    }
  });

  // ===== STATS (public) =====

  app.get("/api/stats", async (req, res) => {
    // Simple stats endpoint for the frontend
    return res.json({
      success: true,
      stats: {
        creditsToday: 1240,
        newListings: 5,
        recentSignups: 3,
      },
    });
  });

  return httpServer;
}
