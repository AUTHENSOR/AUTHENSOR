// ── Core scanner ───────────────────────────────────────────────────────
export { AegisScanner } from './scanner.js';

// ── Types ──────────────────────────────────────────────────────────────
export type {
  DetectorType,
  ThreatLevel,
  ScanMode,
  ScanTarget,
  Detection,
  ScanResult,
  ScanOptions,
  DetectorRule,
  OutputScanOptions,
  OutputScanResult,
  // Multimodal types
  ImageMimeType,
  MultimodalAttachment,
  MultimodalContent,
  MultimodalDetection,
  MultimodalScanResult,
  MultimodalScanOptions,
  VisionBackend,
} from './types.js';

// ── Canary tokens (prompt leak detection) ──────────────────────────────
export {
  generateCanaryToken,
  checkCanaryLeak,
  checkCanaryLeaks,
  CanaryTokenManager,
} from './canary.js';
export type {
  CanaryToken,
  CanaryCheckResult,
  CanaryPosition,
  AdvancedCanaryCheckResult,
  CanaryReport,
  CanaryManagerOptions,
  AdvancedCanaryToken,
  ToolIntegrityRecord,
} from './canary.js';

// ── Entropy analysis (adversarial suffix detection) ───────────────────
export { shannonEntropy, analyzeEntropy } from './entropy.js';
export type { EntropyResult } from './entropy.js';

// ── Heuristic scoring (multi-signal combination) ──────────────────────
export { computeHeuristicScore } from './heuristic.js';
export type { HeuristicSignal, HeuristicResult } from './heuristic.js';

// ── Detector rule sets (for custom composition) ────────────────────────
export { PII_RULES, luhnCheck } from './detectors/pii.js';
export { INJECTION_RULES } from './detectors/injection.js';
export { CREDENTIAL_RULES } from './detectors/credentials.js';
export { CODE_SAFETY_RULES } from './detectors/code-safety.js';
export { EXFILTRATION_RULES } from './detectors/exfiltration.js';
export { OUTPUT_INJECTION_RULES } from './detectors/output-injection.js';
export { MEMORY_POISONING_RULES } from './detectors/memory-poisoning.js';

// ── Multimodal detection (heuristic image/file safety) ───────────────
export {
  checkAttachment,
  checkSvgContent,
  checkTrackingPixels,
  checkQrExfiltration,
  runMultimodalHeuristics,
} from './detectors/multimodal.js';
