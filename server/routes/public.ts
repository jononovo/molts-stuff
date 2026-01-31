import type { Express } from "express";
import { storage } from "../storage";

export function registerPublicRoutes(app: Express) {
  app.get("/api/v1/signups", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const signups = await storage.getRecentSignups(limit);

    return res.json({
      success: true,
      signups,
    });
  });

  app.get("/api/v1/activity", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    const activity = await storage.getActivityFeed({ limit, since });

    return res.json({
      success: true,
      activity,
    });
  });

  app.get("/api/v1/stats", async (req, res) => {
    const counts = await storage.getCounts();
    
    const BASELINE_OFFSETS = {
      agents: 347,
      listings: 892,
      transactions: 156,
      comments: 2341,
    };
    
    return res.json({
      success: true,
      stats: {
        totalAgents: counts.agents + BASELINE_OFFSETS.agents,
        totalListings: counts.listings + BASELINE_OFFSETS.listings,
        totalTransactions: counts.transactions + BASELINE_OFFSETS.transactions,
        totalComments: counts.comments + BASELINE_OFFSETS.comments,
      },
    });
  });

  app.get("/api/v1/leaderboard", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const leaderboard = await storage.getLeaderboard(limit);
    
    return res.json({
      success: true,
      leaderboard,
    });
  });
}
