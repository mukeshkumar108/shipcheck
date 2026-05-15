import type { Finding } from './types.js';
import { FindingArraySchema } from './types.js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SHIPCHECK_MODEL = process.env.SHIPCHECK_MODEL || 'deepseek/deepseek-v4-flash';

export async function analyzeFilesWithAI(files: { path: string, content: string }[]): Promise<Finding[]> {
  if (!OPENROUTER_API_KEY) {
    return [];
  }

  if (files.length === 0) return [];

  const context = files.map(f => `File: ${f.path}\nContent:\n${f.content}`).join('\n\n---\n\n');

  // Add timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: SHIPCHECK_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: `You are Shipcheck, a world-class senior developer partner. You aren't just scanning code; you are "interviewing" it to find the dangerous, fragile, or financially stupid mistakes that solo builders make.

Your judgment is based on "production fires" you've seen before. Ignore linting, types, and style. Focus on logic and architecture.

CRITICAL REVIEW CATEGORIES:
1. 🔐 SECURITY & OWNERSHIP: Beyond just auth, look for IDOR (Insecure Direct Object Reference). Does this endpoint verify the user actually owns the resource they are trying to read/write?
2. 💸 FINANCIAL & SCALE TRAPS:
   - AI endpoints without rate limits (the "$500 overnight" mistake).
   - N+1 queries in loops that will crawl as the DB grows.
   - Missing pagination on routes that fetch lists.
3. 🏗️ ARCHITECTURAL FRAGILITY:
   - Tight coupling: Is business logic baked into components or routes instead of being separated?
   - Missing Timeouts/Retries: Will one slow third-party API call (Stripe, Twilio) hang the entire process?
   - Scale Traps: Are file uploads going to local disk instead of object storage (S3)? Is state stored in-memory (breaking horizontal scale)?
4. 🔄 OPERATIONAL BLIND SPOTS:
   - Silent Failures: Are catch blocks swallowing errors without context?
   - Logic Loops: Code that could cause infinite token wastage in AI-generated flows.
5. 📝 INSTRUCTION QUALITY: Review SHIPCHECK.md/rules. Are they generic? Do they fail to protect the specific "risky surfaces" of this app?

RESPONSE PHILOSOPHY:
- Prioritize by COST and SLEEP, not by count. If a file has 10 minor issues but 1 that could leak all user data, focus on the leak.
- Be opinionated about PATTERNS. Don't just flag a problem; explain the "shape" of the correct solution.
- Use "Why it matters" to explain the real-world consequence (e.g., "A single script could drain your balance" or "This will lock your DB at 3am").

You MUST return a JSON object with EXACTLY this structure — use these exact field names, no substitutions:
{
  "findings": [
    {
      "id": "short-kebab-case-identifier",
      "title": "One-line title of the issue",
      "description": "What was found in the code",
      "whyItMatters": "Real-world consequence if not fixed",
      "severity": "critical",
      "whatToDo": "Concrete steps to fix this",
      "fixPrompt": "Surgical instruction for an AI coding assistant to fix this correctly",
      "file": "path/to/file.ts",
      "line": 42
    }
  ]
}

severity must be one of: critical, high, medium, low, info
file and line are optional. All other fields are required. Return an empty findings array if nothing actionable is found.`,
          },
          {
            role: 'user',
            content: context,
          },
        ],
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return [];

    const parsed = JSON.parse(content);
    const normalized = (parsed.findings ?? []).map((f: any, i: number) => ({
      id: f.id ?? f.ruleId ?? f.rule ?? f.check ?? `ai-finding-${i}`,
      title: f.title ?? f.name ?? f.summary ?? 'Untitled finding',
      description: f.description ?? f.details ?? f.message ?? '',
      whyItMatters: f.whyItMatters ?? f.why ?? f.impact ?? f.reason ?? '',
      severity: f.severity ?? 'medium',
      whatToDo: f.whatToDo ?? f.recommendation ?? f.fix ?? f.action ?? f.remediation ?? f.solution ?? '',
      fixPrompt: f.fixPrompt ?? f.fix_prompt ?? f.prompt ?? '',
      file: f.file ?? f.filePath ?? undefined,
      line: f.line ?? f.lineNumber ?? undefined,
    }));
    const findings = FindingArraySchema.parse(normalized);

    return findings;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.error(chalk.red(`\n❌ AI Review timed out after 30 seconds.`));
    } else {
      console.error(chalk.red(`\n❌ AI Review failed: ${e instanceof Error ? e.message : String(e)}`));
    }
    return [];
  }
}

export async function triageProjectFiles(files: string[], packageJson?: any): Promise<string[]> {
  if (!OPENROUTER_API_KEY || files.length === 0) return [];

  const pkgSummary = packageJson
    ? `Dependencies: ${JSON.stringify({ ...packageJson.dependencies, ...packageJson.devDependencies })}`
    : '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: SHIPCHECK_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a security-focused code reviewer doing a first-pass triage of a codebase.

Given a list of file paths and the project's dependencies, identify which files are the highest risk and most worth a deep review. You understand how real projects are structured — monorepos, non-standard layouts, microservices — don't rely on folder names alone.

Prioritize files that are likely to handle:
- Incoming HTTP requests (API routes, handlers, controllers, middleware)
- Authentication and authorization (auth, session, JWT, permissions)
- AI/LLM integrations (OpenAI, Anthropic, AI SDK calls)
- Payments (Stripe, billing, webhooks)
- File uploads or user-generated content
- Database queries or ORM models with user data
- External API integrations (third-party fetches, webhooks)
- Configuration that affects runtime security

Return ONLY this JSON structure — no other text:
{ "files": ["path/to/file.ts", "path/to/other.ts"] }

Up to 20 files, highest risk first. Only return paths from the provided list.`,
          },
          {
            role: 'user',
            content: `${pkgSummary}\n\nAll project files:\n${files.join('\n')}`,
          },
        ],
      }),
    });

    clearTimeout(timeoutId);
    if (!response.ok) return [];

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.files)) return [];

    const fileSet = new Set(files);
    return parsed.files
      .filter((f: any) => typeof f === 'string' && fileSet.has(f))
      .slice(0, 20);
  } catch (e) {
    clearTimeout(timeoutId);
    return [];
  }
}

export function hasAIEnabled(): boolean {
  return !!OPENROUTER_API_KEY;
}
