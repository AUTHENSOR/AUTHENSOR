import type { DetectorRule } from '../types.js';

export const CODE_SAFETY_RULES: DetectorRule[] = [
  // ── Destructive commands ─────────────────────────────────────────────
  {
    id: 'code-rm-rf',
    type: 'code_safety',
    subType: 'DESTRUCTIVE_COMMAND',
    pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\b/,
    confidence: 0.92,
    description: 'Recursive force delete (rm -rf)',
  },
  {
    id: 'code-drop-table',
    type: 'code_safety',
    subType: 'DESTRUCTIVE_COMMAND',
    pattern: /\bDROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX)\b/i,
    confidence: 0.9,
    description: 'SQL DROP statement',
  },
  {
    id: 'code-delete-no-where',
    type: 'code_safety',
    subType: 'DESTRUCTIVE_COMMAND',
    // DELETE FROM table (without a WHERE clause on the same line)
    pattern: /\bDELETE\s+FROM\s+\S+\s*(?:;|\n|$)/i,
    confidence: 0.8,
    description: 'SQL DELETE without WHERE clause',
  },
  {
    id: 'code-truncate-table',
    type: 'code_safety',
    subType: 'DESTRUCTIVE_COMMAND',
    pattern: /\bTRUNCATE\s+(?:TABLE\s+)?\S+/i,
    confidence: 0.88,
    description: 'SQL TRUNCATE statement',
  },
  {
    id: 'code-format-drive',
    type: 'code_safety',
    subType: 'DESTRUCTIVE_COMMAND',
    pattern: /\bformat\s+[A-Za-z]:\s*/i,
    confidence: 0.88,
    description: 'Windows format drive command',
  },
  {
    id: 'code-mkfs',
    type: 'code_safety',
    subType: 'DESTRUCTIVE_COMMAND',
    pattern: /\bmkfs(?:\.\w+)?\s+\/dev\//,
    confidence: 0.9,
    description: 'Linux mkfs — format filesystem',
  },
  {
    id: 'code-dd-of',
    type: 'code_safety',
    subType: 'DESTRUCTIVE_COMMAND',
    // dd if=/dev/zero of=/dev/sda — writing directly to block device
    pattern: /\bdd\s+.*\bof=\/dev\/[a-z]/i,
    confidence: 0.88,
    description: 'dd writing to block device',
  },

  // ── Reverse shell ────────────────────────────────────────────────────
  {
    id: 'code-reverse-shell-nc',
    type: 'code_safety',
    subType: 'REVERSE_SHELL',
    pattern: /\bnc\s+-[a-zA-Z]*[el][a-zA-Z]*\s/,
    confidence: 0.85,
    description: 'Netcat listener (potential reverse shell)',
  },
  {
    id: 'code-reverse-shell-bash',
    type: 'code_safety',
    subType: 'REVERSE_SHELL',
    pattern: /\bbash\s+-i\s+>&?\s*\/dev\/tcp\//,
    confidence: 0.95,
    description: 'Bash reverse shell via /dev/tcp',
  },
  {
    id: 'code-reverse-shell-devtcp',
    type: 'code_safety',
    subType: 'REVERSE_SHELL',
    pattern: /\/dev\/tcp\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d+/,
    confidence: 0.93,
    description: 'Reference to /dev/tcp with IP and port',
  },
  {
    id: 'code-reverse-shell-python',
    type: 'code_safety',
    subType: 'REVERSE_SHELL',
    pattern: /\bpython[23]?\s+-c\s+['"]import\s+(?:socket|os|subprocess)/,
    confidence: 0.88,
    description: 'Python one-liner reverse shell',
  },

  // ── Privilege escalation ─────────────────────────────────────────────
  {
    id: 'code-chmod-777',
    type: 'code_safety',
    subType: 'PRIVILEGE_ESCALATION',
    pattern: /\bchmod\s+(?:-[a-zA-Z]+\s+)*777\b/,
    confidence: 0.82,
    description: 'chmod 777 — world-writable permissions',
  },
  {
    id: 'code-chown-root',
    type: 'code_safety',
    subType: 'PRIVILEGE_ESCALATION',
    pattern: /\bchown\s+(?:-[a-zA-Z]+\s+)*root[:\s]/,
    confidence: 0.75,
    description: 'chown to root',
  },
  {
    id: 'code-setuid',
    type: 'code_safety',
    subType: 'PRIVILEGE_ESCALATION',
    pattern: /\bchmod\s+(?:-[a-zA-Z]+\s+)*[46]755\b/,
    confidence: 0.85,
    description: 'Set SUID/SGID bit',
  },

  // ── Dangerous eval patterns ──────────────────────────────────────────
  {
    id: 'code-eval-js',
    type: 'code_safety',
    subType: 'DANGEROUS_EVAL',
    // eval() with string argument (not just a reference to eval)
    pattern: /\beval\s*\(\s*["'`]/,
    confidence: 0.78,
    description: 'JavaScript eval() with string literal',
  },
  {
    id: 'code-exec-python',
    type: 'code_safety',
    subType: 'DANGEROUS_EVAL',
    pattern: /\b(?:exec|compile)\s*\(\s*["']/,
    confidence: 0.75,
    description: 'Python exec/compile with string literal',
  },
  {
    id: 'code-import-python',
    type: 'code_safety',
    subType: 'DANGEROUS_EVAL',
    pattern: /\b__import__\s*\(/,
    confidence: 0.82,
    description: 'Python __import__() dynamic import',
  },
  {
    id: 'code-function-constructor',
    type: 'code_safety',
    subType: 'DANGEROUS_EVAL',
    pattern: /\bnew\s+Function\s*\(\s*["'`]/,
    confidence: 0.8,
    description: 'JavaScript Function constructor with string',
  },

  // ── Deserialization attacks ───────────────────────────────────────────
  {
    id: 'code-pickle-loads',
    type: 'code_safety',
    subType: 'DESERIALIZATION',
    // pickle.loads() with untrusted data is a well-known RCE vector
    pattern: /\bpickle\.loads?\s*\(/,
    confidence: 0.88,
    description: 'Python pickle.loads() — unsafe deserialization',
  },
  {
    id: 'code-yaml-unsafe-load',
    type: 'code_safety',
    subType: 'DESERIALIZATION',
    // yaml.load() without Loader=yaml.SafeLoader is dangerous; yaml.unsafe_load is always dangerous
    pattern: /\byaml\.(?:unsafe_load|load)\s*\([^)]*(?!\bSafeLoader\b)/,
    confidence: 0.82,
    description: 'YAML unsafe deserialization (yaml.load / yaml.unsafe_load)',
  },
  {
    id: 'code-marshal-loads',
    type: 'code_safety',
    subType: 'DESERIALIZATION',
    pattern: /\bmarshal\.loads?\s*\(/,
    confidence: 0.85,
    description: 'Python marshal.loads() — unsafe binary deserialization',
  },
  {
    id: 'code-java-objectinputstream',
    type: 'code_safety',
    subType: 'DESERIALIZATION',
    pattern: /\bnew\s+ObjectInputStream\s*\(/,
    confidence: 0.82,
    description: 'Java ObjectInputStream — unsafe deserialization',
  },

  // ── Prototype pollution ──────────────────────────────────────────────
  {
    id: 'code-proto-pollution',
    type: 'code_safety',
    subType: 'PROTOTYPE_POLLUTION',
    // Direct __proto__ assignment
    pattern: /\[?\s*['"]?__proto__['"]?\s*\]?\s*=/,
    confidence: 0.88,
    description: 'Prototype pollution via __proto__ assignment',
  },
  {
    id: 'code-constructor-prototype',
    type: 'code_safety',
    subType: 'PROTOTYPE_POLLUTION',
    // constructor.prototype modification
    pattern: /\.constructor\s*\.\s*prototype\s*[.[]/,
    confidence: 0.85,
    description: 'Prototype pollution via constructor.prototype',
  },
  {
    id: 'code-object-setprototypeof',
    type: 'code_safety',
    subType: 'PROTOTYPE_POLLUTION',
    pattern: /Object\.setPrototypeOf\s*\(/,
    confidence: 0.75,
    description: 'Object.setPrototypeOf() — potential prototype pollution',
  },

  // ── Template injection ────────────────────────────────────────────────
  {
    id: 'code-template-injection-handlebars',
    type: 'code_safety',
    subType: 'TEMPLATE_INJECTION',
    // Handlebars / Mustache: {{ ... }}
    pattern: /\{\{[\s\S]{0,100}\}\}/,
    confidence: 0.72,
    description: 'Handlebars/Mustache template expression in user content',
  },
  {
    id: 'code-template-injection-dollar-brace',
    type: 'code_safety',
    subType: 'TEMPLATE_INJECTION',
    // JavaScript template literal / Spring EL / others: ${ ... }
    pattern: /\$\{[^}]{1,200}\}/,
    confidence: 0.75,
    description: 'Template expression ${...} (SSTI/JS template literal)',
  },
  {
    id: 'code-template-injection-erb',
    type: 'code_safety',
    subType: 'TEMPLATE_INJECTION',
    // ERB (<%= %>, <% %>) and similar server-side template delimiters
    pattern: /<%[\s=\-][\s\S]{0,200}%>/,
    confidence: 0.78,
    description: 'ERB-style template expression (<% %>) in user content',
  },
  {
    id: 'code-template-injection-jinja',
    type: 'code_safety',
    subType: 'TEMPLATE_INJECTION',
    // Jinja2 / Twig: {{ ... }}, {% ... %}, #{...}
    pattern: /\{%[\s\-][\s\S]{0,200}%\}|#\{[^}]{1,200}\}/,
    confidence: 0.78,
    description: 'Jinja2/Twig/Ruby template expression',
  },

  // ── Log injection ─────────────────────────────────────────────────────
  {
    id: 'code-log-injection-newline',
    type: 'code_safety',
    subType: 'LOG_INJECTION',
    // Newlines embedded in data headed for logs (as URL-encoded or literal)
    pattern: /(?:%0[aAdD]|\\r|\\n).*(?:level|error|warn|info|debug|log)/i,
    confidence: 0.78,
    description: 'Newline injection in log-destined string',
  },
  {
    id: 'code-log-injection-ansi',
    type: 'code_safety',
    subType: 'LOG_INJECTION',
    // ANSI escape codes that can corrupt terminal log output
    pattern: /\x1b\[[0-9;]*[mGKHF]|\\x1b\[|\\033\[/,
    confidence: 0.8,
    description: 'ANSI escape code injection (log/terminal poisoning)',
  },

  // ── SSRF — internal/private IP ranges ────────────────────────────────
  {
    id: 'code-ssrf-link-local',
    type: 'code_safety',
    subType: 'SSRF',
    // Link-local 169.254.x.x (AWS metadata etc.) in code context
    pattern: /\b169\.254\.\d{1,3}\.\d{1,3}\b/,
    confidence: 0.9,
    description: 'Link-local address (169.254.x.x) — SSRF risk',
  },
  {
    id: 'code-ssrf-private-range',
    type: 'code_safety',
    subType: 'SSRF',
    // Private IP ranges in code/URL strings
    pattern: /https?:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|localhost|\[::1\]|127\.\d+\.\d+\.\d+)(?::\d+)?(?:\/[^\s"'<>]*)?/i,
    confidence: 0.82,
    description: 'HTTP request to private/internal IP range (SSRF)',
  },
  {
    id: 'code-ssrf-ipv6-loopback',
    type: 'code_safety',
    subType: 'SSRF',
    pattern: /\[::1\]|\[0:0:0:0:0:0:0:1\]/,
    confidence: 0.85,
    description: 'IPv6 loopback address [::1] — SSRF risk',
  },

  // ── Path traversal ───────────────────────────────────────────────────
  {
    id: 'code-path-traversal-dots',
    type: 'code_safety',
    subType: 'PATH_TRAVERSAL',
    // ../  or ..\ sequences, including obfuscated forms
    pattern: /(?:\.\.\/|\.\.\\){2,}|(?:%2e%2e%2f|%2e%2e\/|\.\.%2f|%252e%252e)/i,
    confidence: 0.85,
    description: 'Path traversal sequence (../../ or encoded equivalent)',
  },
  {
    id: 'code-path-traversal-dotdotslash-obfuscated',
    type: 'code_safety',
    subType: 'PATH_TRAVERSAL',
    // ....// and similar doubled-dot tricks used to bypass naive filters
    pattern: /\.{4,}[\/\\]/,
    confidence: 0.82,
    description: 'Obfuscated path traversal (....// pattern)',
  },

  // ── Command injection ─────────────────────────────────────────────────
  {
    id: 'code-cmd-injection-backtick',
    type: 'code_safety',
    subType: 'COMMAND_INJECTION',
    // Backtick command substitution in argument strings
    pattern: /`[^`]{1,200}`/,
    confidence: 0.75,
    description: 'Backtick command substitution (command injection risk)',
  },
  {
    id: 'code-cmd-injection-dollar-paren',
    type: 'code_safety',
    subType: 'COMMAND_INJECTION',
    // $() command substitution
    pattern: /\$\([^)]{1,200}\)/,
    confidence: 0.75,
    description: '$() command substitution (command injection risk)',
  },
  {
    id: 'code-cmd-injection-pipe-semicolon',
    type: 'code_safety',
    subType: 'COMMAND_INJECTION',
    // Pipe or semicolon chaining in what looks like user-supplied input to shell
    pattern: /(?:;\s*(?:bash|sh|cmd|powershell|python|perl|ruby|nc|ncat|wget|curl)\b|\|\s*(?:bash|sh|cmd|powershell|python|perl)\b)/i,
    confidence: 0.8,
    description: 'Shell command chaining via pipe/semicolon (command injection)',
  },
  {
    id: 'code-cmd-injection-subshell',
    type: 'code_safety',
    subType: 'COMMAND_INJECTION',
    // Subshell in argument: arg $(id) or arg `whoami`
    pattern: /\w+\s+(?:\$\([^)]{1,100}\)|`[^`]{1,100}`)/,
    confidence: 0.72,
    description: 'Command substitution in argument (subshell injection)',
  },
];
