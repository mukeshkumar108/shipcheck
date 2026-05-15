import chalk from 'chalk';
import type { Finding, Severity, ScanContext } from './types.js';

const SEVERITY_COLORS: Record<Severity, any> = {
  critical: chalk.bgRed.white.bold,
  high: chalk.red.bold,
  medium: chalk.yellow.bold,
  low: chalk.blue,
  info: chalk.gray,
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: ' CRITICAL ',
  high: ' HIGH ',
  medium: ' MEDIUM ',
  low: ' LOW ',
  info: ' INFO ',
};

export function printFinding(finding: Finding) {
  const color = SEVERITY_COLORS[finding.severity];
  const label = SEVERITY_LABELS[finding.severity];

  console.log(`\n${color(label)} ${chalk.bold(finding.title)}`);
  if (finding.file) {
    console.log(chalk.gray(`File: ${finding.file}${finding.line ? `:${finding.line}` : ''}`));
  }
  console.log(`\n${chalk.white(finding.description)}`);
  console.log(`\n${chalk.cyan('Why it matters:')} ${finding.whyItMatters}`);
  console.log(`${chalk.green('What to do:')} ${finding.whatToDo}`);
  
  if (finding.fixPrompt) {
    console.log(`\n${chalk.magenta('🤖 Fix prompt for AI:')}`);
    console.log(chalk.italic.gray(`"${finding.fixPrompt}"`));
  }
  console.log(chalk.gray('─'.repeat(50)));
}

export function printSummary(ctx: ScanContext, findings: Finding[], rawCount: number, aiEnabled: boolean, options: any) {
  const isAll = options.all;
  const isVerbose = options.verbose;

  console.log(`\n${chalk.bold.underline('Shipcheck Review Details')}`);
  
  // Proof of Work
  console.log(chalk.gray(`Shipcheck reviewed:`));
  console.log(`- ${ctx.apiFiles.length} API/server files`);
  console.log(`- ${ctx.aiFiles.length} AI integration files`);
  console.log(`- ${ctx.envFiles.length} env/config files`);
  console.log(`- ${ctx.instructionFiles.length} instruction files`);
  console.log(`- ${ctx.apiFiles.length + ctx.aiFiles.length} risky surfaces`);

  if (findings.length === 0 && rawCount === 0) {
    console.log(chalk.green('\n✅ No launch-blocking risks found.'));
  }

  console.log(`\n${chalk.bold('Top areas checked:')}`);
  
  // Conditional checkmarks
  const check = (label: string, condition: boolean) => {
    if (condition) console.log(`${chalk.green('✓')} ${label}`);
    else console.log(`${chalk.gray('—')} ${label} (no relevant files detected)`);
  };

  check('secrets', ctx.files.length > 0);
  check('auth-sensitive routes', ctx.apiFiles.length > 0);
  check('AI cost/rate-limit patterns', ctx.aiFiles.length > 0 || ctx.aiUsageDetected);
  check('upload/file handling', ctx.apiFiles.some(f => f.toLowerCase().includes('upload')));
  check('instruction guardrails', ctx.instructionFiles.length > 0);

  if (isVerbose) {
    console.log(`\n${chalk.bold.magenta('AI Analysis (Verbose Mode):')}`);
    console.log(`- sent ${ctx.analyzedByAI.length} high-risk files to DeepSeek`);
    console.log(`- skipped ${ctx.skippedCount} generated/untracked files`);
    const collapsed = rawCount - findings.length;
    if (collapsed > 0) {
      console.log(`- collapsed ${collapsed} low-confidence/duplicate findings`);
    } else {
      console.log(`- no actionable risks after review`);
    }
    if (ctx.analyzedByAI.length > 0) {
      console.log(chalk.gray(`Analyzed files: ${ctx.analyzedByAI.join(', ')}`));
    }
  }

  if (findings.length > 0) {
    console.log(`\n${chalk.bold.underline('Findings')}`);
    if (!isAll && rawCount > findings.length) {
      console.log(chalk.yellow(`\n${rawCount} raw findings collapsed into ${findings.length} actionable issues.`));
    } else {
      console.log(`\nFound ${findings.length} issues:`);
    }

    const counts = findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(counts).forEach(([sev, count]) => {
      const color = SEVERITY_COLORS[sev as Severity];
      console.log(`- ${color(sev.toUpperCase())}: ${count}`);
    });
  }

  if (!aiEnabled) {
    console.log(chalk.yellow('\n💡 Note: AI-enhanced explanations are disabled. Set OPENROUTER_API_KEY to enable.'));
  }
  console.log('');
}

export function printInitSuccess(filePath: string) {
  console.log(chalk.green(`\n✅ Created ${filePath}`));
  console.log(chalk.blue('Now you can run `shipcheck` to scan your project.\n'));
}

export function printInitExists(filePath: string) {
  console.log(chalk.yellow(`\n⚠️  ${filePath} already exists.`));
  console.log(chalk.gray('Use --force to overwrite.\n'));
}
