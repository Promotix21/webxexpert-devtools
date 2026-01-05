# claude-console-bridge

Bridge server that connects Chrome browser console/network capture to Claude Code. Includes an **MCP server** for direct Claude Code integration.

**New in v3.1.0**: MCP (Model Context Protocol) server for native Claude Code tool access!

## Installation

```bash
# Global install (recommended)
npm install -g claude-console-bridge

# Or use npx (no install needed)
npx claude-console-bridge
```

## Usage

### 1. Start the bridge in your project folder

```bash
cd your-project
claude-console-bridge
# or
npx claude-console-bridge
# or short alias
ccb
```

### 2. Install Chrome Extension

Get the Chrome extension from the release and load it in `chrome://extensions` (Developer mode → Load unpacked).

### 3. Use with Claude CLI

The bridge saves data to `.claude-console.json` in your current directory. Just tell Claude:

```
"Read .claude-console.json and help me fix the browser errors"
```

Or:

```
"Check http://localhost:9877/summary for browser issues"
```

## How It Works

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Chrome    │ ──────────────────→│  Bridge Server  │
│  Extension  │    port 9876       │  (this package) │
└─────────────┘                    └────────┬────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
           .claude-console.json    HTTP API :9877          Terminal Output
           (in your project)       /summary, /errors       (real-time logs)
                    │               /network, /clear
                    │                       │
                    └───────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │     Claude CLI      │
                    │  "fix these errors" │
                    └─────────────────────┘
```

## API Endpoints

When running, these are available at `http://localhost:9877`:

| Endpoint | Description |
|----------|-------------|
| `GET /summary` | Markdown summary (best for Claude) |
| `GET /errors` | Console errors as JSON |
| `GET /network` | Network requests as JSON |
| `GET /data` | All captured data |
| `GET /clear` | Clear all data |

## MCP Server (Claude Code Integration)

The MCP server gives Claude Code direct tool access to browser errors, network requests, and Aether Engine code intelligence.

### Setup

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "aether": {
      "command": "npx",
      "args": ["ccb-mcp"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/project",
        "CONSOLE_BRIDGE_PORT": "9877"
      }
    }
  }
}
```

Or run standalone:
```bash
ccb-mcp
```

### Available Tools

Once configured, Claude Code has access to:

| Tool | Description |
|------|-------------|
| `get_debug_summary` | Markdown summary of browser errors |
| `get_browser_errors` | Console errors as JSON |
| `get_network_requests` | Network requests (can filter failed only) |
| `clear_debug_data` | Clear all captured data |
| `list_symbols` | List functions/classes in a file |
| `find_references` | Find all references to a symbol |
| `search_code` | Search code with regex |
| `get_symbol_info` | Get symbol details |
| `index_project` | Index project for faster lookups |

### Example

```
> claude
You: Check if there are any browser errors
Claude: [Uses get_debug_summary tool]
Found 2 errors:
1. TypeError: Cannot read property 'map' of undefined (App.jsx:42)
2. 404 /api/users
```

## Custom Port

```bash
claude-console-bridge 8888
# WebSocket on 8888, HTTP on 8889
```

Then update the port in the Chrome extension settings.

## Example Output

When browser errors occur, you'll see real-time output:

```
10:30:45 ✖ [ERROR] TypeError: Cannot read property 'map' of undefined
10:30:46 → POST /api/users
10:30:46 ✖ 500 /api/users
     └─ {"error": "Internal server error"}
10:30:47 ✓ 200 /api/dashboard
```

## With Claude CLI

```bash
# Terminal 1: Start your Next.js app
npm run dev

# Terminal 2: Start the bridge
npx claude-console-bridge

# Terminal 3: Use Claude CLI
claude

> Read .claude-console.json and fix the React hydration error
```

Claude will see the captured errors and help you fix them!

## License

MIT
