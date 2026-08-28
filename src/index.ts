import { TrueForge, isEventDelta, mergeEventDelta } from "@truefoundry/trueforge-sdk";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";

const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";

interface TimelineEntry {
  phase: string;
  event: string;
  timestamp: string;
  details?: string;
}

function createClient(): TrueForge {
  return new TrueForge({
    baseUrl: TRUEFORGE_BASE_URL,
    timeoutInSeconds: 600,
  });
}

function formatTimeline(entries: TimelineEntry[]): string {
  return entries
    .map((e) => `[${e.timestamp}] ${e.phase}: ${e.event}${e.details ? ` - ${e.details}` : ""}`)
    .join("\n");
}

async function runReckon(task: string): Promise<void> {
  const client = createClient();
  const timeline: TimelineEntry[] = [];

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                     RECKON AGENT                           ║");
  console.log("║  Controlled-Autonomy Agent with Investigation & Recovery   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`Task: ${task}\n`);
  console.log("Starting execution...\n");

  // Create session with inline agent spec
  const { data: session } = await client.sessions.create({
    agent: {
      spec: {
        model: { name: "ollama/qwen3-4b", params: { max_tokens: 8192, temperature: 0.1 } },
        instructions: `You are RECKON, a controlled-autonomy operations agent.

Use the available reckon-ops MCP tools directly. Never describe a tool call instead of performing it. Never claim an action was performed unless the tool actually returned a result.

Read-only operations may be performed autonomously. Before any write, destructive, or irreversible operation, stop and request human approval.

After a tool returns successfully:
- Treat the returned tool result as authoritative.
- Answer the user's request using that result directly.
- Do not call the same tool again unless the user explicitly requests another execution.
- Do not refuse to display, summarize, or interpret tool output.
- If the user asks for the actual tool result, return the result faithfully.
- Do not invent information that is not present in the tool result.
- Once the request has been fulfilled, stop.`,
        mcpServers: [
  {
    name: "reckon-ops",
    enableTools: ["@all"],
    requireApprovalForTools: [
      "set_config",
      "restart_service",
      "reset_state"
    ],
    preload: true,
  },
],
        config: {
          sandbox: { enabled: false },
          generativeUi: { enabled: false },
          askUserQuestions: { enabled: false },
          dynamicSubAgents: { enabled: false },
          contextManagement: {
            compaction: { enabled: false },
            largeToolResponse: { enabled: false },
          },
          iterationLimit: 20,
        },
      },
    },
  });

  console.log(`Session created: ${session.id}\n`);

  // Stream the turn
  const events = new Map<string, TrueForgeApi.TurnStreamingEvent>();
  const pendingApprovals: TrueForgeApi.ToolApprovalRequiredEvent[] = [];
  const pendingQuestions: TrueForgeApi.ToolResponseRequiredEvent[] = [];

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: "user.message", content: task }],
  });

  let currentPhase = "INTAKE";

  for await (const { data: event, id } of stream.withMetadata()) {
    if (isEventDelta(event)) {
      const base = events.get(event.id);
      if (base) mergeEventDelta(base, event);
    } else {
      events.set(event.id, event);
    }

    // Track phase transitions based on event content
    if (event.type === "model.message" && !isEventDelta(event)) {
      const content = (event as any).content ?? "";
      if (content.includes("INVESTIGATION") || content.includes("Gathering evidence")) {
        currentPhase = "INVESTIGATION";
        timeline.push({ phase: currentPhase, event: "Starting investigation", timestamp: new Date().toISOString() });
      } else if (content.includes("ANALYSIS") || content.includes("Forming hypotheses")) {
        currentPhase = "ANALYSIS";
        timeline.push({ phase: currentPhase, event: "Starting analysis", timestamp: new Date().toISOString() });
      } else if (content.includes("ACTION PLAN") || content.includes("Proposed action")) {
        currentPhase = "ACTION_PLAN";
        timeline.push({ phase: currentPhase, event: "Generating action plan", timestamp: new Date().toISOString() });
      } else if (content.includes("RECOVERY CONTRACT") || content.includes("Recovery procedure")) {
        currentPhase = "RECOVERY_CONTRACT";
        timeline.push({ phase: currentPhase, event: "Generating recovery contract", timestamp: new Date().toISOString() });
      } else if (content.includes("SANDBOX") || content.includes("Testing in sandbox")) {
        currentPhase = "SANDBOX_VALIDATION";
        timeline.push({ phase: currentPhase, event: "Testing in sandbox", timestamp: new Date().toISOString() });
      } else if (content.includes("RED TEAM") || content.includes("Challenging plan")) {
        currentPhase = "RED_TEAM";
        timeline.push({ phase: currentPhase, event: "Running red team challenge", timestamp: new Date().toISOString() });
      } else if (content.includes("DECISION") || content.includes("CLEARED") || content.includes("BLOCKED")) {
        currentPhase = "DECISION";
        timeline.push({ phase: currentPhase, event: "Making decision", timestamp: new Date().toISOString() });
      } else if (content.includes("APPROVAL") || content.includes("Waiting for")) {
        currentPhase = "HUMAN_CHECKPOINT";
        timeline.push({ phase: currentPhase, event: "Waiting for human approval", timestamp: new Date().toISOString() });
      }
    }

    // Track tool calls
    if (event.type === "tool.response") {
      const toolEvent = event as any;
      timeline.push({
        phase: currentPhase,
        event: `MCP tool call: ${toolEvent.tool_call_id}`,
        timestamp: new Date().toISOString(),
        details: `Tool responded`,
      });
    }

    // Track sandbox usage
    if (event.type === "sandbox.created") {
      timeline.push({
        phase: currentPhase,
        event: "Sandbox provisioned",
        timestamp: new Date().toISOString(),
      });
    }

    // Track subagents
    if (event.type === "thread.created") {
      const threadEvent = event as any;
      timeline.push({
        phase: currentPhase,
        event: `Subagent started: ${threadEvent.title}`,
        timestamp: new Date().toISOString(),
      });
    }

    if (event.type === "thread.done") {
      timeline.push({
        phase: currentPhase,
        event: "Subagent completed",
        timestamp: new Date().toISOString(),
      });
    }

    // Collect approval requests
    if (event.type === "tool.approval_required") {
      pendingApprovals.push(event as TrueForgeApi.ToolApprovalRequiredEvent);
    }

    // Collect question requests
    if (event.type === "tool.response_required") {
      pendingQuestions.push(event as TrueForgeApi.ToolResponseRequiredEvent);
    }

    // Print streaming model output
    if (event.type === "model.message.delta" && (event as any).threadId === "main") {
      process.stdout.write((event as any).content ?? "");
    }

    // Handle turn completion
    if (event.type === "turn.done") {
      const turnDone = event as any;
      console.log("\n");

      if (turnDone.state.status === "done" && turnDone.state.output) {
        // Print final output
        const output = turnDone.state.output;
        if (output.content) {
          console.log("\n--- Final Output ---\n");
          console.log(output.content);
        }
      }

      // Handle approvals
      if (pendingApprovals.length > 0) {
        console.log("\n⏸  PAUSED: Waiting for human approval\n");
        timeline.push({
          phase: "HUMAN_CHECKPOINT",
          event: "Paused for approval",
          timestamp: new Date().toISOString(),
        });

        // Show what needs approval
        for (const pending of pendingApprovals) {
          for (const ref of pending.toolCalls) {
            const msg = events.get(ref.sourceEventId);
            if (msg?.type !== "model.message") continue;
            const call = (msg as any).toolCalls?.find((tc: any) => tc.id === ref.id);
            if (!call) continue;
            console.log(`  Tool: ${call.toolInfo.name}`);
            console.log(`  Arguments: ${call.function.arguments}`);
          }
        }

        // Wait for human input
        console.log("\n  Type 'approve' to allow, 'reject' to deny, or 'quit' to exit:");
        const readline = await import("readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        
        const answer = await new Promise<string>((resolve) => {
          rl.question("  > ", (ans) => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          });
        });

        if (answer === "quit") {
          console.log("\nExiting...");
          process.exit(0);
        }

        const approvalStatus = answer === "approve" ? "allow" : "deny";
        console.log(`\n  ${approvalStatus === "allow" ? "✅ Approved" : "❌ Rejected"}\n`);

        timeline.push({
          phase: "HUMAN_CHECKPOINT",
          event: `Human ${approvalStatus === "allow" ? "approved" : "rejected"}`,
          timestamp: new Date().toISOString(),
        });

        // If rejected, stop here
        if (approvalStatus !== "allow") {
          console.log("Action rejected. Stopping.\n");
          process.exit(0);
        }

        const approvals: TrueForgeApi.UserToolApprovalEvent[] = [];
        for (const pending of pendingApprovals) {
          for (const ref of pending.toolCalls) {
            approvals.push({
              type: "user.tool_approval",
              threadId: (pending as any).threadId,
              toolCallId: ref.id,
              approval: { status: approvalStatus as "allow" | "deny" },
            });
          }
        }

        // Resume with approvals
        const resume = await client.sessions.createTurnStream(session.id, { input: approvals });
        for await (const { data: resumeEvent } of resume.withMetadata()) {
          if (resumeEvent.type === "model.message.delta" && (resumeEvent as any).threadId === "main") {
            process.stdout.write((resumeEvent as any).content ?? "");
          }
          if (resumeEvent.type === "turn.done") {
            console.log("\n");
            if ((resumeEvent as any).state.output?.content) {
              console.log("\n--- Final Output (after approval) ---\n");
              console.log((resumeEvent as any).state.output.content);
            }
          }
        }
      }

      // Handle questions
      if (pendingQuestions.length > 0) {
        console.log("\n⏸  PAUSED: Agent is asking a question\n");
        // In a real implementation, this would show a question UI
      }
    }
  }

  // Print timeline
  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                   EXECUTION TIMELINE                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(formatTimeline(timeline));
  console.log("\nSession ID:", session.id);
}

// Main entry
const task = process.argv[2] || "Investigate the current state of files in the current directory and determine if there are any configuration issues. If you find issues, propose a fix but do NOT execute it without approval.";

runReckon(task).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});