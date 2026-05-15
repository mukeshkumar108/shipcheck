import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';
import type { ScanContext } from './types.js';

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
];

const INSTRUCTION_PATTERNS = [
  'CLAUDE.md',
  'AGENTS.md',
  '.cursorrules',
  '.cursor/rules/*',
  '.github/copilot-instructions.md',
  'SHIPCHECK.md',
];

const API_PATTERNS = [
  'app/api/**/route.{ts,js,tsx,jsx}',
  'pages/api/**/*.{ts,js,tsx,jsx}',
  'server/**/*.{ts,js,tsx,jsx}',
  'api/**/*.{ts,js,tsx,jsx}',
];

const AI_TERMS = [
  'openai',
  'anthropic',
  '@ai-sdk',
  'generateText',
  'streamText',
  'chat.completions',
];

export async function scanProject(isShipMode: boolean): Promise<ScanContext> {
  const allFiles = await fg(['**/*'], {
    ignore: IGNORE_PATTERNS,
    dot: true,
  });

  const packageJsonPath = allFiles.find(f => f === 'package.json');
  let packageJson = undefined;
  if (packageJsonPath) {
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(content);
    } catch (e) {
      // Ignore parse errors
    }
  }

  const envFiles = allFiles.filter(f => f === '.env' || f.startsWith('.env.'));
  const instructionFiles = await fg(INSTRUCTION_PATTERNS, { ignore: IGNORE_PATTERNS });
  const apiFiles = await fg(API_PATTERNS, { ignore: IGNORE_PATTERNS });

  // Detect AI usage by searching file contents (limited to some files for efficiency?)
  // For now, let's just check package.json dependencies and search a subset of files.
  let aiUsageDetected = false;
  if (packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    aiUsageDetected = AI_TERMS.some(term => deps[term] || Object.keys(deps).some(d => d.includes(term)));
  }

  if (!aiUsageDetected) {
    // Search in likely API or server files
    const filesToSearch = allFiles.filter(f => 
      f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')
    ).slice(0, 100); // Limit to first 100 files for a quick scan

    for (const file of filesToSearch) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        if (AI_TERMS.some(term => content.includes(term))) {
          aiUsageDetected = true;
          break;
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }
  }

  return {
    files: allFiles,
    packageJson,
    envFiles,
    instructionFiles,
    apiFiles,
    aiUsageDetected,
    isShipMode,
  };
}
