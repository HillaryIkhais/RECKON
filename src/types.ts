export type ReversibilityClassification =
  | "READ_ONLY"
  | "REVERSIBLE"
  | "COMPENSABLE"
  | "IRREVERSIBLE"
  | "UNKNOWN";

export type Decision = "CLEARED" | "NEEDS_MORE_EVIDENCE" | "BLOCKED";

export type Phase =
  | "INTAKE"
  | "INVESTIGATION"
  | "ANALYSIS"
  | "ACTION_PLAN"
  | "RECOVERY_CONTRACT"
  | "SANDBOX_VALIDATION"
  | "RED_TEAM"
  | "DECISION"
  | "HUMAN_CHECKPOINT"
  | "EXECUTION"
  | "VERIFICATION"
  | "COMPLETE";

export interface Evidence {
  id: string;
  source: string;
  tool: string;
  timestamp: string;
  data: unknown;
  summary: string;
}

export interface RecoveryContract {
  proposed_action: string;
  preconditions: string[];
  expected_outcome: string;
  affected_resources: string[];
  blast_radius: string;
  recovery_procedure: string[];
  recovery_preconditions: string[];
  verification_conditions: string[];
  reversibility_classification: ReversibilityClassification;
  risks: string[];
  unresolved_uncertainties: string[];
}

export interface SandboxTestResult {
  action_executed: boolean;
  action_result: string;
  recovery_executed: boolean;
  recovery_result: string;
  state_restored: boolean;
  before_state: string;
  after_action_state: string;
  recovered_state: string;
}

export interface RedTeamResult {
  overall_assessment: "SAFE" | "CONCERNS" | "BLOCKING";
  issues_found: string[];
  recommendations: string[];
}

export interface TaskState {
  task_id: string;
  task_description: string;
  phase: Phase;
  evidence: Evidence[];
  hypotheses: string[];
  action_plan: string | null;
  recovery_contract: RecoveryContract | null;
  sandbox_result: SandboxTestResult | null;
  red_team_result: RedTeamResult | null;
  decision: Decision | null;
  approved: boolean;
  execution_result: string | null;
  verification_result: string | null;
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  phase: Phase;
  timestamp: string;
  event: string;
  details: string;
}
