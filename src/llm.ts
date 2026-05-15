import type { ScanContext, Finding } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SHIPCHECK_MODEL = process.env.SHIPCHECK_MODEL || 'deepseek/deepseek-v4-flash';

export async function getAIExplanation(finding: Finding, context: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SHIPCHECK_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are Shipcheck, a friendly safety assistant for solo AI-native builders. Explain the security or quality issue simply and provide a fix prompt.',
          },
          {
            role: 'user',
            content: `Finding: ${finding.title}\nDescription: ${finding.description}\nFile: ${finding.file}\nContext: ${context}\n\nProvide a more detailed explanation and a better fix prompt.`,
          },
        ],
      }),
    });

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    return null;
  }
}

export function hasAIEnabled(): boolean {
  return !!OPENROUTER_API_KEY;
}
