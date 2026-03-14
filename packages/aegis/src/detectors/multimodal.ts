/**
 * Multimodal Detection Framework
 *
 * Heuristic-based content safety checks for image URLs, base64 data,
 * data URIs, SVG content, and other non-text attachments.
 *
 * Zero dependencies — all checks are pure string/regex analysis.
 * For actual image understanding, consumers can plug in a VisionBackend.
 */

import type {
  MultimodalAttachment,
  MultimodalDetection,
  MultimodalScanOptions,
} from '../types.js';

// ── Built-in phishing / exfiltration domain fragments ────────────────

const BUILTIN_PHISHING_DOMAINS: string[] = [
  // Callback / logging services commonly used for data exfiltration
  'webhook.site',
  'requestbin.com',
  'pipedream.com',
  'hookbin.com',
  'burpcollaborator.net',
  'interact.sh',
  'canarytokens.com',
  'ngrok.io',
  'ngrok.app',
  'oast.fun',
  'oast.live',
  'oast.online',
  'oast.site',
  'oastify.com',
  'dnslog.cn',
  'ceye.io',
  'bxss.me',
  'xss.ht',
  // Known phishing infrastructure patterns
  'evil.com',
  'attacker.com',
  'exfil.com',
  'steal-data.com',
];

// ── SVG script / event handler patterns ──────────────────────────────

/**
 * SVG elements / attributes that can execute code.
 * These are checked case-insensitively.
 */
