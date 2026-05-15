import fs from 'fs/promises';
import type { Finding, ScanContext } from './types.js';
import { analyzeFilesWithAI } from './llm.js';
import chalk from 'chalk';

// Hardened secret regexes
const SECRET_PATTERNS = [
  { id: 'generic-secret', regex: /(?:key|secret|token|auth|password|pwd)[_-]?(?:id|value|str)?\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{16,})['"]/gi },
  { id: 'openai-secret', regex: /sk-[a-zA-Z0-9]{48}/g },
  { id: 'anthropic-secret', regex: /sk-ant-api03-[a-zA-Z0-9\-_]{93}AA/g },
  { id: 'stripe-secret', regex: /(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{24}/g },
  { id: 'aws-secret', regex: /AKIA[0-9A-Z]{16}/g },
];

const NEXT_PUBLIC_SECRET_REGEX = /NEXT_PUBLIC_(?:.*(?:SECRET|API|TOKEN|KEY).*)\s*=/gi;

export async function runChecks(ctx: ScanContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  const filesWithSecrets = new Set<string>();

  // --- Phase 1: Local Deterministic Scan ---

  // Check for missing instruction files
  if (ctx.instructionFiles.length === 0) {
    findings.push({
      id: 'missing-instructions',
      title: 'No AI instruction files found',
      description: 'AI-native apps work better with clear guardrails.',
      whyItMatters: 'Without instructions (like .cursorrules or CLAUDE.md), your AI might ignore security or use inefficient patterns.',
      severity: 'medium',
      whatToDo: 'Run `shipcheck init` to create a SHIPCHECK.md file.',
      fixPrompt: 'Create a SHIPCHECK.md file with basic security and coding guardrails for a Node.js/TypeScript project.',
    });
  }

  // Check for exposed secrets in ALL files first (Security Hardening)
  for (const file of ctx.files) {
    if (file.endsWith('.md') || file.endsWith('.json')) continue;
    
    try {
      const content = await fs.readFile(file, 'utf-8');
      for (const pattern of SECRET_PATTERNS) {
        if (content.match(pattern.regex)) {
          filesWithSecrets.add(file);
          if (ctx.envFiles.some(e => e.path === file)) continue; // Handled in env check

          findings.push({
            id: 'exposed-secret',
            title: `Possible secret exposed in ${file}`,
            description: `Hardcoded ${pattern.id} detected.`,
            whyItMatters: 'If you commit this to GitHub, your app could be compromised in seconds.',
            severity: 'critical',
            whatToDo: 'Move the secret to a .env file and add it to .gitignore.',
            fixPrompt: `Move the hardcoded secret found in ${file} to a .env file and use process.env to access it.`,
            file,
          });
          break;
        }
      }
    } catch (e) {}
  }

  // Check for NEXT_PUBLIC secrets & general env secrets
  let reportedIgnoredEnv = false;
  for (const envFile of ctx.envFiles) {
    try {
      const content = await fs.readFile(envFile.path, 'utf-8');
      const hasNextPublic = content.match(NEXT_PUBLIC_SECRET_REGEX);
      
      let hasSecret = false;
      for (const pattern of SECRET_PATTERNS) {
        if (content.match(pattern.regex)) {
          hasSecret = true;
          break;
        }
      }

      if (hasNextPublic) {
        findings.push({
          id: 'next-public-secret',
          title: `Secret exposed via NEXT_PUBLIC in ${envFile.path}`,
          description: 'NEXT_PUBLIC_ variables are bundled into the client-side code.',
          whyItMatters: 'Anyone visiting your site can see these keys in the browser source.',
          severity: envFile.isIgnored ? 'high' : 'critical',
          whatToDo: 'Remove NEXT_PUBLIC_ prefix or use a server-side route to hide the key.',
          fixPrompt: `I have a secret key with NEXT_PUBLIC_ prefix in ${envFile.path}. Help me move this to a server-side route so it is not exposed to the client.`,
          file: envFile.path,
        });
      } else if (hasSecret) {
        if (envFile.isTracked) {
          findings.push({
            id: 'tracked-env-secret',
            title: `Secret exposed in tracked env file: ${envFile.path}`,
            description: 'You are tracking an environment file containing secrets in Git.',
            whyItMatters: 'Anyone with access to the repo can see these secrets.',
            severity: 'critical',
            whatToDo: 'Remove this file from Git tracking using `git rm --cached` and add it to .gitignore.',
            fixPrompt: `Help me remove ${envFile.path} from git tracking and add it to .gitignore.`,
            file: envFile.path,
          });
        } else if (envFile.isIgnored) {
          if (!reportedIgnoredEnv) {
            findings.push({
              id: 'ignored-env-file',
              title: `Local env files detected and appear ignored. Good.`,
              description: `Found ignored env files (e.g. ${envFile.path}).`,
              whyItMatters: 'Keeping secrets in ignored files prevents accidental leaks.',
              severity: 'info',
              whatToDo: 'Nothing. You are doing it right.',
              fixPrompt: '',
              file: envFile.path,
            });
            reportedIgnoredEnv = true;
          }
        } else {
          findings.push({
            id: 'untracked-unignored-env-secret',
            title: `Secret in untracked, un-ignored env file: ${envFile.path}`,
            description: 'This env file is not ignored by git. You might accidentally commit it.',
            whyItMatters: 'If you run `git add .`, this file will be committed and your secrets leaked.',
            severity: 'high',
            whatToDo: 'Add this file to your .gitignore.',
            fixPrompt: `Add ${envFile.path} to .gitignore.`,
            file: envFile.path,
          });
        }
      }
    } catch (e) {}
  }

  // Meta checks: Large files
  for (const file of ctx.files) {
    if (file.includes('node_modules') || file.includes('.git')) continue;
    try {
      const stats = await fs.stat(file);
      if (stats.size > 20000 && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx'))) {
        findings.push({
          id: 'large-file',
          title: `Large file: ${file}`,
          description: 'This file is getting very large.',
          whyItMatters: 'Large files are harder for AI assistants to safely edit and reason about.',
          severity: 'low',
          whatToDo: 'Split this file into smaller modules.',
          fixPrompt: `Help me refactor ${file} into smaller, more manageable components or modules.`,
          file,
        });
      }
    } catch (e) {}
  }

  // --- Phase 2: Semantic AI Review ---
  // Skip AI entirely in 'ship' mode if requested, but for now we'll keep it but limit it.
  // Actually, 'ship' mode should be fast. Let's make Phase 2 optional or prioritized.
  
  if (ctx.isShipMode && !process.env.OPENROUTER_API_KEY) {
     // Skip AI review in ship mode if no key is present (don't even warn)
     return findings;
  }

  const highRiskFiles = [...new Set([...ctx.apiFiles, ...ctx.aiFiles, ...ctx.instructionFiles])].slice(0, 20);
  
  // Filter out files that contain deterministic secrets to ensure they are NEVER sent to AI
  const safeFilesToReview = highRiskFiles.filter(f => !filesWithSecrets.has(f));
  
  if (safeFilesToReview.length > 0) {
    console.log(chalk.blue(`\n🧠 Analyzing logic in ${safeFilesToReview.length} high-risk files...`));
    const filesToReview = [];
    for (const path of safeFilesToReview) {
      try {
        const content = await fs.readFile(path, 'utf-8');
        filesToReview.push({ path, content: content.slice(0, 10000) });
        ctx.analyzedByAI.push(path);
      } catch (e) {}
    }

    const aiFindings = await analyzeFilesWithAI(filesToReview);
    findings.push(...aiFindings);
  }

  return findings;
}
