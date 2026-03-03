# nexus-email-worker

Cloudflare Email Worker that receives emails at `intake@voltagelabs.net` and processes them into Nexus items (tasks, ideas, notes, or raw inbox captures) via LLM classification.

## Architecture

```
Email → Cloudflare Email Routing → Email Worker → LLM Classification (via AI Gateway) → Nexus API
```

## How it works

1. Forward any email to `intake@voltagelabs.net`
2. The Email Worker parses sender, subject, body
3. If subject contains prefixes like `TASK:`, `IDEA:`, `NOTE:` — routes directly
4. Otherwise, sends content to LLM for classification
5. Creates the appropriate Nexus item via Nexus MCP/API
6. Item appears in Nexus inbox/tasks/ideas/notes for review

## Setup

### Prerequisites
- Cloudflare account with Email Routing enabled on `distributedelectrons.com`
- Nexus MCP endpoint: `https://nexus-mcp.solamp.workers.dev/mcp`
- AI Gateway configured for LLM routing

### Configuration

Secrets (via `wrangler secret put`):
- `NEXUS_PASSPHRASE` — Write passphrase for Nexus MCP
- `AI_GATEWAY_TOKEN` — API token for AI Gateway LLM calls

Vars (in `wrangler.toml`):
- `NEXUS_MCP_URL` — Nexus MCP endpoint
- `AI_GATEWAY_URL` — AI Gateway endpoint for LLM calls
- `LLM_MODEL` — Model to use for classification (e.g. `glm-4.7-flashx`)

### Deploy
```bash
bun install
bunx wrangler deploy
```

## Development

```bash
# Local dev (note: email workers can't be tested locally easily)
# Use wrangler tail for live log monitoring
bunx wrangler tail
```

## Phases

- **Phase 1**: Basic email → `nexus_capture` (raw inbox, no LLM)
- **Phase 2**: LLM classification pipeline (task/idea/note routing)
- **Phase 3**: UI for reviewing processed emails in Nexus
