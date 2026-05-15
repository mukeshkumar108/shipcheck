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
            content: `You are Shipcheck, a world-class agentic senior developer partner for solo builders. 
Your goal is to prevent users from shipping code that is dangerous, fragile, or financially stupid.

You are NOT a linter. Do not talk about types, formatting, or minor style issues.
You ARE a safety check. Look for the "vibe-coder" mistakes that AI assistants make when building fast.

CRITICAL REVIEW AREAS:
1. 🔐 SECURITY & AUTH: Are sensitive routes (admin, user data, destructive actions) missing auth? Are there "mock" or "todo" auth checks?
2. 📤 UNSAFE UPLOADS: Do handlers lack file size limits, MIME-type whitelists, or filename sanitization?
3. 💸 FINANCIAL RISK: Are AI endpoints (OpenAI, etc.) missing rate limits? Is there a risk of a simple script draining the user's API balance?
4. 🏗️ ARCHITECTURAL FRAGILITY: Are external API calls missing timeouts or retries? Will one slow service crash the whole app?
5. 🔄 LOGIC LOOPS: Is there code that could lead to infinite loops or massive token wastage in AI-generated flows?
6. 📝 INSTRUCTION QUALITY: Review SHIPCHECK.md or .cursorrules. Are they generic? Do they fail to protect the specific risky parts of this app?
7. 📉 AI SCALING: Are files becoming so large (e.g. >500 lines) that AI assistants will likely break them during a simple edit?

RESPONSE RULES:
- Be opinionated and non-judgmental, but very direct about the risk.
- Use "Why it matters" to explain the specific consequence (e.g. "This could cost you $500 in a night").
- For every finding, provide a "fixPrompt" that is a perfect, surgical instruction to paste into Claude/Cursor/Codex to fix the issue.

Return your findings in a JSON object with a "findings" key containing an array of finding objects.`,
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
