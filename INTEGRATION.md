# WebXExpert Developer Ecosystem - Integration Guide

> **Author:** Rajesh Kumar (WebXExpert)
> **Version:** 1.1.0
> **Last Updated:** December 2024

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Installation](#installation)
5. [Quick Start](#quick-start)
6. [API Reference](#api-reference)
7. [IDE Integration](#ide-integration)
8. [AI Workflow Integration](#ai-workflow-integration)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The WebXExpert Developer Ecosystem is a complete AI-assisted development toolkit that combines:

- **Runtime Debugging** (Console Bridge + Chrome Extension)
- **Static Code Intelligence** (Aether Engine)
- **AI Integration** (Claude CLI, Gemini, etc.)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WEBXEXPERT DEVELOPER ECOSYSTEM                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐   │
│   │   BROWSER   │    │   SERVER    │    │    CODE EDITOR      │   │
│   │             │    │             │    │                     │   │
│   │ React/Next  │    │ Express     │    │  VS Code / Custom   │   │
│   │ Vue/Angular │    │ NestJS      │    │  IDE                │   │
│   │             │    │ Prisma      │    │                     │   │
│   └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘   │
│          │                  │                      │               │
│          ▼                  ▼                      ▼               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐   │
│   │   Chrome    │    │   Server    │    │      Aether         │   │
│   │  Extension  │    │   Libs      │    │      Engine         │   │
│   │             │    │             │    │                     │   │
│   │ - Errors    │    │ - Express   │    │ - Symbol Index      │   │
│   │ - Network   │    │ - NestJS    │    │ - Code Modify       │   │
│   │ - React     │    │ - Prisma    │    │ - Memory System     │   │
│   └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘   │
│          │                  │                      │               │
│          └────────┬─────────┴──────────────────────┘               │
│                   ▼                                                 │
│          ┌─────────────────────────────────────────┐               │
│          │         CONSOLE BRIDGE SERVER           │               │
│          │                                         │               │
│          │  WebSocket: ws://localhost:9876         │               │
│          │  HTTP API:  http://localhost:9877       │               │
│          │                                         │               │
│          │  Endpoints:                             │               │
│          │  - /summary    (markdown)               │               │
│          │  - /errors     (JSON)                   │               │
│          │  - /network    (JSON)                   │               │
│          │  - /symbols    (from Aether)            │               │
│          │  - /symbol/:id (from Aether)            │               │
│          └────────────────┬────────────────────────┘               │
│                           │                                         │
│                           ▼                                         │
│          ┌─────────────────────────────────────────┐               │
│          │              AI ASSISTANT               │               │
│          │                                         │               │
│          │  Claude CLI / Gemini / GPT / Custom     │               │
│          │                                         │               │
│          │  Gets: Errors + Code Context + Symbols  │               │
│          │  Does: Diagnose + Fix + Refactor        │               │
│          └─────────────────────────────────────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Data Flow

```
1. ERROR OCCURS
   Browser: console.error() / Network 4xx/5xx / React Error
   Server:  Express error / NestJS exception / Prisma failure
                    │
                    ▼
2. CAPTURE
   Chrome Extension captures browser errors
   Server middleware captures backend errors
                    │
                    ▼
3. AGGREGATE
   Console Bridge Server receives all errors via:
   - WebSocket (real-time from Chrome Extension)
   - HTTP POST (from server middleware)
                    │
                    ▼
4. ENRICH (with Aether)
   When AI requests code context:
   - Bridge calls Aether engine
   - Gets symbol definitions
   - Adds code snippets
                    │
                    ▼
5. DELIVER
   AI assistant fetches:
   - /summary → Human-readable debug info
   - /symbols → Code structure
   - /symbol/:id → Specific function code
                    │
                    ▼
6. FIX
   AI generates fix → User approves → Applied
```

---

## Components

### 1. Chrome Extension (`chrome-console-for-claude`)

**Purpose:** Captures client-side debugging data

**Features:**
- Console errors and warnings
- Network request/response capture
- React/Next.js specific errors (hydration, hooks, error boundaries)
- Next.js error overlay detection
- Real-time WebSocket streaming

**Files:**
```
chrome-console-for-claude/
├── manifest.json       # Extension config
├── background.js       # Service worker (network capture)
├── content.js          # Content script (error capture)
├── inject.js           # Early error capture
├── popup.html/js       # Extension popup UI
└── icons/              # Extension icons
```

### 2. Console Bridge Server (`claude-console-bridge`)

**Purpose:** Aggregates errors and provides API for AI

**Features:**
- WebSocket server (port 9876)
- HTTP API (port 9877)
- Express/NestJS/Prisma middleware
- Error deduplication
- Markdown formatting

**Files:**
```
claude-console-bridge/
├── index.js            # Main server
├── lib/
│   ├── client.js       # HTTP client for error sending
│   ├── express.js      # Express middleware
│   ├── nestjs.js       # NestJS interceptors
│   └── prisma.js       # Prisma middleware
└── package.json
```

### 3. Aether Engine (`aether`)

**Purpose:** AST-based code intelligence

**Features:**
- Symbol indexing (30+ languages)
- Reference finding
- Code modification with diff preview
- Insert before/after symbols
- Rename across codebase
- Memory system (persistent context)
- Project onboarding

**Files:**
```
aether/
├── aether_engine.py    # Main engine (2,200+ lines)
├── Aether.ps1          # PowerShell wrapper
├── aether.sh           # Bash wrapper
├── setup.py            # pip install
├── pyproject.toml      # Modern Python config
├── requirements.txt    # Dependencies
└── scripts/
    ├── build_languages.ps1
    └── build_languages.sh
```

### 4. Aether IDE (`aether-ide`)

**Purpose:** Native desktop code editor with Aether integration

**Features:**
- Monaco Editor (same as VS Code)
- Aether-powered symbol navigation
- File explorer with folder browsing
- Symbol search and filtering
- Cross-platform (Windows, Mac, Linux)

**Files:**
```
aether-ide/
├── package.json           # Electron config
├── src/
│   ├── main/
│   │   └── main.js        # Electron main process
│   └── renderer/
│       ├── index.html     # UI layout
│       ├── styles.css     # Dark theme styling
│       └── renderer.js    # Editor logic
└── assets/                # Icons
```

**Quick Start:**
```bash
cd aether-ide
npm install
npm start
```

---

## Installation

### Prerequisites

| Component | Requirement |
|-----------|-------------|
| Node.js | v14.0.0+ |
| Python | 3.10 - 3.12 (not 3.13) |
| Chrome | Latest |
| pip | Latest |

### Step 1: Install Aether Engine

```bash
# Clone/download the aether directory
cd aether

# Install dependencies
pip install -r requirements.txt

# OR install as package
pip install .

# Verify installation
aether --help
# OR
python aether_engine.py --help
```

### Step 2: Install Console Bridge

```bash
cd claude-console-bridge

# Install dependencies
npm install

# Start server
npm start
# OR
node index.js
```

### Step 3: Install Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `chrome-console-for-claude` directory
5. Pin the extension to toolbar

### Step 4: Configure Your Backend

**Express:**
```javascript
const { errorHandler, requestLogger, setupProcessHandlers } = require('claude-console-bridge/express');

app.use(requestLogger());
app.use(errorHandler());
setupProcessHandlers();
```

**NestJS:**
```typescript
import { ClaudeConsoleInterceptor, ClaudeConsoleExceptionFilter } from 'claude-console-bridge/nestjs';

app.useGlobalInterceptors(new ClaudeConsoleInterceptor());
app.useGlobalFilters(new ClaudeConsoleExceptionFilter());
```

**Prisma:**
```javascript
const { createPrismaMiddleware } = require('claude-console-bridge/prisma');

prisma.$use(createPrismaMiddleware());
```

---

## Quick Start

### 1. Start the Bridge Server

```bash
# Terminal 1
cd claude-console-bridge
node index.js
# Output: WebSocket server on 9876, HTTP server on 9877
```

### 2. Start Your Application

```bash
# Terminal 2
cd your-app
npm run dev
```

### 3. Open Browser and Trigger Errors

Navigate to your app. The Chrome Extension will capture errors.

### 4. View Debug Summary

```bash
# In another terminal
curl http://localhost:9877/summary

# Or in browser
open http://localhost:9877/summary
```

### 5. Use with Claude CLI

```bash
# Claude CLI can fetch context
claude "Fix the error at http://localhost:9877/summary"
```

### 6. Use Aether for Code Context

```bash
# Index your project
python aether_engine.py index --project /path/to/your/app

# List all functions
python aether_engine.py list_symbols --type function

# Read specific symbol
python aether_engine.py read_symbol handleLogin

# Find all references
python aether_engine.py find_references handleLogin
```

---

## API Reference

### Console Bridge HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/summary` | GET | Markdown formatted debug summary |
| `/errors` | GET | JSON array of captured errors |
| `/network` | GET | JSON array of network events |
| `/data` | GET | All captured data |
| `/clear` | POST | Clear all captured data |
| `/ingest` | POST | Submit error from server |

**Example: Get Summary**
```bash
curl http://localhost:9877/summary
```

**Example: Submit Error**
```bash
curl -X POST http://localhost:9877/ingest \
  -H "Content-Type: application/json" \
  -d '{"type":"error","message":"Test error","stack":"..."}'
```

### Aether CLI API

```bash
# Indexing
aether index --project /path

# Symbol Operations
aether list_symbols [--type TYPE] [--file FILE] [--name NAME]
aether read_symbol SYMBOL_ID
aether symbols_overview FILE_PATH
aether find_references SYMBOL_NAME

# Modification (dry-run by default)
aether replace_symbol SYMBOL --code "new code" [--apply]
aether insert_before SYMBOL --code "code" [--apply]
aether insert_after SYMBOL --code "code" [--apply]
aether rename_symbol OLD_NAME NEW_NAME [--apply]
aether delete_lines FILE START END [--apply]
aether insert_at_line FILE LINE --code "code" [--apply]
aether replace_lines FILE START END --code "code" [--apply]

# Memory System
aether write_memory NAME --content "content" [--tags "tag1,tag2"]
aether read_memory NAME
aether list_memories [TAG]
aether delete_memory NAME

# Project
aether onboard [--force]
aether check_onboarding

# Search
aether search "pattern" [--no-regex] [--ignore-case]
```

### Aether Python API

```python
from aether_engine import AetherEngine

# Initialize
engine = AetherEngine("/path/to/project")

# Index
result = engine.index_project()
print(f"Found {result['total_symbols']} symbols")

# List symbols
symbols = engine.list_symbols(filter_type="function")

# Read symbol
code = engine.read_symbol("MyClass::myMethod")
print(code['code'])

# Find references
refs = engine.find_references("handleLogin")

# Replace symbol (dry run)
result = engine.replace_symbol("myFunction", "def myFunction(): pass")
print(result['diff'])

# Apply changes
result = engine.replace_symbol("myFunction", "def myFunction(): pass", dry_run=False)

# Memory
engine.write_memory("auth_notes", "Uses JWT tokens", tags=["auth", "security"])
memory = engine.read_memory("auth_notes")

# Onboard project
info = engine.onboard()
print(f"Languages: {info['project_info']['languages']}")
```

---

## IDE Integration

### VS Code Integration

**Method 1: Tasks**

Create `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Aether: List Symbols",
      "type": "shell",
      "command": "python",
      "args": ["${workspaceFolder}/../aether/aether_engine.py", "list_symbols", "--project", "${workspaceFolder}"],
      "problemMatcher": []
    },
    {
      "label": "Aether: Index Project",
      "type": "shell",
      "command": "python",
      "args": ["${workspaceFolder}/../aether/aether_engine.py", "index", "--project", "${workspaceFolder}"],
      "problemMatcher": []
    }
  ]
}
```

**Method 2: Extension (Custom)**

See [Building VS Code Extensions](#building-vs-code-extensions) section.

### JetBrains Integration

Create External Tool:
1. Settings → Tools → External Tools
2. Add new tool:
   - Name: `Aether List Symbols`
   - Program: `python`
   - Arguments: `/path/to/aether_engine.py list_symbols --project $ProjectFileDir$`
   - Working Directory: `$ProjectFileDir$`

### Custom IDE Integration

Your custom IDE should:

1. **Spawn Aether as subprocess**
```javascript
const { spawn } = require('child_process');

function runAether(action, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [
      '/path/to/aether_engine.py',
      action,
      '--project', projectRoot,
      ...args
    ]);

    let output = '';
    proc.stdout.on('data', (data) => output += data);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(JSON.parse(output));
      } else {
        reject(new Error(`Aether failed with code ${code}`));
      }
    });
  });
}

// Usage
const symbols = await runAether('list_symbols', ['--type', 'function']);
```

2. **Connect to Console Bridge**
```javascript
const WebSocket = require('ws');

// Real-time errors
const ws = new WebSocket('ws://localhost:9876');
ws.on('message', (data) => {
  const error = JSON.parse(data);
  showErrorInIDE(error);
});

// Or poll HTTP
async function getErrors() {
  const res = await fetch('http://localhost:9877/errors');
  return res.json();
}
```

3. **Display Symbol Tree**
```javascript
async function buildSymbolTree() {
  const result = await runAether('list_symbols');

  // Group by file
  const byFile = {};
  for (const symbol of result.symbols) {
    if (!byFile[symbol.file]) byFile[symbol.file] = [];
    byFile[symbol.file].push(symbol);
  }

  return byFile;
}
```

4. **Implement Go-to-Definition**
```javascript
async function goToDefinition(symbolName) {
  const result = await runAether('read_symbol', [symbolName]);
  if (result.success) {
    openFile(result.symbol.file, result.symbol.start_line);
  }
}
```

5. **Implement Find References**
```javascript
async function findReferences(symbolName) {
  const result = await runAether('find_references', [symbolName]);
  if (result.success) {
    showReferencesPanel(result.references);
  }
}
```

6. **Implement Rename Refactoring**
```javascript
async function renameSymbol(oldName, newName) {
  // Preview
  const preview = await runAether('rename_symbol', [oldName, newName]);

  if (await showConfirmDialog(preview.changes)) {
    // Apply
    await runAether('rename_symbol', [oldName, newName, '--apply']);
    refreshAllFiles();
  }
}
```

---

## AI Workflow Integration

### Claude CLI

```bash
# Automatic context fetching
claude "Debug the errors from my app" \
  --context "$(curl -s http://localhost:9877/summary)"

# With code context
claude "Fix the handleLogin function" \
  --context "$(python aether_engine.py read_symbol handleLogin --project .)"
```

### Custom AI Pipeline

```python
import subprocess
import json
import requests

def get_debug_context():
    """Get runtime errors from Console Bridge"""
    response = requests.get('http://localhost:9877/summary')
    return response.text

def get_code_context(symbol_name, project_path):
    """Get code from Aether"""
    result = subprocess.run([
        'python', 'aether_engine.py',
        'read_symbol', symbol_name,
        '--project', project_path
    ], capture_output=True, text=True)
    return json.loads(result.stdout)

def build_ai_prompt(error_summary, code_context):
    """Build prompt for AI"""
    return f"""
## Error Summary
{error_summary}

## Relevant Code
```{code_context['symbol']['language']}
{code_context['code']}
```

Please analyze the error and provide a fix.
"""

# Usage
errors = get_debug_context()
code = get_code_context('handleLogin', '/path/to/project')
prompt = build_ai_prompt(errors, code)

# Send to your AI of choice
response = call_ai_api(prompt)
```

### MCP Server Integration

Create Aether as an MCP server for Claude Desktop:

```json
{
  "mcpServers": {
    "aether": {
      "command": "python",
      "args": ["/path/to/aether_mcp_server.py"],
      "env": {
        "PROJECT_PATH": "/path/to/your/project"
      }
    }
  }
}
```

---

## Troubleshooting

### Common Issues

**1. tree-sitter-languages not found**
```bash
# Use Python 3.10-3.12
py -3.12 -m pip install tree-sitter-languages
```

**2. Parser error: `__init__() takes exactly 1 argument`**
```bash
# Fix tree-sitter version
pip install "tree-sitter>=0.21.0,<0.22.0" --force-reinstall
```

**3. Chrome Extension not connecting**
- Check Console Bridge is running on port 9876
- Check browser console for WebSocket errors
- Verify extension permissions

**4. No symbols found**
- Check file extensions are supported
- Check files are not in IGNORE_DIRS
- Run with `--verbose` flag

**5. UTF-8 encoding issues (Windows)**
```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001
$env:PYTHONUTF8 = "1"
```

### Debug Mode

```bash
# Aether verbose mode
python aether_engine.py list_symbols --project . --verbose

# Console Bridge debug
DEBUG=* node index.js
```

### Getting Help

- GitHub Issues: [Report bugs](https://github.com/webxexpert/aether/issues)
- Documentation: This file
- Author: WebXExpert

---

## License

MIT License - Rajesh Kumar (WebXExpert)

---

## Changelog

### v1.1.0 (December 2024)
- Added Aether IDE - Electron-based code editor
- Updated author branding to Rajesh Kumar (WebXExpert)
- Improved documentation

### v1.0.0 (December 2024)
- Initial release
- Console Bridge with Express/NestJS/Prisma support
- Chrome Extension for error capture
- Aether Engine with full Serena feature parity
- Cross-platform support (Windows/Linux/WSL)
