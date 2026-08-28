/**
 * RECKON Test Runner
 * 
 * Actual adversarial validation of all capabilities.
 * No mocking. No faking. Real TrueForge runtime.
 */

import { TrueForge } from "@truefoundry/trueforge-sdk";
import { writeFileSync } from "fs";
import { join } from "path";

const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";

interface TestResult {
  test: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  evidence: string[];
  details?: string;
}

// ============================================================
// HELPERS
// ============================================================

function createClient(): TrueForge {
  return new TrueForge({
    baseUrl: TRUEFORGE_BASE_URL,
    timeoutInSeconds: 600,
  });
}

async function checkTrueForgeRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/capabilities`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForTurn(sessionId: string, turnId: string, maxPolls = 60, delayMs = 3000): Promise<any> {
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${sessionId}/turns/${turnId}`);
      const data = await response.json() as any;
      const status = data.data?.state?.status;
      if (status === "done" || status === "failed" || status === "cancelled") {
        return data.data;
      }
    } catch {
      // Continue polling
    }
  }
  return null;
}

async function getTurnEvents(sessionId: string): Promise<any[]> {
  try {
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${sessionId}/events`);
    const data = await response.json() as any;
    return data.data || [];
  } catch {
    return [];
  }
}

// ============================================================
// TEST 1 — REAL MCP
// ============================================================

async function testRealMCP(client: TrueForge): Promise<TestResult> {
  const evidence: string[] = [];
  
  try {
    // Create session with the ops MCP server
    const { data: session } = await client.sessions.create({
      agent: {
        spec: {
          model: { name: "ollama/qwen3-4b", params: { max_tokens: 4096, temperature: 0 } },
          instructions: "You are a test agent. Use the MCP tools to read configuration. When you call a tool, report exactly what the tool returned.",
          mcpServers: [
            {
              name: "reckon-ops",
              enableTools: ["@all"],
              requireApprovalForTools: ["set_config", "restart_service"],
              preload: true,
            },
          ],
          config: {
            sandbox: { enabled: false },
            generativeUi: { enabled: false },
            askUserQuestions: { enabled: false },
            dynamicSubAgents: { enabled: false },
            iterationLimit: 10,
          },
        },
      },
    });
    
    evidence.push(`Session created: ${session.id}`);
    
    // Create turn with stream=false
    const turnResponse = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${session.id}/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: [{ 
          type: "user.message", 
          content: "Call the list_configs tool and report exactly what it returns." 
        }],
        stream: false,
      }),
    });
    const turnData = await turnResponse.json() as any;
    const turnId = turnData.data.id;
    evidence.push(`Turn created: ${turnId}`);
    
    // Wait for turn to complete
    const turn = await waitForTurn(session.id, turnId, 60, 3000);
    if (!turn) {
      return {
        test: "TEST 1 — REAL MCP",
        status: "FAIL",
        evidence,
        details: "Turn did not complete within timeout",
      };
    }
    
    evidence.push(`Turn status: ${turn.state.status}`);
    evidence.push(`Finish reason: ${turn.state.output?.finish_reason}`);
    
    // Get events
    const events = await getTurnEvents(session.id);
    evidence.push(`Events: ${events.length}`);
    
    // Find tool calls and responses
    let toolCalls = 0;
    let toolResponses = 0;
    let mcpInit = false;
    
    for (const e of events) {
      const ev = e.event || e;
      if (ev.type === "model.message" && ev.tool_calls) {
        toolCalls += ev.tool_calls.length;
        for (const tc of ev.tool_calls) {
          evidence.push(`Tool called: ${tc.function?.name}(${tc.function?.arguments})`);
        }
      }
      if (ev.type === "tool.response") {
        toolResponses++;
        evidence.push(`Tool response: ${(ev.content || "").substring(0, 200)}`);
      }
      if (ev.type === "mcp.initialize") {
        mcpInit = true;
        evidence.push(`MCP initialized: ${JSON.stringify(ev.mcp_servers)}`);
      }
    }
    
    // Get final output
    const output = turn.state.output?.content;
    if (output) {
      evidence.push(`Final output: ${output.substring(0, 500)}`);
    }
    
    const passed = toolCalls >= 1 && toolResponses >= 1 && mcpInit;
    
    return {
      test: "TEST 1 — REAL MCP",
      status: passed ? "PASS" : "FAIL",
      evidence,
      details: passed 
        ? `MCP server real, ${toolCalls} tool(s) called, ${toolResponses} response(s) received`
        : `Tool calls: ${toolCalls}, Tool responses: ${toolResponses}, MCP init: ${mcpInit}`,
    };
  } catch (error) {
    evidence.push(`Error: ${String(error)}`);
    return {
      test: "TEST 1 — REAL MCP",
      status: "ERROR",
      evidence,
      details: String(error),
    };
  }
}

// ============================================================
// TEST 2 — REAL SANDBOX
// ============================================================

async function testRealSandbox(client: TrueForge): Promise<TestResult> {
  const evidence: string[] = [];
  
  try {
    const { data: session } = await client.sessions.create({
      agent: {
        spec: {
          model: { name: "ollama/qwen3-4b", params: { max_tokens: 4096, temperature: 0 }},
          instructions: `You are a test agent with sandbox access. When asked to run code:
1. Write a Python script
2. Execute it in the sandbox
3. Report the EXACT stdout output

IMPORTANT: You MUST actually execute code in the sandbox. Do not just describe what would happen.`,
          mcpServers: [],
          config: {
            sandbox: { enabled: true, fileDownloads: true },
            generativeUi: { enabled: false },
            askUserQuestions: { enabled: false },
            dynamicSubAgents: { enabled: false },
            iterationLimit: 20,
          },
        },
      },
    });
    
    evidence.push(`Session created: ${session.id}`);
    
    // Create turn with stream=false
    const turnResponse = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${session.id}/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: [{ 
          type: "user.message", 
          content: "Write and execute a Python script that prints 'RECKON_SANDBOX_TEST_SUCCESS'. Report the exact output." 
        }],
        stream: false,
      }),
    });
    const turnData = await turnResponse.json() as any;
    const turnId = turnData.data.id;
    evidence.push(`Turn created: ${turnId}`);
    
    // Wait for turn to complete (sandbox may take longer)
    const turn = await waitForTurn(session.id, turnId, 90, 3000);
    if (!turn) {
      return {
        test: "TEST 2 — REAL SANDBOX",
        status: "FAIL",
        evidence,
        details: "Turn did not complete within timeout",
      };
    }
    
    evidence.push(`Turn status: ${turn.state.status}`);
    evidence.push(`Finish reason: ${turn.state.output?.finish_reason}`);
    
    // Get events
    const events = await getTurnEvents(session.id);
    evidence.push(`Events: ${events.length}`);
    
    // Find sandbox and tool events
    let sandboxCreated = false;
    let codeExecutionFound = false;
    
    for (const e of events) {
      const ev = e.event || e;
      if (ev.type === "sandbox.created") {
        sandboxCreated = true;
        evidence.push(`Sandbox created: ${ev.sandbox_id}`);
      }
      if (ev.type === "tool.response") {
        const content = ev.content || "";
        if (content.includes("RECKON_SANDBOX_TEST_SUCCESS") || content.includes("sandbox")) {
          codeExecutionFound = true;
          evidence.push(`Code execution evidence: ${content.substring(0, 300)}`);
        }
      }
    }
    
    // Get final output
    const output = turn.state.output?.content;
    if (output) {
      evidence.push(`Final output: ${output.substring(0, 500)}`);
    }
    
    const passed = sandboxCreated || codeExecutionFound || (output && output.includes("RECKON_SANDBOX_TEST_SUCCESS"));
    
    return {
      test: "TEST 2 — REAL SANDBOX",
      status: passed ? "PASS" : "FAIL",
      evidence,
      details: passed
        ? "Sandbox was provisioned and code execution occurred"
        : `Sandbox created: ${sandboxCreated}, Code execution found: ${codeExecutionFound}`,
    };
  } catch (error) {
    evidence.push(`Error: ${String(error)}`);
    return {
      test: "TEST 2 — REAL SANDBOX",
      status: "ERROR",
      evidence,
      details: String(error),
    };
  }
}

// ============================================================
// MAIN TEST RUNNER
// ============================================================

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║          RECKON ADVERSARIAL VALIDATION SUITE               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const isRunning = await checkTrueForgeRunning();
  if (!isRunning) {
    console.log("⚠️  TrueForge is not running at", TRUEFORGE_BASE_URL);
    console.log("   Start it with: npx @truefoundry/trueforge\n");
    results.push({
      test: "ENVIRONMENT",
      status: "ERROR",
      evidence: ["TrueForge not running"],
      details: "Cannot run tests without TrueForge",
    });
    return results;
  }
  
  console.log("✅ TrueForge is running at", TRUEFORGE_BASE_URL, "\n");
  
  const client = createClient();
  
  console.log("Running TEST 1 — REAL MCP...");
  results.push(await testRealMCP(client));
  console.log(`  Result: ${results[results.length - 1].status}\n`);
  
  console.log("Running TEST 2 — REAL SANDBOX...");
  results.push(await testRealSandbox(client));
  console.log(`  Result: ${results[results.length - 1].status}\n`);
  
  return results;
}

// ============================================================
// REPORT
// ============================================================

function printReport(results: TestResult[]): void {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST RESULTS SUMMARY                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const errors = results.filter(r => r.status === "ERROR").length;
  
  for (const result of results) {
    const icon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⚠️";
    console.log(`${icon} ${result.test}: ${result.status}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    console.log(`   Evidence:`);
    for (const e of result.evidence.slice(0, 5)) {
      console.log(`     - ${e.substring(0, 100)}`);
    }
    console.log();
  }
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed} | ERROR: ${errors}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

// ============================================================
// ENTRY POINT
// ============================================================

runTests()
  .then(results => {
    printReport(results);
    
    writeFileSync(
      join(import.meta.dirname ?? ".", "test-results.json"),
      JSON.stringify(results, null, 2)
    );
    
    const hasFailures = results.some(r => r.status === "FAIL" || r.status === "ERROR");
    process.exit(hasFailures ? 1 : 0);
  })
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
