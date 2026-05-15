import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ScanContext, EnvFile } from './types.js';

const execAsync = promisify(exec);

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/.turbo/**',
  '**/.vercel/**',
  '**/.local/**',
  '**/.pnpm-store/**',
  '**/.yarn/**',
  '**/.parcel-cache/**',
  '**/tmp/**',
  '**/temp/**',
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

export async function scanProject(isShipMode: boolean, includeUntracked: boolean = false): Promise<ScanContext> {
  let allFiles = await fg(['**/*'], {
    ignore: IGNORE_PATTERNS,
    dot: true,
  });

  let skippedCount = 0;
  let trackedFiles: Set<string> | null = null;
  const ignoredFilesCache = new Map<string, boolean>();

  try {
    const { stdout } = await execAsync('git ls-files');
    const files = stdout.split('\n').filter(Boolean);
    if (files.length > 0) {
      trackedFiles = new Set(files);
    }
  } catch (e) {}

  async function isIgnored(filePath: string): Promise<boolean> {
    if (ignoredFilesCache.has(filePath)) return ignoredFilesCache.get(filePath)!;
    try {
      await execAsync(`git check-ignore -q "${filePath}"`);
      ignoredFilesCache.set(filePath, true);
      return true;
    } catch (e) {
      ignoredFilesCache.set(filePath, false);
      return false;
    }
  }

  if (trackedFiles && !includeUntracked) {
    const originalCount = allFiles.length;
    allFiles = allFiles.filter(f => trackedFiles!.has(f) || path.basename(f).includes('.env'));
    skippedCount = originalCount - allFiles.length;
  }

  const packageJsonPath = allFiles.find(f => f === 'package.json');
  let packageJson = undefined;
  if (packageJsonPath) {
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(content);
    } catch (e) {}
  }

  const envFilesPaths = allFiles.filter(f => f === '.env' || f.startsWith('.env.'));
  const envFiles: EnvFile[] = [];
  for (const f of envFilesPaths) {
    envFiles.push({
      path: f,
      isTracked: trackedFiles ? trackedFiles.has(f) : false,
      isIgnored: trackedFiles ? await isIgnored(f) : false,
    });
  }

  const rawInstructionFiles = await fg(INSTRUCTION_PATTERNS, { ignore: IGNORE_PATTERNS });
  const instructionFiles = (trackedFiles && !includeUntracked) 
    ? rawInstructionFiles.filter(f => trackedFiles!.has(f)) 
    : rawInstructionFiles;

  const rawApiFiles = await fg(API_PATTERNS, { ignore: IGNORE_PATTERNS });
  const apiFiles = (trackedFiles && !includeUntracked)
    ? rawApiFiles.filter(f => trackedFiles!.has(f))
    : rawApiFiles;

  let aiUsageDetected = false;
  let aiFiles: string[] = [];
  
  if (packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    aiUsageDetected = AI_TERMS.some(term => deps[term] || Object.keys(deps).some(d => d.includes(term)));
  }

  // Find files specifically mentioning AI terms
  const codeFiles = allFiles.filter(f => 
    f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')
  );

  for (const file of codeFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      if (AI_TERMS.some(term => content.includes(term))) {
        aiUsageDetected = true;
        aiFiles.push(file);
      }
    } catch (e) {}
  }

  return {
    files: allFiles,
    packageJson,
    envFiles,
    instructionFiles,
    apiFiles,
    aiFiles,
    aiUsageDetected,
    isShipMode,
    skippedCount,
    analyzedByAI: [], // Will be populated in runChecks
  };
}
