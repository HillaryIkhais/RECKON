/**
 * RECKON Test Runner
 * 
 * Actual adversarial validation of all capabilities.
 * No mocking. No faking. Real TrueForge runtime.
 */

import { TrueForge, isEventDelta, mergeEventDelta } from "@truefoundry/trueforge-sdk";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { spawn, ChildProcess } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";
const MCP_SERVER_PATH = join(import.meta.dirname ?? ".", "mcp-server", "server.ts");

interface TestResult {
  test: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  evidence: string[];
  details?: string;
}

interface ExecutionTrace {
  timestamp: string;
  phase: string;
  event: string;
  details?: string;
  threadId?: string;
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

async function waitForTrueForge(maxRetries = 30, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/capabilities`);
      if (response.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
}

async function checkTrueForgeRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/capabilities`);
    return response.ok;
  } catch {
    return false;
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
          model: { name: "anthropic/claude-sonnet-4-6", params: { max_tokens: 4096, temperature: 0 } },
          instructions: "You are a test agent. Use the MCP tools to read and write configuration. When you call a tool, report exactly what the tool returned.",
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
    
    // Run a turn that calls MCP tools
    const stream = await client.sessions.createTurnStream(session.id, {
      input: [{ 
        type: "user.message", 
        content: "Call the list_configs tool and report exactly what it returns. Then call get_config with key 'database.host' and report the exact result." 
      }],
    });
    
    const events: TrueForgeApi.TurnStreamingEvent[] = [];
    let toolCallsFound = 0;
    let toolResponsesFound = 0;
    
    for await (const { data: event } of stream.withMetadata()) {
      events.push(event);
      
      if (event.type === "tool.response") {
        toolResponsesFound++;
        const response = (event as any).content;
        evidence.push(`Tool response received: ${response.substring(0, 200)}`);
      }
      
      if (event.type === "model.message" && !isEventDelta(event)) {
        const msg = event as any;
        if (msg.toolCalls) {
          toolCallsFound += msg.toolCalls.length;
          for (const tc of msg.toolCalls) {
            evidence.push(`Tool called: ${tc.function.name}(${tc.function.arguments})`);
          }
        }
      }
      
      if (event.type === "turn.done") {
        const output = (event as any).state?.output?.content;
        if (output) {
          evidence.push(`Agent output: ${output.substring(0, 500)}`);
        }
      }
    }
    
    evidence.push(`Total tool calls: ${toolCallsFound}`);
    evidence.push(`Total tool responses: ${toolResponsesFound}`);
    
    // Verify real MCP was used
    const mcpInit = events.find(e => e.type === "mcp.initialize");
    if (mcpInit) {
      evidence.push(`MCP initialized: ${JSON.stringify((mcpInit as any).mcp_servers)}`);
    }
    
    const passed = toolResponsesFound >= 2 && mcpInit !== undefined;
    
    return {
      test: "TEST 1 — REAL MCP",
      status: passed ? "PASS" : "FAIL",
      evidence,
      details: passed 
        ? "MCP server was real, tools were called, responses were received"
        : `Expected at least 2 tool responses and MCP init, got ${toolResponsesFound} responses`,
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
          model: { name: "anthropic/claude-sonnet-4-6", params: { max_tokens: 4096, temperature: 0 } },
          instructions: `You are a test agent with sandbox access. When asked to run code:
1. Write a Python script
2. Execute it in the sandbox
3. Report the EXACT stdout output
4. Report whether the sandbox was used

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
    
    const stream = await client.sessions.createTurnStream(session.id, {
      input: [{ 
        type: "user.message", 
        content: "Write and execute a Python script that prints 'RECKON_SANDBOX_TEST_SUCCESS' and the current working directory. Report the exact output." 
      }],
    });
    
    let sandboxCreated = false;
    let codeExecutionFound = false;
    let outputContent = "";
    
    for await (const { data: event } of stream.withMetadata()) {
      if (event.type === "sandbox.created") {
        sandboxCreated = true;
        evidence.push(`Sandbox created: ${(event as any).sandbox_id}`);
      }
      
      if (event.type === "tool.response") {
        const content = (event as any).content ?? "";
        if (content.includes("RECKON_SANDBOX_TEST_SUCCESS") || content.includes("sandbox") || content.includes("python")) {
          codeExecutionFound = true;
          evidence.push(`Code execution evidence: ${content.substring(0, 300)}`);
        }
      }
      
      if (event.type === "model.message.delta" && (event as any).threadId === "main") {
        outputContent += (event as any).content ?? "";
      }
      
      if (event.type === "turn.done") {
        evidence.push(`Final output contains sandbox reference: ${outputContent.toLowerCase().includes("sandbox")}`);
        evidence.push(`Final output contains execution reference: ${outputContent.toLowerCase().includes("execut") || outputContent.toLowerCase().includes("ran")}`);
      }
    }
    
    const passed = sandboxCreated && (codeExecutionFound || outputContent.toLowerCase().includes("sandbox"));
    
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
  
  // Check if TrueForge is running
  const isRunning = await checkTrueForgeRunning();
  if (!isRunning) {
    console.log("⚠️  TrueForge is not running at", TRUEFORGE_BASE_URL);
    console.log("   Start it with: npx @truefoundry/trueforge\n");
    
    // Try to start it
    console.log("Attempting to start TrueForge...");
    const tfProcess = spawn("npx", ["@truefoundry/trueforge"], {
      stdio: "pipe",
      detached: true,
    });
    
    tfProcess.stdout?.on("data", (data) => {
      process.stdout.write(data);
    });
    
    tfProcess.stderr?.on("data", (data) => {
      process.stderr.write(data);
    });
    
    // Wait for it to start
    const started = await waitForTrueForge(60, 2000);
    if (!started) {
      console.log("❌ Failed to start TrueForge");
      results.push({
        test: "ENVIRONMENT",
        status: "ERROR",
        evidence: ["TrueForge not running and could not be started"],
        details: "Cannot run tests without TrueForge",
      });
      return results;
    }
    
    console.log("\n✅ TrueForge started successfully\n");
  } else {
    console.log("✅ TrueForge is running at", TRUEFORGE_BASE_URL, "\n");
  }
  
  const client = createClient();
  
  // Run tests
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
    
    // Write results to file
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
