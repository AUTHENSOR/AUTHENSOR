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

  // ── GCP ──────────────────────────────────────────────────────────────
  {
    id: 'cred-gcp-service-account',
    type: 'credentials',
    subType: 'GCP_SERVICE_ACCOUNT',
    // GCP service account key JSON contains "type": "service_account"
    pattern: /"type"\s*:\s*"service_account"/,
    confidence: 0.92,
    description: 'GCP service account key JSON',
  },
  {
    id: 'cred-gcp-private-key-id',
    type: 'credentials',
    subType: 'GCP_SERVICE_ACCOUNT',
    // GCP JSON key file also contains "private_key_id"
    pattern: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/i,
    confidence: 0.9,
    description: 'GCP service account private_key_id field',
  },

  // ── Azure ─────────────────────────────────────────────────────────────
  {
    id: 'cred-azure-connection-string',
    type: 'credentials',
    subType: 'AZURE_CONNECTION_STRING',
    // Azure storage/service bus connection strings contain AccountKey=<base64>
    // Key is 20+ base64 chars (real keys are 88 chars but test values may be shorter)
    pattern: /AccountKey=[A-Za-z0-9+/]{20,}={0,2}/,
    confidence: 0.95,
    description: 'Azure connection string with AccountKey',
  },
  {
    id: 'cred-azure-sas-token',
    type: 'credentials',
    subType: 'AZURE_CONNECTION_STRING',
    // Azure SAS token sig= field
    pattern: /(?:sv|se|sr|sp|spr|sip|sig)=[A-Za-z0-9%+/=]{10,}&(?:sv|se|sr|sp|spr|sip|sig)=/i,
    confidence: 0.88,
    description: 'Azure SAS token',
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

  // ── Slack tokens ─────────────────────────────────────────────────────
  {
    id: 'cred-slack-token',
    type: 'credentials',
    subType: 'SLACK_TOKEN',
    pattern: /\bxox[bporas]-[A-Za-z0-9\-]{10,}/,
    confidence: 0.94,
    description: 'Slack API token',
  },

  // ── Discord tokens ────────────────────────────────────────────────────
  {
    id: 'cred-discord-bot-token',
    type: 'credentials',
    subType: 'DISCORD_TOKEN',
    // Discord bot tokens: base64(snowflake).timestamp.hmac — three dot-separated parts
    // Snowflake part: 18-28 chars; timestamp: 6 chars; hmac: 27+ chars
    pattern: /\b[A-Za-z0-9_\-]{18,28}\.[A-Za-z0-9_\-]{6,7}\.[A-Za-z0-9_\-]{27,}\b/,
    confidence: 0.82,
    description: 'Discord bot token',
  },

  // ── HuggingFace ───────────────────────────────────────────────────────
  {
    id: 'cred-huggingface-token',
    type: 'credentials',
    subType: 'HUGGINGFACE_TOKEN',
    pattern: /\bhf_[A-Za-z0-9]{20,}\b/,
    confidence: 0.95,
    description: 'HuggingFace API token',
  },

  // ── Cohere ────────────────────────────────────────────────────────────
  {
    id: 'cred-cohere-key',
    type: 'credentials',
    subType: 'COHERE_KEY',
    // Cohere API keys are 40-char alphanumeric strings typically in an env var context
    pattern: /(?:cohere[_\-]?(?:api[_\-]?)?key|CO_API_KEY)\s*[=:]\s*["']?[A-Za-z0-9]{30,}["']?/i,
    confidence: 0.88,
    description: 'Cohere API key',
  },

  // ── Pinecone ──────────────────────────────────────────────────────────
  {
    id: 'cred-pinecone-key',
    type: 'credentials',
    subType: 'PINECONE_KEY',
    // Pinecone API keys are UUID-like strings, often labelled PINECONE_API_KEY
    pattern: /(?:pinecone[_\-]?(?:api[_\-]?)?key)\s*[=:]\s*["']?[0-9a-f\-]{32,}["']?/i,
    confidence: 0.88,
    description: 'Pinecone API key',
  },

  // ── SendGrid ──────────────────────────────────────────────────────────
  {
    id: 'cred-sendgrid-key',
    type: 'credentials',
    subType: 'SENDGRID_KEY',
    // SendGrid API keys begin with SG.
    pattern: /\bSG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\b/,
    confidence: 0.96,
    description: 'SendGrid API key',
  },

  // ── Twilio ────────────────────────────────────────────────────────────
  {
    id: 'cred-twilio-account-sid',
    type: 'credentials',
    subType: 'TWILIO_CREDENTIAL',
    // Twilio Account SIDs start with AC followed by 32 hex chars
    pattern: /\bAC[0-9a-f]{32}\b/i,
    confidence: 0.88,
    description: 'Twilio Account SID',
  },
  {
    id: 'cred-twilio-auth-token',
    type: 'credentials',
    subType: 'TWILIO_CREDENTIAL',
    // Twilio auth tokens are 32 lowercase hex chars, usually labelled
    pattern: /(?:twilio[_\-]?(?:auth[_\-]?)?token)\s*[=:]\s*["']?[0-9a-f]{32}["']?/i,
    confidence: 0.9,
    description: 'Twilio auth token',
  },

  // ── Datadog ───────────────────────────────────────────────────────────
  {
    id: 'cred-datadog-api-key',
    type: 'credentials',
    subType: 'DATADOG_KEY',
    // Datadog API keys: 32 hex chars, app keys: 40 hex chars
    pattern: /(?:dd[_\-]?(?:api|app)[_\-]?key|datadog[_\-]?(?:api|app)[_\-]?key)\s*[=:]\s*["']?[0-9a-f]{32,40}["']?/i,
    confidence: 0.9,
    description: 'Datadog API or application key',
  },

  // ── SSH private keys ──────────────────────────────────────────────────
  {
    id: 'cred-private-key',
    type: 'credentials',
    subType: 'PRIVATE_KEY',
    pattern: /-----BEGIN\s+(?:RSA\s+)?(?:PRIVATE|EC|DSA|ENCRYPTED)\s+KEY-----/,
    confidence: 0.98,
    description: 'PEM-encoded private key',
  },
  {
    id: 'cred-openssh-private-key',
    type: 'credentials',
    subType: 'PRIVATE_KEY',
    // OpenSSH format (ED25519 etc.)
    pattern: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,
    confidence: 0.98,
    description: 'OpenSSH private key (ED25519/ECDSA)',
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

  // ── Stripe keys ──────────────────────────────────────────────────────
  {
    id: 'cred-stripe-key',
    type: 'credentials',
    subType: 'STRIPE_KEY',
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
    confidence: 0.95,
    description: 'Stripe API key',
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

  // ── OAuth / Bearer tokens ─────────────────────────────────────────────
  {
    id: 'cred-bearer-header',
    type: 'credentials',
    subType: 'BEARER_TOKEN',
    // Authorization: Bearer <token> — flag tokens outside of standard JWT structure
    pattern: /Authorization\s*:\s*Bearer\s+(?!eyJ)[A-Za-z0-9_\-\.+/=]{20,}/i,
    confidence: 0.82,
    description: 'Bearer token in Authorization header (non-JWT)',
  },
  {
    id: 'cred-oauth-token-label',
    type: 'credentials',
    subType: 'BEARER_TOKEN',
    // Labeled OAuth tokens in config/code: oauth_token = "..."
    pattern: /\boauth[_\-]?(?:access[_\-]?)?token\s*[=:]\s*["']?[A-Za-z0-9_\-\.+/=]{20,}["']?/i,
    confidence: 0.85,
    description: 'OAuth token in unexpected location',
  },
];
