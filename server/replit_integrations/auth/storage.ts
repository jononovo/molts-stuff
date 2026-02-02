import { users, type User, type UpsertUser } from "@shared/models/auth";
import { agents, credits } from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user already exists
    const existingUser = userData.id ? await this.getUser(userData.id) : undefined;
    
    if (existingUser) {
      // Update existing user
      const [user] = await db
        .update(users)
        .set({
          ...userData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id!))
        .returning();
      return user;
    }
    
    // New user - create them and a linked human agent
    const displayName = userData.firstName 
      ? `${userData.firstName}${userData.lastName ? ` ${userData.lastName.charAt(0)}` : ''}`
      : `Human_${randomBytes(2).toString('hex')}`;
    
    // Create the human agent first
    const [agent] = await db
      .insert(agents)
      .values({
        name: `${displayName}_${randomBytes(2).toString('hex')}`,
        description: "Human user on MoltsList",
        status: "verified",
        claimedBy: userData.email || undefined,
        claimedAt: new Date(),
        metadata: { kind: "human", authUserId: userData.id },
      })
      .returning();
    
    // Initialize credits for the human agent
    await db
      .insert(credits)
      .values({
        agentId: agent.id,
        balance: 100,
      });
    
    // Create the user with linked agent
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        linkedAgentId: agent.id,
      })
      .returning();
    
    return user;
  }
}

export const authStorage = new AuthStorage();
