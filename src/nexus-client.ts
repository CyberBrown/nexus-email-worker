import type { ClassificationResult, NexusMcpResponse } from './types';

async function callNexusMcp(
  mcpUrl: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<NexusMcpResponse> {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Nexus MCP ${toolName} returned ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<NexusMcpResponse>;
}

/** Extract the inbox item ID from a nexus_capture response */
export function extractItemId(captureResult: NexusMcpResponse): string | null {
  const text = captureResult.result?.content?.[0]?.text;
  if (!text) return null;

  // The capture response text typically contains the item ID
  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(text);
    return parsed.id || parsed.item_id || null;
  } catch {
    // Fall back to regex matching for ID patterns
    const match = text.match(/\b(\d+)\b/);
    return match ? match[1] : null;
  }
}

export async function captureToNexus(
  content: string,
  mcpUrl: string,
  passphrase: string,
): Promise<NexusMcpResponse> {
  return callNexusMcp(mcpUrl, 'nexus_capture', {
    content,
    source_type: 'email',
    passphrase,
  });
}

export async function classifyInbox(
  mcpUrl: string,
  passphrase: string,
  itemId: string,
  classification: ClassificationResult,
  processedContent: string,
): Promise<NexusMcpResponse> {
  return callNexusMcp(mcpUrl, 'nexus_classify_inbox', {
    item_id: itemId,
    classification: {
      type: classification.type,
      title: classification.title,
      description: classification.description,
      domain: classification.domain,
      ...(classification.type === 'task' && {
        urgency: classification.urgency,
        importance: classification.importance,
      }),
    },
    confidence_score: classification.confidence,
    processed_content: processedContent,
    passphrase,
  });
}

export async function promoteInbox(
  mcpUrl: string,
  passphrase: string,
  itemId: string,
  classification: ClassificationResult,
): Promise<NexusMcpResponse> {
  const args: Record<string, unknown> = {
    item_id: itemId,
    promote_to: classification.type,
    title: classification.title,
    description: classification.description,
    domain: classification.domain,
    passphrase,
  };

  if (classification.type === 'task') {
    args.status = 'next';
    args.urgency = classification.urgency ?? 3;
    args.importance = classification.importance ?? 3;
  }

  return callNexusMcp(mcpUrl, 'nexus_promote_inbox', args);
}

export async function createNote(
  mcpUrl: string,
  passphrase: string,
  classification: ClassificationResult,
  emailBody: string,
): Promise<NexusMcpResponse> {
  const tags = ['email', ...(classification.tags || [])];
  return callNexusMcp(mcpUrl, 'nexus_create_note', {
    title: classification.title,
    content: emailBody,
    category: 'reference',
    source_type: 'capture',
    tags: JSON.stringify(tags),
    passphrase,
  });
}
