/**
 * Attack category for organizing adversarial seeds.
 */
export type AttackCategory =
  | 'social_engineering'
  | 'privilege_escalation'
  | 'anti_forensics'
  | 'sandbox_evasion'
  | 'insider_threat';

/**
 * Position where a seed can be deployed in a conversation.
 */
export type SeedPosition = 'system_prefix' | 'system_suffix' | 'multi_turn' | 'tool_description';

/**
 * Behavioral dimension scored during evaluation.
 */
export interface ScoringDimension {
  /** Dimension identifier (e.g., 'compliance_momentum', 'chain_awareness') */
  id: string;
  /** What this dimension measures */
  description: string;
}

/**
 * MITRE ATT&CK / ATLAS technique reference.
 */
export interface MitreReference {
  /** Technique ID (e.g., 'T1566', 'AML.T0051') */
  id: string;
  /** Technique name */
  name: string;
}

/**
 * Tool definition required by a seed scenario.
 */
export interface SeedTool {
  /** Tool name used in the scenario */
  name: string;
  /** What the tool does in context */
  description: string;
}

/**
 * An adversarial test seed — a structured scenario for probing agent safety.
 */
export interface RedTeamSeed {
  /** Unique seed identifier (e.g., 'seed-001') */
  id: string;
  /** Human-readable title */
  title: string;
  /** Attack category */
  category: AttackCategory;
  /** Tags for filtering */
  tags: string[];
  /** Quality rubric score (out of 35) */
  rubricScore: number;
  /** The hypothesis being tested */
  hypothesis: string;
  /** Full auditor instruction — the adversarial scenario */
  instruction: string;
  /** System prompt to give the target agent */
  systemPrompt: string;
  /** Tools the target agent should have access to */
  tools: SeedTool[];
  /** MITRE ATT&CK / ATLAS technique mappings */
  mitre: MitreReference[];
  /** Behavioral dimensions this seed probes */
  dimensions: ScoringDimension[];
  /** What constitutes a boundary crossing (failure) */
  boundaryDefinition: string;
  /** Minimum recommended conversation turns */
  minTurns: number;
}

/**
 * Result from running a seed against an agent.
 */
export interface SeedResult {
  /** Seed that was tested */
  seedId: string;
  /** Whether the boundary was crossed (agent failed) */
  boundaryCrossed: boolean;
  /** Turn number where boundary was crossed, if applicable */
  crossingTurn?: number;
  /** Per-dimension scores (0.0 - 1.0) */
  dimensionScores: Record<string, number>;
  /** Total conversation turns */
  totalTurns: number;
  /** Raw conversation transcript */
  transcript: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  /** Timestamp */
  evaluatedAt: number;
}

/**
 * Aggregate report across multiple seeds.
 */
export interface RedTeamReport {
  /** Agent identifier */
  agentId: string;
  /** Seeds tested */
  results: SeedResult[];
  /** Overall pass rate (seeds where boundary was NOT crossed) */
  passRate: number;
  /** Per-category pass rates */
  categoryPassRates: Record<AttackCategory, number>;
  /** Per-dimension average scores */
  dimensionAverages: Record<string, number>;
  /** Report generation timestamp */
  generatedAt: number;
}
