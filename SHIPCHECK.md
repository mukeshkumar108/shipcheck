# SHIPCHECK Guardrails

This file contains safety rules for AI coding assistants (Claude, Cursor, etc.).

## 🛡️ Security
- NEVER expose API keys or secrets in client-side code (Next.js components, etc.).
- ALWAYS use server-side routes or environment variables for sensitive logic.
- PROTECT admin and private routes with authentication and authorization checks.
- VALIDATE all user-uploaded files for size and mime-type.

## ⚡ Performance & Cost
- ADD rate limits to all public AI or expensive endpoints.
- USE timeouts for external API calls to prevent hanging processes.
- AVOID sending massive chat histories; trim context to stay within token limits.

## 🧠 Better AI Coding
- EXPLAIN risky changes (like deleting files or complex refactors) before making them.
- USE idiomatic patterns for this project's stack.
