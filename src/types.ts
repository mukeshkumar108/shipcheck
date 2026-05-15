export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  severity: Severity;
  whatToDo: string;
  fixPrompt: string;
  file?: string;
  line?: number;
}

export interface ScanContext {
  files: string[];
  packageJson?: any;
  envFiles: string[];
  instructionFiles: string[];
  apiFiles: string[];
  aiUsageDetected: boolean;
  isShipMode: boolean;
}
