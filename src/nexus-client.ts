import type { NexusCaptureResponse } from './types';

export async function captureToNexus(
  content: string,
  mcpUrl: string,
  passphrase: string,
): Promise<NexusCaptureResponse> {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'tools/call',
      params: {
        name: 'nexus_capture',
        arguments: {
          content,
          source_type: 'email',
          passphrase,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Nexus MCP returned ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<NexusCaptureResponse>;
}
