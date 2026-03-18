# MindThread MCP Server

MCP server that connects Claude/GPT to [MindThread](https://mindthread.tw) — the AI-powered Threads automation platform.

## Setup

### 1. Get your API key
Go to https://mindthread.tw/settings and create an API key.

### 2. Install
```bash
npm install -g @ultralab/mindthread-mcp
```

Or run from source:
```bash
git clone https://github.com/anthropics/mindthread-mcp.git
cd mindthread-mcp
npm install && npm run build
```

### 3. Configure Claude Code
Add to `~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mindthread": {
      "command": "npx",
      "args": ["-y", "@ultralab/mindthread-mcp"],
      "env": {
        "MINDTHREAD_API_KEY": "mt_live_your_key_here"
      }
    }
  }
}
```

Or for local development:
```json
{
  "mcpServers": {
    "mindthread": {
      "command": "node",
      "args": ["C:/Users/User/mindthread-mcp/dist/index.js"],
      "env": {
        "MINDTHREAD_API_KEY": "mt_live_your_key_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `mindthread_list_accounts` | List connected Threads accounts with stats |
| `mindthread_generate` | Generate AI content with formulas |
| `mindthread_schedule` | Schedule a pre-written post |
| `mindthread_generate_and_schedule` | Generate + schedule/publish in one call |
| `mindthread_analytics` | Get engagement insights and suggestions |
| `mindthread_list_formulas` | List available content formulas |

## Example Prompts

```
"List my Threads accounts"
"Generate a controversial post about AI replacing developers"
"Schedule a post about Taiwan tech scene for tomorrow 9am on @myaccount"
"What are my best performing formulas this week?"
"Generate and publish a curiosity-style post about remote work"
```

## License
MIT
