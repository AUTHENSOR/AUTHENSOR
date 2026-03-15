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

  // ── Payload splitting ────────────────────────────────────────────────
  {
    id: 'injection-payload-split-continuation',
    type: 'injection',
    subType: 'PAYLOAD_SPLITTING',
    // Instructions split across fields: "continue from:" / "completing the instruction:" / "[CONTINUED]"
    pattern: /(?:^|\n|[.!?]\s+)(?:continue(?:d)?\s+(?:from|with|below)|completing\s+the\s+(?:instruction|prompt|sentence)|(?:\[CONTINUED?\]|\[PART\s*\d+\]))\s*[:=\-]?\s*\S/i,
    confidence: 0.78,
    description: 'Payload splitting — instruction fragment continuation marker',
  },
  {
    id: 'injection-payload-split-part-label',
    type: 'injection',
    subType: 'PAYLOAD_SPLITTING',
    // "Part 1 of 2: ignore" / "Segment 2/3: your instructions"
    pattern: /(?:^|\n|[.!?]\s+)(?:part|segment|chunk|fragment|section)\s*\d+\s*(?:of\s*\d+|\/\s*\d+)\s*[:=\-]\s*(?:ignore|forget|disregard|override|new\s+instructions?|system\s*prompt)/i,
    confidence: 0.85,
    description: 'Payload splitting — numbered segment with injection keyword',
  },

  // ── Language-switching injection ─────────────────────────────────────
  {
    id: 'injection-lang-switch-cjk',
    type: 'injection',
    subType: 'LANGUAGE_SWITCH',
    // Chinese 忽略, Japanese 無視, Korean 무시 followed by instruction-like content
    pattern: /(?:忽略|無視|무시)\s*(?:以前|前の|이전의|所有|すべての|모든)?\s*(?:指示|指令|ルール|규칙|说明|命令)/,
    confidence: 0.88,
    description: 'Language-switching injection — CJK ignore/disregard instruction',
  },
  {
    id: 'injection-lang-switch-romance',
    type: 'injection',
    subType: 'LANGUAGE_SWITCH',
    // Spanish/Portuguese "ignorar", French "ignorer", German "ignorieren", Italian "ignorare" + instruction context
    // No strict sentence-start anchor — these verbs are sufficiently distinctive
    pattern: /\b(?:ignorar|ignorer|ignorieren|ignorare)\s+(?:todas?\s+(?:las|los|as|os)\s+|(?:les|die|le)\s+)?(?:instrucciones|instructions|Anweisungen|istruzioni|regras|règles|regeln)\b/i,
    confidence: 0.88,
    description: 'Language-switching injection — Romance/Germanic ignore instruction',
  },
  {
    id: 'injection-lang-switch-arabic-hindi',
    type: 'injection',
    subType: 'LANGUAGE_SWITCH',
    // Arabic تجاهل (ignore), Hindi अनदेखा (ignore) near instruction keywords
    pattern: /(?:تجاهل|أهمل|تجاهلي|अनदेखा|नज़रअंदाज़)\s+.{0,30}(?:تعليمات|निर्देश|قواعد|नियम)/,
    confidence: 0.88,
    description: 'Language-switching injection — Arabic/Hindi ignore instruction',
  },
  {
    id: 'injection-lang-switch-russian',
    type: 'injection',
    subType: 'LANGUAGE_SWITCH',
    // Russian игнорировать (ignore) / забудь (forget) near instructions
    pattern: /(?:игнорировать|игнорируй|забудь|проигнорируй)\s+.{0,40}(?:инструкции|правила|директивы|указания)/i,
    confidence: 0.88,
    description: 'Language-switching injection — Russian ignore instruction',
  },
  {
    id: 'injection-lang-switch-new-instructions',
    type: 'injection',
    subType: 'LANGUAGE_SWITCH',
    // "new instructions" equivalents in multiple languages
    pattern: /(?:nuevas\s+instrucciones|nouvelles\s+instructions|neue\s+Anweisungen|nuove\s+istruzioni|新しい指示|새로운\s*지시|新指令|नए\s+निर्देश|تعليمات\s+جديدة|новые\s+инструкции)/i,
    confidence: 0.85,
    description: 'Language-switching injection — multilingual "new instructions"',
  },

  // ── Encoding evasion (extended) ──────────────────────────────────────
  {
    id: 'injection-base64-decoded-keywords',
    type: 'injection',
    subType: 'ENCODING_ATTACK',
    // Standalone base64 blobs that decode to common injection phrases:
    // "aWdub3Jl" = base64("ignore"), "Zm9yZ2V0" = base64("forget"),
    // "ZGlzcmVnYXJk" = base64("disregard"), "b3ZlcnJpZGU" = base64("override")
    // "c3lzdGVtIHByb21wdA" = base64("system prompt")
    pattern: /\b(?:aWdub3Jl|Zm9yZ2V0|ZGlzcmVnYXJk|b3ZlcnJpZGU|c3lzdGVtIHByb21wdA)[A-Za-z0-9+/]*={0,2}\b/,
    confidence: 0.9,
    description: 'Base64-encoded injection keyword detected in payload',
  },
  {
    id: 'injection-url-encoded-injection',
    type: 'injection',
    subType: 'ENCODING_ATTACK',
    // URL-encoded versions of injection phrases: %69%67%6E%6F%72%65 = "ignore",
    // detect dense sequences of %XX that reconstruct injection words
    pattern: /(?:%[0-9A-Fa-f]{2}){6,}|(?:ignore|forget|disregard|override|system)(?:d\s+)?(?:%20|%0A|%0D|\+){1,3}(?:previous|instructions|rules|prompt)/i,
    confidence: 0.82,
    description: 'URL-encoded injection pattern — encoded instruction smuggling',
  },
  {
    id: 'injection-html-entity-encoded',
    type: 'injection',
    subType: 'ENCODING_ATTACK',
    // HTML entity encoding of injection keywords: &#105;&#103;&#110;&#111;&#114;&#101; = "ignore"
    // Named entities: &lt;system&gt; or numeric &#115;&#121;&#115;&#116;&#101;&#109;
    pattern: /(?:&#(?:1[01]\d|[0-9]\d);){4,}|(?:&(?:lt|gt|amp|quot|apos);.{0,20}){3,}(?:system|instruction|prompt|ignore)/i,
    confidence: 0.82,
    description: 'HTML entity-encoded injection pattern — instruction smuggling',
  },

  // ── Markdown / comment injection ─────────────────────────────────────
  {
    id: 'injection-markdown-comment-instructions',
    type: 'injection',
    subType: 'MARKDOWN_INJECTION',
    // Markdown/HTML comments containing instruction-like content: <!-- ... -->
    // Broader than existing HTML_INJECTION rule (which only catches "ignore" at start)
    pattern: /<!--[\s\S]{0,300}?(?:you\s+(?:must|should|are\s+now|will)|new\s+instructions?|system\s*prompt|act\s+as|ignore\s+(?:all\s+)?(?:previous|prior|above)|your\s+(?:role|purpose)\s+(?:is|has\s+been))[\s\S]{0,100}?-->/i,
    confidence: 0.88,
    description: 'Markdown/HTML comment containing embedded instructions',
  },
  {
    id: 'injection-markdown-hidden-div',
    type: 'injection',
    subType: 'MARKDOWN_INJECTION',
    // Hidden HTML elements with style="display:none" or hidden attribute containing instructions
    pattern: /(?:<(?:div|span|p|section)[^>]*(?:style\s*=\s*["'][^"']*display\s*:\s*none|hidden)[^>]*>[\s\S]{0,200}?(?:ignore|instruction|system|override|you\s+(?:must|are\s+now))|<(?:div|span)\s+hidden[^>]*>[\s\S]{0,200}?(?:ignore|system|instruction))/i,
    confidence: 0.87,
    description: 'Hidden HTML element containing injection instructions',
  },

  // ── Few-shot injection ────────────────────────────────────────────────
  {
    id: 'injection-few-shot-example',
    type: 'injection',
    subType: 'FEW_SHOT_INJECTION',
    // "Here is an example of a good response:" used to prime model behavior
    pattern: /(?:^|\n|[.!?]\s+)(?:here\s+(?:is|are)\s+(?:an?\s+)?(?:example|sample|demonstration|illustration)\s+of\s+(?:a\s+(?:good|correct|ideal|perfect|expected|appropriate)\s+)?(?:response|answer|reply|output)|example\s+(?:response|output|answer)\s*:)\s*[\s\S]{0,50}?(?:ignore|override|you\s+must|you\s+are\s+now|do\s+not\s+follow|forget)/i,
    confidence: 0.85,
    description: 'Few-shot injection — example priming to override model behavior',
  },
  {
    id: 'injection-few-shot-qa-format',
    type: 'injection',
    subType: 'FEW_SHOT_INJECTION',
    // Fake Q&A pairs used to train in-context behavior: "Q: [anything] A: I will ignore..."
    pattern: /(?:^|\n)\s*(?:Q(?:uestion)?\s*:\s*.{5,80}\n\s*A(?:nswer)?\s*:\s*)(?:I\s+(?:will|shall|am\s+now)|Sure,?\s+I|Of\s+course,?\s+I)\s+(?:ignore|forget|disregard|no\s+longer\s+follow|override)/i,
    confidence: 0.85,
    description: 'Few-shot injection — fake Q&A pair overriding model behavior',
  },

  // ── Roleplay injection ────────────────────────────────────────────────
  {
    id: 'injection-roleplay-you-are-who-always',
    type: 'injection',
    subType: 'ROLEPLAY_INJECTION',
    // "You are now [X] who always [Y]" / "You play [X] that always [Y]"
    pattern: /(?:^|\n|[.!?]\s+)(?:you\s+are\s+(?:now\s+)?|you\s+play\s+(?:the\s+role\s+of\s+)?|you\s+act\s+as\s+(?:a\s+|an\s+)?)\S[\s\S]{2,60}?(?:who|that|which)\s+(?:always|never|must|will\s+always|should\s+always)\s+(?:ignore|override|bypass|disregard|violate|refuse\s+to\s+follow|send|reveal|expose|leak|exfiltrate)/i,
    confidence: 0.88,
    description: 'Roleplay injection — persona defined to always violate constraints',
  },
  {
    id: 'injection-roleplay-pretend-no-restrictions',
    type: 'injection',
    subType: 'ROLEPLAY_INJECTION',
    // "Pretend you have no restrictions/filters/safety guidelines"
    // Covers: "pretend you have no X", "pretend you don't have X", "act as if you have no X"
    pattern: /\b(?:pretend|imagine|assume|suppose|act\s+as\s+if|act\s+like)\b\s+(?:you\s+)?(?:have\s+no|had\s+no|don['']t\s+have|do\s+not\s+have|without)\s+(?:any\s+)?(?:restrictions?|filters?|limits?|safety\s+(?:rules?|guidelines?|measures?)|ethical\s+(?:constraints?|guidelines?)|content\s+(?:policies|filters?)|guardrails?)/i,
    confidence: 0.88,
    description: 'Roleplay injection — pretending to have no restrictions',
  },

  // ── Instruction boundary confusion ────────────────────────────────────
  {
    id: 'injection-boundary-end-of-instructions',
    type: 'injection',
    subType: 'BOUNDARY_CONFUSION',
    // "END_OF_INSTRUCTIONS", "END OF SYSTEM PROMPT", "--- END PROMPT ---"
    pattern: /(?:^|\n)\s*(?:[-_=*]{2,}\s*)?(?:END\s+(?:OF\s+)?(?:INSTRUCTIONS?|SYSTEM\s*PROMPT|PROMPT|CONTEXT|RULES?|GUIDELINES?|CONSTRAINTS?)|INSTRUCTIONS?\s+END|PROMPT\s+END)\s*(?:[-_=*]{2,})?/i,
    confidence: 0.85,
    description: 'Instruction boundary confusion — fake end-of-instructions marker',
  },
  {
    id: 'injection-boundary-system-colon',
    type: 'injection',
    subType: 'BOUNDARY_CONFUSION',
    // "SYSTEM:" or "### New Instructions" appearing mid-content as a fake boundary
    pattern: /(?:^|\n)\s*(?:#{1,6}\s+(?:new|updated?|revised?|override)\s+instructions?|SYSTEM\s*(?:PROMPT\s*)?:\s*(?!.*(?:error|log|message))\S)/i,
    confidence: 0.87,
    description: 'Instruction boundary confusion — fake SYSTEM or heading boundary',
  },
  {
    id: 'injection-boundary-separator',
    type: 'injection',
    subType: 'BOUNDARY_CONFUSION',
    // "==========", "----------" used as fake context separators before injection
    pattern: /(?:^|\n)\s*[=\-]{8,}\s*\n\s*(?:(?:new|updated?|override|ignore|forget|disregard)\s+(?:all\s+)?(?:previous\s+)?(?:instructions?|rules?|guidelines?|context|system\s*prompt)|(?:SYSTEM|ADMIN|ROOT)\s*:)/i,
    confidence: 0.83,
    description: 'Instruction boundary confusion — separator followed by injection',
  },

  // ── Prompt leaking ─────────────────────────────────────────────────
  {
    id: 'injection-prompt-leak-repeat',
    type: 'injection',
    subType: 'PROMPT_LEAK',
    // "repeat your system prompt", "tell me what you were told"
    pattern: /(?:repeat|recite|output|print|show|display|echo|share|tell\s+me)\s+(?:back\s+)?(?:your\s+)?(?:system\s*prompt|initial\s*(?:instructions?|prompt)|original\s*(?:instructions?|prompt)|(?:the\s+)?instructions?\s+you\s+(?:were\s+given|received|follow|have))/i,
    confidence: 0.88,
    description: 'Prompt leak — requesting repetition of system prompt',
  },
  {
    id: 'injection-prompt-leak-what-were-you-told',
    type: 'injection',
    subType: 'PROMPT_LEAK',
    // "what were you told", "what instructions do you have", "what is in your context"
    pattern: /(?:what|which)\s+(?:were\s+you|instructions?\s+(?:were\s+you|do\s+you|have\s+you\s+been)|(?:is|was|are)\s+(?:in\s+)?your\s+(?:system\s*prompt|initial\s*(?:instructions?|prompt)|context|hidden\s+instructions?)|rules?\s+(?:were\s+you|do\s+you)\s+(?:given|told|following|operating\s+under))/i,
    confidence: 0.85,
    description: 'Prompt leak — asking what instructions the model was given',
  },
  {
    id: 'injection-prompt-leak-print-instructions',
    type: 'injection',
    subType: 'PROMPT_LEAK',
    // "print your instructions", "output your prompt", "list your system rules"
    pattern: /(?:print|list|output|enumerate|summarize|describe|reveal|expose|disclose)\s+(?:your\s+)?(?:full\s+|complete\s+|entire\s+|all\s+(?:of\s+)?your\s+)?(?:system\s*(?:prompt|instructions?|message|configuration|rules?)|initial\s*(?:instructions?|prompt|context)|hidden\s+(?:instructions?|prompt|rules?|context))/i,
    confidence: 0.88,
    description: 'Prompt leak — requesting model to print its instructions',
  },

  // ── Token smuggling via zero-width characters ─────────────────────────
  {
    id: 'injection-zwc-keyword-smuggling',
    type: 'injection',
    subType: 'TOKEN_SMUGGLING',
    // Zero-width characters (U+200B, U+200C, U+200D, U+FEFF) inserted between
    // letters of injection keywords like i​g​n​o​r​e, s​y​s​t​e​m, f​o​r​g​e​t
    pattern: /(?:[iu][\u200B\u200C\u200D\uFEFF][gn][\u200B\u200C\u200D\uFEFF][no][\u200B\u200C\u200D\uFEFF][ro][\u200B\u200C\u200D\uFEFF]|[sf][\u200B\u200C\u200D\uFEFF][yo][\u200B\u200C\u200D\uFEFF][rs][\u200B\u200C\u200D\uFEFF][gt][\u200B\u200C\u200D\uFEFF]|[\u200B\u200C\u200D\uFEFF]{1,3}[a-z][\u200B\u200C\u200D\uFEFF]{1,3}[a-z][\u200B\u200C\u200D\uFEFF]{1,3}[a-z][\u200B\u200C\u200D\uFEFF]{1,3}[a-z][\u200B\u200C\u200D\uFEFF]{1,3})/i,
    confidence: 0.87,
    description: 'Token smuggling — zero-width characters inserted between keyword letters',
  },
  {
    id: 'injection-zwc-dense-sequence',
    type: 'injection',
    subType: 'TOKEN_SMUGGLING',
    // Dense sequences of alternating zero-width chars and normal chars (obfuscation pattern)
    // At least 8 zero-width characters spread across a 16-char span
    pattern: /(?:[^\u200B\u200C\u200D\uFEFF][\u200B\u200C\u200D\uFEFF]){4,}/,
    confidence: 0.82,
    description: 'Token smuggling — dense zero-width character interleaving',
  },
];
