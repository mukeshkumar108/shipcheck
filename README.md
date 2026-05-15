# Shipcheck

You've been building with AI. The code works. You're almost ready to ship.

Shipcheck is the 30-second check you run before you do.

It looks at your actual code and tells you the specific things that could blow up after launch — the stuff Cursor and Claude built for you, but didn't audit.

---

## Who this is for

You're building with Cursor, Claude, Bolt, Lovable, Replit, or Codex. You're moving fast. You don't have a team or a security person. You're not deep in software — you're deep in your product.

You don't want CodeRabbit commenting on 400 things. You don't want a linter. You want someone to look at your app and say: *"this part could burn you."*

That's Shipcheck.

---

## What it catches

The mistakes AI assistants commonly make — or quietly leave for you to deal with:

- **Exposed secrets** — API keys hardcoded in your code, or sitting in a `.env` file that could accidentally get committed to GitHub. Checked locally — nothing ever leaves your machine for this.
- **Skipped security work** — AI assistants write `// TODO: add auth before deploying` and move on. You ship it. Shipcheck finds every one of these.
- **Routes anyone can call** — API endpoints with no login check. Anyone on the internet can hit them.
- **The $500 overnight mistake** — AI endpoints with no rate limit. One script, one bad actor, one crawled-to-death endpoint. Shipcheck flags any AI integration that's unprotected.
- **User data leaks** — can user A access user B's data by changing a number in the URL? This is one of the most common AI-coding mistakes and one of the most dangerous.
- **Requests that hang forever** — calls to Stripe, OpenAI, or any third-party API with no timeout. One slow response can take down your whole server.
- **Secrets in your browser** — `NEXT_PUBLIC_` variables that expose private API keys to anyone who opens your site's source code.
- **Missing guardrails** — no `SHIPCHECK.md` or `.cursorrules` means your AI has no safety instructions. It'll keep making the same unsafe patterns.

---

## Install

```bash
npm install -g shipcheck
```

For local development:

```bash
git clone https://github.com/yourusername/shipcheck
cd shipcheck && npm install
```

## Setup

Shipcheck uses your own [OpenRouter](https://openrouter.ai) API key. The AI review of a typical project costs less than a cent.

Create a `.env` file in the shipcheck directory:

```bash
OPENROUTER_API_KEY=your_key_here
```

---

## Commands

```bash
shipcheck init    # Creates a SHIPCHECK.md guardrail file tailored to your stack
shipcheck         # Full review: local scan + AI analysis (~30 seconds)
shipcheck ship    # Fast local-only check — no AI, no API key needed
shipcheck -v      # Verbose: shows exactly which files the AI reviewed
```

**`shipcheck ship`** is designed to be fast enough for a pre-commit hook or CI step. It runs all the local checks (secrets, TODOs, env files) without calling any AI.

---

## How it works

**Step 1 — Local scan (instant, private)**

Looks at every file in your project for hardcoded secrets using patterns specific to OpenAI, Anthropic, Stripe, and AWS keys. Also catches `NEXT_PUBLIC_` leaks, tracked `.env` files, and security TODOs your AI assistant left behind. Nothing is sent anywhere.

**Step 2 — AI triage (fast)**

Sends your file tree to DeepSeek and asks: *which files are highest risk?* It understands your project structure — monorepos, non-standard layouts, any framework — not just Next.js conventions. This replaces the guesswork of folder patterns.

**Step 3 — AI deep review (~25 seconds)**

Reads the highest-risk files and looks for logic problems: missing auth, IDOR vulnerabilities, no rate limits, hanging requests, silent failures. It reads your actual code, not a summary.

Files containing detected secrets are never sent to the AI — ever.

---

## What you get

Every finding tells you:

- What was found and where
- Why it matters in plain English (what actually happens if you ignore it)
- What to do about it
- A paste-ready prompt for Claude or Cursor — anchored to the specific file and function, so your AI makes the right fix in the right place

---

## `shipcheck init`

Generates a `SHIPCHECK.md` file — a set of instructions for your AI coding assistant. It detects your stack (Next.js, Express, Node) and includes guardrails specific to what you're building.

Once it exists, Shipcheck will review it on every scan to make sure your AI is being guided properly.

---

## What Shipcheck is not

It is not a linter. It won't tell you about code style, variable names, or test coverage.

It is not a replacement for a real security audit if you're handling payments, health data, or anything truly sensitive.

It is one focused question: **could this hurt you after you ship?**

---

## Philosophy

Cursor and Claude are incredible at building. They're not great at auditing what they built. They don't know what's important to check before launch. They answer the questions you ask — and most vibe coders don't know the right questions yet.

Shipcheck knows the questions.
