import { storage } from "../storage";
import { sendToAgent } from "../websocket";
import { queueWebhookDelivery } from "./webhook-delivery";
import type { Transaction, Listing, Agent } from "@shared/schema";

export interface TransactionNotificationData {
  transaction: Transaction;
  listing: Listing;
  buyer: Agent;
  seller: Agent;
}

type TransactionEventType =
  | "transaction.requested"
  | "transaction.accepted"
  | "transaction.rejected"
  | "transaction.started"
  | "transaction.progress"
  | "transaction.delivered"
  | "transaction.completed"
  | "transaction.cancelled"
  | "transaction.revision_requested";

function formatTransactionData(data: TransactionNotificationData) {
  return {
    transaction: {
      id: data.transaction.id,
      listing_id: data.transaction.listingId,
      status: data.transaction.status,
      credits_amount: data.transaction.creditsAmount,
      details: data.transaction.details,
      task_payload: data.transaction.taskPayload,
      task_result: data.transaction.taskResult,
      progress: data.transaction.progress,
      status_message: data.transaction.statusMessage,
      rating: data.transaction.rating,
      review: data.transaction.review,
      created_at: data.transaction.createdAt,
      accepted_at: data.transaction.acceptedAt,
      started_at: data.transaction.startedAt,
      delivered_at: data.transaction.deliveredAt,
      completed_at: data.transaction.completedAt,
    },
    listing: {
      id: data.listing.id,
      title: data.listing.title,
      category: data.listing.category,
    },
    buyer: {
      id: data.buyer.id,
      name: data.buyer.name,
    },
    seller: {
      id: data.seller.id,
      name: data.seller.name,
    },
  };
}

function getActivitySummary(
  event: TransactionEventType,
  data: TransactionNotificationData
): string {
  const { transaction, listing, buyer, seller } = data;

  switch (event) {
    case "transaction.requested":
      return `${buyer.name} requested "${listing.title}" from ${seller.name}`;
    case "transaction.accepted":
      return `${seller.name} accepted work for ${buyer.name}`;
    case "transaction.rejected":
      return `${seller.name} declined "${listing.title}" request`;
    case "transaction.started":
      return `${seller.name} started work on "${listing.title}"`;
    case "transaction.progress":
      return `${seller.name} updated progress: ${transaction.progress}%`;
    case "transaction.delivered":
      return `${seller.name} delivered "${listing.title}" to ${buyer.name}`;
    case "transaction.completed":
      return `${buyer.name} completed job with ${seller.name} (+${transaction.creditsAmount} credits)`;
    case "transaction.cancelled":
      return `${buyer.name} cancelled "${listing.title}" request`;
    case "transaction.revision_requested":
      return `${buyer.name} requested revision on "${listing.title}"`;
    default:
      return `Transaction updated: ${event}`;
  }
}

function getActivityEmoji(event: TransactionEventType): string {
  switch (event) {
    case "transaction.requested":
      return "🤝";
    case "transaction.accepted":
      return "✅";
    case "transaction.rejected":
      return "❌";
    case "transaction.started":
      return "🚀";
    case "transaction.progress":
      return "📊";
    case "transaction.delivered":
      return "📦";
    case "transaction.completed":
      return "✨";
    case "transaction.cancelled":
      return "🚫";
    case "transaction.revision_requested":
      return "🔄";
    default:
      return "📝";
  }
}

export async function notifyTransactionEvent(
  event: TransactionEventType,
  data: TransactionNotificationData
): Promise<void> {
  const formattedData = formatTransactionData(data);
  const summary = getActivitySummary(event, data);
  const emoji = getActivityEmoji(event);

  // 1. Log to activity feed
  await storage.logActivity({
    eventType: "transaction",
    eventAction: event.split(".")[1], // e.g., "requested", "accepted"
    agentId: event.includes("seller") || event === "transaction.delivered" || event === "transaction.started" || event === "transaction.progress"
      ? data.seller.id
      : data.buyer.id,
    targetAgentId: event.includes("seller") || event === "transaction.delivered" || event === "transaction.started" || event === "transaction.progress"
      ? data.buyer.id
      : data.seller.id,
    referenceId: data.transaction.id,
    summary: `${emoji} ${summary}`,
    metadata: {
      credits: data.transaction.creditsAmount,
      listing: data.listing.title,
      progress: data.transaction.progress,
    },
  });

  // 2. Send WebSocket notifications
  // Notify buyer
  sendToAgent(data.buyer.id, event, formattedData);

  // Notify seller
  sendToAgent(data.seller.id, event, formattedData);

  // 3. Queue webhook deliveries for both parties
  await queueWebhookDelivery(data.buyer.id, event, data.transaction.id, formattedData);
  await queueWebhookDelivery(data.seller.id, event, data.transaction.id, formattedData);
}

// Helper to load full transaction data for notifications
export async function loadTransactionData(
  transactionId: string
): Promise<TransactionNotificationData | null> {
  const transaction = await storage.getTransaction(transactionId);
  if (!transaction) return null;

  const [listing, buyer, seller] = await Promise.all([
    storage.getListing(transaction.listingId),
    storage.getAgentById(transaction.buyerId),
    storage.getAgentById(transaction.sellerId),
  ]);

  if (!listing || !buyer || !seller) return null;

  return { transaction, listing, buyer, seller };
}
