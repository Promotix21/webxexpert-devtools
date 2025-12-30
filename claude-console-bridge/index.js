#!/usr/bin/env node

/**
 * Claude Console Bridge
 * 
 * Run this from your project folder where Claude CLI is active.
 * It receives browser errors/network from Chrome extension and makes
 * them available to Claude CLI.
 * 
 * Usage:
 *   npx claude-console-bridge          # Run on default port 9876
 *   npx claude-console-bridge 8888     # Run on custom port
 *   ccb                                # Short alias (if installed globally)
 * 
 * Claude CLI can then:
 *   - Read ~/.claude-console.json
 *   - Fetch http://localhost:9877/summary
 *   - You can just say "check browser errors" and paste the data
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

// Configuration
const WS_PORT = parseInt(process.argv[2]) || 9876;
const HTTP_PORT = WS_PORT + 1;
const DATA_FILE = path.join(os.homedir(), '.claude-console.json');
const PROJECT_DATA_FILE = path.join(process.cwd(), '.claude-console.json');

// Store for captured data
let capturedData = {
  errors: [],
  network: [],
  lastUpdate: null,
  pageUrl: null
};

// Terminal colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Logging
function log(color, icon, message) {
  const time = new Date().toLocaleTimeString();
  console.log(`${c.gray}${time}${c.reset} ${color}${icon}${c.reset} ${message}`);
}

function logError(error) {
  const type = error.raw?.type?.toUpperCase() || 'ERROR';
  const msg = (error.cleaned || error.raw?.message || 'Unknown').substring(0, 150);
  const color = type === 'WARN' ? c.yellow : c.red;
  log(color, type === 'WARN' ? '⚠' : '✖', `${c.bold}[${type}]${c.reset} ${msg}`);
}

function logServerError(data) {
  const source = data.context?.model ? 'PRISMA' : (data.raw?.type || 'SERVER').toUpperCase();
  const msg = (data.cleaned || data.raw?.message || 'Unknown').substring(0, 150);
  const route = data.context?.route || '';

  const color = source === 'PRISMA' ? c.magenta : c.red;
  const icon = source === 'PRISMA' ? '⬢' : '⬡';

  log(color, icon, `${c.bold}[${source}]${c.reset} ${route ? route + ' → ' : ''}${msg}`);

  // Show additional context for Prisma errors
  if (data.context?.model) {
    console.log(`${c.gray}     └─ ${data.context.model}.${data.context.action}${c.reset}`);
  }
}

function logNetwork(data) {
  if (data.type === 'request') {
    log(c.blue, '→', `${c.bold}${data.method}${c.reset} ${truncateUrl(data.url)}`);
  } else if (data.type === 'response') {
    const status = data.status;
    const color = status < 300 ? c.green : status < 400 ? c.yellow : c.red;
    const icon = status < 300 ? '✓' : status < 400 ? '↪' : '✖';
    log(color, icon, `${c.bold}${status}${c.reset} ${truncateUrl(data.url)}`);
    
    // Show error response body
    if (status >= 400 && data.body) {
      console.log(`${c.gray}     └─ ${data.body.substring(0, 100)}${c.reset}`);
    }
  } else if (data.type === 'failure') {
    log(c.red, '✖', `${c.bold}FAILED${c.reset} ${data.errorText || 'Connection failed'}`);
  }
}

function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const p = u.pathname + u.search;
    return p.length > 70 ? p.substring(0, 70) + '...' : p;
  } catch {
    return url.substring(0, 70);
  }
}

// Save data to files (both home dir and project dir)
function saveData() {
  capturedData.lastUpdate = new Date().toISOString();
  const json = JSON.stringify(capturedData, null, 2);
  
  try {
    fs.writeFileSync(DATA_FILE, json);
  } catch (e) {
    // Ignore home dir errors
  }
  
  try {
    fs.writeFileSync(PROJECT_DATA_FILE, json);
  } catch (e) {
    // Ignore project dir errors
  }
}

// Generate summary for Claude CLI
function generateSummary() {
  const errors = capturedData.errors || [];
  const network = capturedData.network || [];

  // Separate browser and server errors
  const browserErrors = errors.filter(e => !e.serverEvent);
  const serverErrors = errors.filter(e => e.serverEvent);

  let summary = `# Debug Summary\n\n`;
  summary += `Generated: ${new Date().toISOString()}\n`;
  summary += `Working Directory: ${process.cwd()}\n\n`;

  // Server Errors (show first - they're often the root cause)
  if (serverErrors.length > 0) {
    summary += `## Server Errors (${serverErrors.length})\n\n`;
    serverErrors.slice(-10).forEach((e, i) => {
      const source = e.context?.model ? 'PRISMA' : 'SERVER';
      const type = e.raw?.type || 'Error';
      const msg = e.cleaned || e.raw?.message || 'Unknown';
      const route = e.context?.route || '';

      summary += `### ${i + 1}. [${source}] ${type}\n`;
      if (route) summary += `**Route:** \`${route}\`\n`;
      if (e.context?.model) summary += `**Model:** \`${e.context.model}.${e.context.action}\`\n`;
      summary += `\`\`\`\n${msg.substring(0, 500)}\n\`\`\`\n`;
      if (e.raw?.stack) {
        summary += `<details><summary>Stack trace</summary>\n\n\`\`\`\n${e.raw.stack.substring(0, 1000)}\n\`\`\`\n</details>\n`;
      }
      summary += '\n';
    });
  }

  // Browser/Console Errors
  summary += `## Browser Errors (${browserErrors.length})\n\n`;
  if (browserErrors.length === 0) {
    summary += `✓ No browser errors\n\n`;
  } else {
    browserErrors.slice(-15).forEach((e, i) => {
      const type = e.raw?.type?.toUpperCase() || 'ERROR';
      const msg = e.cleaned || e.raw?.message || 'Unknown';
      summary += `### ${i + 1}. [${type}]\n\`\`\`\n${msg.substring(0, 500)}\n\`\`\`\n\n`;
    });
  }
  
  // Failed Requests
  const failed = network.filter(n => 
    n.type === 'failure' || (n.type === 'response' && n.status >= 400)
  );
  
  summary += `## Failed/Error Requests (${failed.length})\n\n`;
  if (failed.length === 0) {
    summary += `✓ No failed requests\n\n`;
  } else {
    failed.slice(-10).forEach((n, i) => {
      if (n.type === 'failure') {
        summary += `${i + 1}. **FAILED** - ${n.errorText}\n`;
      } else {
        summary += `${i + 1}. **${n.status}** \`${truncateUrl(n.url)}\`\n`;
        if (n.body) {
          summary += `   \`\`\`json\n   ${n.body.substring(0, 300)}\n   \`\`\`\n`;
        }
      }
      summary += '\n';
    });
  }
  
  // Recent Requests
  const requests = network.filter(n => n.type === 'request').slice(-10);
  summary += `## Recent Requests\n\n`;
  requests.forEach((r) => {
    const response = network.find(n => n.type === 'response' && n.url === r.url);
    const status = response ? response.status : '...';
    const statusIcon = !response ? '⏳' : response.status < 300 ? '✓' : response.status < 400 ? '↪' : '✖';
    summary += `- ${statusIcon} \`${r.method}\` ${truncateUrl(r.url)} → ${status}\n`;
  });
  
  return summary;
}

// Print startup banner
function printBanner() {
  console.log(`
${c.cyan}${c.bold}╔═══════════════════════════════════════════════════════════════╗
║           Claude Console Bridge v2.0                          ║
╚═══════════════════════════════════════════════════════════════╝${c.reset}

${c.green}✓${c.reset} WebSocket:  ${c.cyan}ws://localhost:${WS_PORT}${c.reset}
${c.green}✓${c.reset} HTTP API:   ${c.cyan}http://localhost:${HTTP_PORT}${c.reset}
${c.green}✓${c.reset} Data file:  ${c.cyan}${PROJECT_DATA_FILE}${c.reset}

${c.yellow}Waiting for Chrome extension...${c.reset}

${c.bold}━━━ For Claude CLI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}

  Just tell Claude:
  ${c.dim}"Read .claude-console.json and help me fix the errors"${c.reset}
  
  Or:
  ${c.dim}"Check http://localhost:${HTTP_PORT}/summary for browser issues"${c.reset}

${c.bold}━━━ HTTP Endpoints ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}

  ${c.cyan}GET /summary${c.reset}  - Text summary (best for Claude)
  ${c.cyan}GET /errors${c.reset}   - Console errors as JSON
  ${c.cyan}GET /network${c.reset}  - Network requests as JSON
  ${c.cyan}GET /data${c.reset}     - All data as JSON
  ${c.cyan}GET /clear${c.reset}    - Clear all captured data

${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);
}

// WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log(`\n${c.green}${c.bold}● Chrome extension connected${c.reset}\n`);
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      switch (msg.type) {
        case 'console_error':
          capturedData.errors.push(msg.data);
          if (capturedData.errors.length > 100) capturedData.errors.shift();
          logError(msg.data);
          saveData();
          break;
          
        case 'network_request':
          capturedData.network.push(msg.data);
          if (capturedData.network.length > 200) capturedData.network.shift();
          logNetwork(msg.data);
          saveData();
          break;
          
        case 'network_response':
          capturedData.network.push(msg.data);
          if (capturedData.network.length > 200) capturedData.network.shift();
          logNetwork(msg.data);
          saveData();
          break;
          
        case 'network_failure':
          capturedData.network.push(msg.data);
          logNetwork(msg.data);
          saveData();
          break;
      }
    } catch (e) {
      // Ignore parse errors
    }
  });
  
  ws.on('close', () => {
    console.log(`\n${c.yellow}○ Chrome extension disconnected${c.reset}\n`);
  });
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n${c.red}Error: Port ${WS_PORT} already in use${c.reset}`);
    console.log(`Try: ${c.cyan}npx claude-console-bridge ${WS_PORT + 10}${c.reset}\n`);
    process.exit(1);
  }
});

// HTTP Server for Claude CLI
const httpServer = http.createServer((req, res) => {
  // CORS headers for local access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // Handle server-side error ingestion (POST /ingest)
  if (url === '/ingest' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (msg.type === 'server_error' && msg.data) {
          capturedData.errors.push(msg.data);
          if (capturedData.errors.length > 100) capturedData.errors.shift();
          logServerError(msg.data);
          saveData();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  switch (url) {
    case '/':
    case '/data':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(capturedData, null, 2));
      break;

    case '/errors':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(capturedData.errors, null, 2));
      break;

    case '/network':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(capturedData.network, null, 2));
      break;

    case '/summary':
      res.writeHead(200, { 'Content-Type': 'text/markdown' });
      res.end(generateSummary());
      break;

    case '/clear':
      capturedData = { errors: [], network: [], lastUpdate: null, pageUrl: null };
      saveData();
      console.log(`${c.yellow}✓ Data cleared${c.reset}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Data cleared' }));
      break;

    default:
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
  }
});

httpServer.listen(HTTP_PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${c.yellow}Shutting down...${c.reset}`);
  saveData();
  wss.close();
  httpServer.close();
  process.exit(0);
});

// Start
printBanner();
