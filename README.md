# Shipcheck

A simple safety check for AI-built apps.

Shipcheck helps solo builders catch common dangerous, fragile, or expensive mistakes before shipping.

It is not a linter.
It is not a replacement for a real security audit.
It is another pair of eyes for people building fast with AI.

## Who it is for

- solo founders
- vibe coders
- indie hackers
- designers/operators building with Claude, Cursor, Replit, Lovable, Bolt, or Codex
- people who want to know: “is this safe enough to ship?”

## Install

Coming soon.

For local development:

```bash
npm install
npm run dev
```

## Commands
```bash
shipcheck init     # Create SHIPCHECK.md guardrails
shipcheck          # Run safety check (Semantic AI + Deterministic)
shipcheck ship     # Launch-critical scan only
shipcheck -v       # Verbose mode (see what AI is thinking)
```

## What Shipcheck looks for

Shipcheck acts as a senior developer partner, specifically hunting for the "vibe-coder" mistakes that AI assistants often make:

*   **🛡️ Exposed Secrets**: Hardcoded API keys, tokens, or credentials in your code or tracked `.env` files (checked locally for privacy).
*   **🔐 Missing Auth**: Sensitive API routes or Server Actions that are missing authentication or authorization checks.
*   **📤 Unsafe Uploads**: File upload endpoints that lack size limits or MIME-type validation.
*   **💸 AI Cost Controls**: Expensive AI endpoints that are missing rate limits or proper error handling.
*   **🔄 AI Loops**: Logic that could lead to infinite loops or massive token wastage in AI-generated code.
*   **📝 Stale Instructions**: Missing or weak `SHIPCHECK.md` / `.cursorrules` that fail to guide your AI on security.
*   **📉 Architectural Fragility**: Files that are becoming too large or complex for AI assistants to safely reason about.

## How it works: Hybrid AI Review
...

Shipcheck uses a two-phase engine to catch what linters miss:

1. **Local Deterministic Scan**: Blazing fast regex checks catch hardcoded secrets locally. This ensures your private keys are **never** sent to an external AI API.
2. **Semantic AI Review**: High-risk files (APIs, Server Actions, AI integrations) are analyzed by **DeepSeek**. It looks for logical flaws like missing auth, unsafe uploads, and expensive AI loops.

## Bring your own key

Shipcheck uses your own model API key via OpenRouter.

Create a `.env` file:
```bash
OPENROUTER_API_KEY=your_key_here
SHIPCHECK_MODEL=deepseek/deepseek-v4-flash  # Default
```

## Proof of Work

Shipcheck doesn't just stay silent. Every scan provides a "Proof of Work" summary showing exactly how many API routes, AI integrations, and risky surfaces were analyzed. Use `--verbose` to see the exact files analyzed by the AI.

## Output format

Every finding should explain:

- what we found
- why it matters
- how serious it is
- what to do next
- what to paste into Claude/Codex/Cursor

## Philosophy

Shipcheck is not trying to make your code perfect.

It is trying to stop you shipping something dangerous, fragile, or financially stupid.