#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { scanProject } from './scanner.js';
import { runChecks } from './checks.js';
import { printFinding, printSummary, printInitSuccess, printInitExists } from './output.js';
import { hasAIEnabled } from './llm.js';

const program = new Command();

program
  .name('shipcheck')
  .description('A friendly safety check for vibe-coded apps.')
  .version('0.0.1');

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
  .action(async () => {
    await runScan(true);
  });

program
  .action(async () => {
    await runScan(false);
  });

async function runScan(isShipMode: boolean) {
  const ctx = await scanProject(isShipMode);
  const allFindings = await runChecks(ctx);

  let findings = allFindings;
  if (isShipMode) {
    // Only show critical, high, and medium findings for 'ship' command
    findings = allFindings.filter(f => ['critical', 'high', 'medium'].includes(f.severity));
  }

  for (const finding of findings) {
    printFinding(finding);
  }

  printSummary(findings, hasAIEnabled());
}

program.parse(process.argv);
