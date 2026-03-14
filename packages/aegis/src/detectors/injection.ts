import type { DetectorRule } from '../types.js';

export const INJECTION_RULES: DetectorRule[] = [
  // ── Direct instruction override ──────────────────────────────────────
  {
    id: 'injection-ignore-instructions',
    type: 'injection',
    subType: 'DIRECT_OVERRIDE',
    // "ignore previous/above/all/prior/your instructions/rules/guidelines"
    pattern: /(?:^|\n|[.!?]\s+|\b(?:please|now|immediately|just)\s+)ignore\s+(?:all\s+)?(?:previous|above|prior|earlier|your|the)\s+(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.95,
    description: 'Direct instruction override — ignore previous instructions',
  },
  {
    id: 'injection-forget-instructions',
    type: 'injection',
    subType: 'DIRECT_OVERRIDE',
    pattern: /(?:^|\n|[.!?]\s+|\b(?:please|now|immediately|just)\s+)forget\s+(?:all\s+)?(?:previous|above|prior|earlier|your|the)\s+(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.95,
    description: 'Direct instruction override — forget instructions',
  },
  {
    id: 'injection-disregard',
    type: 'injection',
    subType: 'DIRECT_OVERRIDE',
    pattern: /(?:^|\n|[.!?]\s+|\b(?:please|now|immediately|just)\s+)disregard\s+(?:all\s+)?(?:previous|above|prior|earlier|your|the)\s+(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.95,
    description: 'Direct instruction override — disregard instructions',
  },
  {
    id: 'injection-do-not-follow',
    type: 'injection',
    subType: 'DIRECT_OVERRIDE',
    pattern: /(?:^|\n|[.!?]\s+|\b(?:please|now|immediately|just)\s+)do\s+not\s+follow\s+(?:any\s+)?(?:previous|above|prior|earlier|your|the)\s+(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.92,
    description: 'Direct instruction override — do not follow instructions',
  },
  {
    id: 'injection-new-instructions',
    type: 'injection',
    subType: 'DIRECT_OVERRIDE',
    // "your new instructions are", "new system prompt:"
    pattern: /(?:^|\n|[.!?]\s+|\b(?:please|now|immediately|just)\s+)(?:your\s+)?new\s+(?:instructions|system\s*prompt|rules|directives)\s*(?:are|:)/i,
    confidence: 0.9,
    description: 'Direct instruction override — new instructions',
  },

  // ── System prompt extraction ─────────────────────────────────────────
  {
    id: 'injection-extract-system-prompt',
    type: 'injection',
    subType: 'SYSTEM_PROMPT_EXTRACTION',
    pattern: /(?:what\s+is|show\s+me|reveal|display|output|print|tell\s+me|repeat|echo)\s+(?:your\s+)?(?:system\s*prompt|initial\s*prompt|original\s*instructions|hidden\s*instructions|system\s*message|custom\s*instructions)/i,
    confidence: 0.88,
    description: 'System prompt extraction attempt',
  },
  {
    id: 'injection-repeat-instructions',
    type: 'injection',
    subType: 'SYSTEM_PROMPT_EXTRACTION',
    pattern: /(?:^|\n|[.!?]\s+)repeat\s+(?:your\s+)?(?:instructions|system\s*prompt|rules|directives)\s+(?:back\s+to\s+me|verbatim|exactly|word\s*for\s*word)/i,
    confidence: 0.9,
    description: 'System prompt extraction — repeat instructions',
  },
  {
    id: 'injection-dump-prompt',
    type: 'injection',
    subType: 'SYSTEM_PROMPT_EXTRACTION',
    pattern: /(?:^|\n|[.!?]\s+)(?:dump|leak|expose|exfiltrate)\s+(?:your\s+)?(?:system\s*prompt|instructions|configuration|config)/i,
    confidence: 0.92,
    description: 'System prompt extraction — dump prompt',
  },

  // ── Role manipulation ────────────────────────────────────────────────
  {
    id: 'injection-role-you-are-now',
    type: 'injection',
    subType: 'ROLE_MANIPULATION',
    // "you are now DAN/a hacker/an unrestricted AI..."
    pattern: /(?:^|\n|[.!?]\s+)you\s+are\s+now\s+(?:a\s+|an\s+)?(?!going|able|ready|welcome|free\s+to\s+ask)\S/i,
    confidence: 0.7,
    description: 'Role manipulation — "you are now"',
  },
  {
    id: 'injection-role-act-as',
    type: 'injection',
    subType: 'ROLE_MANIPULATION',
    // "act as DAN/an evil AI/a jailbroken model" — anchored to sentence start
    pattern: /(?:^|\n|[.!?]\s+)act\s+as\s+(?:a\s+|an\s+)?(?:DAN|evil|malicious|unrestricted|jailbroken|unfiltered|uncensored)/i,
    confidence: 0.85,
    description: 'Role manipulation — "act as" malicious persona',
  },
  {
    id: 'injection-role-pretend',
    type: 'injection',
    subType: 'ROLE_MANIPULATION',
    pattern: /(?:^|\n|[.!?]\s+)pretend\s+(?:to\s+be|you\s*(?:(?:a|')re))\s+(?:a\s+|an\s+)?(?!friend|customer|user|student|teacher)(?:DAN|evil|malicious|unrestricted|jailbroken|unfiltered|uncensored|AI\s+without\s+(?:restrictions|rules|limits|filters))/i,
    confidence: 0.85,
    description: 'Role manipulation — "pretend to be" malicious persona',
  },
  {
    id: 'injection-jailbreak-dan',
    type: 'injection',
    subType: 'ROLE_MANIPULATION',
    pattern: /\bDAN\s*(?:mode|prompt|jailbreak)\b/i,
    confidence: 0.92,
    description: 'DAN jailbreak pattern',
  },

  // ── Delimiter injection ──────────────────────────────────────────────
  {
    id: 'injection-delimiter-system',
    type: 'injection',
    subType: 'DELIMITER_INJECTION',
    // Fake system/user/assistant message boundaries
    pattern: /(?:^|\n)\s*(?:system|assistant|user)\s*:\s*\n/i,
    confidence: 0.75,
    description: 'Delimiter injection — fake message boundary',
  },
  {
    id: 'injection-delimiter-inst',
    type: 'injection',
    subType: 'DELIMITER_INJECTION',
    // [INST], <<SYS>>, [/INST] — Llama-style prompt markers
    pattern: /\[\/?\s*INST\s*\]|<<\s*\/?SYS\s*>>|<\|im_start\|>|<\|im_end\|>/,
    confidence: 0.88,
    description: 'Delimiter injection — model-specific prompt markers',
  },
  {
    id: 'injection-delimiter-triple-backtick',
    type: 'injection',
    subType: 'DELIMITER_INJECTION',
    // Triple backtick + system-like label to fake a system block
    pattern: /```\s*(?:system|instructions?|prompt|config)\b/i,
    confidence: 0.78,
    description: 'Delimiter injection — fenced system block',
  },

  // ── Hidden HTML injection ────────────────────────────────────────────
  {
    id: 'injection-html-comment',
    type: 'injection',
    subType: 'HTML_INJECTION',
    // HTML comments containing instruction-like content
    pattern: /<!--\s*(?:ignore|forget|disregard|override|new\s+instructions|system\s*prompt)/i,
    confidence: 0.9,
    description: 'Hidden HTML comment with instruction injection',
  },
  {
    id: 'injection-hidden-text',
    type: 'injection',
    subType: 'HTML_INJECTION',
    // Zero-width characters used to hide instructions
    pattern: /[\u200B\u200C\u200D\uFEFF]{3,}/,
    confidence: 0.7,
    description: 'Suspicious zero-width character sequence',
  },

  // ── Encoding attacks ─────────────────────────────────────────────────
  {
    id: 'injection-base64-instructions',
    type: 'injection',
    subType: 'ENCODING_ATTACK',
    // "decode this base64" or "base64:" followed by encoded blob
    pattern: /(?:decode|execute|run|eval|interpret)\s+(?:this\s+)?(?:base64|b64)\s*[:=]?\s*[A-Za-z0-9+\/]{20,}={0,2}/i,
    confidence: 0.82,
    description: 'Base64 encoding attack — instruction smuggling',
  },
  {
    id: 'injection-unicode-tricks',
    type: 'injection',
    subType: 'ENCODING_ATTACK',
    // Homoglyph / unicode confusion — Cyrillic or Greek letters mixed with Latin in suspicious keywords
    pattern: /[\u0400-\u04FF][\u0041-\u005A\u0061-\u007A]{2,}|[\u0041-\u005A\u0061-\u007A]{2,}[\u0400-\u04FF]/,
    confidence: 0.65,
    description: 'Unicode homoglyph confusion (Cyrillic mixed with Latin)',
  },
];
