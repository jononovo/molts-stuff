import { eq, desc, and, ilike, sql, or, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";
import type {
  Agent,
  InsertAgent,
  Listing,
  InsertListing,
  Comment,
  InsertComment,
  Credits,
  CreditTransaction,
  Signup,
  InsertSignup,
  Transaction,
  ActivityFeedItem,
  Webhook,
  InsertWebhook,
  WebhookDelivery,
  File,
} from "@shared/schema";
import { randomBytes, createHash } from "crypto";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

export interface IStorage {
  // Agents
  registerAgent(agent: InsertAgent): Promise<{
    agent: Agent;
    apiKey: string;
    claimToken: string;
    verificationCode: string;
  }>;
  getAgentByApiKey(apiKey: string): Promise<Agent | undefined>;
  getAgentById(id: string): Promise<Agent | undefined>;
  getAgentByName(name: string): Promise<Agent | undefined>;
  getAgentByClaimToken(claimToken: string): Promise<Agent | undefined>;
  getPublicAgents(params: { sort?: string; limit?: number; offset?: number }): Promise<Agent[]>;
  claimAgent(claimToken: string, claimedBy: string): Promise<Agent | undefined>;
  updateAgentActivity(agentId: string): Promise<void>;
  updateAgentProfile(agentId: string, data: { description?: string; metadata?: any }): Promise<Agent | undefined>;
  getRecentSignups(limit: number): Promise<Signup[]>;

  // Listings
  createListing(agentId: string, listing: InsertListing): Promise<Listing>;
  getListing(id: string): Promise<Listing | undefined>;
  getListings(params: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Listing[]>;
  getAgentListings(agentId: string): Promise<Listing[]>;
  updateListing(id: string, agentId: string, data: Partial<InsertListing>): Promise<Listing | undefined>;
  deleteListing(id: string, agentId: string): Promise<boolean>;

  // Comments
  createComment(agentId: string, comment: InsertComment): Promise<Comment>;
  getComments(listingId: string): Promise<Comment[]>;

  // Credits
  getCredits(agentId: string): Promise<Credits>;
  addCredits(agentId: string, amount: number, type: string, memo?: string): Promise<void>;
  transferCredits(fromAgentId: string, toAgentId: string, amount: number, listingId?: string): Promise<boolean>;
  processDailyDrip(agentId: string): Promise<void>;
  getCreditTransactions(agentId: string, limit: number): Promise<CreditTransaction[]>;

  // Transactions
  createTransaction(buyerId: string, listingId: string, creditsAmount: number, details?: string, taskPayload?: any): Promise<Transaction>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  getIncomingTransactions(sellerId: string): Promise<Transaction[]>;
  getOutgoingTransactions(buyerId: string): Promise<Transaction[]>;
  acceptTransaction(id: string, sellerId: string): Promise<Transaction | undefined>;
  rejectTransaction(id: string, sellerId: string): Promise<Transaction | undefined>;
  startTransaction(id: string, sellerId: string): Promise<Transaction | undefined>;
  updateTransactionProgress(id: string, sellerId: string, progress: number, statusMessage?: string): Promise<Transaction | undefined>;
  deliverTransaction(id: string, sellerId: string, taskResult: any, result?: string): Promise<Transaction | undefined>;
  requestRevision(id: string, buyerId: string, reason?: string): Promise<Transaction | undefined>;
  resumeTransaction(id: string, sellerId: string): Promise<Transaction | undefined>;
  completeTransaction(id: string, buyerId: string, rating?: number, review?: string): Promise<Transaction | undefined>;
  cancelTransaction(id: string, buyerId: string): Promise<Transaction | undefined>;

  // Webhooks
  createWebhook(agentId: string, webhook: InsertWebhook): Promise<Webhook>;
  getWebhook(id: string): Promise<Webhook | undefined>;
  getWebhooksByAgent(agentId: string): Promise<Webhook[]>;
  getWebhooksForEvent(agentId: string, event: string): Promise<Webhook[]>;
  updateWebhook(id: string, agentId: string, data: Partial<InsertWebhook>): Promise<Webhook | undefined>;
  deleteWebhook(id: string, agentId: string): Promise<boolean>;
  recordWebhookSuccess(id: string): Promise<void>;
  recordWebhookFailure(id: string): Promise<void>;

  // Webhook Deliveries
  createWebhookDelivery(delivery: { webhookId: string; transactionId?: string; event: string; payload: any }): Promise<WebhookDelivery>;
  getPendingDeliveries(limit: number): Promise<WebhookDelivery[]>;
  updateDeliveryStatus(id: string, status: string, statusCode?: number, response?: string): Promise<void>;
  scheduleRetry(id: string, nextRetryAt: Date): Promise<void>;

  // Files
  createFile(file: { agentId: string; transactionId?: string; filename: string; mimeType: string; size: number; storageKey: string; accessLevel?: string; metadata?: any }): Promise<File>;
  getFile(id: string): Promise<File | undefined>;
  getFilesByAgent(agentId: string, limit?: number): Promise<File[]>;
  getFilesByTransaction(transactionId: string): Promise<File[]>;
  attachFileToTransaction(fileId: string, agentId: string, transactionId: string, accessLevel?: string): Promise<File | undefined>;
  deleteFile(id: string, agentId: string): Promise<boolean>;

  // Activity Feed
  logActivity(event: {
    eventType: string;
    eventAction: string;
    agentId?: string;
    targetAgentId?: string;
    referenceId?: string;
    summary: string;
    metadata?: any;
  }): Promise<ActivityFeedItem>;
  getActivityFeed(params: { limit?: number; since?: Date }): Promise<ActivityFeedItem[]>;

  // Stats
  getCounts(): Promise<{ agents: number; listings: number; transactions: number; comments: number }>;
  getLeaderboard(limit: number): Promise<{ name: string; credits: number; completions: number }[]>;
}

class DbStorage implements IStorage {
  async registerAgent(agent: InsertAgent) {
    const apiKey = `mlist_${randomBytes(32).toString("hex")}`;
    const apiKeyHash = hashApiKey(apiKey);
    const claimToken = `mlist_claim_${randomBytes(24).toString("hex")}`;
    const verificationCode = `reef-${randomBytes(2).toString("hex").toUpperCase()}`;

    const [newAgent] = await db
      .insert(schema.agents)
      .values({
        ...agent,
        apiKeyHash,
        claimToken,
        verificationCode,
      })
      .returning();

    // Initialize credits with starting balance
    await db.insert(schema.credits).values({
      agentId: newAgent.id,
      balance: 100,
      lifetimeEarned: 100,
    });

    await db.insert(schema.creditTransactions).values({
      toAgentId: newAgent.id,
      amount: 100,
      type: "starting_balance",
      memo: "Welcome to MoltsList!",
    });

    // Add to signups feed
    await db.insert(schema.signups).values({
      agentId: newAgent.id,
      name: newAgent.name,
      kind: "agent",
      about: newAgent.description,
    });

    return {
      agent: newAgent,
      apiKey,
      claimToken,
      verificationCode,
    };
  }

  async getAgentByApiKey(apiKey: string) {
    const hash = hashApiKey(apiKey);
    
    // First try to find by hash (new secure method)
    let [agent] = await db.select().from(schema.agents).where(eq(schema.agents.apiKeyHash, hash)).limit(1);
    
    // Fallback to raw key lookup for unmigrated agents
    if (!agent) {
      [agent] = await db.select().from(schema.agents).where(eq(schema.agents.apiKey, apiKey)).limit(1);
      
      // Auto-migrate: hash their key for future lookups
      if (agent && !agent.apiKeyHash) {
        await db.update(schema.agents)
          .set({ apiKeyHash: hash, apiKey: null })
          .where(eq(schema.agents.id, agent.id));
      }
    }
    
    return agent;
  }

  async getAgentById(id: string) {
    const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
    return agent;
  }

  async getAgentByName(name: string) {
    const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.name, name)).limit(1);
    return agent;
  }

  async getAgentByClaimToken(claimToken: string) {
    const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.claimToken, claimToken)).limit(1);
    return agent;
  }

  async getPublicAgents(params: { sort?: string; limit?: number; offset?: number }) {
    const limit = Math.min(params.limit || 50, 100);
    const offset = params.offset || 0;
    
    let orderBy;
    switch (params.sort) {
      case "rating":
        orderBy = desc(schema.agents.ratingAvg);
        break;
      case "active":
        orderBy = desc(schema.agents.completionCount);
        break;
      case "recent":
      default:
        orderBy = desc(schema.agents.createdAt);
    }
    
    const agents = await db
      .select()
      .from(schema.agents)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);
    
    return agents;
  }

  async claimAgent(claimToken: string, claimedBy: string) {
    const [agent] = await db
      .update(schema.agents)
      .set({
        status: "claimed",
        claimedBy,
        claimedAt: new Date(),
      })
      .where(eq(schema.agents.claimToken, claimToken))
      .returning();

    return agent;
  }

  async updateAgentActivity(agentId: string) {
    await db
      .update(schema.agents)
      .set({ lastActiveAt: new Date() })
      .where(eq(schema.agents.id, agentId));
  }

  async getRecentSignups(limit: number) {
    const signups = await db
      .select()
      .from(schema.signups)
      .orderBy(desc(schema.signups.joinedAt))
      .limit(limit);
    return signups;
  }

  async createListing(agentId: string, listing: InsertListing) {
    const [newListing] = await db
      .insert(schema.listings)
      .values({
        ...listing,
        agentId,
      })
      .returning();

    return newListing;
  }

  async getListing(id: string) {
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, id)).limit(1);
    return listing;
  }

  async getListings(params: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const { category, search, limit = 25, offset = 0 } = params;

    let query = db.select().from(schema.listings);

    const conditions = [eq(schema.listings.status, "active")];

    if (category) {
      conditions.push(eq(schema.listings.category, category));
    }

    if (search) {
      conditions.push(
        or(
          ilike(schema.listings.title, `%${search}%`),
          ilike(schema.listings.description, `%${search}%`),
          sql`${schema.listings.tags}::text ILIKE ${`%${search}%`}`
        )!
      );
    }

    const listings = await query
      .where(and(...conditions))
      .orderBy(desc(schema.listings.createdAt))
      .limit(limit)
      .offset(offset);

    return listings;
  }

  async updateListing(id: string, agentId: string, data: Partial<InsertListing>) {
    const [listing] = await db
      .update(schema.listings)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.listings.id, id), eq(schema.listings.agentId, agentId)))
      .returning();

    return listing;
  }

  async deleteListing(id: string, agentId: string) {
    const result = await db
      .delete(schema.listings)
      .where(and(eq(schema.listings.id, id), eq(schema.listings.agentId, agentId)))
      .returning();

    return result.length > 0;
  }

  async createComment(agentId: string, comment: InsertComment) {
    const [newComment] = await db
      .insert(schema.comments)
      .values({
        ...comment,
        agentId,
      })
      .returning();

    return newComment;
  }

  async getComments(listingId: string) {
    const comments = await db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.listingId, listingId))
      .orderBy(schema.comments.createdAt);

    return comments;
  }

  async getCredits(agentId: string) {
    let [credits] = await db.select().from(schema.credits).where(eq(schema.credits.agentId, agentId)).limit(1);

    if (!credits) {
      [credits] = await db
        .insert(schema.credits)
        .values({
          agentId,
          balance: 0,
        })
        .returning();
    }

    return credits;
  }

  async addCredits(agentId: string, amount: number, type: string, memo?: string) {
    await db
      .update(schema.credits)
      .set({
        balance: sql`${schema.credits.balance} + ${amount}`,
        lifetimeEarned: sql`${schema.credits.lifetimeEarned} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.credits.agentId, agentId));

    await db.insert(schema.creditTransactions).values({
      toAgentId: agentId,
      amount,
      type,
      memo,
    });
  }

  async transferCredits(fromAgentId: string, toAgentId: string, amount: number, listingId?: string) {
    const fromCredits = await this.getCredits(fromAgentId);

    if (fromCredits.balance < amount) {
      return false;
    }

    await db
      .update(schema.credits)
      .set({
        balance: sql`${schema.credits.balance} - ${amount}`,
        lifetimeSpent: sql`${schema.credits.lifetimeSpent} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.credits.agentId, fromAgentId));

    await db
      .update(schema.credits)
      .set({
        balance: sql`${schema.credits.balance} + ${amount}`,
        lifetimeEarned: sql`${schema.credits.lifetimeEarned} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.credits.agentId, toAgentId));

    await db.insert(schema.creditTransactions).values({
      fromAgentId,
      toAgentId,
      amount,
      type: listingId ? "listing_payment" : "transfer",
      listingId,
      memo: listingId ? `Payment for listing ${listingId}` : "Credit transfer",
    });

    return true;
  }

  async processDailyDrip(agentId: string) {
    const credits = await this.getCredits(agentId);
    const now = new Date();
    const lastDrip = credits.lastDripAt;

    if (!lastDrip || now.getTime() - lastDrip.getTime() > 24 * 60 * 60 * 1000) {
      await this.addCredits(agentId, 10, "daily_drip", "Daily activity reward");

      await db
        .update(schema.credits)
        .set({ lastDripAt: now })
        .where(eq(schema.credits.agentId, agentId));
    }
  }

  async getCreditTransactions(agentId: string, limit: number) {
    const txns = await db
      .select()
      .from(schema.creditTransactions)
      .where(
        or(
          eq(schema.creditTransactions.fromAgentId, agentId),
          eq(schema.creditTransactions.toAgentId, agentId)
        )!
      )
      .orderBy(desc(schema.creditTransactions.createdAt))
      .limit(limit);

    return txns;
  }

  async updateAgentProfile(agentId: string, data: { description?: string; metadata?: any }) {
    const [agent] = await db
      .update(schema.agents)
      .set(data)
      .where(eq(schema.agents.id, agentId))
      .returning();
    return agent;
  }

  async getAgentListings(agentId: string) {
    const listings = await db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.agentId, agentId))
      .orderBy(desc(schema.listings.createdAt));
    return listings;
  }

  // Transactions
  async createTransaction(buyerId: string, listingId: string, creditsAmount: number, details?: string, taskPayload?: any) {
    const listing = await this.getListing(listingId);
    if (!listing) throw new Error("Listing not found");

    const [transaction] = await db
      .insert(schema.transactions)
      .values({
        listingId,
        buyerId,
        sellerId: listing.agentId,
        creditsAmount,
        details,
        taskPayload,
      })
      .returning();

    return transaction;
  }

  async getTransaction(id: string) {
    const [transaction] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .limit(1);
    return transaction;
  }

  async getIncomingTransactions(sellerId: string) {
    const txns = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.sellerId, sellerId))
      .orderBy(desc(schema.transactions.createdAt));
    return txns;
  }

  async getOutgoingTransactions(buyerId: string) {
    const txns = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.buyerId, buyerId))
      .orderBy(desc(schema.transactions.createdAt));
    return txns;
  }

  async acceptTransaction(id: string, sellerId: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(and(eq(schema.transactions.id, id), eq(schema.transactions.sellerId, sellerId), eq(schema.transactions.status, "requested")))
      .returning();
    return transaction;
  }

  async rejectTransaction(id: string, sellerId: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({ status: "rejected" })
      .where(and(eq(schema.transactions.id, id), eq(schema.transactions.sellerId, sellerId), eq(schema.transactions.status, "requested")))
      .returning();
    return transaction;
  }

  async completeTransaction(id: string, buyerId: string, rating?: number, review?: string) {
    const txn = await this.getTransaction(id);
    // Allow completion from "accepted" (legacy) or "delivered" (new flow)
    if (!txn || txn.buyerId !== buyerId || (txn.status !== "accepted" && txn.status !== "delivered")) return undefined;

    // Transfer credits from buyer to seller
    const transferred = await this.transferCredits(buyerId, txn.sellerId, txn.creditsAmount, txn.listingId);
    if (!transferred) return undefined;

    const [completed] = await db
      .update(schema.transactions)
      .set({
        status: "completed",
        completedAt: new Date(),
        rating,
        review,
      })
      .where(eq(schema.transactions.id, id))
      .returning();

    // Update seller's rating if rating provided
    if (rating) {
      const seller = await this.getAgentById(txn.sellerId);
      if (seller) {
        const newCount = seller.ratingCount + 1;
        const currentAvg = parseFloat(seller.ratingAvg || "0");
        const newAvg = ((currentAvg * seller.ratingCount) + rating) / newCount;
        await db
          .update(schema.agents)
          .set({
            ratingAvg: newAvg.toFixed(2),
            ratingCount: newCount,
            completionCount: seller.completionCount + 1,
          })
          .where(eq(schema.agents.id, txn.sellerId));
      }
    }

    return completed;
  }

  async cancelTransaction(id: string, buyerId: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({ status: "cancelled" })
      .where(and(eq(schema.transactions.id, id), eq(schema.transactions.buyerId, buyerId), eq(schema.transactions.status, "requested")))
      .returning();
    return transaction;
  }

  async startTransaction(id: string, sellerId: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({ status: "in_progress", startedAt: new Date(), progress: 0 })
      .where(and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.sellerId, sellerId),
        eq(schema.transactions.status, "accepted")
      ))
      .returning();
    return transaction;
  }

  async updateTransactionProgress(id: string, sellerId: string, progress: number, statusMessage?: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({ progress: Math.min(100, Math.max(0, progress)), statusMessage })
      .where(and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.sellerId, sellerId),
        eq(schema.transactions.status, "in_progress")
      ))
      .returning();
    return transaction;
  }

  async deliverTransaction(id: string, sellerId: string, taskResult: any, result?: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({
        status: "delivered",
        taskResult,
        result,
        progress: 100,
        deliveredAt: new Date(),
      })
      .where(and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.sellerId, sellerId),
        eq(schema.transactions.status, "in_progress")
      ))
      .returning();
    return transaction;
  }

  async requestRevision(id: string, buyerId: string, reason?: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({
        status: "revision_requested",
        statusMessage: reason || "Revision requested by buyer",
      })
      .where(and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.buyerId, buyerId),
        eq(schema.transactions.status, "delivered")
      ))
      .returning();
    return transaction;
  }

  async resumeTransaction(id: string, sellerId: string) {
    const [transaction] = await db
      .update(schema.transactions)
      .set({
        status: "in_progress",
        statusMessage: "Resumed after revision request",
        progress: 0,
      })
      .where(and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.sellerId, sellerId),
        eq(schema.transactions.status, "revision_requested")
      ))
      .returning();
    return transaction;
  }

  // Webhooks
  async createWebhook(agentId: string, webhook: InsertWebhook) {
    const secret = `whsec_${randomBytes(32).toString("hex")}`;
    const [newWebhook] = await db
      .insert(schema.webhooks)
      .values({
        ...webhook,
        agentId,
        secret,
      })
      .returning();
    return newWebhook;
  }

  async getWebhook(id: string) {
    const [webhook] = await db
      .select()
      .from(schema.webhooks)
      .where(eq(schema.webhooks.id, id))
      .limit(1);
    return webhook;
  }

  async getWebhooksByAgent(agentId: string) {
    const webhooks = await db
      .select()
      .from(schema.webhooks)
      .where(eq(schema.webhooks.agentId, agentId))
      .orderBy(desc(schema.webhooks.createdAt));
    return webhooks;
  }

  async getWebhooksForEvent(agentId: string, event: string) {
    const webhooks = await db
      .select()
      .from(schema.webhooks)
      .where(and(
        eq(schema.webhooks.agentId, agentId),
        eq(schema.webhooks.isActive, true),
        sql`${event} = ANY(${schema.webhooks.events})`
      ));
    return webhooks;
  }

  async updateWebhook(id: string, agentId: string, data: Partial<InsertWebhook>) {
    const [webhook] = await db
      .update(schema.webhooks)
      .set(data)
      .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.agentId, agentId)))
      .returning();
    return webhook;
  }

  async deleteWebhook(id: string, agentId: string) {
    const result = await db
      .delete(schema.webhooks)
      .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.agentId, agentId)))
      .returning();
    return result.length > 0;
  }

  async recordWebhookSuccess(id: string) {
    await db
      .update(schema.webhooks)
      .set({ failureCount: 0, lastSuccessAt: new Date() })
      .where(eq(schema.webhooks.id, id));
  }

  async recordWebhookFailure(id: string) {
    await db
      .update(schema.webhooks)
      .set({
        failureCount: sql`${schema.webhooks.failureCount} + 1`,
        lastFailureAt: new Date(),
        // Auto-disable after 5 consecutive failures
        isActive: sql`CASE WHEN ${schema.webhooks.failureCount} >= 4 THEN false ELSE ${schema.webhooks.isActive} END`,
      })
      .where(eq(schema.webhooks.id, id));
  }

  // Webhook Deliveries
  async createWebhookDelivery(delivery: { webhookId: string; transactionId?: string; event: string; payload: any }) {
    const [newDelivery] = await db
      .insert(schema.webhookDeliveries)
      .values(delivery)
      .returning();
    return newDelivery;
  }

  async getPendingDeliveries(limit: number) {
    const now = new Date();
    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(and(
        eq(schema.webhookDeliveries.status, "pending"),
        or(
          sql`${schema.webhookDeliveries.nextRetryAt} IS NULL`,
          sql`${schema.webhookDeliveries.nextRetryAt} <= ${now}`
        )!
      ))
      .orderBy(schema.webhookDeliveries.createdAt)
      .limit(limit);
    return deliveries;
  }

  async updateDeliveryStatus(id: string, status: string, statusCode?: number, response?: string) {
    await db
      .update(schema.webhookDeliveries)
      .set({
        status,
        statusCode,
        response,
        attempts: sql`${schema.webhookDeliveries.attempts} + 1`,
        deliveredAt: status === "delivered" ? new Date() : undefined,
      })
      .where(eq(schema.webhookDeliveries.id, id));
  }

  async scheduleRetry(id: string, nextRetryAt: Date) {
    await db
      .update(schema.webhookDeliveries)
      .set({ nextRetryAt })
      .where(eq(schema.webhookDeliveries.id, id));
  }

  // Files
  async createFile(file: { agentId: string; transactionId?: string; filename: string; mimeType: string; size: number; storageKey: string; accessLevel?: string; metadata?: any }) {
    const [newFile] = await db
      .insert(schema.files)
      .values({
        ...file,
        accessLevel: file.accessLevel || (file.transactionId ? "transaction" : "private"),
      })
      .returning();
    return newFile;
  }

  async getFile(id: string) {
    const [file] = await db
      .select()
      .from(schema.files)
      .where(eq(schema.files.id, id))
      .limit(1);
    return file;
  }

  async getFilesByAgent(agentId: string, limit = 50) {
    const files = await db
      .select()
      .from(schema.files)
      .where(eq(schema.files.agentId, agentId))
      .orderBy(desc(schema.files.createdAt))
      .limit(limit);
    return files;
  }

  async getFilesByTransaction(transactionId: string) {
    const files = await db
      .select()
      .from(schema.files)
      .where(eq(schema.files.transactionId, transactionId))
      .orderBy(desc(schema.files.createdAt));
    return files;
  }

  async attachFileToTransaction(fileId: string, agentId: string, transactionId: string, accessLevel = "transaction") {
    const [file] = await db
      .update(schema.files)
      .set({ transactionId, accessLevel })
      .where(and(
        eq(schema.files.id, fileId),
        eq(schema.files.agentId, agentId),
        sql`${schema.files.transactionId} IS NULL` // Can only attach unattached files
      ))
      .returning();
    return file;
  }

  async deleteFile(id: string, agentId: string) {
    const result = await db
      .delete(schema.files)
      .where(and(eq(schema.files.id, id), eq(schema.files.agentId, agentId)))
      .returning();
    return result.length > 0;
  }

  // Activity Feed
  async logActivity(event: {
    eventType: string;
    eventAction: string;
    agentId?: string;
    targetAgentId?: string;
    referenceId?: string;
    summary: string;
    metadata?: any;
  }) {
    const [activity] = await db
      .insert(schema.activityFeed)
      .values(event)
      .returning();
    return activity;
  }

  async getActivityFeed(params: { limit?: number; since?: Date }) {
    const { limit = 25, since } = params;

    let query = db.select().from(schema.activityFeed);

    if (since) {
      query = query.where(gt(schema.activityFeed.createdAt, since)) as typeof query;
    }

    const items = await query
      .orderBy(desc(schema.activityFeed.createdAt))
      .limit(limit);

    return items;
  }

  async getCounts() {
    const [agentsResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.agents);
    const [listingsResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.listings);
    const [transactionsResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.transactions);
    const [commentsResult] = await db.select({ count: sql<number>`count(*)` }).from(schema.comments);

    return {
      agents: Number(agentsResult?.count || 0),
      listings: Number(listingsResult?.count || 0),
      transactions: Number(transactionsResult?.count || 0),
      comments: Number(commentsResult?.count || 0),
    };
  }

  async getLeaderboard(limit: number) {
    const results = await db
      .select({
        name: schema.agents.name,
        credits: schema.credits.balance,
        completions: schema.agents.completionCount,
      })
      .from(schema.agents)
      .leftJoin(schema.credits, eq(schema.agents.id, schema.credits.agentId))
      .orderBy(desc(schema.credits.balance))
      .limit(limit);

    return results.map(r => ({
      name: r.name,
      credits: Number(r.credits || 0),
      completions: Number(r.completions || 0),
    }));
  }
}

export const storage = new DbStorage();
