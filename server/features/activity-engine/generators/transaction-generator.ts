import { storage } from "../../../storage";
import { getTransactionTemplate } from "../templates/transactions";

const pendingTransactionQueue: string[] = [];
let recoveryCompleted = false;

async function recoverStrandedTransactions(): Promise<void> {
  if (recoveryCompleted) return;
  recoveryCompleted = true;

  try {
    const agents = await storage.getPublicAgents({ limit: 50 });

    for (const agent of agents) {
      const incoming = await storage.getIncomingTransactions(agent.id);

      for (const tx of incoming) {
        if ((tx.status === "requested" || tx.status === "accepted") && 
            !pendingTransactionQueue.includes(tx.id)) {
          pendingTransactionQueue.push(tx.id);
          console.log(`[ActivityEngine] Recovered stranded transaction: ${tx.id} (${tx.status})`);
        }
      }

      if (pendingTransactionQueue.length >= 5) break;
    }

    if (pendingTransactionQueue.length > 0) {
      console.log(`[ActivityEngine] Recovered ${pendingTransactionQueue.length} stranded transactions`);
    }
  } catch (error) {
    console.error("[ActivityEngine] Failed to recover transactions:", error);
  }
}

export async function generateTransaction(): Promise<{
  success: boolean;
  transactionId?: string;
  action?: string;
  error?: string;
}> {
  try {
    await recoverStrandedTransactions();

    if (pendingTransactionQueue.length > 0) {
      return await advanceExistingTransaction();
    } else {
      return await createNewTransaction();
    }
  } catch (error) {
    console.error("[ActivityEngine] Failed transaction operation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function createNewTransaction(): Promise<{
  success: boolean;
  transactionId?: string;
  action?: string;
  error?: string;
}> {
  const listings = await storage.getListings({ limit: 50 });
  const creditListings = listings.filter(
    (l) => l.priceType === "credits" && l.priceCredits && l.priceCredits > 0
  );

  if (creditListings.length === 0) {
    return { success: false, error: "No credit listings available" };
  }

  const randomListing = creditListings[Math.floor(Math.random() * creditListings.length)];
  const agents = await storage.getPublicAgents({ limit: 100 });

  const eligibleBuyers = agents.filter((a) => a.id !== randomListing.agentId);
  if (eligibleBuyers.length === 0) {
    return { success: false, error: "No eligible buyers" };
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

  pendingTransactionQueue.push(transaction.id);

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

  console.log(`[ActivityEngine] Created transaction: ${transaction.id} for "${randomListing.title.substring(0, 30)}..."`);

  return {
    success: true,
    transactionId: transaction.id,
    action: "requested",
  };
}

async function advanceExistingTransaction(): Promise<{
  success: boolean;
  transactionId?: string;
  action?: string;
  error?: string;
}> {
  const transactionId = pendingTransactionQueue[0];
  const transaction = await storage.getTransaction(transactionId);

  if (!transaction) {
    pendingTransactionQueue.shift();
    return { success: false, error: "Transaction not found" };
  }

  if (transaction.status === "requested") {
    const result = await storage.acceptTransaction(transactionId, transaction.sellerId);

    if (!result) {
      pendingTransactionQueue.shift();
      return { success: false, error: "Failed to accept transaction" };
    }

    const buyer = await storage.getAgentById(transaction.buyerId);
    const seller = await storage.getAgentById(transaction.sellerId);

    await storage.logActivity({
      eventType: "transaction",
      eventAction: "accepted",
      agentId: transaction.sellerId,
      targetAgentId: transaction.buyerId,
      referenceId: transactionId,
      summary: `${seller?.name || "Seller"} accepted request from ${buyer?.name || "unknown"}`,
      metadata: { source: "activity_engine" },
    });

    console.log(`[ActivityEngine] Transaction ${transactionId} accepted by ${seller?.name || "seller"}`);

    return {
      success: true,
      transactionId,
      action: "accepted",
    };
  }

  if (transaction.status === "accepted") {
    const rating = Math.floor(Math.random() * 2) + 4;

    const result = await storage.completeTransaction(transactionId, transaction.buyerId, rating, "Great work!");

    if (!result) {
      pendingTransactionQueue.shift();
      return { success: false, error: "Failed to complete transaction" };
    }

    pendingTransactionQueue.shift();

    const buyer = await storage.getAgentById(transaction.buyerId);
    const seller = await storage.getAgentById(transaction.sellerId);

    await storage.logActivity({
      eventType: "transaction",
      eventAction: "completed",
      agentId: transaction.buyerId,
      targetAgentId: transaction.sellerId,
      referenceId: transactionId,
      summary: `${buyer?.name || "Buyer"} completed transaction with ${seller?.name || "seller"} (${rating}★)`,
      metadata: { source: "activity_engine", rating },
    });

    console.log(`[ActivityEngine] Transaction ${transactionId} completed with ${rating}★ rating`);

    return {
      success: true,
      transactionId,
      action: "completed",
    };
  }

  pendingTransactionQueue.shift();
  return { success: false, error: `Transaction in unexpected status: ${transaction.status}` };
}

export function getPendingTransactionCount(): number {
  return pendingTransactionQueue.length;
}
