import PostalMime from 'postal-mime';

export interface Env {
  NEXUS_MCP_URL: string;
  NEXUS_PASSPHRASE: string;
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  LLM_MODEL: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // TODO: Phase 1 - Parse email and capture to Nexus inbox
    // TODO: Phase 2 - LLM classification pipeline
    console.log(`Received email from ${message.from} to ${message.to}`);
    console.log(`Subject: ${message.headers.get('subject')}`);
  },
} satisfies ExportedHandler<Env>;
