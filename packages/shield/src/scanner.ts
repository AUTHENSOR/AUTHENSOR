/**
 * ShieldScanner -- request/response scanning for the proxy.
 *
 * Scans request bodies for dangerous prompts and known attack patterns.
 * Scans response bodies via Aegis when available.
 * Zero external dependencies; Aegis is lazily loaded as an optional peer.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ScanFinding {
  rule: string;
  description: string;
  confidence: number;
  matchedContent: string;
  threatLevel: ThreatLevel;
}

export interface ScanResult {
  safe: boolean;
  threatLevel: ThreatLevel;
  findings: ScanFinding[];
  scanTimeMs: number;
}

// ── Attack pattern rules ───────────────────────────────────────────────

interface PatternRule {
  id: string;
  description: string;
  pattern: RegExp;
  confidence: number;
  threatLevel: ThreatLevel;
}

const REQUEST_PATTERNS: PatternRule[] = [
  {
    id: 'prompt-injection-ignore',
    description: 'Prompt injection: ignore previous instructions',
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directives)/i,
    confidence: 0.85,
    threatLevel: 'high',
  },
  {
    id: 'prompt-injection-system',
    description: 'Prompt injection: system prompt override attempt',
    pattern: /\[?(system|SYSTEM)\]?\s*:\s*(you are|your (new|real) (role|instruction|purpose))/i,
    confidence: 0.9,
    threatLevel: 'critical',
  },
  {
    id: 'prompt-injection-jailbreak',
    description: 'Prompt injection: jailbreak keyword pattern',
    pattern: /(DAN|do anything now|developer mode|evil mode|unrestricted mode|bypass (safety|content|filter))/i,
    confidence: 0.8,
    threatLevel: 'high',
  },
  {
    id: 'prompt-injection-delimiter',
    description: 'Prompt injection: delimiter escape attempt',
    pattern: /(```|<\/?system>|<\|im_start\|>|<\|im_end\|>|\[INST\]|\[\/INST\])/i,
    confidence: 0.75,
    threatLevel: 'medium',
  },
  {
    id: 'exfiltration-url',
    description: 'Data exfiltration: URL-based data smuggling',
    pattern: /https?:\/\/[^\s]*\?(data|payload|exfil|leak|steal)=/i,
    confidence: 0.7,
    threatLevel: 'high',
  },
  {
    id: 'exfiltration-markdown',
    description: 'Data exfiltration: markdown image/link exfiltration',
    pattern: /!\[.*?\]\(https?:\/\/[^\s)]*\{.*?\}\)/i,
    confidence: 0.8,
    threatLevel: 'high',
  },
  {
    id: 'credential-leak',
    description: 'Credential exposure: API key or token in prompt',
    pattern: /(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16})/,
    confidence: 0.95,
    threatLevel: 'critical',
  },
  {
    id: 'code-execution',
    description: 'Dangerous instruction: code execution request',
    pattern: /(exec|eval|spawn|child_process|require\s*\(\s*['"]child_process['"]\s*\))/i,
    confidence: 0.6,
    threatLevel: 'medium',
  },
  {
    id: 'prompt-injection-roleplay',
    description: 'Prompt injection: roleplay override',
    pattern: /(pretend you are|act as if you|roleplay as|you are now|from now on you)/i,
    confidence: 0.5,
    threatLevel: 'low',
  },
];

const RESPONSE_PATTERNS: PatternRule[] = [
  {
    id: 'response-hidden-instruction',
    description: 'Response contains hidden instruction for agent',
    pattern: /(IMPORTANT|INSTRUCTION|DIRECTIVE|OVERRIDE):\s*(ignore|disregard|forget|override)/i,
    confidence: 0.85,
    threatLevel: 'high',
  },
  {
    id: 'response-tool-manipulation',
    description: 'Response attempts tool invocation manipulation',
    pattern: /(call|invoke|execute|run)\s+(the\s+)?(tool|function|action)\s*[:=]/i,
    confidence: 0.7,
    threatLevel: 'medium',
  },
  {
    id: 'response-credential-leak',
    description: 'Response contains potential credential',
    pattern: /(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16})/,
    confidence: 0.95,
    threatLevel: 'critical',
  },
];

// ── Aegis integration (optional) ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let aegisScanner: any = null;

async function getAegisScanner(): Promise<typeof aegisScanner> {
  if (aegisScanner !== null) return aegisScanner;
  try {
    const mod = await import('@authensor/aegis');
    aegisScanner = new mod.AegisScanner();
    return aegisScanner;
  } catch {
    // Aegis not installed -- fall back to built-in patterns only
    aegisScanner = false;
    return false;
  }
}

// ── Scanner ────────────────────────────────────────────────────────────

function runPatterns(text: string, rules: PatternRule[]): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const rule of rules) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const match = regex.exec(text);
    if (match) {
      const snippet = match[0].length > 60
        ? match[0].slice(0, 57) + '...'
        : match[0];
      findings.push({
        rule: rule.id,
        description: rule.description,
        confidence: rule.confidence,
        matchedContent: snippet,
        threatLevel: rule.threatLevel,
      });
    }
  }

  return findings;
}

function deriveOverallThreat(findings: ScanFinding[]): ThreatLevel {
  if (findings.length === 0) return 'none';
  const levels: ThreatLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
  let maxIdx = 0;
  for (const f of findings) {
    const idx = levels.indexOf(f.threatLevel);
    if (idx > maxIdx) maxIdx = idx;
  }
  return levels[maxIdx];
}

/**
 * Scan a request body (prompt going to an AI provider).
 */
export function scanRequest(body: string): ScanResult {
  const start = performance.now();
  const findings = runPatterns(body, REQUEST_PATTERNS);
  return {
    safe: findings.length === 0,
    threatLevel: deriveOverallThreat(findings),
    findings,
    scanTimeMs: Math.round((performance.now() - start) * 100) / 100,
  };
}

/**
 * Scan a response body (AI provider output).
 * Uses Aegis when available, falls back to built-in patterns.
 */
export async function scanResponse(body: string): Promise<ScanResult> {
  const start = performance.now();
  const findings: ScanFinding[] = [];

  // Built-in response patterns first
  findings.push(...runPatterns(body, RESPONSE_PATTERNS));

  // Try Aegis for deeper scanning
  const scanner = await getAegisScanner();
  if (scanner) {
    try {
      const aegisResult = scanner.scanOutput(body);
      if (!aegisResult.safe) {
        for (const detection of aegisResult.detections) {
          findings.push({
            rule: `aegis-${detection.type}-${detection.subType}`,
            description: detection.pattern,
            confidence: detection.confidence,
            matchedContent: detection.content,
            threatLevel: aegisResult.threatLevel as ThreatLevel,
          });
        }
      }
    } catch {
      // Aegis scan failed -- continue with built-in results only
    }
  }

  return {
    safe: findings.length === 0,
    threatLevel: deriveOverallThreat(findings),
    findings,
    scanTimeMs: Math.round((performance.now() - start) * 100) / 100,
  };
}

/**
 * Get info about available scanning capabilities.
 */
export async function getScannerInfo(): Promise<{
  builtInRules: number;
  aegisAvailable: boolean;
  aegisRules: number;
}> {
  const scanner = await getAegisScanner();
  return {
    builtInRules: REQUEST_PATTERNS.length + RESPONSE_PATTERNS.length,
    aegisAvailable: !!scanner,
    aegisRules: scanner ? scanner.getRuleCount() : 0,
  };
}
