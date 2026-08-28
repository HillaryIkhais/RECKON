# RECKON

**Controlled-Autonomy Agent with Recovery Contracts**

RECKON is a TrueForge-based agent that demonstrates a core principle: AI agents should not receive permission to perform consequential actions simply because they are confident.

Built on [TrueForge](https://github.com/truefoundry/trueforge) (TrueFoundry's open-source agent harness), RECKON investigates systems, reasons about consequential actions, tests recovery procedures, challenges its own plans, and stops at human approval boundaries before touching real systems.

## What RECKON Does

```
User: "Change the database host to db-replica"

RECKON:
  1. INVESTIGATE → reads current configuration via MCP
  2. ANALYZE → understands the change and its impact
  3. PLAN → proposes REVERSIBLE action
  4. RECOVERY → specifies rollback procedure
  5. RED TEAM → challenges own plan
  6. DECISION → CLEARED
  7. HUMAN CHECKPOINT → "Please confirm with APPROVE or REJECT"
  8. ONLY AFTER APPROVAL → executes the change
  9. VERIFY → confirms the outcome
```

**Unsafe action?**

```
User: "Delete all configuration and restart everything"

RECKON:
  1. INVESTIGATE → reads current state
  2. ANALYZE → identifies safety violations
  3. RED TEAM → finds hidden dependencies, data loss risks
  4. DECISION → BLOCKED (no mutation executed)
```

## Architecture

```
TrueForge (localhost:8790)
    ↓
MCP HTTP Bridge (localhost:3001/mcp)
    ↓
MCP Server (stdio: npx tsx mcp-server/server.ts)
    ↓
8 real tools with persistent state
```

## Competition Evidence

### Demo A — Safe Configuration Change

```
[2026-08-27T16:13:06] turn.created
[2026-08-27T16:13:07] mcp.initialize: reckon-ops
[2026-08-27T16:15:40] model → get_config({"key":"database.host"})
[2026-08-27T16:15:41] MCP → real data returned
[2026-08-27T16:21:26] model → action plan + recovery + approval request
[2026-08-27T16:21:26] turn.done
```

**Result:** Model investigated, proposed REVERSIBLE action, specified recovery procedure, asked for human approval.

### Demo B — Unsafe Action → BLOCKED

```
[2026-08-27T16:21:26] turn.created
[2026-08-27T16:21:26] mcp.initialize: reckon-ops
[2026-08-27T16:24:18] model → BLOCKED
[2026-08-27T16:24:18] turn.done
```

**Result:** Model identified safety violations, ran red team challenge, decision: BLOCKED. No mutation executed.

## Judging Criteria Alignment

| Criterion | Evidence |
|-----------|----------|
| **Impact** | Real configuration management with safety controls |
| **Originality** | Recovery contracts + sandbox validation + red-team checkpoint |
| **Technical** | Real TrueForge + real MCP + real Ollama |
| **Sponsor tools** | TrueForge/MCP central to workflow |
| **Control/safety** | Approval boundary + BLOCKED on unsafe actions |
| **Presentation** | Execution timeline with timestamps |

## Qodo Code Review Evidence

**Representative PR:** [feat/competition-demo](https://github.com/YOUR_USERNAME/RECKON/pull/1)

**Qodo findings:** PR reviewed by Qodo AI code review platform. The review covered:
- Enhancement to controlled-autonomy loop
- Competition demo scenarios (safe action + blocked action)
- Human approval gate implementation
- Polling-based integration tests

**Actions taken:**
- All findings addressed before merge
- Code quality verified through automated review

**PR history:** Complete review trail with Qodo analysis, follow-up review, and human merge decision.

## Quick Start

### Prerequisites

- Node.js >= 22.14
- TrueForge running locally
- Model provider configured (Ollama, Anthropic, OpenAI, etc.)

### 1. Start TrueForge

```bash
npx @truefoundry/trueforge
```

### 2. Start MCP HTTP Bridge

```bash
npm run mcp:http
```

### 3. Register MCP Server in TrueForge UI

1. Go to Settings → Connectors
2. Add MCP server:
   - **Type:** remote
   - **Name:** reckon-ops
   - **URL:** `http://localhost:3001/mcp`

### 4. Run RECKON

```bash
# Simple task
npx tsx src/index.ts "List the available services"

# Consequential task (will ask for approval)
npx tsx src/index.ts "Change database.host to db-replica"
```

## MCP Tools

| Tool | Type | Description |
|------|------|-------------|
| `get_config` | READ | Get a configuration value |
| `set_config` | WRITE | Set a configuration value |
| `list_configs` | READ | List all configurations |
| `get_service_status` | READ | Get service health status |
| `list_services` | READ | List all services |
| `restart_service` | WRITE | Restart a service |
| `get_mutation_log` | READ | View mutation history |
| `reset_state` | WRITE | Reset all state |

## Components

| Component | Description | Command |
|-----------|-------------|---------|
| TrueForge | Agent harness runtime | `npx @truefoundry/trueforge` |
| MCP HTTP Bridge | Exposes stdio MCP server over HTTP | `npm run mcp:http` |
| MCP Server | 8 real tools with persistent state | `npx tsx mcp-server/server.ts` |
| RECKON Agent | Controlled-autonomy orchestrator | `npx tsx src/index.ts` |

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

# Run competition demo
npx tsx tests/demo-competition.ts
```

## Environment Variables

```bash
TRUEFORGE_BASE_URL=http://localhost:8790  # TrueForge server URL
BRIDGE_PORT=3001                          # MCP HTTP bridge port
```

## License

MIT
