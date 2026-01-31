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
  priceType: text("price_type").notNull(), // "free" | "credits" | "swap" | "usdc"
  priceCredits: integer("price_credits"),
  // USDC pricing for blockchain escrow
  acceptsUsdc: boolean("accepts_usdc").notNull().default(false),
  priceUsdc: decimal("price_usdc", { precision: 10, scale: 2 }),
  preferredChain: text("preferred_chain"), // "solana" | "base" (null means any)
  location: text("location").notNull().default("remote"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  status: text("status").notNull().default("active"), // "active" | "closed" | "archived"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertListingSchema = createInsertSchema(listings, {
  tags: z.array(z.string()).optional(),
  type: z.enum(["offer", "request"]).optional(),
  priceType: z.enum(["free", "credits", "swap", "usdc"]), // Required
  acceptsUsdc: z.boolean().optional(),
  priceUsdc: z.union([z.number().positive(), z.string()]).optional().transform(val => val ? String(val) : undefined),
  preferredChain: z.enum(["solana", "base"]).nullable().optional(),
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

// Transactions - task execution workflow for agent-to-agent work
// Status flow: requested → accepted → in_progress → delivered → completed
//              ↓                          ↓
//           rejected                   disputed / revision_requested
export const transactions = pgTable("transactions", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id", { length: 255 }).notNull().references(() => listings.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  sellerId: varchar("seller_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("requested"), // "requested" | "accepted" | "in_progress" | "delivered" | "completed" | "rejected" | "cancelled" | "disputed" | "revision_requested"
  creditsAmount: integer("credits_amount").notNull(),

  // Payment method - credits (virtual) or escrow (blockchain)
  paymentMethod: text("payment_method").notNull().default("credits"), // "credits" | "escrow"
  escrowId: varchar("escrow_id", { length: 255 }), // FK to escrows table (set after escrow created)

  // Legacy text fields (kept for backwards compatibility)
  details: text("details"), // what the buyer wants (text)
  result: text("result"), // what the seller delivered (text)

  // Structured task data (new)
  taskPayload: jsonb("task_payload"), // structured task input from buyer
  taskResult: jsonb("task_result"), // structured task output from seller

  // Progress tracking
  progress: integer("progress"), // 0-100 percentage
  statusMessage: text("status_message"), // "Processing step 2/5..."

  // Rating and review
  rating: integer("rating"), // 1-5 stars
  review: text("review"), // review text

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  startedAt: timestamp("started_at"), // when seller started work
  deliveredAt: timestamp("delivered_at"), // when result submitted
  completedAt: timestamp("completed_at"),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  sellerId: true,
  status: true,
  result: true,
  taskResult: true,
  progress: true,
  statusMessage: true,
  rating: true,
  review: true,
  createdAt: true,
  acceptedAt: true,
  startedAt: true,
  deliveredAt: true,
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

// Webhooks - for reliable async notifications to agents
export const webhooks = pgTable("webhooks", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  events: text("events").array().notNull().default(sql`ARRAY[]::text[]`), // ["transaction.requested", "transaction.delivered", ...]
  secret: text("secret").notNull(), // for HMAC signing
  isActive: boolean("is_active").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at"),
  lastSuccessAt: timestamp("last_success_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  agentId: true,
  secret: true,
  isActive: true,
  failureCount: true,
  lastFailureAt: true,
  lastSuccessAt: true,
  createdAt: true,
});

export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;

// Webhook Deliveries - for tracking and retrying webhook attempts
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  webhookId: varchar("webhook_id", { length: 255 }).notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  transactionId: varchar("transaction_id", { length: 255 }).references(() => transactions.id, { onDelete: "set null" }),
  event: text("event").notNull(), // "transaction.requested", etc.
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "delivered" | "failed"
  statusCode: integer("status_code"),
  response: text("response"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextRetryAt: timestamp("next_retry_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

// Files - for sharing files between agents via S3 storage
// Access control: files are private to uploader unless attached to a transaction
// When attached to transaction, both buyer and seller can access
export const files = pgTable("files", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  transactionId: varchar("transaction_id", { length: 255 }).references(() => transactions.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(), // bytes
  storageKey: text("storage_key").notNull(), // S3 key (never expose directly)
  accessLevel: text("access_level").notNull().default("private"), // "private" | "transaction" | "delivered"
  // "private" = only uploader can access
  // "transaction" = buyer and seller can access
  // "delivered" = locked until transaction completed (for result files)
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type File = typeof files.$inferSelect;

// Agent Wallets - blockchain wallet addresses for agents
export const agentWallets = pgTable("agent_wallets", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  solanaAddress: text("solana_address"),
  solanaVerified: boolean("solana_verified").notNull().default(false),
  evmAddress: text("evm_address"),
  evmVerified: boolean("evm_verified").notNull().default(false),
  x402Enabled: boolean("x402_enabled").notNull().default(false),
  x402PayTo: text("x402_pay_to"), // preferred address for x402 payments
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentWalletSchema = createInsertSchema(agentWallets).omit({
  id: true,
  solanaVerified: true,
  evmVerified: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAgentWallet = z.infer<typeof insertAgentWalletSchema>;
export type AgentWallet = typeof agentWallets.$inferSelect;

// Escrows - on-chain escrow tracking for USDC payments
// Status flow: pending → funded → verified → released/refunded/disputed
export const escrows = pgTable("escrows", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id", { length: 255 }).notNull().references(() => transactions.id, { onDelete: "cascade" }),
  chain: text("chain").notNull(), // "solana" | "base"
  currency: text("currency").notNull().default("USDC"),
  amountLamports: text("amount_lamports").notNull(), // stored as string for bigint precision
  amountUsd: decimal("amount_usd", { precision: 10, scale: 2 }).notNull(),
  buyerAddress: text("buyer_address").notNull(),
  sellerAddress: text("seller_address").notNull(),
  escrowPda: text("escrow_pda"), // Program Derived Address for Solana escrow account
  status: text("status").notNull().default("pending"), // "pending" | "funded" | "verified" | "released" | "refunded" | "disputed"
  fundingTxSig: text("funding_tx_sig"), // transaction signature when buyer funded
  releaseTxSig: text("release_tx_sig"), // transaction signature when released/refunded
  sellerAmount: text("seller_amount"), // amount seller receives (99%)
  platformFee: text("platform_fee"), // platform fee (1%)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  fundedAt: timestamp("funded_at"),
  verifiedAt: timestamp("verified_at"),
  releasedAt: timestamp("released_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEscrowSchema = createInsertSchema(escrows).omit({
  id: true,
  status: true,
  fundingTxSig: true,
  releaseTxSig: true,
  sellerAmount: true,
  platformFee: true,
  createdAt: true,
  fundedAt: true,
  verifiedAt: true,
  releasedAt: true,
  updatedAt: true,
});

export type InsertEscrow = z.infer<typeof insertEscrowSchema>;
export type Escrow = typeof escrows.$inferSelect;

// Escrow Events - audit log for escrow state changes
export const escrowEvents = pgTable("escrow_events", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  escrowId: varchar("escrow_id", { length: 255 }).notNull().references(() => escrows.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // "created" | "funded" | "verified" | "released" | "refunded" | "disputed"
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  txSignature: text("tx_signature"),
  blockNumber: text("block_number"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EscrowEvent = typeof escrowEvents.$inferSelect;

// Karma - reputation points (credits renamed for reputation tracking)
export const karma = pgTable("karma", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id", { length: 255 }).notNull().references(() => agents.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  fromCompletions: integer("from_completions").notNull().default(0), // karma earned from completing transactions
  fromRatings: integer("from_ratings").notNull().default(0), // karma earned from positive ratings
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Karma = typeof karma.$inferSelect;
