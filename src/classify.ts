import { callViaGateway, type GatewayProvider } from './gateway-client';
import type { ClassificationResult, Env } from './types';

const SYSTEM_PROMPT = `You are an email classifier for a personal task management system called Nexus.
Given an email, classify it into one of these types:
- "task" — something that requires action (a to-do, request, follow-up)
- "idea" — a concept, suggestion, or thing to explore later
- "note" — reference information, meeting notes, FYI content worth saving
- "noise" — spam, promotions, newsletters with no actionable content

Respond ONLY with a JSON object, no markdown, no preamble:
{
  "type": "task" | "idea" | "note" | "noise",
  "title": "concise title (max 80 chars)",
  "description": "1-3 sentence summary of what this is about",
  "domain": "work" | "personal" | "side_project" | "family" | "health",
  "urgency": 1-5 (only for tasks, 1=low 5=critical),
  "importance": 1-5 (only for tasks, 1=low 5=critical),
  "confidence": 0.0-1.0 (how confident you are in this classification),
  "tags": ["tag1", "tag2"] (optional, 0-3 relevant tags)
}

If the email subject starts with "TASK:", "IDEA:", or "NOTE:", treat that as an explicit instruction and set confidence to 1.0.

For forwarded emails (subject starts with "Fwd:" or "Fw:"), focus on the original email content, not the forwarding metadata.`;

export async function classifyEmail(
  emailContent: string,
  env: Env,
): Promise<ClassificationResult | null> {
  const provider = (env.LLM_PROVIDER || 'zai') as GatewayProvider;

  const response = await callViaGateway(
    {
      gatewayBaseUrl: env.AI_GATEWAY_URL,
      cfAigToken: env.CF_AIG_TOKEN,
    },
    {
      provider,
      path: '/v1/chat/completions',
      body: {
        model: env.LLM_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: emailContent },
        ],
        temperature: 0.1,
        max_tokens: 512,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM call failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('LLM returned empty response');
  }

  // Strip markdown fences if the LLM wraps its response
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = JSON.parse(cleaned) as ClassificationResult;

  // Basic validation
  if (!['task', 'idea', 'note', 'noise'].includes(parsed.type)) {
    throw new Error(`Invalid classification type: ${parsed.type}`);
  }
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(`Invalid confidence: ${parsed.confidence}`);
  }

  return parsed;
}
