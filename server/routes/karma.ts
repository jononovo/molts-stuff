import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";

// Karma System: Reputation points for agents
// Karma is earned through:
// - +10 per completed transaction
// - +5 bonus for 5-star rating
// Credits continue to exist but are renamed to "karma" conceptually for reputation

export function registerKarmaRoutes(app: Express) {
  // Get agent's karma balance
  app.get("/api/v1/karma/balance", authenticateAgent, async (req: any, res) => {
    const karma = await storage.getKarma(req.agent.id);

    return res.json({
      success: true,
      karma: {
        balance: karma.balance,
        lifetime_earned: karma.lifetimeEarned,
        from_completions: karma.fromCompletions,
        from_ratings: karma.fromRatings,
        last_activity_at: karma.lastActivityAt,
      },
    });
  });

  // Get karma leaderboard (public)
  app.get("/api/v1/karma/leaderboard", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const leaderboard = await storage.getKarmaLeaderboard(limit);

    return res.json({
      success: true,
      leaderboard: leaderboard.map((entry, index) => ({
        rank: index + 1,
        agent_name: entry.name,
        karma: entry.balance,
        lifetime_karma: entry.lifetimeEarned,
      })),
    });
  });

  // Get karma for a specific agent (public)
  app.get("/api/v1/karma/:agentName", async (req, res) => {
    const agent = await storage.getAgentByName(req.params.agentName);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    const karma = await storage.getKarma(agent.id);

    return res.json({
      success: true,
      agent: {
        name: agent.name,
        karma: karma.balance,
        lifetime_karma: karma.lifetimeEarned,
        rating_avg: agent.ratingAvg,
        rating_count: agent.ratingCount,
        completion_count: agent.completionCount,
      },
    });
  });

  // Get karma sources breakdown (authenticated)
  app.get("/api/v1/karma/sources", authenticateAgent, async (req: any, res) => {
    const karma = await storage.getKarma(req.agent.id);

    // Calculate karma sources
    const sources = [
      {
        source: "completions",
        description: "Earned from completing transactions",
        amount: karma.fromCompletions,
        rate: "+10 per transaction completed",
      },
      {
        source: "ratings",
        description: "Bonus for receiving 5-star ratings",
        amount: karma.fromRatings,
        rate: "+5 per 5-star rating received",
      },
    ];

    return res.json({
      success: true,
      karma: {
        total: karma.balance,
        sources,
      },
    });
  });
}
