# MindThread in n8n

Two ways to use MindThread from n8n. Neither needs a community node.

## 1. Let an AI Agent node use MindThread (MCP)

1. In **Credentials**, create a **Header Auth** credential named `MindThread API key`:
   - Name: `Authorization`
   - Value: `Bearer mt_live_your_key` (create the key at https://mindthread.tw/settings → API keys; an `mt_test_` key is a free sandbox)
2. Add an **AI Agent** node, and under **Tool** add **MCP Client Tool**:
   - Endpoint: `https://mindthread.tw/api/mcp`
   - Server Transport: **HTTP Streamable**
   - Authentication: **Header Auth**, credential `MindThread API key`
   - Tools to include: **All**, or pick the ones the workflow needs (for example `list_accounts`, `generate_posts`, `publish`, `list_schedules`)
3. Prompt the agent, for example: "List my MindThread accounts and schedule a post about today's product update for 18:00 Taipei time."

## 2. Call the REST API with HTTP Request nodes

Import [`mindthread-schedule-post.workflow.json`](mindthread-schedule-post.workflow.json) (**Workflows → Import from file**), select the `MindThread API key` credential on both HTTP Request nodes, and run it. It lists your accounts and schedules a post on the first account one hour from now.

Useful endpoints (base `https://mindthread.tw/api/v1`, all with the same credential):

| Goal | Method and path | Body or query |
|------|-----------------|---------------|
| List accounts | `GET /accounts` | |
| Draft posts | `POST /content/generate` | `{ "topic": "…", "account_id": "…", "count": 3 }` |
| Publish now or schedule | `POST /content/publish` | `{ "account_id": "…", "text": "…", "publish_now": true }` or `"publish_at": "2026-11-01T09:00:00+08:00"`; images with `"media_urls": [ … ]` |
| Add to the queue | `POST /library` | `{ "account_id": "…", "items": [ { "text": "…" } ] }` |
| Scheduled posts | `GET /schedules?account_id=…` | |
| Replies waiting for review | `GET /patrol/cloud/pending?account_id=…` | |
| Insights | `GET /analytics/insights?account_id=…&period=7d` | |
| Events (poll instead of webhooks) | `GET /events?since=<iso>` | |

Responses are `{ "ok": true, "data": … }`; errors are `{ "error": { "code", "message", "request_id" } }`. A `403` with `approval_required` means the account owner has to confirm the action on mindthread.tw; `error.approval.human_url` is the link to send them. Full spec: https://mindthread.tw/api/v1/openapi.json
