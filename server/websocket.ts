import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { storage } from "./storage";

interface AuthenticatedWebSocket extends WebSocket {
  agentId: string;
  agentName: string;
  isAlive: boolean;
}

// Track connections by agentId
const connections = new Map<string, Set<AuthenticatedWebSocket>>();

let wss: WebSocketServer | null = null;

export function initializeWebSocket(httpServer: HttpServer): void {
  wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const authenticatedWs = ws as AuthenticatedWebSocket;
    authenticatedWs.isAlive = true;

    // Extract API key from query string
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const apiKey = url.searchParams.get("api_key");

    if (!apiKey) {
      ws.close(4001, "Missing api_key parameter");
      return;
    }

    // Authenticate the agent
    const agent = await storage.getAgentByApiKey(apiKey);
    if (!agent) {
      ws.close(4002, "Invalid API key");
      return;
    }

    authenticatedWs.agentId = agent.id;
    authenticatedWs.agentName = agent.name;

    // Track this connection
    if (!connections.has(agent.id)) {
      connections.set(agent.id, new Set());
    }
    connections.get(agent.id)!.add(authenticatedWs);

    // Send connected message
    ws.send(JSON.stringify({
      type: "connected",
      agent_id: agent.id,
      agent_name: agent.name,
      timestamp: new Date().toISOString(),
    }));

    console.log(`WebSocket connected: ${agent.name} (${agent.id})`);

    // Handle pong responses for heartbeat
    ws.on("pong", () => {
      authenticatedWs.isAlive = true;
    });

    // Handle incoming messages
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle ping from client
        if (message.type === "ping") {
          ws.send(JSON.stringify({
            type: "pong",
            timestamp: new Date().toISOString(),
          }));
        }
      } catch {
        // Ignore invalid messages
      }
    });

    // Handle disconnection
    ws.on("close", () => {
      const agentConnections = connections.get(authenticatedWs.agentId);
      if (agentConnections) {
        agentConnections.delete(authenticatedWs);
        if (agentConnections.size === 0) {
          connections.delete(authenticatedWs.agentId);
        }
      }
      console.log(`WebSocket disconnected: ${authenticatedWs.agentName} (${authenticatedWs.agentId})`);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for ${authenticatedWs.agentName}:`, error);
    });
  });

  // Heartbeat to detect stale connections
  const heartbeatInterval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      const authenticatedWs = ws as AuthenticatedWebSocket;
      if (!authenticatedWs.isAlive) {
        authenticatedWs.terminate();
        return;
      }
      authenticatedWs.isAlive = false;
      authenticatedWs.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  console.log("WebSocket server initialized on /ws");
}

export function sendToAgent(agentId: string, event: string, data: any): void {
  const agentConnections = connections.get(agentId);
  if (!agentConnections || agentConnections.size === 0) return;

  const message = JSON.stringify({
    type: event,
    data,
    timestamp: new Date().toISOString(),
  });

  agentConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

export function broadcast(event: string, data: any): void {
  if (!wss) return;

  const message = JSON.stringify({
    type: event,
    data,
    timestamp: new Date().toISOString(),
  });

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

export function getConnectionCount(): number {
  let count = 0;
  connections.forEach((set) => {
    count += set.size;
  });
  return count;
}

export function getConnectedAgents(): string[] {
  return Array.from(connections.keys());
}
