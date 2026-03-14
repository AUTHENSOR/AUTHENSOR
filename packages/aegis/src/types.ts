/** Detector categories available in Aegis */
export type DetectorType = 'pii' | 'injection' | 'credentials' | 'code_safety' | 'exfiltration';

/** Severity of the highest-confidence detection */
export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** How the scanner should handle detections */
export type ScanMode = 'block' | 'redact' | 'warn';

/** A single match found by a detector rule */
export interface Detection {
  /** Detector category */
  type: DetectorType;
  /** Specific pattern within the category, e.g. 'SSN', 'EMAIL', 'DIRECT', 'AWS_KEY' */
  subType: string;
  /** Matched content (truncated to 50 chars) */
  content: string;
  /** Character offsets in the original text */
  position: { start: number; end: number };
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Human-readable pattern name / description */
  pattern: string;
  /** 1-based line number of the match */
  line?: number;
}

/** Result returned by AegisScanner.scan() */
export interface ScanResult {
  /** true when no detections were found */
  safe: boolean;
  /** Aggregated threat level across all detections */
  threatLevel: ThreatLevel;
  /** Every detection found, sorted by position */
  detections: Detection[];
  /** Sanitised version of input when mode='redact' */
  redacted?: string;
  /** Wall-clock scan time in milliseconds */
  scanTimeMs: number;
  /** Per-detector breakdown of rules checked and detections found */
  detectorStats: Record<DetectorType, { rulesChecked: number; detections: number }>;
}

/** Options to customise a scan invocation */
export interface ScanOptions {
  /** Which detector categories to run (default: all) */
  detectors?: DetectorType[];
  /** Scan behaviour: block, redact, or warn */
  mode?: ScanMode;
  /** Maximum input length before truncation (default: 100 000) */
  maxContentLength?: number;
  /** Replacement tag used in redacted output (default: '[REDACTED]') */
  redactWith?: string;
}

/** A single regex-based rule used by a detector */
export interface DetectorRule {
  /** Unique rule identifier, e.g. 'pii-ssn' */
  id: string;
  /** Detector category this rule belongs to */
  type: DetectorType;
  /** Specific sub-category, e.g. 'SSN', 'AWS_KEY' */
  subType: string;
  /** The regex pattern to match against */
  pattern: RegExp;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Human-readable description of what this rule detects */
  description: string;
}

/** Whether a scan targets input (action envelope) or output (tool result) */
export type ScanTarget = 'input' | 'output';

/** Options to customise an output scan invocation */
export interface OutputScanOptions extends ScanOptions {
  /** Name of the tool that produced this output (for context in detections) */
  toolName?: string;
  /** Whether to include all standard detectors or only output-specific ones (default: true — includes all) */
  includeStandardDetectors?: boolean;
}

/** Result returned by AegisScanner.scanOutput() */
export interface OutputScanResult extends ScanResult {
  /** Identifies this as an output scan */
  scanTarget: 'output';
  /** Name of the tool that produced the scanned output (if provided) */
  toolName?: string;
  /** Number of output-specific (indirect injection) rules checked */
  outputRulesChecked: number;
  /** Number of output-specific detections found */
  outputDetectionsFound: number;
}

// ── Multimodal types ──────────────────────────────────────────────────

/** MIME types recognised for multimodal content */
export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml' | 'image/bmp' | 'image/tiff';

/** A single image or file attachment in multimodal content */
export interface MultimodalAttachment {
  /** How the content is provided */
  kind: 'url' | 'base64' | 'data-uri' | 'file-ref' | 'inline-svg';
  /** The raw value: a URL, base64 blob, data URI, file path, or inline SVG markup */
  value: string;
  /** Declared MIME type (if known) */
  mimeType?: string;
  /** Optional label / alt-text */
  label?: string;
}

/** Multimodal content: text plus zero or more attachments */
export interface MultimodalContent {
  /** Text portion of the content (may be empty) */
  text: string;
  /** Image / file attachments */
  attachments: MultimodalAttachment[];
}

/** A single finding from the multimodal scanner */
export interface MultimodalDetection {
  /** Which heuristic or backend produced this finding */
  detector: 'heuristic' | 'vision-backend';
  /** Sub-category of the finding */
  subType:
    | 'SUSPICIOUS_BASE64'
    | 'UNEXPECTED_MIME'
    | 'PHISHING_DOMAIN'
    | 'SVG_SCRIPT_INJECTION'
    | 'TRACKING_PIXEL'
    | 'QR_EXFILTRATION'
    | 'DATA_URI_SCRIPT'
    | string;          // extensible for vision backends
  /** Human-readable explanation */
  description: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Index of the attachment in MultimodalContent.attachments (-1 for text) */
  attachmentIndex: number;
  /** Matched snippet (truncated to 100 chars) */
  snippet: string;
}

/** Result returned by scanMultimodal() */
export interface MultimodalScanResult {
  /** true when no multimodal or text detections were found */
  safe: boolean;
  /** Aggregated threat level */
  threatLevel: ThreatLevel;
  /** Text-based detections from standard scan */
  textResult: ScanResult;
  /** Multimodal-specific detections */
  multimodalDetections: MultimodalDetection[];
  /** Wall-clock scan time in milliseconds */
  scanTimeMs: number;
}

/**
 * Pluggable vision model backend interface.
 *
 * Implement this to extend Aegis with actual image understanding
 * (e.g., OCR, NSFW detection, visual prompt injection detection).
 * Aegis itself remains zero-dependency; backends are provided by the consumer.
 */
export interface VisionBackend {
  /** Human-readable name of the backend (e.g. "openai-vision", "llava") */
  readonly name: string;

  /**
   * Analyse a single attachment and return zero or more detections.
   * The implementation MAY be async (e.g., calling an external API).
   */
  analyse(attachment: MultimodalAttachment, index: number): Promise<MultimodalDetection[]>;

  /**
   * Optional: return true if this backend can handle the given MIME type.
   * When omitted, the backend is called for all attachments.
   */
  supports?(mimeType: string): boolean;
}

/** Options for scanMultimodal() */
export interface MultimodalScanOptions extends ScanOptions {
  /** Optional vision backends to run against image attachments */
  visionBackends?: VisionBackend[];
  /** Maximum base64 string length before it is flagged as suspicious (default: 500_000) */
  maxBase64Length?: number;
  /** Additional phishing/exfiltration domains to check (merged with built-in list) */
  extraPhishingDomains?: string[];
}
