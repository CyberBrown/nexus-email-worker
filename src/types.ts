export interface Env {
  NEXUS_MCP_URL: string;
  NEXUS_PASSPHRASE: string;
  AI_GATEWAY_URL: string;
  CF_AIG_TOKEN: string;
  LLM_PROVIDER: string;
  LLM_MODEL: string;
  AUTO_PROMOTE_THRESHOLD: string;
}

export interface ParsedEmail {
  from: string;
  subject: string;
  date: string;
  textBody: string;
  htmlBody: string;
}

export interface ClassificationResult {
  type: 'task' | 'idea' | 'note' | 'noise';
  title: string;
  description: string;
  domain: 'work' | 'personal' | 'side_project' | 'family' | 'health';
  urgency?: number;
  importance?: number;
  confidence: number;
  tags?: string[];
}

export interface NexusMcpResponse {
  result?: {
    content: Array<{ type: string; text: string }>;
  };
  error?: {
    code: number;
    message: string;
  };
}
