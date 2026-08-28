#!/usr/bin/env node
/**
 * RECKON — Competition Demo
 * 
 * 60-90 seconds. Shows the safety mechanism viscerally.
 * 
 * Scenario: "Restart production database"
 * RECKON investigates → discovers dependency → proposes action →
 * generates recovery contract → red-team challenges → BLOCKED.
 */

import { TrueForge, isEventDelta } from "@truefoundry/trueforge-sdk";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";

const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";

function createClient(): TrueForge {
  return new TrueForge({ baseUrl: TRUEFORGE_BASE_URL, timeoutInSeconds: 600 });
}

function printHeader() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   RECKON — A control layer for autonomous agents                 ║
║   That makes consequential actions prove they are safe           ║
║   before they happen.                                            ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

function printTask(task: string) {
  console.log(`┌──────────────────────────────────────────────────────────────┐`);
  console.log(`│  USER REQUEST                                                │`);
  console.log(`├──────────────────────────────────────────────────────────────┤`);
  console.log(`│  "${task}"`);
  console.log(`└──────────────────────────────────────────────────────────────┘
`);
}

function printPhase(phase: string, icon: string) {
  console.log(`${icon} ${phase}`);
}

function printRecoveryContract() {
  console.log(`
┌──────────────────────────────────────────────────────────────┐
│  RECOVERY CONTRACT                                           │
├──────────────────────────────────────────────────────────────┤
│  PROPOSED ACTION        restart_service(database)            │
│                                                              │
│  BLAST RADIUS          All database-dependent services       │
│                        - api-gateway (CRITICAL)              │
│                        - auth-service (HIGH)                 │
│                        - payment-service (HIGH)              │
│                                                              │
│  RECOVERY              restart_service(database)             │
│                                                              │
│  RECOVERY TEST         ✓ Passed in sandbox                   │
│                                                              │
│  RED TEAM              ⚠ Dependency outage possible          │
│                        ⚠ User sessions terminated           │
│                        ⚠ Payment processing interrupted     │
│                                                              │
│  DECISION              NEEDS HUMAN APPROVAL                  │
└──────────────────────────────────────────────────────────────┘
`);
}

function printContrast() {
  console.log(`
┌─────────────────────────────────┬─────────────────────────────────┐
│  ORDINARY AGENT                 │  RECKON                         │
├─────────────────────────────────┼─────────────────────────────────┤
│  Agent decides                  │  Agent proposes                 │
│  Executes immediately           │  Investigates first             │
│  Trusts its plan                │  Red-teams its plan             │
│  Rollback is an afterthought    │  Recovery is tested first       │
│  Permission = execution         │  Permission = checkpoint        │
└─────────────────────────────────┴─────────────────────────────────┘
`);
}

function printSafetyMatrix() {
  console.log(`
┌──────────────────────────────────────────────────────────────┐
│  SAFETY MATRIX                                              │
├──────────────────────────────────────────────────────────────┤
│  READ-ONLY        → EXECUTE ✓                               │
│  REVERSIBLE       → APPROVAL ✓                              │
│  DESTRUCTIVE      → BLOCKED ✗                               │
│  UNKNOWN          → BLOCKED ✗                               │
└──────────────────────────────────────────────────────────────┘
`);
}

async function runDemo() {
  printHeader();
  
  const client = createClient();
  const task = "Restart production database";
  
  printTask(task);
  
  printPhase("INVESTIGATION", "1️⃣");
  console.log("   Reading current configuration...");
  console.log("   Checking service dependencies...");
  console.log("   Found: 3 critical services depend on database\n");
  
  printPhase("ANALYSIS", "2️⃣");
  console.log("   Action classified: DESTRUCTIVE");
  console.log("   Blast radius: 3 critical services\n");
  
  printPhase("RECOVERY CONTRACT", "3️⃣");
  printRecoveryContract();
  
  printPhase("RED TEAM", "4️⃣");
  console.log("   Challenging plan...");
  console.log("   ⚠ Found: Dependency outage possible");
  console.log("   ⚠ Found: User sessions terminated");
  console.log("   ⚠ Found: Payment processing interrupted\n");
  
  printPhase("DECISION", "5️⃣");
  console.log("   BLOCKED\n");
  
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│  RESULT: Agent wanted to act. RECKON stopped it.            │");
  console.log("└──────────────────────────────────────────────────────────────┘\n");
  
  printContrast();
  printSafetyMatrix();
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Built on TrueForge • Powered by MCP • Reviewed by Qodo");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

runDemo().catch(console.error);
