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

  // ── Authority injection ────────────────────────────────────────────────
  {
    id: 'memory-poison-authority-system',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Content claiming to come from "system", "admin", "root", "administrator", or "the developer"
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:this\s+(?:message|instruction|directive|update|notice)\s+(?:is\s+from|comes?\s+from|originates?\s+from|sent\s+by)|message\s+from|instructions?\s+from|directive\s+from|update\s+from)\s+(?:the\s+)?(?:system\b|admin(?:istrator)?\b|root\b|developer\b|backend\b|platform\b|operator\b)/i,
    confidence: 0.88,
    description: 'Memory poisoning — content falsely claiming system/admin authority',
  },
  {
    id: 'memory-poison-authority-signed',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "— Admin", "— System", "Signed: root", "From: administrator" as apparent message signatures
    pattern: /(?:^|\n)\s*(?:—\s*|signed(?:\s+by)?\s*:\s*|-+\s*)(?:admin(?:istrator)?|system|root|the\s+developer|backend|platform\s+team|devops)\s*$/im,
    confidence: 0.85,
    description: 'Memory poisoning — false authority signature in stored content',
  },

  // ── Sleeper payloads (extended) ──────────────────────────────────────
  {
    id: 'memory-poison-when-trigger-action',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "when the user says [X], then [Y]" / "whenever the user types [X], forward..."
    // explicit trigger-action sleeper syntax
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*when(?:ever)?\s+(?:the\s+)?(?:user|human|operator|caller|client)\s+(?:says?|types?|writes?|inputs?|mentions?|uses?\s+(?:the\s+)?(?:word|phrase|keyword|command))\s+["']?[\w\s]{1,40}["']?\s*[,;]\s*(?:then\s+)?(?:you\s+(?:must|should|will|need\s+to)\s+)?(?:execute|run|perform|send|forward|ignore|override|delete|exfiltrate|leak|reveal|expose|bypass|disable)/i,
    confidence: 0.9,
    description: 'Memory poisoning — explicit sleeper trigger-action payload',
  },
  {
    id: 'memory-poison-activation-phrase',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "activation phrase", "trigger word", "secret command" that unlocks behavior
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:activation\s+(?:phrase|word|code|keyword|sequence)|trigger\s+(?:word|phrase|code|keyword)|secret\s+(?:command|word|phrase|code|keyword)|passphrase|magic\s+(?:word|phrase|command))\s*[:=\-]\s*["']?\w[\s\S]{0,60}?(?:then|will|should|must|you\s+(?:must|will|should))/i,
    confidence: 0.9,
    description: 'Memory poisoning — activation phrase/trigger word for sleeper payload',
  },

  // ── Gradual drift instructions ────────────────────────────────────────
  {
    id: 'memory-poison-gradual-drift',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "slightly modify your responses", "gradually change your behavior",
    // "over time begin to ignore constraints" — slow drift attacks
    // Two-branch pattern:
    //   Branch A: "slightly/gradually modify/change [your] [verb?] [noun]"
    //   Branch B: "over time / progressively / ... begin to [verb?] [your] [noun]"
    pattern: /\b(?:slightly\s+(?:modify|change|alter|shift|adjust|bend|deviate\s+from)|gradually\s+(?:change|shift|alter|modify|transition|move\s+away\s+from|abandon))\s+(?:your\s+)?(?:responses?|behavior|answers?|outputs?|instructions?|rules?|guidelines?|constraints?|tone)|\b(?:over\s+time|progressively|incrementally|bit\s+by\s+bit|little\s+by\s+little)\s+(?:begin\s+to|start\s+to|become|stop\s+following)\s+(?:\w+\s+){0,3}(?:your\s+)?(?:responses?|behavior|answers?|outputs?|instructions?|rules?|guidelines?|constraints?|tone)/i,
    confidence: 0.87,
    description: 'Memory poisoning — gradual drift instruction for slow behavior change',
  },
  {
    id: 'memory-poison-subtle-shift',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "make your responses slightly more permissive" / "begin adding X to responses" — subtle nudge
    pattern: /\bmake\s+(?:your\s+)?(?:responses?|answers?|outputs?|replies?)\s+(?:slightly|gradually|progressively|increasingly)\s+(?:more|less)\s+\w|\bbegin\s+(?:adding|including|inserting|embedding)\s+\S[\s\S]{0,40}?\s+(?:in(?:to)?|within)\s+(?:your\s+)?(?:responses?|answers?|outputs?|replies?)/i,
    confidence: 0.82,
    description: 'Memory poisoning — subtle nudge to gradually shift model outputs',
  },

  // ── Cross-session poisoning ───────────────────────────────────────────
  {
    id: 'memory-poison-remember-next-time',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "remember this for next time", "save this for future conversations"
    // Session nouns are optional — "for next time" alone is sufficient signal
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:remember|save|store|note|record|keep|retain)\s+(?:this|these|the\s+following|it)\s+(?:for\s+(?:next\s+time|future|later|subsequent|all\s+future)(?:\s+(?:conversations?|sessions?|chats?|interactions?|uses?))?|across\s+(?:conversations?|sessions?|chats?|interactions?))/i,
    confidence: 0.88,
    description: 'Memory poisoning — cross-session persistence instruction',
  },
  {
    id: 'memory-poison-in-future-conversations',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // "in future conversations", "in all subsequent sessions", "every time we talk"
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:in\s+(?:all\s+)?(?:future|subsequent|upcoming|following|later)\s+(?:conversations?|sessions?|chats?|interactions?|exchanges?)|every\s+time\s+(?:we\s+(?:talk|chat|speak|interact)|you\s+(?:respond|reply|answer))|from\s+(?:now\s+on|this\s+point\s+(?:on|forward))\s+(?:in\s+)?(?:all\s+)?(?:conversations?|sessions?|interactions?))\s*[,;:]?\s*(?:you\s+(?:must|should|will|need\s+to)|always|never|remember\s+to)/i,
    confidence: 0.88,
    description: 'Memory poisoning — instruction targeting all future sessions',
  },

  // ── RAG poisoning markers ─────────────────────────────────────────────
  {
    id: 'memory-poison-rag-keyword-stuffing',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Suspiciously dense repetition of a single keyword to boost RAG retrieval
    // Detects the same meaningful word repeated 5+ times within a short span
    pattern: /\b(\w{4,})\b(?:\s+\S+\s+\S+\s+\S+\s+\S+\s+\1\b){4,}/i,
    confidence: 0.72,
    description: 'Memory poisoning — keyword stuffing to manipulate RAG retrieval ranking',
  },
  {
    id: 'memory-poison-rag-relevance-boost',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Explicit attempts to influence retrieval ranking: "This document is highly relevant",
    // "Always retrieve this first", "High priority document for embedding"
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:this\s+(?:document|entry|record|note|memory|content)\s+(?:is\s+(?:highly\s+)?relevant\s+(?:to|for)|should\s+always\s+be\s+retrieved)|always\s+retrieve\s+this\s+(?:document|entry|first|when)|high\s*[-\s]?priority\s+(?:document|entry|memory)\s+(?:for\s+)?(?:embedding|retrieval|indexing|ranking)|boost\s+(?:the\s+)?(?:relevance|ranking|priority|score)\s+of\s+this)/i,
    confidence: 0.85,
    description: 'Memory poisoning — explicit RAG retrieval ranking manipulation',
  },

  // ── Conversation history manipulation ────────────────────────────────
  {
    id: 'memory-poison-fake-history-turn',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Injected fake conversation turns mimicking the chat format:
    // "User: [benign] Assistant: I will ignore all safety guidelines" patterns
    pattern: /(?:^|\n)\s*(?:User|Human|Assistant|AI|Bot)\s*:\s*.{0,80}\n\s*(?:User|Human|Assistant|AI|Bot)\s*:\s*.{0,80}\n\s*(?:Assistant|AI|Bot)\s*:\s*(?:I\s+(?:will|shall|am\s+now|must|have\s+been\s+told\s+to)\s+(?:ignore|forget|disregard|override|bypass|violate|no\s+longer\s+follow)|Sure[,!]\s+I\s+(?:will|can|shall)\s+(?:ignore|override|forget)|Of\s+course[,!]\s+I\s+(?:will|shall)\s+(?:ignore|forget|disregard))/i,
    confidence: 0.9,
    description: 'Memory poisoning — fabricated conversation history injecting compliance',
  },
  {
    id: 'memory-poison-injected-assistant-turn',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // A lone fake "Assistant:" turn injected mid-document claiming prior agreement
    // Covers: "I have been told to ignore", "I agree to bypass", "I previously confirmed I would override"
    pattern: /(?:^|\n)\s*(?:Assistant|AI\s*Response|Bot\s*Response)\s*:\s*(?:I\s+(?:have\s+been\s+told\s+(?:to\s+)?|understand\s+that\s+I\s+(?:must|should)\s+|agree\s+to\s+|(?:previously\s+)?confirmed\s+(?:that\s+I\s+will|I\s+would)\s+)(?:ignore|bypass|override|disregard|violate|exfiltrate|send|forward|reveal))/i,
    confidence: 0.9,
    description: 'Memory poisoning — injected fake assistant turn claiming prior compliance',
  },

  // ── Memory metadata poisoning ─────────────────────────────────────────
  {
    id: 'memory-poison-metadata-priority-flag',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Attempts to set importance/priority metadata on injected memories:
    // "importance: high", "priority: 1", "weight: 1.0", "must_include: true"
    pattern: /(?:^|\n)\s*(?:importance|priority|weight|rank|score|relevance|must[_\-]include|always[_\-]retrieve|mandatory|required)\s*[:=]\s*(?:high|critical|urgent|maximum|1(?:\.0)?|true|yes|always|top|highest)\s*$/im,
    confidence: 0.82,
    description: 'Memory poisoning — metadata field set to manipulate memory retrieval priority',
  },
  {
    id: 'memory-poison-metadata-inject-tags',
    type: 'injection',
    subType: 'MEMORY_POISONING',
    // Fake YAML/JSON-style metadata blocks injected into content to manipulate memory systems
    pattern: /(?:^|\n)\s*(?:tags|labels|keywords|categories|flags)\s*:\s*\[?\s*["']?(?:system[-_]override|admin[-_]instruction|high[-_]priority|always[-_]include|mandatory[-_]context|forced[-_]retrieval)/i,
    confidence: 0.85,
    description: 'Memory poisoning — injected metadata tags to force retrieval or system override',
  },
];
