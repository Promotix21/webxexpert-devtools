# Aether MCP - VS Code Extension

MCP (Model Context Protocol) server that gives Claude Code access to:
- **Browser Errors** - Console errors and network requests via Console Bridge
- **Code Intelligence** - Symbol navigation, references, and search via Aether Engine

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  VS Code                                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Terminal: claude                               │   │
│  │                                                 │   │
│  │  Claude Code ←──── MCP ────→ Aether MCP Server │   │
│  │                              ├─ Console Bridge  │   │
│  │                              └─ Aether Engine   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Status Bar: [✓ Aether MCP]                            │
└─────────────────────────────────────────────────────────┘
```

## Installation

### From VSIX
```bash
code --install-extension aether-mcp-1.0.0.vsix
```

### From Source
```bash
cd aether-vscode
npm install
npm run package
code --install-extension aether-mcp-1.0.0.vsix
```

## Setup

### 1. Start Console Bridge
The Console Bridge captures browser errors and network requests.

```bash
npx claude-console-bridge
```

Or click the status bar and select "Start Console Bridge".

### 2. Configure Claude Code
Click the **Aether MCP** status bar item and select **"Copy MCP Config"**, then paste into `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "aether-mcp": {
      "command": "node",
      "args": ["/path/to/aether-vscode/src/mcp-server.js"],
      "env": {
        "CONSOLE_BRIDGE_PORT": "9877",
        "WORKSPACE_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### 3. Install Chrome Extension
Install the Chrome Console for Claude extension to capture browser errors.

## Available Tools

Once configured, Claude Code has access to these tools:

### Console Bridge Tools
| Tool | Description |
|------|-------------|
| `get_debug_summary` | Markdown summary of browser errors and network requests |
| `get_browser_errors` | Detailed console errors as JSON |
| `get_network_requests` | Captured network requests (can filter failed only) |
| `clear_debug_data` | Clear all captured data |

### Aether Engine Tools
| Tool | Description |
|------|-------------|
| `list_symbols` | List functions, classes, variables in a file/directory |
| `find_references` | Find all references to a symbol |
| `search_code` | Search code with regex patterns |
| `get_symbol_info` | Get detailed info about a symbol |
| `index_project` | Index project for faster lookups |

## Example Usage in Claude Code

```
> claude

You: Check if there are any browser errors

Claude: I'll check the browser errors using the debug summary.
[Uses get_debug_summary tool]

There are 3 console errors:
1. TypeError: Cannot read property 'map' of undefined (App.jsx:42)
2. Failed to fetch: 404 /api/users (network)
3. Unhandled promise rejection (utils.js:15)
```

```
You: Find all places where the UserService class is used

Claude: I'll search for references to UserService.
[Uses find_references tool]

UserService is referenced in 5 files:
- src/controllers/UserController.ts:12 (import)
- src/controllers/UserController.ts:25 (constructor injection)
- src/services/AuthService.ts:8 (import)
...
```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aether-mcp.consoleBridgePort` | 9877 | HTTP port for Console Bridge |
| `aether-mcp.aetherEnginePath` | (auto) | Path to aether_engine.py |
| `aether-mcp.pythonPath` | python | Python executable |
| `aether-mcp.autoStart` | true | Auto-start on VS Code open |

## Requirements

- Node.js 14+
- Python 3.10-3.12 (for Aether Engine)
- Console Bridge running (`npx claude-console-bridge`)
- Chrome Extension installed (for browser error capture)

## Architecture

```
Browser                    Server                 VS Code Terminal
   │                          │                         │
   │ Chrome Extension         │ Express/NestJS          │ Claude Code
   │         │                │ middleware              │      │
   │         ▼                ▼                         │      │
   │    ┌─────────────────────────────┐                │      │
   │    │     Console Bridge          │                │      │
   │    │     (port 9876 WS)          │◄───────────────┼──────┤
   │    │     (port 9877 HTTP)        │   MCP Server   │      │
   │    └─────────────────────────────┘        │       │      │
   │                                           │       │      │
   │                                           ▼       │      │
   │                               ┌──────────────────┐│      │
   │                               │  Aether Engine   ││      │
   │                               │  (Python AST)    │◄──────┤
   │                               └──────────────────┘│      │
   │                                                   │      │
```

## License

MIT
