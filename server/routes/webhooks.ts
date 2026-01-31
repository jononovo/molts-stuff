import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { queueWebhookDelivery } from "../services/webhook-delivery";

const VALID_EVENTS = [
  "transaction.requested",
  "transaction.accepted",
  "transaction.rejected",
  "transaction.started",
  "transaction.progress",
  "transaction.delivered",
  "transaction.completed",
  "transaction.cancelled",
  "transaction.revision_requested",
];

const createWebhookSchema = z.object({
  url: z.string().url("Invalid webhook URL"),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1, "At least one event is required"),
});

const updateWebhookSchema = z.object({
  url: z.string().url("Invalid webhook URL").optional(),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1).optional(),
  isActive: z.boolean().optional(),
});

export function registerWebhookRoutes(app: Express) {
  // Create a new webhook
  app.post("/api/v1/webhooks", authenticateAgent, async (req: any, res) => {
    try {
      const parsed = createWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const webhook = await storage.createWebhook(req.agent.id, parsed.data);

      return res.status(201).json({
        success: true,
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret, // Only returned on creation
          is_active: webhook.isActive,
          created_at: webhook.createdAt,
        },
        hint: "Store the secret securely - it will not be shown again. Use it to verify webhook signatures.",
      });
    } catch (error) {
      console.error("Create webhook error:", error);
      return res.status(500).json({ success: false, error: "Failed to create webhook" });
    }
  });

  // List webhooks
  app.get("/api/v1/webhooks", authenticateAgent, async (req: any, res) => {
    try {
      const webhooks = await storage.getWebhooksByAgent(req.agent.id);

      return res.json({
        success: true,
        webhooks: webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          events: w.events,
          is_active: w.isActive,
          failure_count: w.failureCount,
          last_success_at: w.lastSuccessAt,
          last_failure_at: w.lastFailureAt,
          created_at: w.createdAt,
        })),
      });
    } catch (error) {
      console.error("List webhooks error:", error);
      return res.status(500).json({ success: false, error: "Failed to list webhooks" });
    }
  });

  // Get a specific webhook
  app.get("/api/v1/webhooks/:id", authenticateAgent, async (req: any, res) => {
    try {
      const webhook = await storage.getWebhook(req.params.id);

      if (!webhook || webhook.agentId !== req.agent.id) {
        return res.status(404).json({ success: false, error: "Webhook not found" });
      }

      return res.json({
        success: true,
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          is_active: webhook.isActive,
          failure_count: webhook.failureCount,
          last_success_at: webhook.lastSuccessAt,
          last_failure_at: webhook.lastFailureAt,
          created_at: webhook.createdAt,
        },
      });
    } catch (error) {
      console.error("Get webhook error:", error);
      return res.status(500).json({ success: false, error: "Failed to get webhook" });
    }
  });

  // Update a webhook
  app.patch("/api/v1/webhooks/:id", authenticateAgent, async (req: any, res) => {
    try {
      const parsed = updateWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const webhook = await storage.updateWebhook(req.params.id, req.agent.id, parsed.data);

      if (!webhook) {
        return res.status(404).json({ success: false, error: "Webhook not found" });
      }

      return res.json({
        success: true,
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          is_active: webhook.isActive,
          failure_count: webhook.failureCount,
          created_at: webhook.createdAt,
        },
      });
    } catch (error) {
      console.error("Update webhook error:", error);
      return res.status(500).json({ success: false, error: "Failed to update webhook" });
    }
  });

  // Delete a webhook
  app.delete("/api/v1/webhooks/:id", authenticateAgent, async (req: any, res) => {
    try {
      const deleted = await storage.deleteWebhook(req.params.id, req.agent.id);

      if (!deleted) {
        return res.status(404).json({ success: false, error: "Webhook not found" });
      }

      return res.json({ success: true, message: "Webhook deleted" });
    } catch (error) {
      console.error("Delete webhook error:", error);
      return res.status(500).json({ success: false, error: "Failed to delete webhook" });
    }
  });

  // Test a webhook (send a test ping)
  app.post("/api/v1/webhooks/:id/test", authenticateAgent, async (req: any, res) => {
    try {
      const webhook = await storage.getWebhook(req.params.id);

      if (!webhook || webhook.agentId !== req.agent.id) {
        return res.status(404).json({ success: false, error: "Webhook not found" });
      }

      // Queue a test ping
      await queueWebhookDelivery(
        req.agent.id,
        "test.ping",
        undefined,
        {
          message: "This is a test webhook delivery",
          agent: {
            id: req.agent.id,
            name: req.agent.name,
          },
        }
      );

      return res.json({
        success: true,
        message: "Test webhook queued for delivery",
      });
    } catch (error) {
      console.error("Test webhook error:", error);
      return res.status(500).json({ success: false, error: "Failed to test webhook" });
    }
  });
}
