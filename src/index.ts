#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { scanProject } from './scanner.js';
import { runChecks } from './checks.js';
import { printFinding, printSummary, printInitSuccess, printInitExists } from './output.js';
import { hasAIEnabled } from './llm.js';
import type { Finding } from './types.js';

const program = new Command();

program
  .name('shipcheck')
  .description('A friendly safety check for vibe-coded apps.')
  .version('0.0.1')
  .option('-u, --include-untracked', 'Include untracked files in scan')
  .option('-v, --verbose', 'Show detailed AI analysis and debug info')
  .option('-a, --all', 'Show all findings without grouping or filtering');

program
  .command('init')
  .description('Initialize Shipcheck in your project')
  .option('-f, --force', 'Overwrite existing SHIPCHECK.md')
  .action(async (options) => {
    const filePath = path.join(process.cwd(), 'SHIPCHECK.md');
    const exists = await fs.access(filePath).then(() => true).catch(() => false);

    if (exists && !options.force) {
      printInitExists('SHIPCHECK.md');
      return;
    }

    const content = `# SHIPCHECK Guardrails

This file contains safety rules for AI coding assistants (Claude, Cursor, etc.).

## 🛡️ Security
- NEVER expose API keys or secrets in client-side code (Next.js components, etc.).
- ALWAYS use server-side routes or environment variables for sensitive logic.
- PROTECT admin and private routes with authentication and authorization checks.
- VALIDATE all user-uploaded files for size and mime-type.

## ⚡ Performance & Cost
- ADD rate limits to all public AI or expensive endpoints.
- USE timeouts for external API calls to prevent hanging processes.
- AVOID sending massive chat histories; trim context to stay within token limits.

## 🧠 Better AI Coding
- EXPLAIN risky changes (like deleting files or complex refactors) before making them.
- USE idiomatic patterns for this project's stack.
`;

    await fs.writeFile(filePath, content, 'utf-8');
    printInitSuccess('SHIPCHECK.md');
  });

program
  .command('ship')
  .description('Scan for launch-critical issues')
  .option('-u, --include-untracked', 'Include untracked files in scan')
  .option('-v, --verbose', 'Show detailed AI analysis and debug info')
  .option('-a, --all', 'Show all findings without grouping or filtering')
  .action(async (options) => {
    const globalOptions = program.opts();
    await runScan(true, { ...globalOptions, ...options });
  });

program
  .action(async (options) => {
    const globalOptions = program.opts();
    await runScan(false, { ...globalOptions, ...options });
  });

async function runScan(isShipMode: boolean, options: any) {
  const ctx = await scanProject(isShipMode, options.includeUntracked);
  const allFindings = await runChecks(ctx);

  let findingsToPrint = allFindings;
  let rawCount = allFindings.length;

  if (!options.all) {
    const { grouped, totalRaw } = groupFindings(allFindings);
    findingsToPrint = grouped;
    rawCount = totalRaw;

    findingsToPrint = findingsToPrint.filter(f => ['critical', 'high', 'medium'].includes(f.severity));
  } else if (isShipMode) {
    findingsToPrint = allFindings.filter(f => ['critical', 'high', 'medium'].includes(f.severity));
  }

  if (!options.all && findingsToPrint.length > 10) {
    findingsToPrint = findingsToPrint.slice(0, 10);
  }

  for (const finding of findingsToPrint) {
    printFinding(finding);
  }

  printSummary(ctx, findingsToPrint, rawCount, hasAIEnabled(), options);
}

function groupFindings(findings: Finding[]): { grouped: Finding[], totalRaw: number } {
  const groups = new Map<string, { finding: Finding, files: string[] }>();

  for (const f of findings) {
    const key = f.id;
    if (groups.has(key)) {
      const group = groups.get(key)!;
      if (f.file && !group.files.includes(f.file)) {
        group.files.push(f.file);
      }
    } else {
      groups.set(key, { finding: { ...f }, files: f.file ? [f.file] : [] });
    }
  }

  const grouped = Array.from(groups.values()).map(g => {
    const f = g.finding;
    if (g.files.length > 1) {
      const baseTitle = f.title.includes(' in ') ? f.title.split(' in ')[0] : f.title;
      f.title = `${baseTitle} (in ${g.files.length} files)`;
      f.file = g.files.slice(0, 3).join(', ') + (g.files.length > 3 ? ` ... (+${g.files.length - 3} more)` : '');
    }
    return f;
  });

  return { grouped, totalRaw: findings.length };
}

program.parse(process.argv);
