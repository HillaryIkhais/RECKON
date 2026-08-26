/**
 * RECKON MCP Server Test - Proper stdio communication
 */

import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { writeFileSync } from "fs";

const serverPath = join(import.meta.dirname ?? ".", "..", "mcp-server", "server.ts");

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

class MCPTestClient {
  private process: ChildProcess;
  private buffer: string = "";
  private pendingRequests: Map<number, { resolve: (value: MCPResponse) => void; reject: (error: Error) => void }> = new Map();
  private messageId: number = 0;

  constructor() {
    this.process = spawn("npx", ["tsx", serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (data) => {
      console.error("Server stderr:", data.toString());
    });
  }

  private processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg: MCPResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg);
        }
      } catch (e) {
        console.error("Failed to parse:", line);
      }
    }
  }

  async sendRequest(method: string, params: any = {}): Promise<MCPResponse> {
    const id = ++this.messageId;
    const request = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin?.write(request + "\n");

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 5000);
    });
  }

  async callTool(name: string, args: any = {}): Promise<any> {
    const response = await this.sendRequest("tools/call", { name, arguments: args });
    return response.result;
  }

  async listTools(): Promise<any[]> {
    const response = await this.sendRequest("tools/list");
    return response.result?.tools ?? [];
  }

  async initialize(): Promise<boolean> {
    try {
      const response = await this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "reckon-test", version: "1.0.0" },
      });
      return !!response.result;
    } catch {
      return false;
    }
  }

  close() {
    this.process.kill();
  }
}

async function runTest() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         RECKON MCP SERVER - PROPER VALIDATION              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const client = new MCPTestClient();
  const evidence: string[] = [];

  try {
    // Test 1: Initialize
    console.log("1. Initializing MCP server...");
    const initSuccess = await client.initialize();
    evidence.push(`Initialize: ${initSuccess}`);
    console.log(`   Result: ${initSuccess ? "✅" : "❌"}\n`);

    // Test 2: List tools
    console.log("2. Listing tools...");
    const tools = await client.listTools();
    evidence.push(`Tools listed: ${tools.length}`);
    console.log(`   Found ${tools.length} tools:`);
    for (const tool of tools) {
      console.log(`     - ${tool.name}`);
    }
    console.log();

    // Test 3: Read config
    console.log("3. Reading database.host...");
    const getConfigResult = await client.callTool("get_config", { key: "database.host" });
    const configValue = getConfigResult?.content?.[0]?.text;
    evidence.push(`get_config result: ${configValue}`);
    console.log(`   Result: ${configValue}\n`);

    // Test 4: Write config (consequential mutation)
    console.log("4. Setting database.host to 'db.test.example.com' (WRITE)...");
    const setResult = await client.callTool("set_config", { 
      key: "database.host", 
      value: "db.test.example.com" 
    });
    evidence.push(`set_config result: ${JSON.stringify(setResult?.content?.[0]?.text)}`);
    console.log(`   Result: ${setResult?.content?.[0]?.text}\n`);

    // Test 5: Verify mutation persisted
    console.log("5. Verifying mutation persisted...");
    const verifyResult = await client.callTool("get_config", { key: "database.host" });
    const verifiedValue = verifyResult?.content?.[0]?.text;
    evidence.push(`Verify get_config: ${verifiedValue}`);
    
    const mutationPersisted = verifiedValue?.includes("db.test.example.com") ?? false;
    evidence.push(`Mutation persisted: ${mutationPersisted}`);
    console.log(`   Result: ${verifiedValue}`);
    console.log(`   Mutation persisted: ${mutationPersisted ? "✅" : "❌"}\n`);

    // Test 6: Check mutation log
    console.log("6. Checking mutation log...");
    const logResult = await client.callTool("get_mutation_log");
    const logContent = logResult?.content?.[0]?.text;
    evidence.push(`Mutation log: ${logContent}`);
    
    const logHasMutation = logContent?.includes("set_config") ?? false;
    evidence.push(`Log has mutation: ${logHasMutation}`);
    console.log(`   Log entries: ${logContent}`);
    console.log(`   Mutation logged: ${logHasMutation ? "✅" : "❌"}\n`);

    // Test 7: List all configs
    console.log("7. Listing all configs...");
    const listResult = await client.callTool("list_configs");
    evidence.push(`All configs: ${listResult?.content?.[0]?.text?.substring(0, 200)}`);
    console.log(`   Result: ${listResult?.content?.[0]?.text?.substring(0, 200)}...\n`);

    // Summary
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("SUMMARY:");
    console.log(`  Initialize: ${initSuccess ? "✅" : "❌"}`);
    console.log(`  Tools listed: ${tools.length > 0 ? "✅" : "❌"} (${tools.length} tools)`);
    console.log(`  Read operation: ${configValue?.includes("db.prod.example.com") ? "✅" : "❌"}`);
    console.log(`  Write operation: ${setResult?.content?.[0]?.text?.includes("success") ? "✅" : "❌"}`);
    console.log(`  Mutation persisted: ${mutationPersisted ? "✅" : "❌"}`);
    console.log(`  Mutation logged: ${logHasMutation ? "✅" : "❌"}`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    const allPassed = initSuccess && tools.length > 0 && mutationPersisted && logHasMutation;
    
    console.log(`OVERALL: ${allPassed ? "✅ PASS" : "❌ FAIL"}\n`);

    // Save results
    writeFileSync(
      join(import.meta.dirname ?? ".", "mcp-test-results.json"),
      JSON.stringify({ passed: allPassed, evidence }, null, 2)
    );

  } catch (error) {
    console.error("Test error:", error);
    evidence.push(`Error: ${error}`);
  } finally {
    client.close();
  }
}

runTest();
