import type { Env } from './types';
import { parseEmail, formatContent } from './parse-email';
import { captureToNexus, extractItemId, classifyInbox, promoteInbox, createNote } from './nexus-client';
import { classifyEmail } from './classify';

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Received email from ${message.from} to ${message.to}`);
    console.log(`Subject: ${message.headers.get('subject')}`);

    try {
      // Phase 1: Parse and capture
      const parsed = await parseEmail(message.raw);
      const content = formatContent(parsed);

      console.log(`Parsed email from ${parsed.from}, subject: "${parsed.subject}"`);

      const captureResult = await captureToNexus(content, env.NEXUS_MCP_URL, env.NEXUS_PASSPHRASE);

      if (captureResult.error) {
        console.error(`Nexus capture error: ${captureResult.error.message}`);
        return;
      }

      console.log('Email captured to Nexus inbox successfully');

      // Phase 2: LLM classification and auto-promotion
      const itemId = extractItemId(captureResult);
      if (!itemId) {
        console.error('Could not extract inbox item ID from capture response');
        return;
      }

      let classification;
      try {
        classification = await classifyEmail(content, env);
      } catch (err) {
        console.error('LLM classification failed, leaving as raw capture:', err);
        return;
      }

      if (!classification) {
        console.log('No classification returned, leaving as raw capture');
        return;
      }

      console.log(`Classified as ${classification.type} (confidence: ${classification.confidence})`);

      // Classify in Nexus
      try {
        const classifyResult = await classifyInbox(
          env.NEXUS_MCP_URL, env.NEXUS_PASSPHRASE,
          itemId, classification, parsed.textBody || parsed.htmlBody,
        );
        if (classifyResult.error) {
          console.error(`Nexus classify error: ${classifyResult.error.message}`);
          return;
        }
      } catch (err) {
        console.error('Nexus classify call failed:', err);
        return;
      }

      // Auto-promote if confidence meets threshold
      const threshold = parseFloat(env.AUTO_PROMOTE_THRESHOLD) || 0.85;

      if (classification.confidence < threshold) {
        console.log(`Confidence ${classification.confidence} < ${threshold}, leaving for manual review`);
        return;
      }

      if (classification.type === 'task' || classification.type === 'idea') {
        try {
          const promoteResult = await promoteInbox(
            env.NEXUS_MCP_URL, env.NEXUS_PASSPHRASE,
            itemId, classification,
          );
          if (promoteResult.error) {
            console.error(`Nexus promote error: ${promoteResult.error.message}`);
          } else {
            console.log(`Auto-promoted to ${classification.type}: "${classification.title}"`);
          }
        } catch (err) {
          console.error('Nexus promote call failed:', err);
        }
      } else if (classification.type === 'note') {
        try {
          const noteResult = await createNote(
            env.NEXUS_MCP_URL, env.NEXUS_PASSPHRASE,
            classification, parsed.textBody || parsed.htmlBody,
          );
          if (noteResult.error) {
            console.error(`Nexus create_note error: ${noteResult.error.message}`);
          } else {
            console.log(`Created note: "${classification.title}"`);
          }
        } catch (err) {
          console.error('Nexus create_note call failed:', err);
        }
      } else {
        console.log('Classified as noise, no further action');
      }
    } catch (err) {
      console.error('Failed to process email:', err);
      // Don't rethrow — email delivery should not fail
    }
  },
} satisfies ExportedHandler<Env>;
