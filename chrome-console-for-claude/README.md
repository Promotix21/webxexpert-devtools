# Console & Network for Claude CLI

A Chrome extension that captures console errors and network requests from React/Next.js apps, with VS Code integration for Claude CLI.

## Features

- 🔴 **Console Capture**: Catches `console.error`, `console.warn`, unhandled promise rejections
- 🌐 **Network Capture**: Records all fetch/XHR requests and responses  
- 🎯 **React/Next.js Optimized**: Detects hydration errors, hook errors, Next.js specific issues
- 🧹 **Auto-Clean**: Removes webpack noise, minified junk, long hashes from stack traces
- 🔗 **VS Code Bridge**: Real-time connection to Claude CLI via WebSocket
- 📋 **Copy for Claude**: One-click export in Claude-friendly markdown format

## Installation

### 1. Install Chrome Extension

1. Download and unzip the extension
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `chrome-console-for-claude` folder

### 2. Install Bridge Server (for Claude CLI integration)

Run this in your project folder where Claude CLI is running:

```bash
npx claude-console-bridge
```

Or install globally:

```bash
npm install -g claude-console-bridge
claude-console-bridge
# or short alias: ccb
```

## Usage

### Basic Usage (Copy/Paste)

1. Open your React/Next.js app in Chrome
2. Click the extension icon
3. Click **▶ Start Capture** to capture network requests
4. Trigger errors in your app
5. Click **📋 Copy** to copy formatted output
6. Paste into Claude CLI or Claude.ai

### VS Code / Claude CLI Integration (Real-time)

1. In your project folder, start the bridge:

```bash
npx claude-console-bridge
```

2. Open your app in Chrome - the extension auto-connects

3. Errors are saved to `.claude-console.json` in your project folder

4. Tell Claude CLI:
   - "Read .claude-console.json and fix the errors"
   - "Check http://localhost:9877/summary for browser issues"

### HTTP API Endpoints

When the bridge is running at `http://localhost:9877`:

| Endpoint | Description |
|----------|-------------|
| `GET /summary` | Markdown summary (best for Claude) |
| `GET /errors` | Console errors as JSON |
| `GET /network` | Network requests as JSON |
| `GET /data` | All captured data |
| `GET /clear` | Clear all data |

## Example Output (Claude Format)

```markdown
## Browser Debug Data

**Page:** http://localhost:3000/dashboard
**Captured:** 2024-01-15T10:30:00.000Z

### Console Errors (2)

**1. [ERROR]**
TypeError: Cannot read property 'map' of undefined
  at Dashboard (dashboard.tsx:45:12)

**2. [WARN (React hydration)]**
Text content does not match server-rendered HTML

### Network Requests (3)

#### ❌ Failed Requests
- net::ERR_CONNECTION_REFUSED

#### ⚠️ Error Responses  
**500** `POST /api/users`
Response: {"error": "Internal server error"}

#### Recent Requests
- `GET` /api/dashboard → 200
- `POST` /api/users → 500
```

## Configuration

### Change Bridge Port

Default: WebSocket on 9876, HTTP API on 9877.

```bash
npx claude-console-bridge 8888
# WebSocket on 8888, HTTP on 8889
```

Then update port in extension Settings tab.

### Network Capture

Network capture uses Chrome's debugger API. You'll see a "debugging" banner - this is normal.

## Troubleshooting

### Extension shows "Not injected"
- Refresh the page after installing
- Some pages (chrome://, file://) don't allow extensions

### Network capture not working
- Click **▶ Start Capture** in Network tab
- Allow debugger when Chrome prompts

### VS Code bridge not connecting
- Ensure bridge is running: `npx claude-console-bridge`
- Check port matches (default: 9876)
- Extension auto-reconnects every 5 seconds

## How It Works

```
Chrome Extension ──WebSocket──→ Bridge Server ──→ .claude-console.json
                                     │
                                     └──→ HTTP API :9877
                                              │
                                              ▼
                                         Claude CLI
```

## License

MIT
