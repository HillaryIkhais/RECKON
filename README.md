# RECKON

**Controlled-Autonomy Agent with Investigation & Recovery**

RECKON is a TrueForge-based agent that demonstrates the principle: AI agents should not receive permission to perform consequential actions simply because they are confident.

## Core Workflow

1. **INTAKE** - Parse task, identify affected systems
2. **INVESTIGATION** - Use MCP tools to gather evidence
3. **ANALYSIS** - Form hypotheses, execute code in sandbox
4. **ACTION PLAN** - Generate plan, classify reversibility
5. **RECOVERY CONTRACT** - Generate recovery document
6. **SANDBOX VALIDATION** - Test action + recovery in sandbox
7. **RED TEAM** - Challenge the plan
8. **DECISION** - CLEARED / NEEDS_MORE_EVIDENCE / BLOCKED
9. **HUMAN CHECKPOINT** - TrueForge approval gate
10. **EXECUTION** - Real MCP mutation after approval
11. **VERIFICATION** - Confirm outcome

## Prerequisites

- Node.js >= 22.14
- A model provider configured in TrueForge (e.g., Ollama, Anthropic, OpenAI)

## Quick Start

### 1. Start TrueForge locally

```bash
npx @truefoundry/trueforge
```

This starts TrueForge at `http://localhost:8790`.

### 2. Configure a model provider

Open `http://localhost:8790` in your browser:
1. Go to Settings → Models
2. Add your model provider (e.g., Ollama, Anthropic, OpenAI)

### 3. Start the MCP HTTP Bridge

RECKON's MCP server uses stdio transport, but TrueForge v0.1.4 only supports remote (HTTP) MCP servers. The bridge converts HTTP → stdio.

```bash
npm run mcp:http
```

This starts the bridge at `http://localhost:3001`.

### 4. Register the MCP server in TrueForge

In the TrueForge UI:
1. Go to Settings → Connectors
2. Add a new MCP server:
   - **Type:** remote
   - **Name:** reckon-ops
   - **URL:** `http://localhost:3001/mcp`

### 5. Run RECKON

```bash
npm run dev
```

Or with a custom task:

```bash
npm run dev -- "Investigate the files in the current directory and check for issues"
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design.

## Components

| Component | Description | Command |
|-----------|-------------|---------|
| TrueForge | Agent harness runtime | `npx @truefoundry/trueforge` |
| MCP HTTP Bridge | Exposes stdio MCP server over HTTP | `npm run mcp:http` |
| RECKON Agent | Controlled-autonomy orchestrator | `npm run dev` |

## MCP Server

The MCP server (`mcp-server/server.ts`) provides 8 tools for operational management:

| Tool | Type | Description |
|------|------|-------------|
| `get_config` | READ | Read configuration value |
| `set_config` | WRITE | Set configuration value (consequential) |
| `list_configs` | READ | List all configurations |
| `get_service_status` | READ | Get service status |
| `list_services` | READ | List all services |
| `restart_service` | WRITE | Restart service (consequential) |
| `get_mutation_log` | READ | Get mutation history |
| `reset_state` | WRITE | Reset to initial state |

## MCP HTTP Bridge

The bridge (`mcp-http-bridge.ts`) translates between TrueForge's HTTP transport and the MCP server's stdio transport:

```
TrueForge (HTTP) → Bridge → MCP Server (stdio)
```

**Bridge endpoints:**
- `POST /mcp` - MCP JSON-RPC messages
- `GET /mcp` - SSE stream for session
- `DELETE /mcp` - Terminate session
- `GET /health` - Health check

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Run MCP bridge
npm run mcp:http

# Run RECKON agent
npm run dev
```

## Environment Variables

```bash
TRUEFORGE_BASE_URL=http://localhost:8790  # TrueForge server URL
BRIDGE_PORT=3001                          # MCP HTTP bridge port
```

## License

MIT
