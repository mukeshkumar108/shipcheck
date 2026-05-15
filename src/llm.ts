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
            content: `You are Shipcheck, an agentic senior developer partner for solo founders. 
Your goal is to perform a semantic safety check for vibe-coded apps. 
Review the provided files for dangerous, fragile, or expensive mistakes.

Focus on:
1. Missing authentication/authorization on sensitive routes or server actions.
2. AI endpoints without rate limiting or cost controls.
3. Unsafe file uploads (missing size/mime-type validation).
4. Logical flaws that could lead to data leaks or server crashes.
5. Expensive or infinite loops in AI-generated code.

Do NOT report on:
- Formatting or style.
- Missing types or linting warnings.
- Obvious secrets (handled by a local regex scanner).

Return your findings in a JSON object with a "findings" key containing an array of finding objects. 
Each finding must follow this schema:
{
  "id": "slug-id",
  "title": "Short title",
  "description": "What is the issue?",
  "whyItMatters": "Explain the risk in plain English.",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "whatToDo": "Specific actionable step.",
  "fixPrompt": "A perfect prompt to paste into an AI editor to fix this exact issue.",
  "file": "path/to/file"
}`,
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
