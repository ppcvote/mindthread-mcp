# Changelog

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
