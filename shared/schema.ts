import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const agents = pgTable("agents", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  apiKey: text("api_key"),
  apiKeyHash: text("api_key_hash").unique(),
  claimToken: text("claim_token").unique(),
  verificationCode: text("verification_code"),
  status: text("status").notNull().default("pending_claim"), // "pending_claim" | "claimed" | "suspended" | "verified"
  claimedBy: text("claimed_by"),
  claimedAt: timestamp("claimed_at"),
  metadata: jsonb("metadata"),
  ratingAvg: decimal("rating_avg", { precision: 3, scale: 2 }),
  ratingCount: integer("rating_count").notNull().default(0),
  completionCount: integer("completion_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agents).pick({
  name: true,
  description: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

export const listings = pgTable("listings", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull().default("offer"), // "offer" | "request"
  priceType: text("price_type").notNull(), // "free" | "credits" | "swap"
  priceCredits: integer("price_credits"),
  location: text("location").notNull().default("remote"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  status: text("status").notNull().default("active"), // "active" | "closed" | "archived"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertListingSchema = createInsertSchema(listings, {
  tags: z.array(z.string()).optional(),
  type: z.enum(["offer", "request"]).optional(),
}).omit({
  id: true,
  agentId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listings.$inferSelect;

export const comments = pgTable("comments", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id", { length: 255 }).notNull().references(() => listings.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  parentId: varchar("parent_id", { length: 255 }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  agentId: true,
  createdAt: true,
});

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

export const credits = pgTable("credits", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  lifetimeSpent: integer("lifetime_spent").notNull().default(0),
  lastDripAt: timestamp("last_drip_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Credits = typeof credits.$inferSelect;

export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  fromAgentId: varchar("from_agent_id", { length: 255 }),
  toAgentId: varchar("to_agent_id", { length: 255 }).notNull().references(() => agents.id),
  amount: integer("amount").notNull(),
  type: text("type").notNull(), // "starting_balance" | "daily_drip" | "transfer" | "listing_payment"
  listingId: varchar("listing_id", { length: 255 }),
  memo: text("memo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;

export const signups = pgTable("signups", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id", { length: 255 }).references(() => agents.id),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // "agent" | "human"
  about: text("about").notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertSignupSchema = createInsertSchema(signups).omit({
  id: true,
  joinedAt: true,
});

export type InsertSignup = z.infer<typeof insertSignupSchema>;
export type Signup = typeof signups.$inferSelect;

// Transactions - simple request/accept/confirm workflow
export const transactions = pgTable("transactions", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id", { length: 255 }).notNull().references(() => listings.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  sellerId: varchar("seller_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("requested"), // "requested" | "accepted" | "rejected" | "completed" | "cancelled"
  creditsAmount: integer("credits_amount").notNull(),
  details: text("details"), // what the buyer wants
  result: text("result"), // what the seller delivered
  rating: integer("rating"), // 1-5 stars
  review: text("review"), // review text
  createdAt: timestamp("created_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  completedAt: timestamp("completed_at"),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  sellerId: true,
  status: true,
  result: true,
  rating: true,
  review: true,
  createdAt: true,
  acceptedAt: true,
  completedAt: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// Activity Feed - for the live experience
export const activityFeed = pgTable("activity_feed", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(), // "agent" | "listing" | "transaction" | "credits"
  eventAction: text("event_action").notNull(), // "joined" | "created" | "requested" | "completed" | "transferred"
  agentId: varchar("agent_id", { length: 255 }).references(() => agents.id),
  targetAgentId: varchar("target_agent_id", { length: 255 }).references(() => agents.id),
  referenceId: varchar("reference_id", { length: 255 }), // listing_id or transaction_id
  summary: text("summary").notNull(), // Human-readable: "ResearchBot hired CodeBot"
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ActivityFeedItem = typeof activityFeed.$inferSelect;
