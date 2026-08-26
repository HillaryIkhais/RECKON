#!/usr/bin/env node
/**
 * RECKON MCP HTTP Bridge
 * 
 * Exposes the existing stdio MCP server as a remote HTTP endpoint.
 * TrueForge v0.1.4 only supports type: "remote" MCP servers,
 * so this bridge translates HTTP → stdio → the real MCP server.
 */

import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest, JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { join } from "node:path";

// ============================================================
// CONFIGURATION
// ============================================================

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT ?? "3001", 10);
const MCP_SERVER_PATH = join(import.meta.dirname ?? ".", "mcp-server", "server.ts");

// ============================================================
// TRANSPORT MANAGEMENT
// ============================================================

interface BridgeSession {
  httpTransport: StreamableHTTPServerTransport;
  stdioTransport: StdioClientTransport;
  sessionId: string;
}

const sessions = new Map<string, BridgeSession>();

// ============================================================
// STDIO CLIENT FACTORY
// ============================================================

function createStdioTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: "npx",
    args: ["tsx", MCP_SERVER_PATH],
    stderr: "pipe",
  });
}

// ============================================================
// REQUEST HANDLER
// ============================================================

async function handleMCPRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Parse body
  const body = await parseBody(req);
  
  // GET = SSE stream for session
  if (req.method === "GET") {
    const sessionId = req.headers["mcp-session-id"] as string;
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.httpTransport.handleRequest(req, res);
    return;
  }
  
  // DELETE = terminate session
  if (req.method === "DELETE") {
    const sessionId = req.headers["mcp-session-id"] as string;
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
      return;
    }
    const session = sessions.get(sessionId)!;
    await session.httpTransport.handleRequest(req, res);
    sessions.delete(sessionId);
    return;
  }
  
  // POST = MCP message
  if (req.method === "POST") {
    const sessionId = req.headers["mcp-session-id"] as string;
    
    // New session: initialize request without session ID
    if (!sessionId && isInitializeRequest(body)) {
      console.log("[bridge] New session initializing...");
      
      // Create stdio transport to child MCP server
      const stdioTransport = createStdioTransport();
      await stdioTransport.start();
      console.log("[bridge] Stdio transport started, MCP server child process running");
      
      // Create HTTP transport
      const httpTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          console.log(`[bridge] HTTP session initialized: ${sid}`);
          sessions.set(sid, {
            httpTransport,
            stdioTransport,
            sessionId: sid,
          });
        },
      });
      
      // Bridge: HTTP transport messages → stdio transport → child process
      httpTransport.onmessage = async (message: JSONRPCMessage) => {
        console.log(`[bridge] HTTP→stdio: ${message.method ?? "response"}`);
        await stdioTransport.send(message);
      };
      
      // Bridge: child process responses → HTTP transport → client
      stdioTransport.onmessage = async (message: JSONRPCMessage) => {
        console.log(`[bridge] stdio→HTTP: ${message.method ?? "response"}`);
        await httpTransport.send(message);
      };
      
      stdioTransport.onerror = (error) => {
        console.error("[bridge] Stdio error:", error);
      };
      
      stdioTransport.onclose = () => {
        console.log("[bridge] Stdio transport closed");
        httpTransport.close();
      };
      
      // Connect HTTP transport
      await httpTransport.handleRequest(req, res, body);
      console.log("[bridge] HTTP transport handling initialize request");
      return;
    }
    
    // Existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.httpTransport.handleRequest(req, res, body);
      return;
    }
    
    // Invalid request
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID" },
      id: null,
    }));
    return;
  }
  
  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

// ============================================================
// BODY PARSER
// ============================================================

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ============================================================
// HEALTH ENDPOINT
// ============================================================

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status: "ok",
    bridge: "reckon-mcp-http-bridge",
    sessions: sessions.size,
    uptime: process.uptime(),
  }));
}

// ============================================================
// HTTP SERVER
// ============================================================

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = new URL(req.url ?? "/", `http://localhost:${BRIDGE_PORT}`);
  
  try {
    if (url.pathname === "/health") {
      handleHealth(req, res);
    } else if (url.pathname === "/mcp") {
      await handleMCPRequest(req, res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  } catch (error) {
    console.error("[bridge] Error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

// ============================================================
// STARTUP
// ============================================================

server.listen(BRIDGE_PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           RECKON MCP HTTP Bridge                            ║
║  stdio MCP server → HTTP endpoint for TrueForge            ║
╚══════════════════════════════════════════════════════════════╝

Listening on: http://localhost:${BRIDGE_PORT}
MCP endpoint: http://localhost:${BRIDGE_PORT}/mcp
Health check: http://localhost:${BRIDGE_PORT}/health

Register in TrueForge as:
  Type: remote
  URL:  http://localhost:${BRIDGE_PORT}/mcp
`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[bridge] Shutting down...");
  for (const [sid, session] of sessions) {
    await session.stdioTransport.close();
    await session.httpTransport.close();
  }
  server.close();
  process.exit(0);
});
