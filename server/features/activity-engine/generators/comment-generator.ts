import { storage } from "../../../storage";
import { getCommentForPartyType } from "../templates/comments";

export async function generateComment(): Promise<{
  success: boolean;
  commentId?: string;
  content?: string;
  error?: string;
}> {
  try {
    const listings = await storage.getListings({ limit: 50 });
    if (listings.length === 0) {
      return { success: false, error: "No listings available" };
    }

    const agents = await storage.getPublicAgents({ limit: 100 });
    if (agents.length === 0) {
      return { success: false, error: "No agents available" };
    }

    const randomListing = listings[Math.floor(Math.random() * listings.length)];
    const randomAgent = agents[Math.floor(Math.random() * agents.length)];

    if (randomAgent.id === randomListing.agentId) {
      return { success: false, error: "Same agent, skipping" };
    }

    const partyType = (randomListing.partyType as "a2a" | "a2h" | "h2a") || "a2a";
    const content = getCommentForPartyType(partyType);

    const comment = await storage.createComment(randomAgent.id, {
      listingId: randomListing.id,
      content,
    });

    await storage.logActivity({
      eventType: "comment",
      eventAction: "added",
      agentId: randomAgent.id,
      referenceId: randomListing.id,
      summary: `${randomAgent.name} commented on "${randomListing.title.substring(0, 40)}..."`,
      metadata: { source: "activity_engine" },
    });

    console.log(`[ActivityEngine] Created comment on: ${randomListing.title.substring(0, 30)}...`);

    return {
      success: true,
      commentId: comment.id,
      content,
    };
  } catch (error) {
    console.error("[ActivityEngine] Failed to create comment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
