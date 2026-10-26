# MindThread MCP: the Threads scheduler built for AI agents

Let Claude, Cursor or any MCP client write, schedule and publish Threads posts, review drafted replies and read insights for your accounts, through Meta's official Threads API. 40+ tools, a free sandbox key, and permission controls so the agent asks before it posts.

```bash
claude mcp add --transport http mindthread https://mindthread.tw/api/mcp --header "Authorization: Bearer mt_live_your_key"
```

[繁體中文說明在下方](#繁體中文)

## What your agent can do

- **Write**: generate 1 to 5 drafts in the account's voice (persona, brand material, content formulas), or threads of 2 to 10 parts.
- **Schedule and publish**: text, single image, carousel (2 to 10 images) or video, now or at an exact time; or drop posts into a queue that publishes at the account's own time slots.
- **Stay on-brand in code**: content rules (length, banned phrases, no hashtags, only numbers from your fact list) are enforced by the server, not just suggested in a prompt.
- **Reply where it matters**: cloud patrol searches Threads for your keywords and drafts replies; your agent lists the drafts and approves or rejects each one.
- **Measure**: views, likes, replies and followers per account, plus the results of patrol replies.
- **Stay in control**: every key has per-permission `allow`, `ask` or `deny`. With `ask`, the post waits until you confirm it on mindthread.tw, and the agent gets a link to hand you instead of posting.

## Three-minute setup

**1. Get an API key.** Sign up at [mindthread.tw](https://mindthread.tw), connect a Threads account, then open **Settings → API keys** and create a key.
Start with a **test key** (`mt_test_…`): reads show your real data, writes are simulated and nothing reaches Threads. Switch to a live key (`mt_live_…`) when you are ready.
Every plan includes API access (October 2026: free plan 50 calls a day per live key; test keys share a 500-a-day sandbox). Current limits: [mindthread.tw/developers](https://mindthread.tw/developers).

**2. Add MindThread to your client** (pick yours below).

**3. Ask for your first scheduled post:**

> List my MindThread accounts. Then write a short post about why I started my business, show it to me, and schedule it on my account for tomorrow at 9:00 Taipei time.

The agent calls `list_accounts`, `generate_posts`, then `publish` with `publish_at`. Check the result with "show my scheduled posts" (`list_schedules`).

## Client setup

There are two ways to connect, and both reach the same server:

- **Remote (recommended)**: point the client at `https://mindthread.tw/api/mcp`. Nothing to install.
- **Local stdio**: run this package with `npx -y mindthread-mcp`. Use it for clients that only start servers with a command. It forwards every message to the same endpoint, so the tools are always identical.

### Claude Code

```bash
# Remote, with an API key
claude mcp add --transport http mindthread https://mindthread.tw/api/mcp --header "Authorization: Bearer mt_live_your_key"

# Remote, signing in with your MindThread account instead of a key (run /mcp in Claude Code to log in)
claude mcp add --transport http mindthread https://mindthread.tw/api/mcp

# Local stdio
claude mcp add mindthread --env MINDTHREAD_API_KEY=mt_live_your_key -- npx -y mindthread-mcp
```

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "mindthread": {
      "command": "npx",
      "args": ["-y", "mindthread-mcp"],
      "env": { "MINDTHREAD_API_KEY": "mt_live_your_key" }
    }
  }
}
```

On Windows, if Claude cannot find `npx`, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "mindthread-mcp"]`.
Without editing files: **Settings → Connectors → Add custom connector**, URL `https://mindthread.tw/api/mcp`, then sign in with your MindThread account (on Claude plans that offer custom connectors).

### Cursor

`~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "mindthread": {
      "url": "https://mindthread.tw/api/mcp",
      "headers": { "Authorization": "Bearer mt_live_your_key" }
    }
  }
}
```

Or the stdio form: `"command": "npx", "args": ["-y", "mindthread-mcp"], "env": { "MINDTHREAD_API_KEY": "mt_live_your_key" }`.

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json`, which asks for the key once and stores it securely:

```json
{
  "inputs": [
    { "type": "promptString", "id": "mindthread-key", "description": "MindThread API key", "password": true }
  ],
  "servers": {
    "mindthread": {
      "type": "http",
      "url": "https://mindthread.tw/api/mcp",
      "headers": { "Authorization": "Bearer ${input:mindthread-key}" }
    }
  }
}
```

### Any other MCP client

- Streamable HTTP: `https://mindthread.tw/api/mcp`, header `Authorization: Bearer <key>` (also accepted as `X-API-Key`).
- stdio: command `npx`, args `-y mindthread-mcp`, env `MINDTHREAD_API_KEY`.

Without a key, `initialize`, `tools/list`, `get_playbook` and `list_formulas` still work, so you can look around first.

## Example prompts

- "What can MindThread do? Read the playbook first." (`get_playbook`)
- "Write 3 posts about saving for a first home in @mybrand's voice. Don't post anything yet." (`generate_posts`)
- "Queue posts 1 and 3; schedule post 2 for Friday 20:00." (`add_library`, `publish`)
- "Any drafted replies waiting for me? Show them one by one." (`list_pending_replies`, `approve_pending_reply`, `reject_pending_reply`)
- "How did @mybrand do in the last 7 days compared with the 7 days before?" (`analytics_insights`)
- "Set cloud patrol keywords to 'first home', 'mortgage', 'rent vs buy', at most 10 replies a day, and hold every reply for my review." (`set_cloud_patrol`)

## Tools

The set any client sees before signing in, generated from the live server with `npm run tools-table`. The server is the source of truth: when it adds a tool, this package exposes it without an update.

<!-- TOOLS:START -->
| Tool | Title | Kind | What it does |
|------|-------|------|--------------|
| `get_me` | My plan and key | read | Returns the current plan, this connection's identity and permissions (each permission is allow, ask or deny), remaining daily calls in this … |
| `list_accounts` | List connected accounts | read | Lists the Threads accounts connected to this MindThread member, with the id to pass as account_id to every other tool. |
| `get_material` | Get brand material | read | Returns the account's material digest (who the brand is, what it sells, claims, experiences, FAQ, sourced numbers, voice) that every … |
| `build_material` | Build brand material | write | Builds or rebuilds the account's material digest from up to 8 https pages of the brand's own website, optional notes with real cases and … |
| `get_account_settings` | Get account settings | read | Returns one account's persona, schedule_times, review_before_publish, auto_reply_enabled, auto_thread, content_rules, and the guardrails … |
| `update_account_settings` | Update account settings | write | Changes an account's persona (up to 4,000 characters), schedule_times (comma-separated HH:MM in the account time zone, up to 8), … |
| `list_guardrail_changes` | Guardrail change history | read | Lists an account's guardrail revisions, newest first (limit 1 to 50, default 20; before for the next page). |
| `list_account_settings` | List account settings (bulk) | read | Lists every connected Threads account of this member with the settings of the MindThread bulk settings sheet (run mode, auto-posting, review … |
| `preview_account_settings` | Preview bulk settings changes | read | Shows what a batch of settings changes would do and writes nothing: for each account and cell the current value and the new value, warnings … |
| `apply_account_settings` | Apply bulk settings changes | write | Writes a batch of settings changes to up to 100 accounts, each account in its own transaction, and returns a per-row result (ok, unchanged, … |
| `revert_account_settings_batch` | Undo a bulk settings batch | write | Restores the values that one batch changed, within 24 hours of the batch. |
| `get_account_settings_batch` | Get a bulk settings batch | read | Returns one batch by batch_id: when it was sent and from where (website, API or MCP), counts, whether it can still be reverted, and each … |
| `generate_posts` | Generate post drafts | write | Generates 1 to 5 post drafts about a topic using a content formula (auto, or an id from list_formulas), the account persona and material, … |
| `publish` | Publish or schedule a post | write | Publishes a post to Threads now (publish_now:true) or at publish_at (ISO 8601 with offset). |
| `schedule_text` | Schedule a text post | write | Schedules an existing text (up to 500 characters) at publish_at, or at the next best slot with auto_optimize_time:true (the two are mutually … |
| `list_schedules` | List scheduled posts | read | Lists scheduled posts, optionally filtered by account_id, with status, publish_at, and held_reason when a post was held (for example … |
| `cancel_schedule` | Cancel a scheduled post | write | Cancels a scheduled post by id. |
| `list_library` | List library items | read | Lists an account's library items by status (queued, draft, published, failed; limit up to 200). |
| `add_library` | Add library items | write | Adds up to 20 items (text, optional public https images) to an account's library as queued (default; they publish automatically at … |
| `delete_library_item` | Delete a library item | write | Permanently deletes one queued, draft or archived library item by id. |
| `approve_library_item` | Approve a draft into the queue | write | Moves one draft into the publishing queue by id. |
| `update_library_item` | Update a library item | write | Changes one library item by id: status (archived, draft, queued), text (checked against content_rules), or its place in the queue (position … |
| `get_cloud_patrol` | Get cloud patrol settings | read | Returns an account's cloud patrol configuration and status: keywords, daily cap, replies sent today, review_before_reply, last scan time. |
| `set_cloud_patrol` | Set cloud patrol | write | Creates or updates an account's cloud patrol: keywords (1 to 10; a "#tag" entry searches a topic tag), reply persona, daily_cap (1 to 50 on … |
| `cloud_patrol_log` | Cloud patrol reply log | read | Lists replies sent by cloud patrol for an account in the last 1 to 7 days, with the target post and the reply text. |
| `cloud_patrol_stats` | Cloud patrol results | read | Returns views and likes earned by cloud patrol replies for an account over 1 to 14 days, with the top replies. |
| `list_pending_replies` | List drafted replies awaiting review | read | Lists cloud patrol reply drafts for an account by status (pending by default; also sent, rejected, expired). |
| `approve_pending_reply` | Send a drafted reply | write | Approves one drafted cloud patrol reply by id and sends it to Threads now, optionally with an edited reply text that passes the same quality … |
| `reject_pending_reply` | Reject a drafted reply | write | Rejects one drafted cloud patrol reply by id with an optional note. |
| `list_events` | List recent events | read | Returns the member's event feed for the last 7 days, newest first (limit 1 to 200): post.published, post.failed, reply.sent, patrol.reply, … |
| `analytics_insights` | Account insights | read | Returns views, likes, replies and followers for one account over a period (7d, 30d; default 30d). |
| `list_formulas` | List content formulas | read | Lists the content formulas that generate_posts accepts, with id and a short description of each. |
| `get_playbook` | Operating playbook | read | Returns the operating playbook for running an account through this server: the daily loop, how confirmation requests work, quotas, and the … |
| `connect_account_link` | Get a link to connect a new account | write | Returns a Threads OAuth link for the user to open in a browser to connect a new Threads account to this member. |
| `disable_this_key` | Disable this connection | write | Permanently disables the key or connection making this call. |
| `get_my_usage` | My usage and call log | read | Returns this connection's own usage for the last 1 to 30 days (days=1 is today since 00:00 Asia/Taipei): summary (calls, units, errors, … |
| `get_approval` | Check a confirmation request | read | Returns one confirmation request created by this connection, by id (apr_...): status (pending, approved, executed, failed, denied, expired, … |
| `bulk_archive_library` | Archive library items in bulk | write | Archives up to 50 library items by id in one call. |
| `bulk_delete_library` | Delete library items in bulk | write | Permanently deletes up to 50 queued, draft or archived library items by id in one call. |
| `bulk_queue_library` | Queue library items in bulk | write | Moves up to 50 drafts into the publishing queue by id in one call; they publish automatically at the account's schedule_times. |
<!-- TOOLS:END -->

## Safety and control

- **Permissions per key.** Each permission (read, write drafts, schedule, publish now, send replies, turn cloud patrol on, connect accounts, loosen guardrails, webhooks) is `allow`, `ask` or `deny`, set in Settings → API keys. `ask` means the agent receives `approval_required` with a link for you; the action runs only after you confirm on mindthread.tw.
- **Things only you do on the website.** Undoing a guardrail change is always yours. Turning cloud patrol on is never granted to an OAuth connection (Claude, ChatGPT), and an API key needs that permission set explicitly.
- **Content rules run in code.** `enforce: "block"` makes the server refuse a post that breaks the rules, whatever the model wrote.
- **Kill switch.** `disable_this_key` permanently disables the key in use. You can also revoke keys and connections in Settings.
- **Official API only.** Posting and replies go through Meta's official Threads API. MindThread never asks for your Threads password.
- **Your key stays local.** In stdio mode the key is read from the `MINDTHREAD_API_KEY` environment variable and sent only to `mindthread.tw`. It is never printed (logs show `mt_live_…abcd`).

## Configuration

| Variable | Required | Meaning |
|----------|----------|---------|
| `MINDTHREAD_API_KEY` | for any tool that touches your accounts | `mt_live_…` or `mt_test_…` |
| `MINDTHREAD_MCP_URL` | no | Endpoint override, default `https://mindthread.tw/api/mcp` |

Requires Node.js 18.17 or newer. No runtime dependencies.

## Troubleshooting

- **"MINDTHREAD_API_KEY is not set"**: add the key to the `env` block of this server in your client config, then restart the client.
- **"MindThread rejected the key"**: the key is wrong, revoked or disabled. Create a new one in Settings → API keys.
- **`approval_required`**: working as intended. Open the link the agent shows you, confirm, and the post goes out.
- **`insufficient_scope`**: that permission is set to `deny` for this key. The error's `fix` field names the setting to change.
- **`rate_limit_exceeded`**: daily or per-minute limit reached; the error says when it resets.
- Logs go to stderr (Claude Desktop: Settings → Developer → Open Logs Folder). stdout carries only MCP messages.

## Also available

- **CLI** for scripts and agents that prefer shell commands: [mindthread-cli](https://github.com/ppcvote/mindthread-cli) (`npx mindthread-cli`).
- **REST API**: OpenAPI 3.1 at [mindthread.tw/api/v1/openapi.json](https://mindthread.tw/api/v1/openapi.json), docs at [mindthread.tw/developers](https://mindthread.tw/developers), agent guide at [mindthread.tw/llms.txt](https://mindthread.tw/llms.txt).

## 繁體中文

MindThread 是給 AI agent 用的 Threads 排程器。接上之後，Claude、Cursor 或任何支援 MCP 的工具，都能替你的 Threads 帳號寫文、排程、發文（文字、單圖、輪播、影片）、審核雲端海巡的回覆草稿、看觀看與互動數據。全程走 Meta 官方 Threads API，不需要你的 Threads 密碼。

三分鐘上手：

1. 到 [mindthread.tw](https://mindthread.tw) 註冊並連接 Threads 帳號，在「設定 → API 金鑰」建立金鑰。建議先用測試金鑰（`mt_test_` 開頭）：讀取的是真資料，寫入只模擬、不會發到 Threads。
2. 把 MindThread 加進你的工具，例如 Claude Code：
   ```bash
   claude mcp add --transport http mindthread https://mindthread.tw/api/mcp --header "Authorization: Bearer mt_live_你的金鑰"
   ```
   Claude Desktop、Cursor、VS Code 的設定見上方 [Client setup](#client-setup)。
3. 對 AI 說：「列出我的 MindThread 帳號，幫我寫一篇介紹我為什麼創業的短文，給我看過之後，排在明天早上 9 點發。」

你保有控制權：每把金鑰的每項權限都能設成「允許」「先問我」「拒絕」。設成「先問我」時，AI 會拿到一個確認連結交給你，你在 mindthread.tw 按下確認才會發出。字數、禁用詞、只能用你列的數字這些內容規則，由伺服器以程式檢查，可以設成直接擋下。

## License

MIT © Ultra Lab
