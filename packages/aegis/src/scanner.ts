import type { DetectorRule, ScanOptions, ScanResult, Detection, DetectorType, ThreatLevel, OutputScanOptions, OutputScanResult, MultimodalContent, MultimodalScanResult, MultimodalScanOptions, MultimodalDetection } from './types.js';
import { PII_RULES } from './detectors/pii.js';
import { INJECTION_RULES } from './detectors/injection.js';
import { CREDENTIAL_RULES } from './detectors/credentials.js';
import { CODE_SAFETY_RULES } from './detectors/code-safety.js';
import { EXFILTRATION_RULES } from './detectors/exfiltration.js';
import { OUTPUT_INJECTION_RULES } from './detectors/output-injection.js';
import { MEMORY_POISONING_RULES } from './detectors/memory-poisoning.js';
import { runMultimodalHeuristics } from './detectors/multimodal.js';

const ALL_RULES: DetectorRule[] = [
  ...PII_RULES,
  ...INJECTION_RULES,
  ...CREDENTIAL_RULES,
  ...CODE_SAFETY_RULES,
  ...EXFILTRATION_RULES,
  ...MEMORY_POISONING_RULES,
];

const ALL_DETECTOR_TYPES: DetectorType[] = [
  'pii', 'injection', 'credentials', 'code_safety', 'exfiltration',
];

const DEFAULT_OPTIONS: Required<ScanOptions> = {
  detectors: ALL_DETECTOR_TYPES,
  mode: 'block',
  maxContentLength: 100_000,
  redactWith: '[REDACTED]',
};

/**
 * AegisScanner — content safety engine.
 *
 * Pure TypeScript, zero external dependencies.
 * Scans text for PII, prompt injection, credentials, dangerous code, and data exfiltration patterns.
 */
export class AegisScanner {
  private readonly rules: DetectorRule[];
  private readonly outputRules: DetectorRule[];

  constructor(customRules?: DetectorRule[], customOutputRules?: DetectorRule[]) {
    this.rules = customRules ?? ALL_RULES;
    this.outputRules = customOutputRules ?? OUTPUT_INJECTION_RULES;
  }

  /**
   * Scan content against all active detector rules.
   */
  scan(content: string, options?: ScanOptions): ScanResult {
    const start = performance.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Truncate oversized input
    const text = content.length > opts.maxContentLength
      ? content.slice(0, opts.maxContentLength)
      : content;

    // Filter rules to only the requested detector categories
    const activeRules = this.rules.filter(r => opts.detectors.includes(r.type));

    const detections: Detection[] = [];
    const detectorStats: Record<DetectorType, { rulesChecked: number; detections: number }> = {
      pii: { rulesChecked: 0, detections: 0 },
      injection: { rulesChecked: 0, detections: 0 },
      credentials: { rulesChecked: 0, detections: 0 },
      code_safety: { rulesChecked: 0, detections: 0 },
      exfiltration: { rulesChecked: 0, detections: 0 },
    };

    for (const rule of activeRules) {
      detectorStats[rule.type].rulesChecked++;

      // Build a global copy of the pattern so we can use exec() for position tracking
      // without mutating the original rule's regex state.
      const flags = rule.pattern.flags.includes('g')
        ? rule.pattern.flags
        : rule.pattern.flags + 'g';
      const regex = new RegExp(rule.pattern.source, flags);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const matchedContent = match[0];
        const line = text.slice(0, match.index).split('\n').length;

        detections.push({
          type: rule.type,
          subType: rule.subType,
          content: matchedContent.length > 50
            ? matchedContent.slice(0, 47) + '...'
            : matchedContent,
          position: { start: match.index, end: match.index + matchedContent.length },
          confidence: rule.confidence,
          pattern: rule.description,
          line,
        });

        detectorStats[rule.type].detections++;

        // Guard against zero-length matches causing infinite loops
        if (matchedContent.length === 0) {
          regex.lastIndex++;
        }
      }
    }

    // Sort detections by position (earliest first)
    detections.sort((a, b) => a.position.start - b.position.start);

    // Derive overall threat level
    const threatLevel = this.calculateThreatLevel(detections);

    // Build redacted output when requested
    let redacted: string | undefined;
    if (opts.mode === 'redact' && detections.length > 0) {
      redacted = this.redact(text, detections, opts.redactWith);
    }

