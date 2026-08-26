/**
 * RECKON Adversarial Validation - Phase 2
 * 
 * Tests the ACTUAL architecture:
 *   TrueForge → remote MCP → HTTP bridge → stdio MCP server
 */

import { writeFileSync } from "fs";
import { join } from "path";

const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://localhost:3001";

interface TestResult {
  test: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR" | "BLOCKED";
  evidence: string[];
  details?: string;
  requiresAction?: string;
}

// ============================================================
// HELPERS
// ============================================================

async function checkTrueForgeRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/capabilities`);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkBridgeRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function getModelProviders(): Promise<any[]> {
  try {
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/settings/model-providers`);
    const data = await response.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function getMCPServers(): Promise<any[]> {
  try {
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/settings/mcp-servers`);
    const data = await response.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function getMCPTools(serverName: string): Promise<any[]> {
  try {
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/mcp-servers/${serverName}/tools`);
    const data = await response.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ============================================================
// TEST 1 — INFRASTRUCTURE AUDIT
// ============================================================

async function testInfrastructure(): Promise<TestResult> {
  const evidence: string[] = [];
  
  try {
    const isRunning = await checkTrueForgeRunning();
    evidence.push(`TrueForge running: ${isRunning}`);
    
    if (!isRunning) {
      return {
        test: "TEST 1 — INFRASTRUCTURE AUDIT",
        status: "ERROR",
        evidence,
        details: "TrueForge is not running",
        requiresAction: "Start TrueForge with: npx @truefoundry/trueforge",
      };
    }
    
    const providers = await getModelProviders();
    evidence.push(`Model providers: ${providers.length}`);
    for (const p of providers) {
      evidence.push(`  - ${p.name} (${p.manifest?.type ?? p.type})`);
    }
    
    const mcpServers = await getMCPServers();
    evidence.push(`MCP servers: ${mcpServers.length}`);
    for (const s of mcpServers) {
      evidence.push(`  - ${s.name} (${s.manifest?.type})`);
    }
    
    const bridgeRunning = await checkBridgeRunning();
    evidence.push(`Bridge running: ${bridgeRunning}`);
    
    const capsResponse = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/capabilities`);
    const caps = await capsResponse.json();
    evidence.push(`Sandbox enabled: ${caps.data?.sandbox?.enabled ?? false}`);
    
    const hasModel = providers.length > 0;
    const hasMCP = mcpServers.length > 0;
    
    return {
      test: "TEST 1 — INFRASTRUCTURE AUDIT",
      status: hasModel && hasMCP ? "PASS" : "BLOCKED",
      evidence,
      details: hasModel && hasMCP 
        ? "Infrastructure ready: model + MCP configured"
        : `Missing: ${!hasModel ? "model provider " : ""}${!hasMCP ? "MCP server" : ""}`,
      requiresAction: !hasModel 
        ? "Configure a model provider" 
        : !hasMCP 
          ? "Register MCP server in TrueForge" 
          : undefined,
    };
  } catch (error) {
    evidence.push(`Error: ${String(error)}`);
    return {
      test: "TEST 1 — INFRASTRUCTURE AUDIT",
      status: "ERROR",
      evidence,
      details: String(error),
    };
  }
}

// ============================================================
// TEST 2 — MCP VIA TRUEFORGE (Real Architecture)
// ============================================================

async function testMCPViaTrueForge(): Promise<TestResult> {
  const evidence: string[] = [];
  
  try {
    // Step 1: Verify MCP server is registered in TrueForge
    const mcpServers = await getMCPServers();
    const reckonOps = mcpServers.find(s => s.name === "reckon-ops");
    
    if (!reckonOps) {
      return {
        test: "TEST 2 — MCP VIA TRUEFORGE",
        status: "BLOCKED",
        evidence: ["reckon-ops not registered in TrueForge"],
        details: "MCP server not registered",
        requiresAction: "Register reckon-ops in TrueForge UI",
      };
    }
    
    evidence.push(`reckon-ops registered: type=${reckonOps.manifest?.type}, url=${reckonOps.manifest?.url}`);
    
    // Step 2: List tools through TrueForge API
    const tools = await getMCPTools("reckon-ops");
    evidence.push(`Tools via TrueForge: ${tools.length}`);
    
    if (tools.length === 0) {
      return {
        test: "TEST 2 — MCP VIA TRUEFORGE",
        status: "FAIL",
        evidence,
        details: "No tools returned from TrueForge MCP endpoint",
      };
    }
    
    const toolNames = tools.map(t => t.name);
    evidence.push(`Tool names: ${toolNames.join(", ")}`);
    
    // Verify our 8 tools are present
    const expectedTools = ["get_config", "set_config", "list_configs", "get_service_status", "list_services", "restart_service", "get_mutation_log", "reset_state"];
    const missingTools = expectedTools.filter(t => !toolNames.includes(t));
    
    if (missingTools.length > 0) {
      evidence.push(`Missing tools: ${missingTools.join(", ")}`);
      return {
        test: "TEST 2 — MCP VIA TRUEFORGE",
        status: "FAIL",
        evidence,
        details: `Missing ${missingTools.length} tools`,
      };
    }
    
    evidence.push("All 8 expected tools present");
    
    // Step 3: Verify bridge is reachable
    const bridgeOk = await checkBridgeRunning();
    evidence.push(`Bridge reachable: ${bridgeOk}`);
    
    if (!bridgeOk) {
      return {
        test: "TEST 2 — MCP VIA TRUEFORGE",
        status: "FAIL",
        evidence,
        details: "HTTP bridge not reachable",
        requiresAction: "Start bridge with: npm run mcp:http",
      };
    }
    
    return {
      test: "TEST 2 — MCP VIA TRUEFORGE",
      status: "PASS",
      evidence,
      details: `MCP registered in TrueForge, ${tools.length} tools available via API`,
    };
  } catch (error) {
    evidence.push(`Error: ${String(error)}`);
    return {
      test: "TEST 2 — MCP VIA TRUEFORGE",
      status: "ERROR",
      evidence,
      details: String(error),
    };
  }
}

// ============================================================
// TEST 3 — SANDBOX CAPABILITY
// ============================================================

async function testSandboxCapability(): Promise<TestResult> {
  const evidence: string[] = [];
  
  try {
    const capsResponse = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/capabilities`);
    const caps = await capsResponse.json();
    const sandboxEnabled = caps.data?.sandbox?.enabled ?? false;
    evidence.push(`Sandbox enabled in capabilities: ${sandboxEnabled}`);
    
    // Check sandbox provider
    const sandboxResponse = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/settings/sandbox-providers`);
    const sandboxData = await sandboxResponse.json();
    const hasProvider = !sandboxData.error;
    evidence.push(`Sandbox provider configured: ${hasProvider}`);
    
    if (!sandboxEnabled) {
      return {
        test: "TEST 3 — SANDBOX CAPABILITY",
        status: "BLOCKED",
        evidence,
        details: "Sandbox not enabled in TrueForge capabilities",
      };
    }
    
    if (!hasProvider) {
      return {
        test: "TEST 3 — SANDBOX CAPABILITY",
        status: "BLOCKED",
        evidence,
        details: "Sandbox enabled but no provider configured - sessions can be created but code won't execute",
        requiresAction: "Configure a sandbox provider in TrueForge UI",
      };
    }
    
    return {
      test: "TEST 3 — SANDBOX CAPABILITY",
      status: "PASS",
      evidence,
      details: "Sandbox enabled and provider configured",
    };
  } catch (error) {
    evidence.push(`Error: ${String(error)}`);
    return {
      test: "TEST 3 — SANDBOX CAPABILITY",
      status: "ERROR",
      evidence,
      details: String(error),
    };
  }
}

// ============================================================
// TEST 4 — MCP INTEGRATION
// ============================================================

async function testMCPIntegration(): Promise<TestResult> {
  const evidence: string[] = [];
  
  try {
    const mcpServers = await getMCPServers();
    evidence.push(`MCP servers configured: ${mcpServers.length}`);
    
    if (mcpServers.length === 0) {
      return {
        test: "TEST 4 — MCP INTEGRATION",
        status: "BLOCKED",
        evidence,
        details: "No MCP servers configured",
        requiresAction: "Register reckon-ops in TrueForge",
      };
    }
    
    for (const server of mcpServers) {
      evidence.push(`  - ${server.name}: ${server.manifest?.url ?? "stdio"}`);
      
      try {
        const tools = await getMCPTools(server.name);
        evidence.push(`    Tools: ${tools.length}`);
      } catch (error) {
        evidence.push(`    Error listing tools: ${error}`);
      }
    }
    
    return {
      test: "TEST 4 — MCP INTEGRATION",
      status: "PASS",
      evidence,
      details: `${mcpServers.length} MCP server(s) configured and accessible`,
    };
  } catch (error) {
    evidence.push(`Error: ${String(error)}`);
    return {
      test: "TEST 4 — MCP INTEGRATION",
      status: "ERROR",
      evidence,
      details: String(error),
    };
  }
}

// ============================================================
// TEST 5 — AGENT CREATION
// ============================================================

async function testAgentCreation(): Promise<TestResult> {
  const evidence: string[] = [];
  
  try {
    const providers = await getModelProviders();
    
    if (providers.length === 0) {
      return {
        test: "TEST 5 — AGENT CREATION",
        status: "BLOCKED",
        evidence: ["No model providers configured"],
        details: "Cannot create agents without a model provider",
        requiresAction: "Configure a model provider",
      };
    }
    
    // Build model FQN from provider structure
    // Actual structure: { name: "ollama", manifest: { type: "custom", models: [{ model_id, name }] } }
    // TrueForge uses provider NAME for FQN, not manifest.type
    // Working example: "ollama/llama3-2" (not "custom/llama3.2:latest")
    const provider = providers[0];
    const manifest = provider.manifest ?? provider;
    const modelName = manifest.models?.[0]?.name; // Use "name" not "model_id"
    const providerName = provider.name; // Use provider name, not manifest.type
    const modelFQN = `${providerName}/${modelName}`;
    
    evidence.push(`Provider: ${provider.name}`);
    evidence.push(`Model FQN: ${modelFQN}`);
    
    if (!modelName) {
      return {
        test: "TEST 5 — AGENT CREATION",
        status: "FAIL",
        evidence,
        details: "Could not determine model ID from provider",
      };
    }
    
    // Try to create an agent
    const response = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "reckon-test-agent",
        manifest: {
          model: { name: modelFQN },
          instructions: "You are a test agent.",
          config: {
            sandbox: { enabled: false },
            dynamicSubAgents: { enabled: false },
          },
        },
      }),
    });
    
    const data = await response.json();
    evidence.push(`Create agent response: ${response.status}`);
    
    if (response.ok) {
      evidence.push(`Agent created: ${data.data?.id}`);
      
      // Clean up
      if (data.data?.id) {
        await fetch(`${TRUEFORGE_BASE_URL}/api/v1/agents/${data.data.id}`, {
          method: "DELETE",
        });
        evidence.push("Test agent cleaned up");
      }
      
      return {
        test: "TEST 5 — AGENT CREATION",
        status: "PASS",
        evidence,
        details: `Agent created with model ${modelFQN}`,
      };
    } else {
      evidence.push(`Error: ${data.error?.message}`);
      return {
        test: "TEST 5 — AGENT CREATION",
        status: "FAIL",
        evidence,
        details: `Failed: ${data.error?.message}`,
      };
    }
  } catch (error) {
    evidence.push(`Error: ${String(error)}`);
    return {
      test: "TEST 5 — AGENT CREATION",
      status: "ERROR",
      evidence,
      details: String(error),
    };
  }
}

// ============================================================
// MAIN
// ============================================================

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║       RECKON ADVERSARIAL VALIDATION - PHASE 2              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  console.log("Running validation tests...\n");
  
  results.push(await testInfrastructure());
  console.log(`  ${results[results.length - 1].test}: ${results[results.length - 1].status}\n`);
  
  results.push(await testMCPViaTrueForge());
  console.log(`  ${results[results.length - 1].test}: ${results[results.length - 1].status}\n`);
  
  results.push(await testSandboxCapability());
  console.log(`  ${results[results.length - 1].test}: ${results[results.length - 1].status}\n`);
  
  results.push(await testMCPIntegration());
  console.log(`  ${results[results.length - 1].test}: ${results[results.length - 1].status}\n`);
  
  results.push(await testAgentCreation());
  console.log(`  ${results[results.length - 1].test}: ${results[results.length - 1].status}\n`);
  
  return results;
}

function printReport(results: TestResult[]): void {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    VALIDATION RESULTS                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const blocked = results.filter(r => r.status === "BLOCKED").length;
  const errors = results.filter(r => r.status === "ERROR").length;
  
  for (const result of results) {
    const icon = result.status === "PASS" ? "✅" 
      : result.status === "FAIL" ? "❌" 
      : result.status === "BLOCKED" ? "🚫"
      : "⚠️";
    console.log(`${icon} ${result.test}: ${result.status}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    if (result.requiresAction) {
      console.log(`   ⚡ ACTION: ${result.requiresAction}`);
    }
    console.log();
  }
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed} | BLOCKED: ${blocked} | ERROR: ${errors}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

runTests()
  .then(results => {
    printReport(results);
    
    writeFileSync(
      join(import.meta.dirname ?? ".", "test-results-phase2.json"),
      JSON.stringify(results, null, 2)
    );
    
    const hasFailures = results.some(r => r.status === "FAIL" || r.status === "ERROR");
    process.exit(hasFailures ? 1 : 0);
  })
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
