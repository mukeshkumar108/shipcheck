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
shipcheck init
shipcheck
shipcheck ship
```

## Bring your own key

Shipcheck uses your own model API key.

Create a `.env` file:
```bash
OPENROUTER_API_KEY=your_key_here
SHIPCHECK_MODEL=deepseek/deepseek-v4-flash
```

## What Shipcheck looks for

* exposed API keys
* missing auth on sensitive routes
* unsafe upload endpoints
* AI endpoints with no rate limiting
* expensive AI usage patterns
* missing timeouts/retries
* stale or missing AI coding instructions
* files that are becoming hard for AI assistants to safely edit

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