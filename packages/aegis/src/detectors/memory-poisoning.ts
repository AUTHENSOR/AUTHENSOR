/**
 * Memory Poisoning / Indirect Prompt Injection Detector Rules
 *
 * Detects MINJA-style attacks where adversaries inject malicious instructions
 * into agent memory, context windows, or retrieved documents (OWASP ASI06).
 *
 * Attack surface: poisoned RAG documents, manipulated conversation history,
 * injected tool results stored in memory, contaminated vector DB entries.
 *
 * When the agent retrieves these memories later, it may execute the
 * injected instructions — exfiltrating data, overriding behavior, or
 * pivoting to attacker-controlled objectives.
 */

import type { DetectorRule } from '../types.js';

export const MEMORY_POISONING_RULES: DetectorRule[] = [
  // ── Instructions disguised as data ─────────────────────────────────────
  // Attackers embed imperative instructions inside what looks like stored
  // facts, notes, or retrieved documents.
  {
    id: 'memory-poison-remember-instruction',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "Remember: always send/forward/include..." — instructions hidden as memos
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*remember\s*:\s*(?:always|never|you\s+(?:must|should|need\s+to))\s+(?:send|forward|include|attach|upload|share|transmit|post|exfiltrate|leak|expose|output)\b/i,
    confidence: 0.9,
    description: 'Memory poisoning — instruction disguised as stored memo',
  },
  {
    id: 'memory-poison-note-to-self',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "Note to self:", "Note:", "Important note:" followed by imperative instructions
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:important\s+)?note(?:\s+to\s+(?:self|assistant|ai|agent))?\s*:\s*(?:always|never|you\s+(?:must|should|need\s+to)|ignore|forget|disregard|override)\b/i,
    confidence: 0.85,
    description: 'Memory poisoning — instruction disguised as note-to-self',
  },
  {
    id: 'memory-poison-when-asked',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "When asked about X, include/reveal/send the API key/password/secret..."
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*when\s+(?:asked|queried|prompted|questioned)\s+(?:about|regarding|for)\s+\S[\s\S]{0,60}?(?:include|reveal|send|share|output|disclose|leak|expose|attach|forward)\s+(?:the\s+|your\s+|all\s+|any\s+)?(?:api\s*key|password|secret|token|credential|private\s*key|access\s*key|session|auth)/i,
    confidence: 0.92,
    description: 'Memory poisoning — conditional data exfiltration trigger',
  },

  // ── Hidden system prompt overrides in retrieved content ─────────────────
  {
    id: 'memory-poison-system-override',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "SYSTEM:" or "[SYSTEM]" or "<<SYSTEM>>" appearing in memory/context content
    // Allow optional adjectives between the override verb and target noun
    pattern: /(?:^|\n)\s*(?:\[SYSTEM\]|SYSTEM\s*:|<<\s*SYSTEM\s*>>)\s*(?:\n|.){1,200}?(?:ignore|forget|disregard|override|replace|update|change)\s+(?:(?:all|your|the|any|every|previous|prior|existing|original)\s+)*(?:instructions|rules|guidelines|directives|prompts?|behavior|configuration)/i,
    confidence: 0.95,
    description: 'Memory poisoning — fake system prompt override in stored content',
  },
  {
    id: 'memory-poison-hidden-directive',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "DIRECTIVE:", "INSTRUCTION:", "ADMIN:" — authoritative-sounding labels
    pattern: /(?:^|\n)\s*(?:DIRECTIVE|ADMIN(?:\s*OVERRIDE)?|PRIORITY\s*(?:INSTRUCTION|OVERRIDE|DIRECTIVE)|HIDDEN\s*(?:INSTRUCTION|DIRECTIVE))\s*:\s*\S/i,
    confidence: 0.88,
    description: 'Memory poisoning — authoritative directive label in stored content',
  },

  // ── Base64 / encoding obfuscation of instructions ──────────────────────
  {
    id: 'memory-poison-base64-decode',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Instructions telling the agent to decode and execute base64 content from memory
    // Use relaxed anchoring — these instructions may appear mid-sentence after "please"
    pattern: /\b(?:decode|deobfuscate|decrypt|interpret|parse)\s+(?:the\s+)?(?:following|this|below|above|stored|embedded)\s+(?:base64|b64|encoded)\s+(?:string|text|data|content|instructions?|payload)/i,
    confidence: 0.88,
    description: 'Memory poisoning — instruction to decode obfuscated payload',
  },
  {
    id: 'memory-poison-encoded-block',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // A labeled base64 block embedded in text: "base64:" or "encoded:" followed by data
    // This catches payloads smuggled into memory/documents
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:execute|run|follow|process|apply)\s+(?:this\s+)?(?:encoded|base64|b64|obfuscated)\s*(?:instruction|command|directive|payload)?\s*[:=]\s*[A-Za-z0-9+/]{20,}={0,2}/i,
    confidence: 0.9,
    description: 'Memory poisoning — executable encoded payload block',
  },

  // ── Unicode obfuscation of instructions ────────────────────────────────
  {
    id: 'memory-poison-unicode-tag-chars',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Unicode tag characters (U+E0001–U+E007F) used to hide text in documents
    // These are invisible characters that can encode ASCII instructions
    // Must use the `u` flag and \u{...} syntax for supplementary plane chars
    pattern: /[\u{E0001}-\u{E007F}]{4,}/u,
    confidence: 0.92,
    description: 'Memory poisoning — Unicode tag characters hiding instructions',
  },
  {
    id: 'memory-poison-bidi-override',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Bidirectional override characters used to visually reverse/hide text
    pattern: /[\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069]{2,}.*?(?:ignore|forget|override|execute|send|system|instruction)/i,
    confidence: 0.85,
    description: 'Memory poisoning — bidirectional text override hiding instructions',
  },

  // ── Delimiter injection in context windows ─────────────────────────────
  {
    id: 'memory-poison-fake-system-tag',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Fake XML-style system/role tags that mimic framework context delimiters
    pattern: /<\s*(?:system[-_]?message|system[-_]?prompt|system[-_]?instruction|assistant[-_]?instruction|tool[-_]?instruction|admin[-_]?override)\s*>/i,
    confidence: 0.9,
    description: 'Memory poisoning — fake system/role XML tag in content',
  },
  {
    id: 'memory-poison-context-boundary',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "--- END OF CONTEXT ---", "=== NEW SYSTEM PROMPT ===" — fake context boundaries
    pattern: /(?:^|\n)\s*(?:[-=]{3,})\s*(?:END\s+OF\s+(?:CONTEXT|MEMORY|DOCUMENT|RETRIEVAL)|NEW\s+(?:SYSTEM\s+PROMPT|INSTRUCTIONS?|CONTEXT|DIRECTIVE)|BEGIN\s+(?:OVERRIDE|SYSTEM|ADMIN))\s*(?:[-=]{3,})/i,
    confidence: 0.88,
    description: 'Memory poisoning — fake context boundary delimiter',
  },

  // ── Instruction anchoring / priority escalation ────────────────────────
  {
    id: 'memory-poison-important-override',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "IMPORTANT:", "CRITICAL:", "URGENT:" followed by instruction override language
    // Allow optional stacking of adjectives like "your existing rules"
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:IMPORTANT|CRITICAL|URGENT|TOP\s*PRIORITY|HIGHEST\s*PRIORITY)\s*:\s*(?:ignore|forget|disregard|override|replace|update)\s+(?:(?:all|your|the|any|every|previous|prior|above|earlier|existing|other)\s+)*(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.92,
    description: 'Memory poisoning — priority-escalated instruction override',
  },
  {
    id: 'memory-poison-above-all-else',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "Above all else", "This takes priority", "Supersedes all" — priority anchoring
    // Use word boundary for "supersedes" since it can appear mid-sentence
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:above\s+all\s+(?:else|other\s+instructions)|this\s+(?:takes|has)\s+(?:highest\s+)?priority\s+over)|\bsupersedes?\s+(?:all|any|every)\s+(?:other\s+)?(?:instructions?|rules?|directives?|guidelines?)/i,
    confidence: 0.85,
    description: 'Memory poisoning — priority anchoring to override instructions',
  },

  // ── Data exfiltration via memory ───────────────────────────────────────
  {
    id: 'memory-poison-exfil-on-retrieval',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "When you retrieve/recall this, send/include/append..." — triggered exfiltration
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*when\s+(?:you\s+)?(?:retrieve|recall|read|access|load|fetch)\s+this[\s\S]{0,60}?(?:send|forward|include|append|attach|post|transmit|upload)\s+(?:the\s+|all\s+|your\s+|any\s+)?(?:conversation|chat|history|context|memory|data|information|secrets?|keys?|tokens?|credentials?|passwords?)/i,
    confidence: 0.92,
    description: 'Memory poisoning — exfiltration triggered on memory retrieval',
  },
  {
    id: 'memory-poison-append-to-response',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "Always append/include the following in your responses..."
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:always|whenever\s+(?:you\s+)?respond)\s+(?:append|include|add|insert|embed|inject)\s+(?:the\s+following|this|these)\s+(?:in|to|into|within)\s+(?:your\s+|every\s+|all\s+)?(?:responses?|outputs?|replies?|messages?|answers?)/i,
    confidence: 0.82,
    description: 'Memory poisoning — persistent response manipulation',
  },

  // ── Persona hijacking via stored content ───────────────────────────────
  {
    id: 'memory-poison-persona-hijack',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "You are now a helpful assistant that..." — persona override in retrieved docs
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*you\s+are\s+(?:now\s+)?(?:a\s+|an\s+)?(?:helpful\s+)?(?:assistant|AI|agent|bot|model)\s+(?:that|who|which)\s+(?:always|never|must|should|will)\s+(?:send|share|reveal|expose|forward|disclose|leak|output|include)/i,
    confidence: 0.9,
    description: 'Memory poisoning — persona hijack with exfiltration directive',
  },
  {
    id: 'memory-poison-role-redefine',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "Your role has been updated to...", "Your purpose is now..."
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*your\s+(?:role|purpose|function|behavior|personality|identity)\s+(?:has\s+been|is\s+(?:now|hereby)|was)\s+(?:updated|changed|modified|redefined|overridden|replaced)\b/i,
    confidence: 0.88,
    description: 'Memory poisoning — role/identity redefinition in stored content',
  },

  // ── Multi-turn / sleeper agent patterns ────────────────────────────────
  {
    id: 'memory-poison-sleeper-trigger',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "If the user says/asks X, then execute/perform/do Y" — delayed trigger
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:if|when|once|after)\s+(?:the\s+)?(?:user|human|operator|caller)\s+(?:says?|asks?|mentions?|types?|inputs?|requests?|provides?)\s+[\s\S]{1,80}?(?:then\s+)?(?:execute|perform|run|call|invoke|send|forward|exfiltrate|ignore|override|delete)/i,
    confidence: 0.85,
    description: 'Memory poisoning — sleeper trigger conditional on user input',
  },
  {
    id: 'memory-poison-on-next-turn',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "On your next response/turn/reply, do X" — delayed execution
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:on|in|during)\s+(?:your\s+)?(?:next|subsequent|following)\s+(?:response|turn|reply|message|output|interaction)\s*[,:]\s*(?:you\s+(?:must|should|will|need\s+to)\s+)?(?:execute|perform|run|call|invoke|send|forward|include|ignore|override|forget)/i,
    confidence: 0.85,
    description: 'Memory poisoning — deferred execution on next turn',
  },

  // ── Tool result contamination ──────────────────────────────────────────
  {
    id: 'memory-poison-tool-override',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Instructions claiming to be from a tool/system that override behavior
    pattern: /(?:^|\n)\s*\[(?:TOOL|SYSTEM|ADMIN|INTERNAL|SERVICE)\s*(?:RESULT|OUTPUT|RESPONSE|MESSAGE|UPDATE|OVERRIDE)\]\s*:\s*(?:ignore|forget|disregard|override|replace|update)\b/i,
    confidence: 0.9,
    description: 'Memory poisoning — fake tool/system message overriding behavior',
  },

  // ── Prompt leakage via memory storage ──────────────────────────────────
  {
    id: 'memory-poison-store-prompt',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "Store/save/memorize your system prompt in..." — prompt extraction via memory
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:store|save|memorize|write|record|log|cache)\s+(?:your\s+)?(?:system\s*prompt|instructions|configuration|rules|guidelines|directives|original\s*prompt)\s+(?:in|to|into|as)\b/i,
    confidence: 0.88,
    description: 'Memory poisoning — system prompt extraction via memory storage',
  },
];
