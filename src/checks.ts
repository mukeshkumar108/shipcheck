import fs from 'fs/promises';
import type { Finding, ScanContext } from './types.js';
import { analyzeFilesWithAI, triageProjectFiles } from './llm.js';
import chalk from 'chalk';

// Hardened secret regexes
const SECRET_PATTERNS = [
  { id: 'generic-secret', regex: /(?:key|secret|token|auth|password|pwd)[_-]?(?:id|value|str)?\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{16,})['"]/gi },
  { id: 'openai-secret', regex: /sk-(?:proj-)?[a-zA-Z0-9_\-]{40,}/g },
  { id: 'anthropic-secret', regex: /sk-ant-[a-zA-Z0-9\-_]{40,}/g },
  { id: 'stripe-secret', regex: /(?:sk|pk|rk)_(?:live|test)_[0-9a-zA-Z]{10,}/g },
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
            fixPrompt: `Open ${file} and find the hardcoded secret value. Move it to a .env file, add .env to .gitignore, and replace the hardcoded value with process.env.YOUR_VAR_NAME. Show me the change before applying it.`,
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
          fixPrompt: `Open ${envFile.path} and find the variable with the NEXT_PUBLIC_ prefix that contains a secret key. Remove the NEXT_PUBLIC_ prefix and create a server-side API route that uses it instead of exposing it to the browser. Show me the plan before making changes.`,
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
            fixPrompt: `Run: git rm --cached ${envFile.path} && echo "${envFile.path}" >> .gitignore && git add .gitignore. This removes the file from git history tracking without deleting it locally. Show me the commands before running them.`,
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
            fixPrompt: `Add ${envFile.path} to your .gitignore file so it can never be accidentally committed. Open .gitignore and add a new line with exactly: ${envFile.path}`,
            file: envFile.path,
          });
        }
      }
    } catch (e) {}
  }

  // Check for AI assistant breadcrumbs — skipped security/auth work left as TODOs
  const BREADCRUMB_REGEX = /(?:TODO|FIXME|HACK|XXX)[^\n]*(?:auth|rate.?limit|security|secret|bypass|sanitize|permission|rbac|csrf|xss|inject)/gi;
  for (const file of ctx.files) {
    if (file.includes('node_modules') || file.includes('.git') || file.endsWith('.md')) continue;
    try {
      const content = await fs.readFile(file, 'utf-8');
      const matches = content.match(BREADCRUMB_REGEX);
      if (matches) {
        findings.push({
          id: 'unresolved-security-todo',
          title: `Unresolved security TODO in ${file}`,
          description: `Found ${matches.length} comment(s) flagging skipped security work: ${matches.slice(0, 2).map(m => `"${m.trim()}"`).join(', ')}`,
          whyItMatters: 'AI assistants leave these as reminders and move on. Vibe coders ship them. This is how auth gets skipped in production.',
          severity: 'high',
          whatToDo: 'Resolve every security TODO before shipping. Do not treat them as optional.',
          fixPrompt: `Open ${file} and search for TODO/FIXME comments related to auth, rate limiting, or security. Read the surrounding code to understand what was intentionally skipped. Implement each one — do not delete the comments without doing the work. Show me your plan for each one before starting.`,
          file,
        });
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
          fixPrompt: `Open ${file} and look at its structure. Identify the largest logical sections (e.g. separate concerns like data fetching, business logic, UI). Suggest a split into smaller files before making any changes.`,
          file,
        });
      }
    } catch (e) {}
  }

  // --- Phase 2: Semantic AI Review ---
  // ship mode is fast/local-first — skip AI entirely
  if (ctx.isShipMode) {
    return findings;
  }

  // AI triage: let the model identify high-risk files from the full file tree.
  // This works for any project structure — monorepos, non-standard layouts, anything.
  // Falls back to glob-based discovery if AI is unavailable or triage fails.
  const TRIAGE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
  const triageableFiles = ctx.files.filter(f => {
    const ext = f.substring(f.lastIndexOf('.'));
    return TRIAGE_EXTENSIONS.has(ext);
  });

  const globFallback = [...new Set([...ctx.apiFiles, ...ctx.aiFiles])];

  console.log(chalk.blue(`\n🔍 Identifying high-risk files across ${triageableFiles.length} source files...`));
  const triaged = await triageProjectFiles(triageableFiles, ctx.packageJson);

  // Always include instruction files — triage focuses on code, not config
  const highRiskFiles = [
    ...new Set([
      ...(triaged.length > 0 ? triaged : globFallback),
      ...ctx.instructionFiles,
    ])
  ].slice(0, 20);

  ctx.triagedByAI = triaged.length > 0;

  // Never send files containing detected secrets to the AI
  const safeFilesToReview = highRiskFiles.filter(f => !filesWithSecrets.has(f));

  if (safeFilesToReview.length > 0) {
    console.log(chalk.blue(`🧠 Analyzing logic in ${safeFilesToReview.length} high-risk files...`));
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
