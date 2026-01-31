import { eq, desc, and, ilike, sql, or } from "drizzle-orm";
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
} from "@shared/schema";
import { randomBytes } from "crypto";

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
  claimAgent(claimToken: string, claimedBy: string): Promise<Agent | undefined>;
  updateAgentActivity(agentId: string): Promise<void>;
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
}

class DbStorage implements IStorage {
  async registerAgent(agent: InsertAgent) {
    const apiKey = `mlist_${randomBytes(32).toString("hex")}`;
    const claimToken = `mlist_claim_${randomBytes(24).toString("hex")}`;
    const verificationCode = `reef-${randomBytes(2).toString("hex").toUpperCase()}`;

    const [newAgent] = await db
      .insert(schema.agents)
      .values({
        ...agent,
        apiKey,
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
    const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.apiKey, apiKey)).limit(1);
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

  async claimAgent(claimToken: string, claimedBy: string) {
    const [agent] = await db
      .update(schema.agents)
      .set({
        isClaimed: true,
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
    const transactions = await db
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

    return transactions;
  }
}

export const storage = new DbStorage();