    return {
      safe: detections.length === 0,
      threatLevel,
      detections,
      redacted,
      scanTimeMs: Math.round((performance.now() - start) * 100) / 100,
      detectorStats,
    };
  }

  /**
   * Scan tool output/results for threats.
   *
   * Addresses OWASP ASI01 — indirect prompt injection via tool results.
   * Runs output-specific rules (hidden instructions, tool manipulation,
   * markdown exfiltration) plus standard detectors (PII, credentials,
   * exfiltration, code safety) to catch threats in data returned by tools.
   *
   * @param content The tool result text to scan
   * @param options Output scan options
   */
  scanOutput(content: string, options?: OutputScanOptions): OutputScanResult {
    const start = performance.now();
    const opts = {
      ...DEFAULT_OPTIONS,
      ...options,
      includeStandardDetectors: options?.includeStandardDetectors ?? true,
    };

    // Truncate oversized content
    const text = content.length > opts.maxContentLength
      ? content.slice(0, opts.maxContentLength)
      : content;

    // Build the combined rule set: output-specific rules + optionally standard rules
    const outputActiveRules = this.outputRules.filter(r => opts.detectors.includes(r.type));
    const standardActiveRules = opts.includeStandardDetectors
      ? this.rules.filter(r => opts.detectors.includes(r.type))
      : [];

    const allActiveRules = [...outputActiveRules, ...standardActiveRules];

    const detections: Detection[] = [];
    const detectorStats: Record<DetectorType, { rulesChecked: number; detections: number }> = {
      pii: { rulesChecked: 0, detections: 0 },
      injection: { rulesChecked: 0, detections: 0 },
      credentials: { rulesChecked: 0, detections: 0 },
      code_safety: { rulesChecked: 0, detections: 0 },
      exfiltration: { rulesChecked: 0, detections: 0 },
    };

    let outputRulesChecked = 0;
    let outputDetectionsFound = 0;
    const outputRuleIds = new Set(this.outputRules.map(r => r.id));

    for (const rule of allActiveRules) {
      detectorStats[rule.type].rulesChecked++;
      const isOutputRule = outputRuleIds.has(rule.id);
      if (isOutputRule) outputRulesChecked++;

      const flags = rule.pattern.flags.includes('g')
        ? rule.pattern.flags
        : rule.pattern.flags + 'g';
      const regex = new RegExp(rule.pattern.source, flags);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const matchedContent = match[0];
        const line = text.slice(0, match.index).split('\n').length;

        detections.push({
          type: rule.type,
          subType: rule.subType,
          content: matchedContent.length > 50
            ? matchedContent.slice(0, 47) + '...'
            : matchedContent,
          position: { start: match.index, end: match.index + matchedContent.length },
          confidence: rule.confidence,
          pattern: rule.description,
          line,
        });

        detectorStats[rule.type].detections++;
        if (isOutputRule) outputDetectionsFound++;

        if (matchedContent.length === 0) {
          regex.lastIndex++;
        }
      }
    }

    // Sort detections by position
    detections.sort((a, b) => a.position.start - b.position.start);

    const threatLevel = this.calculateThreatLevel(detections);

    let redacted: string | undefined;
    if (opts.mode === 'redact' && detections.length > 0) {
      redacted = this.redact(text, detections, opts.redactWith);
    }

    return {
      safe: detections.length === 0,
      threatLevel,
      detections,
      redacted,
      scanTimeMs: Math.round((performance.now() - start) * 100) / 100,
      detectorStats,
      scanTarget: 'output',
      toolName: options?.toolName,
      outputRulesChecked,
      outputDetectionsFound,
    };
  }

  /** Total number of output-specific rules loaded. */
  getOutputRuleCount(): number {
    return this.outputRules.length;
  }

  /**
   * Scan multimodal content (text + images / files).
   *
   * Runs text through the standard detector pipeline, then applies
   * heuristic checks to all attachments (base64, data URIs, SVGs,
   * image URLs). Optionally delegates to pluggable VisionBackend
   * instances for deeper image analysis.
   *
   * @param content  Multimodal content bundle (text + attachments)
   * @param options  Scan options including optional vision backends
   */
  async scanMultimodal(
    content: MultimodalContent,
    options?: MultimodalScanOptions,
  ): Promise<MultimodalScanResult> {
    const start = performance.now();

    // 1. Run text through the standard scan pipeline
    const textResult = this.scan(content.text, options);

    // 2. Run heuristic checks on attachments + text patterns
    const multimodalDetections: MultimodalDetection[] = runMultimodalHeuristics(
      content.text,
      content.attachments,
      options,
    );

    // 3. Run optional vision backends (async)
    if (options?.visionBackends?.length) {
      for (const backend of options.visionBackends) {
        for (let i = 0; i < content.attachments.length; i++) {
          const attachment = content.attachments[i];
          // Check if backend supports this MIME type
          if (backend.supports && attachment.mimeType && !backend.supports(attachment.mimeType)) {
            continue;
          }
          try {
            const backendDetections = await backend.analyse(attachment, i);
            multimodalDetections.push(...backendDetections);
          } catch {
            // Vision backend failures are non-fatal — fail open for extensibility,
            // but heuristic checks (above) still apply.
          }
        }
      }
    }

    // 4. Derive combined threat level
    const combinedThreatLevel = this.deriveMultimodalThreatLevel(
      textResult.threatLevel,
      multimodalDetections,
    );

    const safe = textResult.safe && multimodalDetections.length === 0;

    return {
      safe,
      threatLevel: combinedThreatLevel,
      textResult,
      multimodalDetections,
      scanTimeMs: Math.round((performance.now() - start) * 100) / 100,
    };
  }

  /**
   * Derive an aggregate threat level from text results + multimodal detections.
   */
  private deriveMultimodalThreatLevel(
    textThreat: ThreatLevel,
    mmDetections: MultimodalDetection[],
  ): ThreatLevel {
    // Map multimodal detections to a threat level
    let mmThreat: ThreatLevel = 'none';
    if (mmDetections.length > 0) {
      const maxConfidence = Math.max(...mmDetections.map(d => d.confidence));
      const hasScript = mmDetections.some(d =>
        d.subType === 'SVG_SCRIPT_INJECTION' || d.subType === 'DATA_URI_SCRIPT',
      );
      const hasDangerousMime = mmDetections.some(d =>
        d.subType === 'UNEXPECTED_MIME' && d.confidence >= 0.85,
      );
      const hasPhishing = mmDetections.some(d => d.subType === 'PHISHING_DOMAIN');

      if (hasScript || hasDangerousMime || hasPhishing) {
        mmThreat = 'critical';
      } else if (maxConfidence >= 0.8) {
        mmThreat = 'high';
      } else if (maxConfidence >= 0.6) {
        mmThreat = 'medium';
      } else {
        mmThreat = 'low';
      }
    }

    // Return the higher of the two
    const levels: ThreatLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
    return levels.indexOf(mmThreat) > levels.indexOf(textThreat) ? mmThreat : textThreat;
  }

  /**
   * Calculate the aggregate threat level from a set of detections.
   */
  private calculateThreatLevel(detections: Detection[]): ThreatLevel {
    if (detections.length === 0) return 'none';

    const hasHighConfidenceInjection = detections.some(
      d => d.type === 'injection' && d.confidence >= 0.8,
    );
    const hasExfiltration = detections.some(d => d.type === 'exfiltration');
    const hasHighConfidenceCredentials = detections.some(
      d => d.type === 'credentials' && d.confidence >= 0.9,
    );
    const hasCodeSafety = detections.some(d => d.type === 'code_safety');

    if (hasHighConfidenceInjection || hasExfiltration) return 'critical';
    if (hasHighConfidenceCredentials || hasCodeSafety) return 'high';
    if (detections.some(d => d.confidence >= 0.8)) return 'medium';
    return 'low';
  }

  /**
   * Produce a redacted copy of the text by replacing each detection span.
   * Works backwards through the string to preserve character offsets.
   */
  private redact(text: string, detections: Detection[], replacement: string): string {
    let result = text;
    // Process from end to start so earlier positions stay valid
    const sorted = [...detections].sort((a, b) => b.position.start - a.position.start);
    for (const d of sorted) {
      const tag = `[${d.subType}_${replacement}]`;
      result = result.slice(0, d.position.start) + tag + result.slice(d.position.end);
    }
    return result;
  }

  /** Total number of rules loaded. */
  getRuleCount(): number {
    return this.rules.length;
  }

  /** Count of rules per detector category. */
  getRulesByDetector(): Record<DetectorType, number> {
    const counts: Record<string, number> = {};
    for (const type of ALL_DETECTOR_TYPES) {
      counts[type] = 0;
    }
    for (const rule of this.rules) {
      counts[rule.type] = (counts[rule.type] || 0) + 1;
    }
    return counts as Record<DetectorType, number>;
  }
}
