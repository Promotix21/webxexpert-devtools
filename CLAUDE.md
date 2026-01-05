# WebXExpert Developer Ecosystem - Claude Integration

> **Author:** Rajesh Kumar (WebXExpert)

This workspace contains the Aether developer toolkit for AI-assisted debugging and code intelligence.

**Requirements:** Python 3.10-3.12 (not 3.13), Node.js 14+

> On Windows, use `py -3.12` instead of `python` if Python 3.13 is your default.

## Quick Start

### 1. Start Console Bridge (for browser debugging)
```bash
cd claude-console-bridge && node index.js
# Runs on: WebSocket 9876, HTTP 9877
```

### 2. Index a Project (for code intelligence)
```bash
python aether/aether_engine.py index --project /path/to/project
```

## Aether Engine CLI Reference

Located at: `D:\CRM\Debugging\aether\aether_engine.py`

### Indexing & Symbols
```bash
# Index project
python aether_engine.py index --project .

# List symbols (functions, classes, methods)
python aether_engine.py list_symbols --project .
python aether_engine.py list_symbols --type function --file auth

# Read a specific symbol's code
python aether_engine.py read_symbol handleLogin --project .

# Find all references to a symbol
python aether_engine.py find_references handleLogin --project .

# Get file overview
python aether_engine.py symbols_overview src/auth.ts --project .
```

### Code Modification (dry-run by default)
```bash
# Replace symbol body
python aether_engine.py replace_symbol MyFunc --code "def MyFunc(): pass" --project .
python aether_engine.py replace_symbol MyFunc --code "..." --apply  # Actually apply

# Insert before/after
python aether_engine.py insert_before MyFunc --code "# TODO: refactor" --project .
python aether_engine.py insert_after MyFunc --code "# End of func" --apply

# Rename across codebase
python aether_engine.py rename_symbol oldName newName --project .
python aether_engine.py rename_symbol oldName newName --apply

# Line operations
python aether_engine.py delete_lines src/file.py 10 20 --apply
python aether_engine.py insert_at_line src/file.py 15 --code "new line"
python aether_engine.py replace_lines src/file.py 10 20 --code "replacement"
```

### Memory System (persistent context)
```bash
# Write a memory
python aether_engine.py write_memory "auth_notes" --content "Uses JWT tokens" --project .

# Read a memory
python aether_engine.py read_memory "auth_notes" --project .

# List all memories
python aether_engine.py list_memories --project .

# Delete a memory
python aether_engine.py delete_memory "auth_notes" --project .
```

### Project Analysis
```bash
# Generate project onboarding summary
python aether_engine.py onboard --project .

# Check if project is onboarded
python aether_engine.py check_onboarding --project .

# Search code with regex
python aether_engine.py search "TODO|FIXME" --regex --project .
python aether_engine.py search "processUser" --project .
```

## Console Bridge API

When running, access these endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /summary` | Markdown debug summary |
| `GET /errors` | Browser console errors (JSON) |
| `GET /network` | Network requests (JSON) |
| `POST /clear` | Clear captured data |

```bash
# Quick check for errors
curl http://localhost:9877/summary
```

## MCP Server Integration

### For Claude Code CLI

The MCP server is at: `D:\CRM\Debugging\aether-vscode\src\mcp-server.js`

Add to `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "aether": {
      "command": "node",
      "args": ["D:\\CRM\\Debugging\\aether-vscode\\src\\mcp-server.js"],
      "env": {
        "WORKSPACE_ROOT": "D:\\CRM\\Debugging",
        "CONSOLE_BRIDGE_PORT": "9877",
        "AETHER_ENGINE_PATH": "D:\\CRM\\Debugging\\aether\\aether_engine.py"
      }
    }
  }
}
```

### For Claude Desktop App

Add to Claude Desktop config:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "aether": {
      "command": "node",
      "args": ["D:\\CRM\\Debugging\\aether-vscode\\src\\mcp-server.js"],
      "env": {
        "WORKSPACE_ROOT": "D:\\CRM\\Debugging",
        "CONSOLE_BRIDGE_PORT": "9877",
        "AETHER_ENGINE_PATH": "D:\\CRM\\Debugging\\aether\\aether_engine.py"
      }
    }
  }
}
```

### Available MCP Tools

When MCP is configured, these tools become available:

**Browser Debugging:**
- `get_debug_summary` - Markdown summary of browser errors
- `get_browser_errors` - Console errors as JSON
- `get_network_requests` - Network requests (use `failed_only: true` for errors)
- `clear_debug_data` - Clear captured data

**Code Intelligence:**
- `list_symbols` - List functions/classes in a file
- `find_references` - Find symbol usages
- `search_code` - Regex search across codebase
- `get_symbol_info` - Get symbol details
- `index_project` - Re-index after changes

## Project Structure

```
D:\CRM\Debugging\
├── aether/                    # Core engine (Python)
│   └── aether_engine.py       # Main CLI tool
├── aether-vscode/             # VS Code extension + MCP server
│   └── src/mcp-server.js      # MCP server for Claude
├── claude-console-bridge/     # Browser debug aggregator
│   └── index.js               # HTTP/WebSocket server
├── chrome-console-for-claude/ # Chrome extension
└── aether-ide/                # Electron-based IDE
```

## Typical Workflow

1. **Start debugging session:**
   ```bash
   cd claude-console-bridge && node index.js
   ```

2. **Index your project:**
   ```bash
   python aether/aether_engine.py index --project /path/to/app
   ```

3. **Debug with Claude:**
   - Check `http://localhost:9877/summary` for browser errors
   - Use `find_references` to understand code flow
   - Use `replace_symbol` with `--apply` to make changes

## Supported Languages

Python, JavaScript, TypeScript, TSX, Java, C, C++, Rust, Go, Ruby, PHP, C#, Kotlin, Swift, Scala, HTML, CSS, JSON, YAML, Markdown, and more.
