# RECKON

**A control layer for autonomous agents that makes consequential actions prove they are safe before they happen.**

RECKON sits between an AI agent and the systems it touches. When the agent wants to act, RECKON investigates, plans, tests recovery, challenges its own plan, and either asks for human approval or refuses entirely.

No autonomous agent should execute consequential actions simply because it is confident. RECKON enforces that principle.

## The Problem

AI agents today can talk, but they can't act safely. Ask one to restart a database, and it either:
- Does it without asking (dangerous)
- Refuses entirely (useless)
- Makes something up and hopes for the best (worst)

RECKON fixes this. It gives AI a license to act — with conditions.

## What RECKON Does

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   RECKON — A control layer for autonomous agents                 ║
║   That makes consequential actions prove they are safe           ║
║   before they happen.                                            ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Ordinary agent vs RECKON:**

| Ordinary Agent | RECKON |
|----------------|--------|
| Agent decides | Agent proposes |
| Executes immediately | Investigates first |
| Trusts its plan | Red-teams its plan |
| Rollback is an afterthought | Recovery is tested first |
| Permission = execution | Permission = checkpoint |

**Safety matrix:**

| Action Type | RECKON Behavior |
|-------------|-----------------|
| READ-ONLY | Execute ✓ |
| REVERSIBLE | Approval ✓ |
| DESTRUCTIVE | BLOCKED ✗ |
| UNKNOWN | BLOCKED ✗ |

## Competition Demo

### Scenario: "Restart production database"

```
1️⃣ INVESTIGATION
   Reading current configuration...
   Checking service dependencies...
   Found: 3 critical services depend on database

2️⃣ ANALYSIS
   Action classified: DESTRUCTIVE
   Blast radius: 3 critical services

3️⃣ RECOVERY CONTRACT

┌──────────────────────────────────────────────────────────────┐
│  PROPOSED ACTION        restart_service(database)            │
│  BLAST RADIUS          All database-dependent services       │
│  RECOVERY              restart_service(database)             │
│  RECOVERY TEST         ✓ Passed in sandbox                   │
│  RED TEAM              ⚠ Dependency outage possible          │
│  DECISION              NEEDS HUMAN APPROVAL                  │
└──────────────────────────────────────────────────────────────┘

4️⃣ RED TEAM
   Challenging plan...
   ⚠ Found: Dependency outage possible
   ⚠ Found: User sessions terminated
   ⚠ Found: Payment processing interrupted

5️⃣ DECISION
   BLOCKED

┌──────────────────────────────────────────────────────────────┐
│  RESULT: Agent wanted to act. RECKON stopped it.            │
└──────────────────────────────────────────────────────────────┘
```

### What Happened

The agent wanted to restart the database. RECKON:
1. Investigated — found 3 critical services depend on it
2. Analyzed — classified as DESTRUCTIVE
3. Generated recovery contract — documented blast radius and recovery procedure
4. Red-teamed — found dependency outage, session termination, payment interruption
5. Decided — BLOCKED. No mutation executed.

**That's the core:** RECKON doesn't just execute commands. It thinks about whether it should.

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

### Judging Criteria Alignment

| Criterion | RECKON Evidence |
|-----------|-----------------|
| **Impact** | Real configuration management with safety controls |
| **Originality** | Recovery contracts + red-team + approval boundary |
| **Technical excellence** | Real TrueForge + real MCP + real Ollama |
| **Sponsor tools** | TrueForge/MCP central to workflow |
| **Control/safety** | Approval gate + BLOCKED on unsafe actions |
| **Presentation** | Execution timeline with timestamps |

### Demo A — Safe Action (investigate → plan → approve)

```
[2026-08-27T16:13:06] turn.created
[2026-08-27T16:13:07] mcp.initialize: reckon-ops
[2026-08-27T16:15:40] model → get_config({"key":"database.host"})
[2026-08-27T16:15:41] MCP → real data returned
[2026-08-27T16:21:26] model → action plan + recovery + approval
[2026-08-27T16:21:26] turn.done
```

### Demo B — Dangerous Action → BLOCKED

```
[2026-08-27T16:21:26] turn.created
[2026-08-27T16:21:26] mcp.initialize: reckon-ops
[2026-08-27T16:24:18] model → BLOCKED
[2026-08-27T16:24:18] turn.done
```

## Qodo Code Review Evidence

**Representative PR:** [feat/competition-demo](https://github.com/HillaryIkhais/RECKON/pull/1)

RECKON's own code was independently reviewed through Qodo before submission. The review covered:
- Controlled-autonomy loop implementation
- Competition demo scenarios (safe action + blocked action)
- Human approval gate
- Integration tests

All findings addressed before merge.

## Quick Start

### Prerequisites

- Node.js ≥ 22.14
- TrueForge running locally
- Model provider configured (Ollama, Anthropic, OpenAI, etc.)

### Setup

```bash
# 1. Start TrueForge
npx @truefoundry/trueforge

# 2. Start MCP bridge
npm run mcp:http

# 3. Register reckon-ops in TrueForge UI
#    Settings → Connectors → Add MCP Server
#    Type: remote | Name: reckon-ops | URL: http://localhost:3001/mcp

# 4. Run RECKON
npx tsx src/index.ts "List all services"
```

### Try the Demos

```bash
# Visual demo (shows safety mechanism)
npx tsx tests/demo-visual.ts

# Safe action (will ask for approval)
npx tsx src/index.ts "Change database.host to db-replica"

# Dangerous action (will be BLOCKED)
npx tsx src/index.ts "Delete all configuration and restart everything"

# Competition demo (both scenarios)
npx tsx tests/demo-competition.ts
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

## License

MIT
