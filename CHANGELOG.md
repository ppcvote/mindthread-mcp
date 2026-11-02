# Changelog

## 0.2.1 (2026-11-02)

- After a daily `rate_limit_exceeded`, the bridge stops sending tool calls until `reset_at` (00:00 Asia/Taipei): each call before then would get 429 again and still be logged. It answers them itself with the same error object (`held_locally: true`, `retry_after_seconds` counting down) and prints one line to stderr. `get_playbook`, `list_formulas`, `get_approval` and `disable_this_key` use no daily quota and still go through; `tools/list` and `initialize` are never held.
- Every tool call counts against the key's daily quota, polls included; the hosted `list_events` and `list_pending_replies` descriptions now say so (free plan: 50 calls a day, poll every 30 minutes or slower, or use a webhook).

## 0.2.0 (2026-10-26)

First npm release.

- Renamed the package to `mindthread-mcp` (bin `mindthread-mcp`).
- Rewritten as a zero-dependency stdio bridge to MindThread's hosted MCP server at `https://mindthread.tw/api/mcp`. Every tool, description and permission check now comes from the live server (40+ tools: posts, scheduling, library queue, cloud patrol review, insights, events, approvals, bulk account settings), so the package no longer drifts from the API.
- Discovery works without a key (`initialize`, `tools/list`, `get_playbook`, `list_formulas`); other tools explain how to set `MINDTHREAD_API_KEY` when it is missing or rejected.
- Network failures and non-JSON answers come back as JSON-RPC errors instead of a crash. The full key is never printed.
- Added `server.json` for the official MCP Registry (`io.github.ppcvote/mindthread`, npm package plus the hosted remote) and `glama.json`.
- Setup guides for Claude Code, Claude Desktop, Cursor and VS Code.

## 0.1.0 (2026-03-18)

Unreleased prototype with 14 locally defined tools.
