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
];
