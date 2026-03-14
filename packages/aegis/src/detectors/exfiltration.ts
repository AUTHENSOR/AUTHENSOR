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
];
