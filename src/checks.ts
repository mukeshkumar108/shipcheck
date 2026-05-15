import fs from 'fs/promises';
import type { Finding, ScanContext } from './types.js';
import { analyzeFilesWithAI } from './llm.js';
import chalk from 'chalk';

const SECRET_REGEX = /(?:key|secret|token|auth|password|pwd)[_-]?(?:id|value|str)?\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{16,})['"]/gi;
const NEXT_PUBLIC_SECRET_REGEX = /NEXT_PUBLIC_(?:.*(?:SECRET|API|TOKEN|KEY).*)\s*=/gi;

export async function runChecks(ctx: ScanContext): Promise<Finding[]> {
  const findings: Finding[] = [];

  // --- Phase 1: Local Deterministic Scan ---
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

  for (const file of ctx.files) {
    if (ctx.envFiles.some(e => e.path === file) || file.endsWith('.md') || file.endsWith('.json')) continue;
    const isConfigOrDoc = file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.yml') || file.endsWith('.yaml') || file.includes('config');
    try {
      const content = await fs.readFile(file, 'utf-8');
      if (content.match(SECRET_REGEX)) {
        findings.push({
          id: 'exposed-secret',
          title: `Possible secret exposed in ${file}`,
          description: 'Hardcoded credentials detected.',
          whyItMatters: 'If you commit this to GitHub, your app could be compromised in seconds.',
          severity: isConfigOrDoc ? 'high' : 'critical',
          whatToDo: 'Move the secret to a .env file and add it to .gitignore.',
          fixPrompt: `Move the hardcoded secret found in ${file} to a .env file and use process.env to access it.`,
          file,
        });
      }
    } catch (e) {}
  }

  let reportedIgnoredEnv = false;
  for (const envFile of ctx.envFiles) {
    try {
      const content = await fs.readFile(envFile.path, 'utf-8');
      const hasNextPublic = content.match(NEXT_PUBLIC_SECRET_REGEX);
      const hasSecret = content.match(SECRET_REGEX) || hasNextPublic;

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
  const highRiskFiles = [...new Set([...ctx.apiFiles, ...ctx.aiFiles])].slice(0, 15);
  if (highRiskFiles.length > 0) {
    console.log(chalk.blue(`\n🧠 Analyzing logic in ${highRiskFiles.length} high-risk files...`));
    const filesToReview = [];
    for (const path of highRiskFiles) {
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
