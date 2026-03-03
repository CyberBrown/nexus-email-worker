import type { Env } from './types';
import { parseEmail, formatContent } from './parse-email';
import { captureToNexus } from './nexus-client';

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Received email from ${message.from} to ${message.to}`);
    console.log(`Subject: ${message.headers.get('subject')}`);

    try {
      const parsed = await parseEmail(message.raw);
      const content = formatContent(parsed);

      console.log(`Parsed email from ${parsed.from}, subject: "${parsed.subject}"`);

      const result = await captureToNexus(content, env.NEXUS_MCP_URL, env.NEXUS_PASSPHRASE);

      if (result.error) {
        console.error(`Nexus capture error: ${result.error.message}`);
      } else {
        console.log('Email captured to Nexus inbox successfully');
      }
    } catch (err) {
      console.error('Failed to process email:', err);
      // Don't rethrow — email delivery should not fail
    }
  },
} satisfies ExportedHandler<Env>;
