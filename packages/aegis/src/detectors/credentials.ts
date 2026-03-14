import type { DetectorRule } from '../types.js';

export const CREDENTIAL_RULES: DetectorRule[] = [
  // ── AWS ──────────────────────────────────────────────────────────────
  {
    id: 'cred-aws-access-key',
    type: 'credentials',
    subType: 'AWS_KEY',
    // AWS access key IDs start with AKIA followed by 16 uppercase alnum chars
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    confidence: 0.97,
    description: 'AWS access key ID',
  },
  {
    id: 'cred-aws-secret-key',
    type: 'credentials',
    subType: 'AWS_SECRET',
    // AWS secret keys are 40-char base64-like strings, often preceded by a label
    pattern: /(?:aws_secret_access_key|aws_secret|secret_key)\s*[=:]\s*["']?[A-Za-z0-9\/+=]{40}["']?/i,
    confidence: 0.92,
    description: 'AWS secret access key',
  },

  // ── OpenAI ───────────────────────────────────────────────────────────
  {
    id: 'cred-openai-key',
    type: 'credentials',
    subType: 'OPENAI_KEY',
    pattern: /\bsk-(?:proj-|live-)[A-Za-z0-9_\-]{20,}\b/,
    confidence: 0.96,
    description: 'OpenAI API key',
  },

  // ── Anthropic ────────────────────────────────────────────────────────
  {
    id: 'cred-anthropic-key',
    type: 'credentials',
    subType: 'ANTHROPIC_KEY',
    pattern: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/,
    confidence: 0.96,
    description: 'Anthropic API key',
  },

  // ── GitHub tokens ────────────────────────────────────────────────────
  {
    id: 'cred-github-pat',
    type: 'credentials',
    subType: 'GITHUB_TOKEN',
    // ghp_ (PAT), gho_ (OAuth), ghu_ (user-to-server), ghs_ (server-to-server), ghr_ (refresh)
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/,
    confidence: 0.96,
    description: 'GitHub token',
  },

  // ── Generic API keys ────────────────────────────────────────────────
  {
    id: 'cred-generic-apikey-kv',
    type: 'credentials',
    subType: 'GENERIC_API_KEY',
    // key=value patterns: api_key=xxx, apikey=xxx, api-key=xxx
    pattern: /\b(?:api[_\-]?key|api[_\-]?secret|access[_\-]?token|auth[_\-]?token|bearer[_\-]?token)\s*[=:]\s*["']?[A-Za-z0-9_\-\.]{16,}["']?/i,
    confidence: 0.78,
    description: 'Generic API key in key=value format',
  },
  {
    id: 'cred-generic-apikey-json',
    type: 'credentials',
    subType: 'GENERIC_API_KEY',
    // JSON patterns: "api_key": "xxx"
    pattern: /["'](?:api[_\-]?key|api[_\-]?secret|access[_\-]?token|auth[_\-]?token|bearer[_\-]?token)["']\s*:\s*["'][A-Za-z0-9_\-\.]{16,}["']/i,
    confidence: 0.8,
    description: 'Generic API key in JSON format',
  },

  // ── Private keys ─────────────────────────────────────────────────────
  {
    id: 'cred-private-key',
    type: 'credentials',
    subType: 'PRIVATE_KEY',
    pattern: /-----BEGIN\s+(?:RSA\s+)?(?:PRIVATE|EC|DSA|ENCRYPTED)\s+KEY-----/,
    confidence: 0.98,
    description: 'PEM-encoded private key',
  },

  // ── JWT tokens ───────────────────────────────────────────────────────
  {
    id: 'cred-jwt',
    type: 'credentials',
    subType: 'JWT',
    // JWT: base64url header.payload.signature — all three parts
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-]{10,}\b/,
    confidence: 0.85,
    description: 'JSON Web Token (JWT)',
  },

  // ── Database connection strings ──────────────────────────────────────
  {
    id: 'cred-db-connstring',
    type: 'credentials',
    subType: 'DATABASE_URI',
    // postgres://user:password@host, mysql://..., mongodb://... — only flagged when password segment is present
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:]+:[^\s@]+@[^\s]+/i,
    confidence: 0.92,
    description: 'Database connection string with credentials',
  },

  // ── Slack tokens ─────────────────────────────────────────────────────
  {
    id: 'cred-slack-token',
    type: 'credentials',
    subType: 'SLACK_TOKEN',
    pattern: /\bxox[bporas]-[A-Za-z0-9\-]{10,}/,
    confidence: 0.94,
    description: 'Slack API token',
  },

  // ── Stripe keys ──────────────────────────────────────────────────────
  {
    id: 'cred-stripe-key',
    type: 'credentials',
    subType: 'STRIPE_KEY',
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
    confidence: 0.95,
    description: 'Stripe API key',
  },
];
