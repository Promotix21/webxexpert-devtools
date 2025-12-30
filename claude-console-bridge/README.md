# claude-console-bridge

Bridge server that connects Chrome browser console/network capture to Claude CLI. Run it from your project folder and Claude CLI can automatically access browser errors.

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
