# Claude Code Prompt: nexus-email-worker

## Repo
github.com/CyberBrown/nexus-email-worker (already scaffolded, clone it first)

## Goal
Build a Cloudflare Email Worker that receives emails at `inbox@distributedelectrons.com`, parses them, and creates Nexus inbox items. This is Phase 1 — no LLM classification yet, just raw capture to Nexus.

## What this worker does
1. Receives inbound email via Cloudflare Email Routing
2. Parses the email using `postal-mime` (already in package.json) — extracts: sender, subject, body (text + html), date
3. Formats a clean content string for Nexus capture
4. Calls the Nexus MCP endpoint to create an inbox item via the `nexus_capture` tool
5. Logs success/failure

## Architecture decisions
- **No reply emails** — we don't want more email, there will be a UI
- **No attachment handling** for MVP
- **No LLM** for Phase 1 — just raw capture with source_type "email"
- **Use Nexus MCP protocol** to create items (not REST API) — this is the standard way all services interact with Nexus
- **Route LLM calls through AI Gateway** (placeholder for Phase 2)

## How to call Nexus MCP
The Nexus MCP server speaks the Model Context Protocol over HTTP. To call the `nexus_capture` tool:

```
POST https://nexus-mcp.solamp.workers.dev/mcp
Content-Type: application/json

// MCP protocol: send a tools/call request
{
  "method": "tools/call",
  "params": {
    "name": "nexus_capture",
    "arguments": {
      "content": "Email from sender@example.com\nSubject: Meeting notes\n\n<email body here>",
      "source_type": "email",
      "passphrase": "<NEXUS_PASSPHRASE secret>"
    }
  }
}
```

The response will be a JSON-RPC style response with the result.

## Content formatting
Format the captured content like this:
```
📧 Email from: sender@example.com
Subject: <subject>
Date: <date>

---
<plain text body, fallback to stripped html if no text>
```

If the subject starts with known prefixes, include them as metadata hints (for future Phase 2 LLM classification):
- `TASK:` — hint that this should become a task
- `IDEA:` — hint that this should become an idea  
- `NOTE:` — hint that this should become a note
- `FWD:` or `Fw:` — this is a forwarded email, note that in the content

## File structure
```
src/
  index.ts        — Main email handler (the entry point)
  parse-email.ts  — Email parsing logic using postal-mime
  nexus-client.ts — Nexus MCP client (call nexus_capture)
  types.ts        — TypeScript interfaces
```

## Environment / Secrets

wrangler.toml vars (already set):
- `NEXUS_MCP_URL` = "https://nexus-mcp.solamp.workers.dev/mcp"
- `AI_GATEWAY_URL` (placeholder for Phase 2)
- `LLM_MODEL` (placeholder for Phase 2)

Secrets (set via `wrangler secret put`):
- `NEXUS_PASSPHRASE` — the write passphrase for Nexus MCP

The Env interface:
```typescript
export interface Env {
  NEXUS_MCP_URL: string;
  NEXUS_PASSPHRASE: string;
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  LLM_MODEL: string;
}
```

## wrangler.toml email routing
Add this to wrangler.toml for email routing:
```toml
[[email_routing.rules]]
enabled = true
match = "inbox@distributedelectrons.com"
action = "worker"
```

Note: The actual email routing also needs to be configured in the Cloudflare dashboard for the distributedelectrons.com domain (Email > Email Routing > Routes). The wrangler.toml config just tells the worker to expect email events.

## Important notes
- Use `bun` not npm (check package.json scripts already use wrangler)
- The email handler export uses `email()` method, not `fetch()`. See Cloudflare Email Workers docs.
- `postal-mime` is the standard library for parsing emails in CF Workers (works with the ReadableStream from the email message)
- Error handling: if Nexus call fails, log the error but don't throw (email delivery should not fail)
- Keep it simple — this is an MVP

## After building
- Run `bun install` 
- Commit all changes with descriptive message
- Deploy with `bunx wrangler deploy`
- Set the secret: `bunx wrangler secret put NEXUS_PASSPHRASE` (value: the Nexus write passphrase)
