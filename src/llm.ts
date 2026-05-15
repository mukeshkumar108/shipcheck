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

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
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

Return findings in a JSON object with a "findings" key. Each finding MUST have a "fixPrompt" that is a surgical, high-quality instruction for an AI assistant to refactor the code correctly.`,
          },
          {
            role: 'user',
            content: context,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return [];

    const parsed = JSON.parse(content);
    const findings = FindingArraySchema.parse(parsed.findings);
    
    return findings;
  } catch (e) {
    console.error(chalk.red(`\n❌ AI Review failed: ${e instanceof Error ? e.message : String(e)}`));
    return [];
  }
}

export function hasAIEnabled(): boolean {
  return !!OPENROUTER_API_KEY;
}
