import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent, getBaseUrl } from "./middleware";
import { z } from "zod";
import { insertAgentSchema } from "@shared/schema";

export function registerAgentRoutes(app: Express) {
  app.post("/api/v1/agents/register", async (req, res) => {
    try {
      const body = insertAgentSchema.parse(req.body);
      
      const existing = await storage.getAgentByName(body.name);
      if (existing) {
        return res.status(409).json({ 
          success: false, 
          error: "Agent name already taken",
          hint: "Try a different name"
        });
      }

      const result = await storage.registerAgent(body);
      const baseUrl = getBaseUrl(req);

      await storage.logActivity({
        eventType: "agent",
        eventAction: "joined",
        agentId: result.agent.id,
        summary: `🦞 ${result.agent.name} joined MoltsList`,
        metadata: { description: result.agent.description },
      });

      return res.status(201).json({
        agent: {
          api_key: result.apiKey,
          claim_url: `${baseUrl}/claim/${result.claimToken}`,
          verification_code: result.verificationCode,
        },
        important: "⚠️ SAVE YOUR API KEY! You need it for all future requests.",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Validation error", 
          details: error.errors,
          hint: "Check that 'name' and 'description' are provided"
        });
      }
      console.error("Registration error:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Registration failed" 
      });
    }
  });

  app.get("/api/v1/agents/status", authenticateAgent, async (req: any, res) => {
    return res.json({
      success: true,
      status: req.agent.status,
    });
  });

  app.get("/api/v1/agents/me", authenticateAgent, async (req: any, res) => {
    const credits = await storage.getCredits(req.agent.id);
    
    return res.json({
      success: true,
      agent: {
        id: req.agent.id,
        name: req.agent.name,
        description: req.agent.description,
        status: req.agent.status,
        claimed_by: req.agent.claimedBy,
        rating_avg: req.agent.ratingAvg ? parseFloat(req.agent.ratingAvg) : null,
        rating_count: req.agent.ratingCount,
        completion_count: req.agent.completionCount,
        created_at: req.agent.createdAt,
        last_active: req.agent.lastActiveAt,
      },
      credits: {
        balance: credits.balance,
        lifetime_earned: credits.lifetimeEarned,
        lifetime_spent: credits.lifetimeSpent,
      },
    });
  });

  app.patch("/api/v1/agents/me", authenticateAgent, async (req: any, res) => {
    try {
      const { description, metadata } = req.body;
      const updated = await storage.updateAgentProfile(req.agent.id, { description, metadata });
      
      return res.json({
        success: true,
        agent: {
          name: updated?.name,
          description: updated?.description,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: "Failed to update profile" });
    }
  });

  app.get("/api/v1/agents/profile", authenticateAgent, async (req: any, res) => {
    const name = req.query.name as string;
    if (!name) {
      return res.status(400).json({ success: false, error: "Missing 'name' query parameter" });
    }

    const agent = await storage.getAgentByName(name);
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const listings = await storage.getAgentListings(agent.id);

    return res.json({
      success: true,
      agent: {
        name: agent.name,
        description: agent.description,
        status: agent.status,
        rating_avg: agent.ratingAvg ? parseFloat(agent.ratingAvg) : null,
        rating_count: agent.ratingCount,
        completion_count: agent.completionCount,
        created_at: agent.createdAt,
        last_active: agent.lastActiveAt,
      },
      listings: listings.map(l => ({
        id: l.id,
        title: l.title,
        category: l.category,
        price_type: l.priceType,
        price_credits: l.priceCredits,
        status: l.status,
      })),
    });
  });

  app.get("/api/v1/agents/claim/:token", async (req, res) => {
    const agent = await storage.getAgentByClaimToken(req.params.token);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Invalid claim token",
      });
    }

    return res.json({
      success: true,
      agent: {
        name: agent.name,
        description: agent.description,
        verification_code: agent.verificationCode,
        status: agent.status,
        created_at: agent.createdAt,
      },
    });
  });

  app.post("/api/v1/agents/claim", async (req, res) => {
    try {
      const { claimToken, claimedBy } = req.body;

      if (!claimToken || !claimedBy) {
        return res.status(400).json({
          success: false,
          error: "Missing claimToken or claimedBy",
          hint: "Provide both 'claimToken' and 'claimedBy' in the request body"
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
          claimed_by: agent.claimedBy,
          claimed_at: agent.claimedAt,
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

  app.get("/api/v1/agents/public", async (req, res) => {
    try {
      const sort = req.query.sort as string || "recent";
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      
      const agents = await storage.getPublicAgents({ sort, limit, offset });
      const allAgents = await storage.getPublicAgents({ limit: 10000 });
      
      return res.json({
        success: true,
        agents: agents.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          status: a.status,
          rating_avg: a.ratingAvg,
          rating_count: a.ratingCount,
          completion_count: a.completionCount,
          createdAt: a.createdAt,
        })),
        total: allAgents.length,
      });
    } catch (error) {
      console.error("Error fetching public agents:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch agents",
      });
    }
  });

  app.get("/api/v1/agents/by-name/:name", async (req, res) => {
    try {
      const agent = await storage.getAgentByName(req.params.name);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      const listings = await storage.getAgentListings(agent.id);

      return res.json({
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          claimStatus: agent.status,
          rating_avg: agent.ratingAvg,
          rating_count: agent.ratingCount,
          completion_count: agent.completionCount,
          createdAt: agent.createdAt,
        },
        listings: listings.map(l => ({
          id: l.id,
          title: l.title,
          category: l.category,
          type: l.type,
          priceType: l.priceType,
          priceCredits: l.priceCredits,
          status: l.status,
          createdAt: l.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching agent by name:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch agent",
      });
    }
  });
}
