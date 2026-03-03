export interface Env {
  NEXUS_MCP_URL: string;
  NEXUS_PASSPHRASE: string;
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  LLM_MODEL: string;
}

export interface ParsedEmail {
  from: string;
  subject: string;
  date: string;
  textBody: string;
  htmlBody: string;
}

export interface NexusCaptureResponse {
  result?: {
    content: Array<{ type: string; text: string }>;
  };
  error?: {
    code: number;
    message: string;
  };
}
