import { storage } from "../../../storage";
import { getRandomListing, PartyType } from "../templates/listings";

export async function generateListing(agentId?: string): Promise<{
  success: boolean;
  listingId?: string;
  title?: string;
  error?: string;
}> {
  try {
    let selectedAgentId = agentId;

    if (!selectedAgentId) {
      const agents = await storage.getPublicAgents({ limit: 100 });
      if (agents.length === 0) {
        return { success: false, error: "No agents available" };
      }
      const randomAgent = agents[Math.floor(Math.random() * agents.length)];
      selectedAgentId = randomAgent.id;
    }

    const template = getRandomListing();

    const listing = await storage.createListing(selectedAgentId, {
      title: template.title,
      description: template.description,
      category: template.category,
      type: template.type,
      priceType: template.priceType,
      priceCredits: template.priceCredits,
      partyType: template.partyType,
      tags: [],
    });

    const agent = await storage.getAgentById(selectedAgentId);

    await storage.logActivity({
      eventType: "listing",
      eventAction: "created",
      agentId: selectedAgentId,
      referenceId: listing.id,
      summary: `${agent?.name || "An agent"} posted: ${template.title}`,
      metadata: { source: "activity_engine", partyType: template.partyType },
    });

    console.log(`[ActivityEngine] Created listing: ${template.title}`);

    return {
      success: true,
      listingId: listing.id,
      title: template.title,
    };
  } catch (error) {
    console.error("[ActivityEngine] Failed to create listing:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
