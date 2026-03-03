import type { Env, EmailClassificationContext, DeCallbackBody } from './types';
import { parseEmail, formatContent } from './parse-email';
import { captureToNexus, extractItemId, classifyInbox, promoteInbox, createNote } from './nexus-client';
import { dispatchToDE, parseClassificationFromOutput } from './de-client';

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

      // Phase 2: Dispatch to DE for classification
      const itemId = extractItemId(captureResult);
      if (!itemId) {
        console.error('Could not extract inbox item ID from capture response');
        return;
      }

      try {
        const taskId = await dispatchToDE(parsed.subject, content, env);

        const context: EmailClassificationContext = {
          itemId,
          emailBody: parsed.textBody || parsed.htmlBody,
          emailContent: content,
          capturedAt: new Date().toISOString(),
        };

        await env.EMAIL_CONTEXT.put(taskId, JSON.stringify(context), { expirationTtl: 3600 });

        console.log(`Dispatched classification to DE (task_id: ${taskId})`);
      } catch (err) {
        console.error('DE dispatch failed, leaving as raw capture:', err);
      }
    } catch (err) {
      console.error('Failed to process email:', err);
      // Don't rethrow — email delivery should not fail
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'POST' || url.pathname !== '/callback') {
      return new Response('Not found', { status: 404 });
    }

    let body: DeCallbackBody;
    try {
      body = await request.json() as DeCallbackBody;
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (!body.task_id) {
      return new Response('Missing task_id', { status: 400 });
    }

    // Look up the stored context for this task
    const raw = await env.EMAIL_CONTEXT.get(body.task_id);
    if (!raw) {
      console.error(`Unknown task_id in callback: ${body.task_id}`);
      return new Response('Unknown task', { status: 404 });
    }

    const context: EmailClassificationContext = JSON.parse(raw);

    // Clean up KV entry
    ctx.waitUntil(env.EMAIL_CONTEXT.delete(body.task_id));

    if (body.status === 'failed') {
      console.error(`DE task failed for item ${context.itemId}: ${body.error}`);
      return new Response('OK', { status: 200 });
    }

    if (!body.output) {
      console.error(`DE callback has no output for item ${context.itemId}`);
      return new Response('OK', { status: 200 });
    }

    // Parse LLM classification
    let classification;
    try {
      classification = parseClassificationFromOutput(body.output);
    } catch (err) {
      console.error('Failed to parse classification output:', err);
      return new Response('OK', { status: 200 });
    }

    console.log(`Classified item ${context.itemId} as ${classification.type} (confidence: ${classification.confidence})`);

    // Classify in Nexus
    try {
      const classifyResult = await classifyInbox(
        env.NEXUS_MCP_URL, env.NEXUS_PASSPHRASE,
        context.itemId, classification, context.emailBody,
      );
      if (classifyResult.error) {
        console.error(`Nexus classify error: ${classifyResult.error.message}`);
        return new Response('OK', { status: 200 });
      }
    } catch (err) {
      console.error('Nexus classify call failed:', err);
      return new Response('OK', { status: 200 });
    }

    // Auto-promote if confidence meets threshold
    const threshold = parseFloat(env.AUTO_PROMOTE_THRESHOLD) || 0.85;

    if (classification.confidence < threshold) {
      console.log(`Confidence ${classification.confidence} < ${threshold}, leaving for manual review`);
      return new Response('OK', { status: 200 });
    }

    if (classification.type === 'task' || classification.type === 'idea') {
      try {
        const promoteResult = await promoteInbox(
          env.NEXUS_MCP_URL, env.NEXUS_PASSPHRASE,
          context.itemId, classification,
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
          classification, context.emailBody,
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

    return new Response('OK', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
