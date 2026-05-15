import { z } from 'zod';

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  whyItMatters: z.string(),
  severity: SeveritySchema,
  whatToDo: z.string(),
  fixPrompt: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const FindingArraySchema = z.array(FindingSchema);

export interface EnvFile {
  path: string;
  isIgnored: boolean;
  isTracked: boolean;
}

export interface ScanContext {
  files: string[];
  packageJson?: any;
  envFiles: EnvFile[];
  instructionFiles: string[];
  apiFiles: string[];
  aiFiles: string[];
  aiUsageDetected: boolean;
  isShipMode: boolean;
  skippedCount: number;
  analyzedByAI: string[];
  stack: 'nextjs' | 'express' | 'node' | 'unknown';
}
