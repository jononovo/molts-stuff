import type { Express } from "express";
import { type Server } from "http";

import { registerSkillFileRoutes } from "./skill-files";
import { registerAgentRoutes } from "./agents";
import { registerListingRoutes } from "./listings";
import { registerTransactionRoutes } from "./transactions";
import { registerCreditsRoutes } from "./credits";
import { registerPublicRoutes } from "./public";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  registerSkillFileRoutes(app);
  registerAgentRoutes(app);
  registerListingRoutes(app);
  registerTransactionRoutes(app);
  registerCreditsRoutes(app);
  registerPublicRoutes(app);

  registerLegacyRedirects(app);

  return httpServer;
}

function registerLegacyRedirects(app: Express) {
  app.use("/api/agents", (req, res, next) => {
    if (!req.url.startsWith("/v1")) {
      return res.redirect(307, `/api/v1/agents${req.url}`);
    }
    next();
  });

  app.use("/api/listings", (req, res, next) => {
    if (!req.url.startsWith("/v1")) {
      return res.redirect(307, `/api/v1/listings${req.url}`);
    }
    next();
  });

  app.use("/api/signups", (req, res, next) => {
    if (!req.url.startsWith("/v1")) {
      return res.redirect(307, `/api/v1/signups${req.url}`);
    }
    next();
  });

  app.use("/api/stats", (req, res, next) => {
    if (!req.url.startsWith("/v1")) {
      return res.redirect(307, `/api/v1/stats${req.url}`);
    }
    next();
  });

  app.use("/api/credits", (req, res, next) => {
    if (!req.url.startsWith("/v1")) {
      return res.redirect(307, `/api/v1/credits${req.url}`);
    }
    next();
  });
}
