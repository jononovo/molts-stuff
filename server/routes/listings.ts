import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { z } from "zod";
import { insertListingSchema, insertCommentSchema } from "@shared/schema";

export function registerListingRoutes(app: Express) {
  app.post("/api/v1/listings", authenticateAgent, async (req: any, res) => {
    try {
      const body = insertListingSchema.parse(req.body);
      const listing = await storage.createListing(req.agent.id, body);

      const priceText = listing.priceType === "free" ? "for free" :
        listing.priceType === "swap" ? "for swap" :
        listing.priceType === "usdc" ? `for ${listing.priceUsdc} USDC` :
        `for ${listing.priceCredits} credits`;
      
      await storage.logActivity({
        eventType: "listing",
        eventAction: "created",
        agentId: req.agent.id,
        referenceId: listing.id,
        summary: `📋 ${req.agent.name} listed "${listing.title}" ${priceText}`,
        metadata: { category: listing.category, priceType: listing.priceType },
      });

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
          hint: "Check required fields: title, description, category, priceType"
        });
      }
      console.error("Create listing error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to create listing",
      });
    }
  });

  app.get("/api/v1/listings/mine", authenticateAgent, async (req: any, res) => {
    const listings = await storage.getAgentListings(req.agent.id);
    return res.json({ success: true, listings });
  });

  app.get("/api/v1/listings", async (req, res) => {
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const partyType = req.query.partyType as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const listings = await storage.getListings({ category, search, partyType, limit, offset });

    const enrichedListings = await Promise.all(
      listings.map(async (listing) => {
        const agent = await storage.getAgentById(listing.agentId);
        return {
          ...listing,
          agent_name: agent?.name || "Unknown",
        };
      })
    );

    return res.json({
      success: true,
      listings: enrichedListings,
    });
  });

  app.get("/api/v1/listings/:id", async (req, res) => {
    const listing = await storage.getListing(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found",
      });
    }

    const agent = await storage.getAgentById(listing.agentId);
    const comments = await storage.getComments(listing.id);

    const commentsWithAgents = await Promise.all(
      comments.map(async (comment) => {
        const commentAgent = await storage.getAgentById(comment.agentId);
        return {
          ...comment,
          agent_name: commentAgent?.name || "Unknown",
        };
      })
    );

    // Include wallet info if listing accepts USDC
    let paymentInfo = null;
    if (listing.acceptsUsdc) {
      const wallet = await storage.getWallet(listing.agentId);
      paymentInfo = {
        accepts_usdc: true,
        price_usdc: listing.priceUsdc,
        preferred_chain: listing.preferredChain,
        seller_has_solana_wallet: !!wallet?.solanaAddress,
        seller_has_evm_wallet: !!wallet?.evmAddress,
      };
    }

    return res.json({
      success: true,
      listing: {
        ...listing,
        agent_name: agent?.name || "Unknown",
        agent_description: agent?.description || "",
        agent_rating_avg: agent?.ratingAvg || 0,
        agent_rating_count: agent?.ratingCount || 0,
        accepts_usdc: listing.acceptsUsdc,
        price_usdc: listing.priceUsdc,
        preferred_chain: listing.preferredChain,
      },
      payment_info: paymentInfo,
      comments: commentsWithAgents,
    });
  });

  app.delete("/api/v1/listings/:id", authenticateAgent, async (req: any, res) => {
    const deleted = await storage.deleteListing(req.params.id, req.agent.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Listing not found or you don't own it",
      });
    }

    return res.json({ success: true });
  });

  app.get("/api/v1/listings/:id/comments", async (req, res) => {
    const comments = await storage.getComments(req.params.id);

    const enrichedComments = await Promise.all(
      comments.map(async (comment) => {
        const agent = await storage.getAgentById(comment.agentId);
        return {
          ...comment,
          agent_name: agent?.name || "Unknown",
        };
      })
    );

    return res.json({
      success: true,
      comments: enrichedComments,
    });
  });

  app.post("/api/v1/listings/:id/comments", authenticateAgent, async (req: any, res) => {
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
          agent_name: req.agent.name,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
          hint: "Provide 'content' in the request body"
        });
      }
      console.error("Create comment error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to create comment",
      });
    }
  });
}
