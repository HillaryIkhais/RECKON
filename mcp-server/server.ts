#!/usr/bin/env node
/**
 * RECKON Test MCP Server
 * 
 * A deterministic mock operational system for testing RECKON's capabilities.
 * Exposes read and write tools with detectable state changes.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ============================================================
// OPERATIONAL STATE - Real mutable state
// ============================================================

interface ServiceConfig {
  value: string;
  updatedAt: string;
  updatedBy: string;
}

interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "error";
  uptime: number;
  lastRestart: string | null;
}

// Initial state
const configStore: Map<string, ServiceConfig> = new Map([
  ["database.host", { value: "db.prod.example.com", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" }],
  ["database.port", { value: "5432", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" }],
  ["database.pool_size", { value: "10", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" }],
  ["cache.enabled", { value: "true", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" }],
  ["cache.ttl", { value: "300", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" }],
  ["api.rate_limit", { value: "1000", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" }],
]);

const services: Map<string, ServiceStatus> = new Map([
  ["api-gateway", { name: "api-gateway", status: "running", uptime: 864000, lastRestart: null }],
  ["auth-service", { name: "auth-service", status: "running", uptime: 432000, lastRestart: null }],
  ["payment-service", { name: "payment-service", status: "running", uptime: 216000, lastRestart: null }],
]);

// Track all mutations for verification
const mutationLog: Array<{
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  previousState?: unknown;
  newState?: unknown;
}> = [];

// ============================================================
// TOOL DEFINITIONS
// ============================================================

const tools = [
  {
    name: "get_config",
    description: "Read a configuration value from the operational system",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Configuration key (e.g., 'database.host')" },
      },
      required: ["key"],
    },
  },
  {
    name: "set_config",
    description: "Set a configuration value - THIS IS A CONSEQUENTIAL WRITE OPERATION",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Configuration key" },
        value: { type: "string", description: "New value" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "list_configs",
    description: "List all configuration keys and their values",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_service_status",
    description: "Get the status of a service",
    inputSchema: {
      type: "object" as const,
      properties: {
        service_name: { type: "string", description: "Name of the service" },
      },
      required: ["service_name"],
    },
  },
  {
    name: "list_services",
    description: "List all services and their statuses",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "restart_service",
    description: "Restart a service - THIS IS A CONSEQUENTIAL WRITE OPERATION that causes downtime",
    inputSchema: {
      type: "object" as const,
      properties: {
        service_name: { type: "string", description: "Name of the service to restart" },
      },
      required: ["service_name"],
    },
  },
  {
    name: "get_mutation_log",
    description: "Get the log of all mutations that have been applied",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "reset_state",
    description: "Reset all state to initial values (for testing)",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ============================================================
// TOOL HANDLERS
// ============================================================

function handleGetConfig(args: { key: string }) {
  const config = configStore.get(args.key);
  if (!config) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Config key '${args.key}' not found` }) }],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify({ key: args.key, ...config }) }],
  };
}

function handleSetConfig(args: { key: string; value: string }) {
  const previousState = configStore.get(args.key);
  const previousValue = previousState ? { ...previousState } : null;
  
  configStore.set(args.key, {
    value: args.value,
    updatedAt: new Date().toISOString(),
    updatedBy: "agent",
  });
  
  mutationLog.push({
    timestamp: new Date().toISOString(),
    tool: "set_config",
    args,
    success: true,
    previousState: previousValue,
    newState: configStore.get(args.key),
  });
  
  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify({ 
        success: true, 
        key: args.key, 
        previousValue: previousValue?.value,
        newValue: args.value 
      }) 
    }],
  };
}

function handleListConfigs() {
  const configs: Record<string, { value: string; updatedAt: string; updatedBy: string }> = {};
  configStore.forEach((value, key) => {
    configs[key] = value;
  });
  return {
    content: [{ type: "text", text: JSON.stringify(configs) }],
  };
}

function handleGetServiceStatus(args: { service_name: string }) {
  const service = services.get(args.service_name);
  if (!service) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Service '${args.service_name}' not found` }) }],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(service) }],
  };
}

function handleListServices() {
  const allServices: Record<string, ServiceStatus> = {};
  services.forEach((value, key) => {
    allServices[key] = value;
  });
  return {
    content: [{ type: "text", text: JSON.stringify(allServices) }],
  };
}

function handleRestartService(args: { service_name: string }) {
  const service = services.get(args.service_name);
  if (!service) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Service '${args.service_name}' not found` }) }],
    };
  }
  
  const previousStatus = service.status;
  
  // Simulate restart: status goes to stopped briefly, then back to running
  service.status = "stopped";
  service.lastRestart = new Date().toISOString();
  service.uptime = 0;
  
  // After a "restart", status returns to running
  setTimeout(() => {
    service.status = "running";
  }, 100);
  
  mutationLog.push({
    timestamp: new Date().toISOString(),
    tool: "restart_service",
    args,
    success: true,
    previousState: { status: previousStatus },
    newState: { status: "stopped", lastRestart: service.lastRestart },
  });
  
  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify({ 
        success: true, 
        service: args.service_name,
        previousStatus,
        newStatus: "stopped",
        message: "Service is restarting..."
      }) 
    }],
  };
}

function handleGetMutationLog() {
  return {
    content: [{ type: "text", text: JSON.stringify(mutationLog) }],
  };
}

function handleResetState() {
  // Reset configs
  configStore.clear();
  configStore.set("database.host", { value: "db.prod.example.com", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" });
  configStore.set("database.port", { value: "5432", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" });
  configStore.set("database.pool_size", { value: "10", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" });
  configStore.set("cache.enabled", { value: "true", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" });
  configStore.set("cache.ttl", { value: "300", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" });
  configStore.set("api.rate_limit", { value: "1000", updatedAt: "2026-08-24T00:00:00Z", updatedBy: "system" });
  
  // Reset services
  services.clear();
  services.set("api-gateway", { name: "api-gateway", status: "running", uptime: 864000, lastRestart: null });
  services.set("auth-service", { name: "auth-service", status: "running", uptime: 432000, lastRestart: null });
  services.set("payment-service", { name: "payment-service", status: "running", uptime: 216000, lastRestart: null });
  
  // Clear mutation log
  mutationLog.length = 0;
  
  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, message: "State reset to initial values" }) }],
  };
}

// ============================================================
// SERVER SETUP
// ============================================================

const server = new Server(
  {
    name: "reckon-test-ops",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "get_config":
        return handleGetConfig(args as { key: string });
      case "set_config":
        return handleSetConfig(args as { key: string; value: string });
      case "list_configs":
        return handleListConfigs();
      case "get_service_status":
        return handleGetServiceStatus(args as { service_name: string });
      case "list_services":
        return handleListServices();
      case "restart_service":
        return handleRestartService(args as { service_name: string });
      case "get_mutation_log":
        return handleGetMutationLog();
      case "reset_state":
        return handleResetState();
      default:
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RECKON Test MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
