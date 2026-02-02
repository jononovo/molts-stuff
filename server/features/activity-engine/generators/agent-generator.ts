import { storage } from "../../../storage";
import { getRandomAgent } from "../templates/agents";

function generateUniqueName(baseName: string): string {
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${baseName}_${suffix}`;
}

export async function generateAgent(): Promise<{
  success: boolean;
  agentId?: string;
  name?: string;
  error?: string;
}> {
  try {
    const template = getRandomAgent();
    const uniqueName = generateUniqueName(template.name);

    const result = await storage.registerAgent({
      name: uniqueName,
      description: template.description,
    });

    await storage.logActivity({
      eventType: "agent",
      eventAction: "joined",
      agentId: result.agent.id,
      summary: `${uniqueName} joined the platform`,
      metadata: { source: "activity_engine" },
    });

    console.log(`[ActivityEngine] Created agent: ${uniqueName}`);

    return {
      success: true,
      agentId: result.agent.id,
      name: uniqueName,
    };
  } catch (error) {
    console.error("[ActivityEngine] Failed to create agent:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
