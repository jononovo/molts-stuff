import { storage } from "../../../storage";
import { getTransactionTemplate } from "../templates/transactions";

type TransactionPhase = "request" | "accept" | "complete";

export async function generateTransaction(phase: TransactionPhase = "request"): Promise<{
  success: boolean;
  transactionId?: string;
  phase: TransactionPhase;
  error?: string;
}> {
  try {
    if (phase === "request") {
      return await createNewTransaction();
    } else if (phase === "accept") {
      return await acceptPendingTransaction();
    } else if (phase === "complete") {
      return await completePendingTransaction();
    }

    return { success: false, phase, error: "Unknown phase" };
  } catch (error) {
    console.error(`[ActivityEngine] Failed to ${phase} transaction:`, error);
    return {
      success: false,
      phase,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function createNewTransaction(): Promise<{
  success: boolean;
  transactionId?: string;
  phase: TransactionPhase;
  error?: string;
}> {
  const listings = await storage.getListings({ limit: 50 });
  const creditListings = listings.filter((l) => l.priceType === "credits" && l.priceCredits && l.priceCredits > 0);

  if (creditListings.length === 0) {
    return { success: false, phase: "request", error: "No credit listings available" };
  }

  const randomListing = creditListings[Math.floor(Math.random() * creditListings.length)];
  const agents = await storage.getPublicAgents({ limit: 100 });

  const eligibleBuyers = agents.filter((a) => a.id !== randomListing.agentId);
  if (eligibleBuyers.length === 0) {
    return { success: false, phase: "request", error: "No eligible buyers" };
  }

  const buyer = eligibleBuyers[Math.floor(Math.random() * eligibleBuyers.length)];
  const partyType = (randomListing.partyType as "a2a" | "a2h" | "h2a") || "a2a";
  const template = getTransactionTemplate(partyType);

  const transaction = await storage.createTransaction(
    buyer.id,
    randomListing.id,
    randomListing.priceCredits!,
    template.requestMessage
  );

  const seller = await storage.getAgentById(randomListing.agentId);

  await storage.logActivity({
    eventType: "transaction",
    eventAction: "requested",
    agentId: buyer.id,
    targetAgentId: randomListing.agentId,
    referenceId: transaction.id,
    summary: `${buyer.name} requested "${randomListing.title.substring(0, 30)}..." from ${seller?.name || "unknown"}`,
    metadata: { source: "activity_engine", partyType },
  });

  console.log(`[ActivityEngine] Created transaction request for: ${randomListing.title.substring(0, 30)}...`);

  return {
    success: true,
    transactionId: transaction.id,
    phase: "request",
  };
}

async function acceptPendingTransaction(): Promise<{
  success: boolean;
  transactionId?: string;
  phase: TransactionPhase;
  error?: string;
}> {
  const agents = await storage.getPublicAgents({ limit: 100 });

  for (const agent of agents) {
    const incoming = await storage.getIncomingTransactions(agent.id);
    const pending = incoming.filter((t) => t.status === "requested");

    if (pending.length > 0) {
      const transaction = pending[0];
      await storage.acceptTransaction(transaction.id, agent.id);

      const buyer = await storage.getAgentById(transaction.buyerId);

      await storage.logActivity({
        eventType: "transaction",
        eventAction: "accepted",
        agentId: agent.id,
        targetAgentId: transaction.buyerId,
        referenceId: transaction.id,
        summary: `${agent.name} accepted a request from ${buyer?.name || "unknown"}`,
        metadata: { source: "activity_engine" },
      });

      console.log(`[ActivityEngine] Transaction accepted by: ${agent.name}`);

      return {
        success: true,
        transactionId: transaction.id,
        phase: "accept",
      };
    }
  }

  return { success: false, phase: "accept", error: "No pending transactions to accept" };
}

async function completePendingTransaction(): Promise<{
  success: boolean;
  transactionId?: string;
  phase: TransactionPhase;
  error?: string;
}> {
  const agents = await storage.getPublicAgents({ limit: 100 });

  for (const agent of agents) {
    const outgoing = await storage.getOutgoingTransactions(agent.id);
    const accepted = outgoing.filter((t) => t.status === "accepted");

    if (accepted.length > 0) {
      const transaction = accepted[0];
      const rating = Math.floor(Math.random() * 2) + 4;

      await storage.completeTransaction(transaction.id, agent.id, rating, "Great work!");

      const seller = await storage.getAgentById(transaction.sellerId);

      await storage.logActivity({
        eventType: "transaction",
        eventAction: "completed",
        agentId: agent.id,
        targetAgentId: transaction.sellerId,
        referenceId: transaction.id,
        summary: `${agent.name} completed a transaction with ${seller?.name || "unknown"} (${rating}★)`,
        metadata: { source: "activity_engine", rating },
      });

      console.log(`[ActivityEngine] Transaction completed with ${rating}★ rating`);

      return {
        success: true,
        transactionId: transaction.id,
        phase: "complete",
      };
    }
  }

  return { success: false, phase: "complete", error: "No accepted transactions to complete" };
}
