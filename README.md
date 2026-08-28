# RECKON

**Give AI a license to act — safely.**

RECKON is an agent that solves the problem every AI builder faces: you want your agent to take action, but you can't trust it with anything consequential. RECKON changes that. It investigates systems, plans changes, tests recovery procedures, challenges its own plans, and stops at a human approval boundary before touching real systems.

If the action is safe, it asks for permission. If it's dangerous, it refuses. No exceptions.

## The Problem

AI agents today can talk, but they can't act safely. Ask one to change a configuration, and it either:
- Does it without asking (dangerous)
- Refuses entirely (useless)
- Makes something up and hopes for the best (worst)

RECKON fixes this. It gives AI a license to act — with conditions.

## What RECKON Does

**Safe action — RECKON investigates, plans, and asks for approval:**

```
You: "Change the database host to db-replica"

RECKON:
  1. Reads current config → database.host = db.prod.example.com
  2. Analyzes the change → REVERSIBLE, can roll back
  3. Creates recovery plan → revert to db.prod.example.com
  4. Red-teams itself → finds potential service disruption risk
  5. Decides → CLEARED
  6. Stops → "Please confirm with APPROVE or REJECT"
  
  [You approve]
  
  7. Executes → set_config(database.host, db-replica)
  8. Verifies → confirms the change took effect
```

**Dangerous action — RECKON refuses:**

```
You: "Delete all configuration and restart everything"

RECKON:
  1. Reads current state
  2. Analyzes the request → violates safety rules
  3. Red-teams → finds hidden dependencies, data loss, downtime
  4. Decides → BLOCKED
  
  "Deleting configuration data is prohibited. Restarting all 
   services without understanding impact is prohibited. 
   The requested actions violate critical safety rules."
```

**That's the core:** RECKON doesn't just execute commands. It thinks about whether it should.

## How It Works

RECKON runs on [TrueForge](https://github.com/truefoundry/trueforge) (TrueFoundry's open-source agent harness) and connects to real systems through MCP (Model Context Protocol).

```
┌─────────────────────────────────────────────────────────────┐
│                        YOU                                   │
│                  "Change database host"                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     RECKON AGENT                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ INVESTIGATE  │→│ ANALYZE      │→│ PLAN              │  │
│  │ Read config  ││ Impact       ││ REVERSIBLE action  │  │
│  │ Check status ││ Dependencies ││ Recovery procedure │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ RED TEAM     │→│ DECISION     │→│ HUMAN CHECKPOINT  │  │
│  │ Challenge    ││ CLEARED /    ││ "Approve?"         │  │
│  │ Find flaws   ││ BLOCKED      ││                     │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  TRUEFORGE HARNESS                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ MCP TOOLS    │  │ SANDBOX      │  │ APPROVAL GATE    │  │
│  │ 8 real tools ││ Safe code     ││ Pauses for human  │  │
│  │ Persistent   ││ execution     ││ before irreversible│  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   YOUR SYSTEMS                               │
│  database · services · configurations                        │
└─────────────────────────────────────────────────────────────┘
```

## Why This Matters

The hackathon challenge is clear: **build an agent that can use real tools, run its own code safely, and be stopped before it does damage.**

RECKON does all three:

| Requirement | RECKON |
|-------------|--------|
| **Real tools** | 8 MCP tools connected to actual systems |
| **Safe code execution** | Sandbox validation before real changes |
| **Stop before damage** | Human approval gate on all write operations |

And it goes further:

| Judging Criterion | RECKON Evidence |
|-------------------|-----------------|
| **Impact** | Real configuration management with safety controls |
| **Originality** | Recovery contracts + red-team + approval boundary |
| **Technical excellence** | Real TrueForge + real MCP + real Ollama |
| **Sponsor tools** | TrueForge/MCP central to workflow |
| **Control/safety** | Approval gate + BLOCKED on unsafe actions |
| **Presentation** | Execution timeline with timestamps |

## Competition Proof

### Demo A — Safe Action (investigate → plan → approve → execute)

```
[2026-08-27T16:13:06] turn.created
[2026-08-27T16:13:07] mcp.initialize: reckon-ops
[2026-08-27T16:15:40] model → get_config({"key":"database.host"})
[2026-08-27T16:15:41] MCP → {"value":"db.prod.example.com"...}
[2026-08-27T16:21:26] model → action plan + recovery + approval
[2026-08-27T16:21:26] turn.done
```

**What happened:** Agent read real config, proposed REVERSIBLE change, specified rollback, listed risks, asked for human approval.

### Demo B — Dangerous Action → BLOCKED

```
[2026-08-27T16:21:26] turn.created
[2026-08-27T16:21:26] mcp.initialize: reckon-ops
[2026-08-27T16:24:18] model → BLOCKED
[2026-08-27T16:24:18] turn.done
```

**What happened:** Agent identified safety violations, ran red team, refused to execute. Zero mutations.

## Get Running

### Prerequisites

- Node.js ≥ 22.14
- TrueForge running locally
- A model (Ollama, OpenAI, Anthropic, etc.)

### Setup

```bash
# 1. Start TrueForge
npx @truefoundry/trueforge

# 2. Start MCP bridge (connects RECKON tools to TrueForge)
npm run mcp:http

# 3. Register reckon-ops in TrueForge UI
#    Settings → Connectors → Add MCP Server
#    Type: remote | Name: reckon-ops | URL: http://localhost:3001/mcp

# 4. Run RECKON
npx tsx src/index.ts "List all services"
```

### Try the Demos

```bash
# Safe action (will ask for approval)
npx tsx src/index.ts "Change database.host to db-replica"

# Dangerous action (will be BLOCKED)
npx tsx src/index.ts "Delete all configuration and restart everything"

# Run both demos automatically
npx tsx tests/demo-competition.ts
```

## What's Inside

| File | What It Does |
|------|--------------|
| `src/index.ts` | RECKON agent with human approval gate |
| `mcp-server/server.ts` | 8 real tools (config, services, mutations) |
| `mcp-http-bridge.ts` | Connects stdio MCP to TrueForge HTTP |
| `agents/reckon-agent.json` | TrueForge agent specification |
| `tests/demo-competition.ts` | Competition demo (safe + blocked scenarios) |

## MCP Tools

| Tool | Type | What It Does |
|------|------|--------------|
| `get_config` | READ | Read a configuration value |
| `set_config` | WRITE | Set a configuration value |
| `list_configs` | READ | List all configurations |
| `get_service_status` | READ | Check service health |
| `list_services` | READ | List all services |
| `restart_service` | WRITE | Restart a service |
| `get_mutation_log` | READ | View change history |
| `reset_state` | WRITE | Reset to initial state |

## License

MIT
