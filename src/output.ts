import chalk from 'chalk';
import type { Finding, Severity } from './types.js';

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
  
  console.log(`\n${chalk.magenta('🤖 Fix prompt for AI:')}`);
  console.log(chalk.italic.gray(`"${finding.fixPrompt}"`));
  console.log(chalk.gray('─'.repeat(50)));
}

export function printSummary(findings: Finding[], aiEnabled: boolean) {
  console.log(`\n${chalk.bold.underline('Shipcheck Summary')}`);
  
  if (findings.length === 0) {
    console.log(chalk.green('\n✅ Everything looks great! No issues found.'));
  } else {
    const counts = findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`\nFound ${findings.length} issues:`);
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
