# Phase 2: LLM Email Classification & Auto-Promotion

## Context
Phase 1 captures raw emails into Nexus inbox via `nexus_capture`. Phase 2 adds LLM classification so emails are automatically sorted into tasks, ideas, or notes — and optionally auto-promoted when confidence is high.

## Overview
After capturing the email to Nexus inbox (Phase 1), the worker:
1. Sends the email content to an LLM for classification
2. Calls `nexus_classify_inbox` with the LLM's structured output
3. If confidence >= 0.85 AND the classification type is task/idea, auto-promotes via `nexus_promote_inbox`
4. Notes are created directly via `nexus_create_note` (no promotion needed)
5. Items classified as "noise" or with low confidence stay in inbox for manual review

## LLM Routing — AI Gateway
ALL LLM calls must route through the Cloudflare AI Gateway. Never call provider APIs directly.

The project already has `AI_GATEWAY_URL` and `CF_AIG_TOKEN` configured.

### Gateway client pattern
Copy the gateway client from DE workflows — it's the canonical pattern:
`github.com/CyberBrown/distributed-electrons/workers/workflows/lib/gateway-client.ts`

This provides `callViaGateway()` which handles:
- Gateway mode: routes through `${AI_GATEWAY_URL}/${provider-slug}${path}` with `cf-aig-authorization` header
- Direct mode fallback: calls provider API directly if gateway token not set
- Provider slugs: `anthropic`, `openai`, `google-ai-studio`, `custom-zai`, `workers-ai`

### Provider choice for classification
Use Z.ai (Zhipu) `glm-4.7-flashx` as the default — it's cheap and fast, ideal for classification.
- Provider: `zai` (gateway slug: `custom-zai`)
- Path: `/v1/chat/completions` (OpenAI-compatible)
- Model: `glm-4.7-flashx`

The LLM_MODEL env var controls this. Support swapping to other providers later.

### Env additions
Add to `wrangler.toml`:
```toml
[vars]
# ... existing vars ...
LLM_PROVIDER = "zai"  # gateway provider slug
LLM_MODEL = "glm-4.7-flashx"
AUTO_PROMOTE_THRESHOLD = "0.85"  # confidence threshold for auto-promotion
```

Add to secrets:
- `CF_AIG_TOKEN` — Cloudflare API token with AI Gateway permissions (same one used across DE)

Update the Env interface:
```typescript
export interface Env {
  NEXUS_MCP_URL: string;
  NEXUS_PASSPHRASE: string;
  AI_GATEWAY_URL: string;
  CF_AIG_TOKEN: string;
  LLM_PROVIDER: string;
  LLM_MODEL: string;
  AUTO_PROMOTE_THRESHOLD: string;
}
```

## Classification Prompt
The LLM receives the parsed email content and must return structured JSON.

System prompt:
```
You are an email classifier for a personal task management system called Nexus.
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

For forwarded emails (subject starts with "Fwd:" or "Fw:"), focus on the original email content, not the forwarding metadata.
```

User message: the formatted email content from Phase 1's parsing.

## LLM Response Handling
```typescript
interface ClassificationResult {
  type: 'task' | 'idea' | 'note' | 'noise';
  title: string;
  description: string;
  domain: 'work' | 'personal' | 'side_project' | 'family' | 'health';
  urgency?: number;
  importance?: number;
  confidence: number;
  tags?: string[];
}
```

Parse the LLM response. If JSON parsing fails, fall back to treating it as raw inbox (don't fail the email).

## Nexus MCP Calls

### Step 1: Classify (always)
Call `nexus_classify_inbox` with the LLM output:
```json
{
  "method": "tools/call",
  "params": {
    "name": "nexus_classify_inbox",
    "arguments": {
      "item_id": "<inbox_item_id from capture step>",
      "classification": {
        "type": "<task|idea|note|noise>",
        "title": "<title>",
        "description": "<description>",
        "domain": "<domain>",
        "urgency": "<if task>",
        "importance": "<if task>"
      },
      "confidence_score": 0.92,
      "processed_content": "<cleaned email body>",
      "passphrase": "<NEXUS_PASSPHRASE>"
    }
  }
}
```

### Step 2: Auto-promote (conditional)
If confidence >= AUTO_PROMOTE_THRESHOLD and type is "task" or "idea":

Call `nexus_promote_inbox`:
```json
{
  "method": "tools/call",
  "params": {
    "name": "nexus_promote_inbox",
    "arguments": {
      "item_id": "<inbox_item_id>",
      "promote_to": "task",
      "title": "<title from classification>",
      "description": "<description>",
      "domain": "<domain>",
      "status": "next",
      "urgency": 3,
      "importance": 3,
      "passphrase": "<NEXUS_PASSPHRASE>"
    }
  }
}
```

### Step 3: Notes (direct creation)
If type is "note" and confidence >= threshold:

Call `nexus_create_note`:
```json
{
  "method": "tools/call",
  "params": {
    "name": "nexus_create_note",
    "arguments": {
      "title": "<title>",
      "content": "<email body>",
      "category": "reference",
      "source_type": "capture",
      "tags": "[\"email\", \"<any tags>\"]",
      "passphrase": "<NEXUS_PASSPHRASE>"
    }
  }
}
```

### Noise
If type is "noise", no further action. The item stays classified in inbox.

## File structure additions
```
src/
  index.ts          — Update to call classify after capture
  parse-email.ts    — No changes
  nexus-client.ts   — Add classify_inbox, promote_inbox, create_note methods
  classify.ts       — NEW: LLM classification logic
  gateway-client.ts — NEW: Copy from DE workflows (AI Gateway routing)
  types.ts          — Add ClassificationResult, update Env
```

## Flow diagram
```
Email arrives
  → parse (postal-mime)
  → capture to Nexus inbox (nexus_capture) → get inbox_item_id
  → send to LLM for classification (via AI Gateway)
  → parse LLM JSON response
  → call nexus_classify_inbox with result
  → if confidence >= 0.85:
      → type=task/idea → nexus_promote_inbox
      → type=note → nexus_create_note
      → type=noise → done
  → if confidence < 0.85:
      → leave in inbox for manual review
```

## Error handling
- LLM call fails → log error, item stays as raw capture (Phase 1 behavior)
- LLM returns invalid JSON → log, leave as raw capture
- Nexus classify call fails → log, item stays as raw capture
- Nexus promote call fails → log, item stays classified but not promoted
- Never let any of these failures cause the email handler to throw

## Important notes
- Use `bun` not npm
- Copy `gateway-client.ts` from DE workflows — don't reinvent it
- The capture step (Phase 1) must complete and return the inbox_item_id BEFORE classification starts
- Parse the MCP response to extract the inbox item ID from the capture result
- All LLM calls go through AI Gateway, never direct
- Keep the classification prompt tight — we're paying per token on glm-4.7-flashx (though it's cheap)

## After building
- Commit all changes with descriptive message
- Deploy: `bunx wrangler deploy`
- Set secret if not already: `bunx wrangler secret put CF_AIG_TOKEN`
- Test by sending an email to inbox@distributedelectrons.com
- Monitor with `bunx wrangler tail`
