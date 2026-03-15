# YouTube Demo Video Script

**Target length:** 3 minutes
**Tone:** Direct, technical, no hype. Let the demo speak for itself.

---

## 0:00 - 0:15 | Hook

**[SCREEN: Terminal showing unprotected agent output — destructive actions executing rapidly]**

**VOICEOVER:**

"This AI agent just deleted a database table, emailed customer data to an external address, and executed a shell command. No policy checked any of those actions. No human approved them. There's no record of what happened or why."

**[PAUSE — let the output sit on screen for a beat]**

---

## 0:15 - 0:45 | The Problem

**[SCREEN: Highlight the dangerous lines in the terminal output]**

**VOICEOVER:**

"This is how most deployed AI agents work today. You give them tools, you give them a task, and you hope they make good decisions. There's no authorization layer. No approval step for dangerous actions. And when something goes wrong, there's no audit trail to investigate."

**[SCREEN: Cut to a simple diagram — Agent -> Tools with a red X between them and the text "No safety layer"]**

"Authensor fixes this. It's an open-source safety stack that sits between your agent and the tools it uses. Every action is evaluated against a policy before it executes. Let me show you."

---

## 0:45 - 1:30 | Setup

**[SCREEN: Clean terminal, empty directory]**

**VOICEOVER:**

"Setting up Authensor takes about 30 seconds."

**[TYPE ON SCREEN:]**
```
npx @authensor/create-authensor my-agent
```

**[SCREEN: Show the scaffolding output — files being created]**

"This scaffolds a demo project with an example agent, a policy file, and a run script."

**[TYPE ON SCREEN:]**
```
cd my-agent
npm install
```

**[SCREEN: Show install completing]**

"Now let's look at the policy file before we run the demo."

**[SCREEN: Open policy.yaml in editor, briefly highlight key sections]**

"This YAML file defines what the agent can and cannot do. File reads are allowed. Database deletes are denied. Email sends require human approval. And this line at the top — `default_effect: deny` — means anything not explicitly allowed is blocked. Fail-closed."

---

## 1:30 - 2:15 | The Demo

**[SCREEN: Back to terminal]**

**VOICEOVER:**

"Now let's run the demo."

**[TYPE ON SCREEN:]**
```
npm run demo
```

**[SCREEN: Show the demo output. Two sections will appear — unprotected and protected.]**

"The demo runs the same agent twice. First without Authensor — you'll see it execute every action, including the destructive ones. Same output we saw at the start."

**[SCREEN: Highlight the unprotected section]**

"Now watch the second run — with Authensor active."

**[SCREEN: Highlight the protected section, showing ALLOW/DENY/ESCALATE decisions]**

"File read — allowed. Database delete — denied. Email send — escalated, waiting for human approval. And look at the bottom — every decision produced a receipt with a SHA-256 hash linked to the previous receipt. That's your audit trail. Tamper with any record and the chain breaks."

**[SCREEN: Zoom into a receipt showing the hash chain]**

"This isn't logging. It's a cryptographic audit trail. It satisfies the record-keeping requirements in the EU AI Act."

---

## 2:15 - 2:45 | Policy Walkthrough

**[SCREEN: policy.yaml open in editor]**

**VOICEOVER:**

"Let me walk through the policy file quickly."

**[SCREEN: Highlight each section as it's discussed]**

"Rules are evaluated top to bottom. Each rule matches on the tool name and can check parameters, agent identity, and time windows. The effect is allow, deny, or escalate."

"Escalate pauses the action and routes it to a human — through Slack, a webhook, or a custom UI. The agent resumes once it's approved or the request times out."

"You can also set conditions. This rule allows file reads, but only in the /data directory. Anything outside that path is denied."

"The policy engine is synchronous and has zero dependencies. It evaluates in microseconds."

---

## 2:45 - 3:00 | CTA

**[SCREEN: GitHub repo page]**

**VOICEOVER:**

"Authensor is open source, MIT licensed, and completely free. No enterprise tier. Self-host with Docker Compose."

**[SCREEN: Show the GitHub star button, then the URL]**

"If you're building AI agents, give it a try. Star the repo if it's useful. Link is in the description."

**[SCREEN: Clean end card with:]**

```
github.com/authensor/authensor
authensor.com

npx @authensor/create-authensor my-agent
```

**[END]**

---

## Production Notes

- **Screen recording tool:** Use a clean terminal theme (dark background, large font, no distracting prompts). Recommend Warp or iTerm2 with a minimal theme.
- **Resolution:** Record at 1920x1080 minimum. 4K preferred for YouTube quality.
- **Typing speed:** Use a typing effect tool or slow, deliberate typing. Don't rush the commands.
- **Audio:** Record voiceover separately for clean audio. Add light background music (royalty-free, low volume) if desired.
- **Thumbnail:** Terminal screenshot showing the ALLOW/DENY/ESCALATE output with the Authensor logo overlaid. Text: "Your AI Agent Has No Guardrails."
- **Title suggestion:** "Your AI Agent Has No Safety Guardrails. Here's How to Fix It in 30 Seconds."
- **Description:** Include the GitHub link, npx command, and links to documentation.
- **Tags:** AI agents, AI safety, LangChain, OpenAI, open source, TypeScript, MCP, EU AI Act
