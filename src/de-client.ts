import type { ClassificationResult, Env } from './types';

const CLASSIFICATION_SYSTEM_PROMPT = `You are an email classifier for a personal task management system called Nexus.
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

/**
 * Dispatch an email classification task to DE's /execute endpoint.
 * Returns the task_id for correlating the callback.
 */
export async function dispatchToDE(
  subject: string,
  emailContent: string,
  env: Env,
): Promise<string> {
  const taskId = crypto.randomUUID();

  const response = await fetch(env.DE_EXECUTE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Passphrase': env.NEXUS_PASSPHRASE,
    },
    body: JSON.stringify({
      task_id: taskId,
      title: `Classify email: ${subject.slice(0, 60)}`,
      description: emailContent,
      context: {
        system_prompt: CLASSIFICATION_SYSTEM_PROMPT,
      },
      hints: {
        workflow: 'text-generation',
      },
      callback_url: `${env.WORKER_URL}/callback`,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DE dispatch failed (${response.status}): ${text}`);
  }

  return taskId;
}

/**
 * Parse the LLM classification output from DE's callback.
 */
export function parseClassificationFromOutput(output: string): ClassificationResult {
  // Strip markdown fences if the LLM wraps its response
  const cleaned = output
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned) as ClassificationResult;

  if (!['task', 'idea', 'note', 'noise'].includes(parsed.type)) {
    throw new Error(`Invalid classification type: ${parsed.type}`);
  }
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(`Invalid confidence: ${parsed.confidence}`);
  }

  return parsed;
}
