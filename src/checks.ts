import fs from 'fs/promises';
import type { Finding, ScanContext } from './types.js';

const SECRET_REGEX = /(?:key|secret|token|auth|password|pwd)[_-]?(?:id|value|str)?\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{16,})['"]/gi;
const NEXT_PUBLIC_SECRET_REGEX = /NEXT_PUBLIC_(?:.*(?:SECRET|API|TOKEN|KEY).*)\s*=/gi;

export async function runChecks(ctx: ScanContext): Promise<Finding[]> {
  const findings: Finding[] = [];

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

  // Check for exposed secrets in non-env files
  for (const file of ctx.files) {
    if (ctx.envFiles.includes(file) || file.endsWith('.md') || file.endsWith('.json')) continue;
    
    try {
      const content = await fs.readFile(file, 'utf-8');
      if (content.match(SECRET_REGEX)) {
        findings.push({
          id: 'exposed-secret',
          title: `Possible secret exposed in ${file}`,
          description: 'Hardcoded credentials detected.',
          whyItMatters: 'If you commit this to GitHub, your app could be compromised in seconds.',
          severity: 'critical',
          whatToDo: 'Move the secret to a .env file and add it to .gitignore.',
          fixPrompt: `Move the hardcoded secret found in ${file} to a .env file and use process.env to access it.`,
          file,
        });
      }
    } catch (e) {}
  }

  // Check for NEXT_PUBLIC secrets
  for (const envFile of ctx.envFiles) {
    try {
      const content = await fs.readFile(envFile, 'utf-8');
      if (content.match(NEXT_PUBLIC_SECRET_REGEX)) {
        findings.push({
          id: 'next-public-secret',
          title: `Secret exposed via NEXT_PUBLIC in ${envFile}`,
          description: 'NEXT_PUBLIC_ variables are bundled into the client-side code.',
          whyItMatters: 'Anyone visiting your site can see these keys in the browser source.',
          severity: 'critical',
          whatToDo: 'Remove NEXT_PUBLIC_ prefix or use a server-side route to hide the key.',
          fixPrompt: `I have a secret key with NEXT_PUBLIC_ prefix in ${envFile}. Help me move this to a server-side route so it is not exposed to the client.`,
          file: envFile,
        });
      }
    } catch (e) {}
  }

  // Check API files for various issues
  for (const apiFile of ctx.apiFiles) {
    try {
      const content = await fs.readFile(apiFile, 'utf-8');
      const stats = await fs.stat(apiFile);

      // Large API files
      if (stats.size > 10000) { // > 10KB
        findings.push({
          id: 'large-api-file',
          title: `Large API file: ${apiFile}`,
          description: 'This route is getting a bit chunky.',
          whyItMatters: 'Large files are harder for AIs to reason about and more prone to bugs.',
          severity: 'low',
          whatToDo: 'Refactor logic into smaller helper functions or separate files.',
          fixPrompt: `The file ${apiFile} is too large. Help me refactor the logic into smaller, reusable functions.`,
          file: apiFile,
        });
      }

      // AI usage without rate limiting
      if (ctx.aiUsageDetected && (content.includes('openai') || content.includes('anthropic') || content.includes('@ai-sdk'))) {
        if (!content.toLowerCase().includes('ratelimit') && !content.toLowerCase().includes('upstash') && !content.toLowerCase().includes('limit')) {
          findings.push({
            id: 'ai-no-ratelimit',
            title: `AI usage without rate limiting in ${apiFile}`,
            description: 'Your AI costs could skyrocket.',
            whyItMatters: 'A simple script could drain your API credits if there is no rate limiting.',
            severity: 'high',
            whatToDo: 'Add rate limiting using a library like Upstash or a middleware.',
            fixPrompt: `Add rate limiting to the AI endpoint in ${apiFile} to prevent abuse and control costs.`,
            file: apiFile,
          });
        }
      }

      // Uploads without validation
      if (apiFile.toLowerCase().includes('upload') || content.toLowerCase().includes('upload')) {
        if (!content.toLowerCase().includes('size') && !content.toLowerCase().includes('type')) {
          findings.push({
            id: 'unvalidated-upload',
            title: `Unvalidated upload route in ${apiFile}`,
            description: 'No file size or type checks found.',
            whyItMatters: 'Users could upload massive files or malicious scripts, crashing your server or hacking users.',
            severity: 'high',
            whatToDo: 'Add checks for file size (e.g., max 5MB) and mime-type.',
            fixPrompt: `Add file size and type validation to the upload route in ${apiFile}.`,
            file: apiFile,
          });
        }
      }

      // Admin routes without auth
      if (apiFile.toLowerCase().includes('admin') || content.toLowerCase().includes('admin')) {
        if (!content.toLowerCase().includes('auth') && !content.toLowerCase().includes('session') && !content.toLowerCase().includes('user')) {
          findings.push({
            id: 'unprotected-admin',
            title: `Unprotected admin route in ${apiFile}`,
            description: 'Sensitive route seems to lack auth checks.',
            whyItMatters: 'Anyone could access your admin data or perform admin actions.',
            severity: 'critical',
            whatToDo: 'Add a check to ensure the user is logged in and has admin privileges.',
            fixPrompt: `Add authentication and authorization checks to the admin route in ${apiFile}.`,
            file: apiFile,
          });
        }
      }

    } catch (e) {}
  }

  // Weak instructions check
  for (const instFile of ctx.instructionFiles) {
    try {
      const content = (await fs.readFile(instFile, 'utf-8')).toLowerCase();
      const requirements = ['security', 'env', 'auth', 'upload', 'rate limit'];
      const missing = requirements.filter(req => !content.includes(req));

      if (missing.length > 2) {
        findings.push({
          id: 'weak-instructions',
          title: `Weak instructions in ${instFile}`,
          description: 'Important security guardrails are missing.',
          whyItMatters: 'If the AI doesn\'t know these rules, it will keep making the same mistakes.',
          severity: 'medium',
          whatToDo: `Add mentions of ${missing.join(', ')} to your instructions.`,
          fixPrompt: `Improve the AI instructions in ${instFile} by adding guardrails for: ${missing.join(', ')}.`,
          file: instFile,
        });
      }
    } catch (e) {}
  }

  return findings;
}
