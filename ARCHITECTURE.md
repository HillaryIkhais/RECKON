# RECKON Architecture

## Core Thesis

AI agents should not receive permission to perform consequential actions simply because they are confident. Before an agent acts, it should investigate, plan, determine consequences, generate recovery procedures, test recovery in a sandbox, challenge its own plan, and only then request human authorization.

## System Components

### 1. Orchestrator (`src/orchestrator.ts`)

The main agent loop that coordinates all phases. Built on TrueForge's agent execution loop — NOT a custom loop.

**Responsibilities:**
- Receive task from user
- Drive the phase state machine
- Delegate to subagents for parallel work
- Enforce phase transitions (no skipping)

**Phase State Machine:**
```
INTAKE → INVESTIGATION → ANALYSIS → ACTION_PLAN → RECOVERY_CONTRACT → SANDBOX_VALIDATION → RED_TEAM → DECISION → HUMAN_CHECKPOINT → EXECUTION → VERIFICATION
```

### 2. Investigation Module (`src/investigation.ts`)

Uses MCP tools to gather evidence. Maintains explicit investigation state.

**MCP Tools Used:**
- Any read-only MCP server (GitHub, database, monitoring, etc.)
- Investigation results stored as structured evidence

### 3. Analysis Module (`src/analysis.ts`)

Uses model reasoning + sandbox code execution for data analysis.

**TrueForge Capabilities Used:**
- Code Mode: Generate and execute Python scripts in sandbox
- Sandbox: Isolated execution environment

### 4. Planning Module (`src/planning.ts`)

Generates action plan and classifies reversibility.

**Classifications:**
- `READ_ONLY` — no side effects
- `REVERSIBLE` — can be undone
- `COMPENSABLE` — can be compensated
- `IRREVERSIBLE` — cannot be undone
- `UNKNOWN` — must not be executed

### 5. Recovery Contract Generator (`src/recovery-contract.ts`)

Generates structured recovery contracts before any consequential action.

**Contract Fields:**
- proposed_action
- preconditions
- expected_outcome
- affected_resources
- blast_radius
- recovery_procedure
- recovery_preconditions
- verification_conditions
- reversibility_classification
- risks
- unresolved_uncertainties

### 6. Sandbox Validation (`src/sandbox-validation.ts`)

Executes proposed action + recovery in sandbox, verifies state restoration.

**TrueForge Capabilities Used:**
- Sandbox as tool: Real isolated execution
- Code Mode: Execute generated scripts
- Results are REAL, not model-generated statements

### 7. Red Team Subagent (`src/red-team.ts`)

Separate TrueForge subagent that attacks the proposed plan.

**TrueForge Capabilities Used:**
- Dynamic subagents: Parallel isolated execution
- Own context window: No pollution of parent agent

**Attacks:**
- Missing preconditions
- Hidden dependencies
- Incomplete rollback
- Data loss scenarios
- Incorrect assumptions
- Side effects
- Recovery failure modes
- Contradictory evidence

### 8. Decision Engine (`src/decision.ts`)

Produces one of: `CLEARED`, `NEEDS_MORE_EVIDENCE`, `BLOCKED`.

Only `CLEARED` reaches the human checkpoint.

### 9. Human Checkpoint (`src/human-checkpoint.ts`)

Uses TrueForge's actual approval mechanism.

**TrueForge Capabilities Used:**
- Tool approval: `require_approval_for_tools`
- Ask clarifying questions: For ambiguous situations
- Generative UI: Rich approval display

### 10. Execution & Verification (`src/execution.ts`)

After approval, executes real MCP mutation and verifies outcome.

## TrueForge Integration Points

| Capability | How RECKON Uses It |
|---|---|
| MCP tools | Investigation (read) + Execution (write) |
| Sandbox | Recovery testing + Code execution |
| Human checkpoints | Approval before consequential actions |
| Subagents | Red team challenge + parallel investigation |
| Sessions | Persistent execution history |
| Context management | Long-running investigations |
| Code Mode | Data analysis + recovery testing |
| Tool approval | Gating write/destructive MCP tools |

## Data Flow

```
User Task
    ↓
INTAKE: Parse task, identify affected systems
    ↓
INVESTIGATION: MCP read tools → evidence collection
    ↓
ANALYSIS: Model reasoning + sandbox code execution
    ↓
ACTION_PLAN: Generate plan + classify reversibility
    ↓
RECOVERY_CONTRACT: Generate recovery document
    ↓
SANDBOX_VALIDATION: Execute action + recovery in sandbox
    ↓
RED_TEAM: Subagent challenges the plan
    ↓
DECISION: CLEARED / NEEDS_MORE_EVIDENCE / BLOCKED
    ↓ (if CLEARED)
HUMAN_CHECKPOINT: TrueForge approval gate
    ↓ (if approved)
EXECUTION: Real MCP mutation
    ↓
VERIFICATION: MCP read tools confirm outcome
    ↓
SESSION_RECORD: Full execution history preserved
```

## File Structure

```
reckon/
├── src/
│   ├── orchestrator.ts          # Main agent loop
│   ├── investigation.ts         # Evidence gathering
│   ├── analysis.ts              # Hypothesis formation
│   ├── planning.ts              # Action plan generation
│   ├── recovery-contract.ts     # Recovery contract generator
│   ├── sandbox-validation.ts    # Sandbox testing
│   ├── red-team.ts              # Red team subagent
│   ├── decision.ts              # Decision engine
│   ├── human-checkpoint.ts      # Approval handling
│   ├── execution.ts             # Action execution
│   ├── verification.ts          # Post-action verification
│   ├── state.ts                 # State machine
│   ├── types.ts                 # TypeScript types
│   └── index.ts                 # Entry point
├── agents/
│   └── reckon-agent.json        # TrueForge agent spec
├── package.json
├── tsconfig.json
└── ARCHITECTURE.md
```

## MVP Vertical Slice

The first working version implements:

1. User provides task → "Investigate this production anomaly"
2. TrueForge agent receives task via SDK
3. Agent uses MCP read tool to gather evidence
4. Agent generates analysis code, executes in sandbox
5. Agent generates recovery contract
6. Agent tests recovery in sandbox
7. Agent uses TrueForge tool approval for human checkpoint
8. Agent executes MCP mutation after approval
9. Agent verifies outcome

This proves: MCP tools, sandbox execution, human approval, harness orchestration.
