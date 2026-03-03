export interface Env {
  NEXUS_MCP_URL: string;
  NEXUS_PASSPHRASE: string;
  DE_EXECUTE_URL: string;
  WORKER_URL: string;
  AUTO_PROMOTE_THRESHOLD: string;
  EMAIL_CONTEXT: KVNamespace;
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

export interface EmailClassificationContext {
  itemId: string;
  emailBody: string;
  emailContent: string;
  capturedAt: string;
}

export interface DeCallbackBody {
  task_id: string;
  status: 'completed' | 'failed';
  output?: string;
  error?: string;
}
