import type { DetectorRule } from '../types.js';

export const EXFILTRATION_RULES: DetectorRule[] = [
  // ── Data piping to external URLs ─────────────────────────────────────
  {
    id: 'exfil-curl-pipe',
    type: 'exfiltration',
    subType: 'DATA_EXFIL',
    // curl URL | bash, curl URL | sh
    pattern: /\bcurl\s+[^\n|]*\|\s*(?:ba)?sh\b/,
    confidence: 0.92,
    description: 'curl piped to shell execution',
  },
  {
    id: 'exfil-wget-pipe',
    type: 'exfiltration',
    subType: 'DATA_EXFIL',
    pattern: /\bwget\s+[^\n|]*(?:-O\s*-|\|)\s*(?:ba)?sh\b/,
    confidence: 0.92,
    description: 'wget piped to shell execution',
  },
  {
    id: 'exfil-curl-post-data',
    type: 'exfiltration',
    subType: 'DATA_EXFIL',
    // curl with -d or --data posting sensitive-looking content
    pattern: /\bcurl\s+(?:[^\n]*\s)?(?:-X\s*POST\s+)?(?:[^\n]*\s)?(?:-d|--data)\s+[^\n]*(?:password|secret|token|key|cred)/i,
    confidence: 0.82,
    description: 'curl POST with sensitive data',
  },

  // ── SSRF / internal network access ───────────────────────────────────
  {
    id: 'exfil-ssrf-metadata',
    type: 'exfiltration',
    subType: 'SSRF',
    // AWS/GCP/Azure metadata endpoints
    pattern: /169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com/,
    confidence: 0.95,
    description: 'Cloud metadata endpoint (SSRF)',
  },
  {
    id: 'exfil-ssrf-localhost',
    type: 'exfiltration',
    subType: 'SSRF',
    // Requests targeting localhost, 127.x, 0.0.0.0
    pattern: /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|127\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/\S*)?/,
    confidence: 0.72,
    description: 'Request to localhost/loopback address',
  },
  {
    id: 'exfil-ssrf-internal-ip',
    type: 'exfiltration',
    subType: 'SSRF',
    // Private IP ranges: 10.x, 172.16-31.x, 192.168.x
    pattern: /(?:https?:\/\/)?(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/\S*)?/,
    confidence: 0.68,
    description: 'Request to private/internal IP address',
  },

  // ── DNS exfiltration ─────────────────────────────────────────────────
  {
    id: 'exfil-dns-long-subdomain',
    type: 'exfiltration',
    subType: 'DNS_EXFIL',
    // Very long subdomain labels (>40 chars) that look like encoded data
    pattern: /\b[a-z0-9]{40,}\.(?:[a-z0-9\-]+\.){1,5}[a-z]{2,}\b/i,
    confidence: 0.7,
    description: 'Suspicious long DNS subdomain (potential data exfiltration)',
  },
  {
    id: 'exfil-dns-hex-subdomain',
    type: 'exfiltration',
    subType: 'DNS_EXFIL',
    // Hex-encoded subdomain labels
    pattern: /\b(?:[0-9a-f]{2}){10,}\.(?:[a-z0-9\-]+\.){1,5}[a-z]{2,}\b/i,
    confidence: 0.75,
    description: 'Hex-encoded DNS subdomain (potential data exfiltration)',
  },
  {
    id: 'exfil-dns-base32-subdomain',
    type: 'exfiltration',
    subType: 'DNS_EXFIL',
    // Base32-encoded subdomains: chunks of uppercase A-Z + 2-7 separated by dots, typical of iodine/dnscat
    // Each label is 10+ chars of the base32 alphabet, repeated 2+ times before the TLD
    pattern: /\b(?:[A-Z2-7]{10,}\.){2,}(?:[A-Za-z0-9\-]+\.)*[a-zA-Z]{2,}\b/,
    confidence: 0.78,
    description: 'Base32-encoded DNS subdomains (DNS tunnel pattern)',
  },

  // ── File system traversal ────────────────────────────────────────────
  {
    id: 'exfil-path-traversal',
    type: 'exfiltration',
    subType: 'PATH_TRAVERSAL',
    // Multiple levels of ../ traversal
    pattern: /(?:\.\.\/){2,}/,
    confidence: 0.78,
    description: 'Directory traversal (multiple ../)',
  },
  {
    id: 'exfil-etc-passwd',
    type: 'exfiltration',
    subType: 'PATH_TRAVERSAL',
    pattern: /\/etc\/(?:passwd|shadow|sudoers|hosts)/,
    confidence: 0.9,
    description: 'Access to sensitive system files',
  },
  {
    id: 'exfil-proc-self',
    type: 'exfiltration',
    subType: 'PATH_TRAVERSAL',
    pattern: /\/proc\/self\/(?:environ|cmdline|maps|fd)/,
    confidence: 0.92,
    description: 'Access to /proc/self (process introspection)',
  },
  {
    id: 'exfil-windows-system',
    type: 'exfiltration',
    subType: 'PATH_TRAVERSAL',
    pattern: /[A-Za-z]:\\Windows\\System32\\config\\(?:SAM|SYSTEM|SECURITY)/i,
    confidence: 0.9,
    description: 'Access to Windows SAM/SYSTEM/SECURITY hive',
  },
  {
    id: 'exfil-path-traversal-encoded',
    type: 'exfiltration',
    subType: 'PATH_TRAVERSAL',
    // URL-encoded and double-encoded traversal sequences
    pattern: /(?:%2e%2e%2f|%2e%2e\/|\.\.%2f|%252e%252e%252f|\.{4,}\/)/i,
    confidence: 0.85,
    description: 'URL-encoded path traversal sequence',
  },

  // ── Webhook / callback exfiltration ──────────────────────────────────
  {
    id: 'exfil-webhook-post',
    type: 'exfiltration',
    subType: 'WEBHOOK_EXFIL',
    // Send data to common webhook/callback services
    pattern: /(?:https?:\/\/)?(?:(?:webhook|requestbin|pipedream|hookbin|burpcollaborator|interact\.sh|canarytokens|ngrok)[.\-])/i,
    confidence: 0.85,
    description: 'Data sent to webhook/callback service',
  },
  {
    id: 'exfil-webhook-arbitrary-post',
    type: 'exfiltration',
    subType: 'WEBHOOK_EXFIL',
    // Patterns of POSTing sensitive data to an arbitrary external URL
    pattern: /\b(?:fetch|axios|http\.post|requests\.post)\s*\([^)]*(?:password|secret|token|api[_-]?key|credential)[^)]*\)/i,
    confidence: 0.8,
    description: 'HTTP POST call containing sensitive field names',
  },

  // ── Steganographic exfiltration ──────────────────────────────────────
  {
    id: 'exfil-steg-base64-query',
    type: 'exfiltration',
    subType: 'STEG_EXFIL',
    // base64 payload (20+ chars of base64 alphabet) embedded in a URL query string parameter
    pattern: /https?:\/\/[^\s"']+\?[^\s"']*=[A-Za-z0-9+/]{20,}={0,2}(?:[&;][^\s"']*)?/,
    confidence: 0.72,
    description: 'Base64-encoded data in URL query string (potential steganographic exfiltration)',
  },
  {
    id: 'exfil-steg-image-url-params',
    type: 'exfiltration',
    subType: 'STEG_EXFIL',
    // Image URL with suspicious data-like query parameters (e.g. img.png?d=<data>)
    pattern: /https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|gif|svg|ico|webp)\?[^\s"']*(?:data|payload|d|p|q)=[A-Za-z0-9%+/=_-]{20,}/i,
    confidence: 0.75,
    description: 'Image URL with encoded data in query parameters (steganographic exfiltration)',
  },

  // ── Chunked exfiltration ─────────────────────────────────────────────
  {
    id: 'exfil-chunked-sequential',
    type: 'exfiltration',
    subType: 'CHUNKED_EXFIL',
    // Patterns suggestive of sending data in numbered sequential chunks
    pattern: /\bchunk\s*[_\-]?\s*\d+\s*(?:of|\/)\s*\d+\b/i,
    confidence: 0.68,
    description: 'Data chunking pattern (sequential chunk references)',
  },
  {
    id: 'exfil-chunked-split-marker',
    type: 'exfiltration',
    subType: 'CHUNKED_EXFIL',
    // Explicit data-splitting markers in tool calls
    pattern: /\b(?:part|segment|slice|fragment)\s*[_\-]?\s*\d+\s*(?:of|\/)\s*\d+\b/i,
    confidence: 0.65,
    description: 'Explicit data-part marker (potential multi-call exfiltration)',
  },

  // ── Metadata / header exfiltration ───────────────────────────────────
  {
    id: 'exfil-header-sensitive',
    type: 'exfiltration',
    subType: 'METADATA_EXFIL',
    // Setting HTTP headers with sensitive data
    pattern: /(?:X-[A-Za-z0-9\-]+|User-Agent|Referer|Authorization)\s*:\s*[^\n]*(?:password|secret|token|ssn|credit.?card|api[_\-]?key)[^\n]*/i,
    confidence: 0.8,
    description: 'Sensitive data embedded in HTTP header',
  },
  {
    id: 'exfil-useragent-data',
    type: 'exfiltration',
    subType: 'METADATA_EXFIL',
    // User-Agent containing structured base64 or hex blobs (data exfil via UA)
    pattern: /User-Agent\s*:\s*[^\n]*[A-Za-z0-9+/]{30,}={0,2}/i,
    confidence: 0.7,
    description: 'Potential data exfiltration via User-Agent header',
  },

  // ── Redirect-based exfiltration ──────────────────────────────────────
  {
    id: 'exfil-redirect-referrer',
    type: 'exfiltration',
    subType: 'REDIRECT_EXFIL',
    // Open redirect patterns that could leak referrer data
    pattern: /(?:window\.location|location\.href|document\.location)\s*=\s*["']?https?:\/\/(?!(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.))([a-z0-9\-]+\.)+[a-z]{2,}/i,
    confidence: 0.72,
    description: 'JavaScript redirect to external domain (referrer leak risk)',
  },
  {
    id: 'exfil-redirect-param',
    type: 'exfiltration',
    subType: 'REDIRECT_EXFIL',
    // URL redirect via query parameter passing external destination
    pattern: /[?&](?:redirect|return|next|url|dest|goto|target)=https?:\/\/[^\s"'&]+/i,
    confidence: 0.7,
    description: 'Open redirect via URL parameter (potential referrer-based data leak)',
  },

  // ── Email exfiltration ────────────────────────────────────────────────
  {
    id: 'exfil-email-sensitive-body',
    type: 'exfiltration',
    subType: 'EMAIL_EXFIL',
    // Constructing or sending an email with sensitive keywords in body/subject
    pattern: /(?:send(?:mail)?|mail(?:to)?|smtp)\b[^;]{0,200}(?:password|secret|token|ssn|api[_\-]?key|credential|private[_\-]?key)/i,
    confidence: 0.78,
    description: 'Email action containing sensitive data keywords',
  },
  {
    id: 'exfil-mailto-sensitive',
    type: 'exfiltration',
    subType: 'EMAIL_EXFIL',
    // mailto: links with body/subject containing sensitive terms
    pattern: /mailto:[^\s"'<>]+\?(?:[^\s"'<>]*&)?(?:subject|body)=[^\s"'<>]*(?:password|secret|token|api[_\-]?key|ssn|credential)/i,
    confidence: 0.8,
    description: 'mailto: link with sensitive data in subject/body',
  },
];
