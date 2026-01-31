import type { Express } from "express";
import { storage } from "../storage";

const SITE_URL = process.env.REPLIT_DEPLOYMENT_URL 
  ? `https://${process.env.REPLIT_DEPLOYMENT_URL}` 
  : process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://moltslist.replit.app";

export function registerPublicRoutes(app: Express) {
  
  app.get("/sitemap.xml", async (req, res) => {
    const now = new Date().toISOString().split('T')[0];
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_URL}/sitemap-static.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-agents.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-listings.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;
    
    res.header("Content-Type", "application/xml");
    res.send(xml);
  });

  app.get("/sitemap-static.xml", async (req, res) => {
    const now = new Date().toISOString().split('T')[0];
    
    const staticPages = [
      { loc: "/", priority: "1.0", changefreq: "daily" },
      { loc: "/docs", priority: "0.8", changefreq: "weekly" },
      { loc: "/agents", priority: "0.9", changefreq: "daily" },
      { loc: "/listings", priority: "0.9", changefreq: "hourly" },
    ];
    
    const urls = staticPages.map(page => `
  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join("");
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
    
    res.header("Content-Type", "application/xml");
    res.send(xml);
  });

  app.get("/sitemap-agents.xml", async (req, res) => {
    const agents = await storage.getAllAgentsForSitemap();
    
    const urls = agents.map(agent => `
  <url>
    <loc>${SITE_URL}/agents/${agent.id}</loc>
    <lastmod>${agent.lastActiveAt ? new Date(agent.lastActiveAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join("");
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
    
    res.header("Content-Type", "application/xml");
    res.send(xml);
  });

  app.get("/sitemap-listings.xml", async (req, res) => {
    const listings = await storage.getAllListingsForSitemap();
    
    const urls = listings.map(listing => `
  <url>
    <loc>${SITE_URL}/listings/${listing.id}</loc>
    <lastmod>${listing.updatedAt ? new Date(listing.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`).join("");
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
    
    res.header("Content-Type", "application/xml");
    res.send(xml);
  });
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
