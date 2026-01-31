import { createHmac } from "crypto";
import { storage } from "../storage";
import type { Webhook, WebhookDelivery } from "@shared/schema";

// Retry intervals in milliseconds: 30s, 2m, 10m, 1h, 4h
const RETRY_INTERVALS = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
  4 * 60 * 60 * 1000,
];

export interface WebhookEvent {
  event: string;
  transactionId?: string;
  data: any;
  timestamp: string;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function deliverWebhook(webhook: Webhook, delivery: WebhookDelivery): Promise<boolean> {
  const payloadString = JSON.stringify(delivery.payload);
  const signature = signPayload(payloadString, webhook.secret);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MoltsList-Signature": `sha256=${signature}`,
        "X-MoltsList-Event": delivery.event,
        "X-MoltsList-Delivery-Id": delivery.id,
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseText = await response.text().catch(() => "");

    if (response.ok) {
      await storage.updateDeliveryStatus(delivery.id, "delivered", response.status, responseText.slice(0, 1000));
      await storage.recordWebhookSuccess(webhook.id);
      return true;
    } else {
      await handleDeliveryFailure(delivery, webhook.id, response.status, responseText.slice(0, 1000));
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await handleDeliveryFailure(delivery, webhook.id, 0, errorMessage);
    return false;
  }
}

async function handleDeliveryFailure(
  delivery: WebhookDelivery,
  webhookId: string,
  statusCode: number,
  response: string
) {
  const nextAttempt = delivery.attempts + 1;

  if (nextAttempt >= delivery.maxAttempts) {
    await storage.updateDeliveryStatus(delivery.id, "failed", statusCode, response);
    await storage.recordWebhookFailure(webhookId);
  } else {
    const retryInterval = RETRY_INTERVALS[Math.min(nextAttempt - 1, RETRY_INTERVALS.length - 1)];
    const nextRetryAt = new Date(Date.now() + retryInterval);
    await storage.updateDeliveryStatus(delivery.id, "pending", statusCode, response);
    await storage.scheduleRetry(delivery.id, nextRetryAt);
  }
}

export async function queueWebhookDelivery(
  agentId: string,
  event: string,
  transactionId: string | undefined,
  data: any
): Promise<void> {
  const webhooks = await storage.getWebhooksForEvent(agentId, event);

  const payload: WebhookEvent = {
    event,
    transactionId,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const webhook of webhooks) {
    await storage.createWebhookDelivery({
      webhookId: webhook.id,
      transactionId,
      event,
      payload,
    });
  }
}

export async function processWebhookQueue(): Promise<number> {
  const pendingDeliveries = await storage.getPendingDeliveries(10);
  let processed = 0;

  for (const delivery of pendingDeliveries) {
    const webhook = await storage.getWebhook(delivery.webhookId);
    if (!webhook || !webhook.isActive) {
      await storage.updateDeliveryStatus(delivery.id, "failed", 0, "Webhook not found or inactive");
      continue;
    }

    await deliverWebhook(webhook, delivery);
    processed++;
  }

  return processed;
}

// Start the webhook processor
let processorInterval: NodeJS.Timeout | null = null;

export function startWebhookProcessor(intervalMs = 5000): void {
  if (processorInterval) return;

  processorInterval = setInterval(async () => {
    try {
      await processWebhookQueue();
    } catch (error) {
      console.error("Webhook processor error:", error);
    }
  }, intervalMs);

  console.log(`Webhook processor started (interval: ${intervalMs}ms)`);
}

export function stopWebhookProcessor(): void {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
    console.log("Webhook processor stopped");
  }
}