const SVG_DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string; confidence: number }> = [
  {
    pattern: /<script[\s>]/i,
    description: 'SVG contains <script> element',
    confidence: 0.95,
  },
  {
    pattern: /\bon\w+\s*=/i,
    description: 'SVG contains inline event handler (onload, onerror, etc.)',
    confidence: 0.9,
  },
  {
    pattern: /javascript\s*:/i,
    description: 'SVG contains javascript: URI scheme',
    confidence: 0.95,
  },
  {
    pattern: /<foreignObject[\s>]/i,
    description: 'SVG contains <foreignObject> which can embed arbitrary HTML',
    confidence: 0.75,
  },
  {
    pattern: /<iframe[\s>]/i,
    description: 'SVG contains embedded <iframe>',
    confidence: 0.9,
  },
  {
    pattern: /<embed[\s>]/i,
    description: 'SVG contains embedded <embed> element',
    confidence: 0.85,
  },
  {
    pattern: /xlink:href\s*=\s*["']?\s*(?:javascript|data):/i,
    description: 'SVG xlink:href with dangerous protocol',
    confidence: 0.92,
  },
  {
    pattern: /<set[\s>]|<animate[\s>]/i,
    description: 'SVG animation element that can trigger script via attributeName',
    confidence: 0.6,
  },
];

// ── Tracking pixel patterns ──────────────────────────────────────────

const TRACKING_PIXEL_PATTERNS: Array<{ pattern: RegExp; description: string; confidence: number }> = [
  {
    // <img with explicit 1x1 dimensions
    pattern: /<img[^>]+(?:width\s*=\s*["']?1["']?\s+height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?\s+width\s*=\s*["']?1["']?)[^>]*>/i,
    description: 'HTML img tag with 1x1 pixel dimensions (tracking pixel)',
    confidence: 0.85,
  },
  {
    // <img with display:none or visibility:hidden
    pattern: /<img[^>]+style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'][^>]*>/i,
    description: 'Hidden HTML img tag (tracking pixel)',
    confidence: 0.82,
  },
  {
    // <img with width/height 0
    pattern: /<img[^>]+(?:width\s*=\s*["']?0["']?|height\s*=\s*["']?0["']?)[^>]*>/i,
    description: 'HTML img tag with zero dimension (tracking pixel)',
    confidence: 0.8,
  },
  {
    // Markdown image with known tracking domains
    pattern: /!\[[^\]]*\]\([^)]*(?:pixel|track|beacon|1x1|spacer|blank\.gif|t\.gif|p\.gif)[^)]*\)/i,
    description: 'Markdown image referencing tracking pixel URL',
    confidence: 0.78,
  },
];

// ── QR code exfiltration heuristics ──────────────────────────────────

const QR_EXFIL_PATTERNS: Array<{ pattern: RegExp; description: string; confidence: number }> = [
  {
    // Requests to generate QR codes that encode sensitive-looking data
    pattern: /(?:generate|create|make|render)\s+(?:a\s+)?QR\s*(?:code)?\s+(?:for|with|containing|encoding)\s+(?:[^\n]*(?:password|secret|token|key|credential|api.?key|private|ssn|credit.?card))/i,
    description: 'QR code generation request encoding sensitive data',
    confidence: 0.82,
  },
  {
    // QR code API URLs with sensitive-looking query parameters
    pattern: /(?:api\.qrserver\.com|chart\.googleapis\.com\/chart\?[^\s]*chl=|quickchart\.io\/qr)[^\s]*(?:password|secret|token|key|credential|api.?key|private)/i,
    description: 'QR code API URL with sensitive data in parameters',
    confidence: 0.88,
  },
];

// ── Data URI analysis ────────────────────────────────────────────────

/** MIME types that are expected in image data URIs */
const SAFE_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

/** MIME types that can execute code when embedded as data URIs */
const DANGEROUS_DATA_URI_MIMES = new Set([
  'text/html',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'application/pdf',
  'application/x-shockwave-flash',
]);

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function extractDomainFromUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/([^/:]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function parseDataUri(uri: string): { mime: string; isBase64: boolean; data: string } | null {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,(.*)/s);
  if (!match) return null;
  return {
    mime: match[1].toLowerCase().trim(),
    isBase64: match[2]?.toLowerCase() === 'base64',
    data: match[3],
  };
}

// ── Core heuristic checks ────────────────────────────────────────────

/**
 * Check a single attachment against all heuristic rules.
 * Returns zero or more detections.
 */
export function checkAttachment(
  attachment: MultimodalAttachment,
  index: number,
  options?: MultimodalScanOptions,
): MultimodalDetection[] {
  const detections: MultimodalDetection[] = [];
  const maxBase64 = options?.maxBase64Length ?? 500_000;
  const extraDomains = options?.extraPhishingDomains ?? [];
  const allPhishingDomains = [...BUILTIN_PHISHING_DOMAINS, ...extraDomains];

  // ── 1. Suspicious base64 length ────────────────────────────────────
  if (attachment.kind === 'base64') {
    if (attachment.value.length > maxBase64) {
      detections.push({
        detector: 'heuristic',
        subType: 'SUSPICIOUS_BASE64',
        description: `Base64 string is suspiciously large (${attachment.value.length.toLocaleString()} chars) — potential steganographic payload or data smuggling`,
        confidence: 0.72,
        attachmentIndex: index,
        snippet: truncate(attachment.value, 100),
      });
    }
  }

  // ── 2. Data URI analysis ───────────────────────────────────────────
  if (attachment.kind === 'data-uri') {
    const parsed = parseDataUri(attachment.value);
    if (parsed) {
      // Check for unexpected/dangerous MIME types
      if (DANGEROUS_DATA_URI_MIMES.has(parsed.mime)) {
        detections.push({
          detector: 'heuristic',
          subType: 'UNEXPECTED_MIME',
          description: `Data URI has executable MIME type "${parsed.mime}" — potential script injection`,
          confidence: 0.9,
          attachmentIndex: index,
          snippet: truncate(attachment.value, 100),
        });
      } else if (!SAFE_IMAGE_MIMES.has(parsed.mime) && !parsed.mime.startsWith('image/')) {
        detections.push({
          detector: 'heuristic',
          subType: 'UNEXPECTED_MIME',
          description: `Data URI has unexpected MIME type "${parsed.mime}" — not a recognised image format`,
          confidence: 0.7,
          attachmentIndex: index,
          snippet: truncate(attachment.value, 100),
        });
      }

      // Check for oversized base64 payload inside data URI
      if (parsed.isBase64 && parsed.data.length > maxBase64) {
        detections.push({
          detector: 'heuristic',
          subType: 'SUSPICIOUS_BASE64',
          description: `Data URI contains oversized base64 payload (${parsed.data.length.toLocaleString()} chars)`,
          confidence: 0.72,
          attachmentIndex: index,
          snippet: truncate(attachment.value, 100),
        });
      }

      // SVG data URI — check for scripts
      if (parsed.mime === 'image/svg+xml') {
        let svgContent: string;
        if (parsed.isBase64) {
          // Attempt basic base64 decode (only ASCII portion for heuristic check)
          try {
            svgContent = atob(parsed.data);
          } catch {
            svgContent = parsed.data;
          }
        } else {
          svgContent = decodeURIComponent(parsed.data);
        }
        detections.push(...checkSvgContent(svgContent, index));
      }
    }
  }

  // ── 3. URL-based checks ────────────────────────────────────────────
  if (attachment.kind === 'url') {
    const domain = extractDomainFromUrl(attachment.value);
    if (domain) {
      for (const phishDomain of allPhishingDomains) {
        if (domain === phishDomain || domain.endsWith('.' + phishDomain)) {
          detections.push({
            detector: 'heuristic',
            subType: 'PHISHING_DOMAIN',
            description: `Image URL points to known phishing/exfiltration domain "${phishDomain}"`,
            confidence: 0.88,
            attachmentIndex: index,
            snippet: truncate(attachment.value, 100),
          });
          break; // one detection per attachment for domain
        }
      }
    }
  }

  // ── 4. Inline SVG checks ───────────────────────────────────────────
  if (attachment.kind === 'inline-svg') {
    detections.push(...checkSvgContent(attachment.value, index));
  }

  // ── 5. MIME type mismatch (declared vs. kind) ──────────────────────
  if (attachment.mimeType) {
    const mime = attachment.mimeType.toLowerCase();
    if (DANGEROUS_DATA_URI_MIMES.has(mime)) {
      detections.push({
        detector: 'heuristic',
        subType: 'UNEXPECTED_MIME',
        description: `Attachment declares executable MIME type "${mime}"`,
        confidence: 0.85,
        attachmentIndex: index,
        snippet: truncate(attachment.value, 100),
      });
    }
  }

  return detections;
}

/**
 * Check SVG markup for dangerous elements / attributes.
 */
export function checkSvgContent(svg: string, attachmentIndex: number): MultimodalDetection[] {
  const detections: MultimodalDetection[] = [];

  for (const check of SVG_DANGEROUS_PATTERNS) {
    if (check.pattern.test(svg)) {
      detections.push({
        detector: 'heuristic',
        subType: 'SVG_SCRIPT_INJECTION',
        description: check.description,
        confidence: check.confidence,
        attachmentIndex,
        snippet: truncate(svg, 100),
      });
    }
  }

  return detections;
}

/**
 * Scan text content for tracking pixel patterns.
 *
 * This is run on the text portion of MultimodalContent to catch
 * HTML img tags and markdown images that serve as tracking pixels.
 */
export function checkTrackingPixels(text: string): MultimodalDetection[] {
  const detections: MultimodalDetection[] = [];

  for (const check of TRACKING_PIXEL_PATTERNS) {
    const flags = check.pattern.flags.includes('g')
      ? check.pattern.flags
      : check.pattern.flags + 'g';
    const regex = new RegExp(check.pattern.source, flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      detections.push({
        detector: 'heuristic',
        subType: 'TRACKING_PIXEL',
        description: check.description,
        confidence: check.confidence,
        attachmentIndex: -1,
        snippet: truncate(match[0], 100),
      });
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  return detections;
}

/**
 * Scan text content for QR code exfiltration patterns.
 */
export function checkQrExfiltration(text: string): MultimodalDetection[] {
  const detections: MultimodalDetection[] = [];

  for (const check of QR_EXFIL_PATTERNS) {
    const flags = check.pattern.flags.includes('g')
      ? check.pattern.flags
      : check.pattern.flags + 'g';
    const regex = new RegExp(check.pattern.source, flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      detections.push({
        detector: 'heuristic',
        subType: 'QR_EXFILTRATION',
        description: check.description,
        confidence: check.confidence,
        attachmentIndex: -1,
        snippet: truncate(match[0], 100),
      });
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  return detections;
}

/**
 * Run all heuristic checks against a set of multimodal content.
 *
 * This is the main entry point used by AegisScanner.scanMultimodal().
 */
export function runMultimodalHeuristics(
  text: string,
  attachments: MultimodalAttachment[],
  options?: MultimodalScanOptions,
): MultimodalDetection[] {
  const detections: MultimodalDetection[] = [];

  // Check each attachment
  for (let i = 0; i < attachments.length; i++) {
    detections.push(...checkAttachment(attachments[i], i, options));
  }

  // Check text for tracking pixels and QR exfiltration
  detections.push(...checkTrackingPixels(text));
  detections.push(...checkQrExfiltration(text));

  return detections;
}
