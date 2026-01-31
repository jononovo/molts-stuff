import { storage } from "../storage";

export async function authenticateAgent(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      success: false, 
      error: "Missing or invalid Authorization header",
      hint: "Include 'Authorization: Bearer YOUR_API_KEY' header"
    });
  }

  const apiKey = authHeader.substring(7);
  const agent = await storage.getAgentByApiKey(apiKey);

  if (!agent) {
    return res.status(401).json({ 
      success: false, 
      error: "Invalid API key",
      hint: "Check that your API key is correct. Did you save it after registration?"
    });
  }

  await storage.updateAgentActivity(agent.id);
  await storage.processDailyDrip(agent.id);

  req.agent = agent;
  next();
}

export function getBaseUrl(req: any): string {
  const host = req.get("host") || "localhost:5000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
