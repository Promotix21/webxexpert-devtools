const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Configuration
const CONFIG = {
  consoleBridgePort: parseInt(process.env.CONSOLE_BRIDGE_PORT || "9877"),
  aetherEnginePath: process.env.AETHER_ENGINE_PATH || "",
  pythonCommand: process.env.PYTHON_PATH || (process.platform === "win32" ? "py" : "python3"),
  pythonArgs: process.platform === "win32" ? ["-3.12"] : [],
  workspaceRoot: process.env.WORKSPACE_ROOT || process.cwd(),
};

// Helper: HTTP GET request
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      })
      .on("error", reject);
  });
}

// Helper: Run Aether Engine command
function runAether(action, args = {}) {
  return new Promise((resolve, reject) => {
    let enginePath = CONFIG.aetherEnginePath;

    // Auto-detect aether_engine.py
    if (!enginePath) {
      const possiblePaths = [
        path.join(CONFIG.workspaceRoot, "aether", "aether_engine.py"),
        path.join(CONFIG.workspaceRoot, "..", "aether", "aether_engine.py"),
        path.join(__dirname, "..", "..", "aether", "aether_engine.py"),
        "D:\\CRM\\Debugging\\aether\\aether_engine.py",
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          enginePath = p;
          break;
        }
      }
    }

    if (!enginePath || !fs.existsSync(enginePath)) {
      reject(new Error("Aether Engine not found. Set AETHER_ENGINE_PATH."));
      return;
    }

    // Build CLI arguments
    const cliArgs = [...CONFIG.pythonArgs, enginePath, action];

    // Add target if provided
    if (args.target) {
      cliArgs.push(args.target);
    }
    if (args.target2) {
      cliArgs.push(args.target2);
    }

    // Add project path
    cliArgs.push("--project", args.project || CONFIG.workspaceRoot);

    // Add optional flags
    if (args.type) cliArgs.push("--type", args.type);
    if (args.file) cliArgs.push("--file", args.file);
    if (args.name) cliArgs.push("--name", args.name);
    if (args.code) cliArgs.push("--code", args.code);
    if (args.regex) cliArgs.push("--regex");
    if (args.apply) cliArgs.push("--apply");

    const proc = spawn(CONFIG.pythonCommand, cliArgs, {
      cwd: CONFIG.workspaceRoot,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data));
    proc.stderr.on("data", (data) => (stderr += data));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Aether exited with code ${code}`));
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(stdout);
        }
      }
    });
  });
}

// Define tools
const TOOLS = [
  // Console Bridge Tools
  {
    name: "get_debug_summary",
    description:
      "Get a markdown-formatted summary of browser console errors and network requests. Use this to understand what errors are occurring in the user's browser.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_browser_errors",
    description:
      "Get detailed browser console errors as JSON. Includes error messages, stack traces, and source locations.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of errors to return (default: 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_network_requests",
    description:
      "Get captured network requests including failed requests and their responses. Useful for debugging API issues.",
    inputSchema: {
      type: "object",
      properties: {
        failed_only: {
          type: "boolean",
          description: "Only return failed requests (4xx, 5xx)",
        },
        limit: {
          type: "number",
          description: "Maximum number of requests to return (default: 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "clear_debug_data",
    description: "Clear all captured browser errors and network requests.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  // Aether Engine Tools
  {
    name: "list_symbols",
    description:
      "List all symbols (functions, classes, variables) in a file or directory. Use this to understand code structure.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File or directory path to analyze",
        },
        type: {
          type: "string",
          description:
            "Filter by symbol type: function, class, method, variable",
        },
        recursive: {
          type: "boolean",
          description: "Recursively search directories (default: true)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "find_references",
    description:
      "Find all references to a symbol across the codebase. Use this to understand how a function/class is used.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Symbol name to find references for",
        },
        path: {
          type: "string",
          description: "Scope search to this path (optional)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "search_code",
    description:
      "Search for code patterns across the codebase. Supports regex patterns.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (supports regex)",
        },
        path: {
          type: "string",
          description: "Scope search to this path (optional)",
        },
        file_pattern: {
          type: "string",
          description: 'File glob pattern, e.g., "*.ts" (optional)',
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "get_symbol_info",
    description:
      "Get detailed information about a specific symbol including its definition, signature, and docstring.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Symbol name",
        },
        file: {
          type: "string",
          description: "File path where symbol is defined",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "index_project",
    description:
      "Index or re-index the project for faster symbol lookups. Run this after major code changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Project root path (default: workspace root)",
        },
      },
      required: [],
    },
  },
];

// Tool handlers
async function handleTool(name, args) {
  const bridgeUrl = `http://localhost:${CONFIG.consoleBridgePort}`;

  switch (name) {
    // Console Bridge handlers
    case "get_debug_summary": {
      try {
        const data = await httpGet(`${bridgeUrl}/summary`);
        return { content: [{ type: "text", text: String(data) }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Console Bridge not available at port ${CONFIG.consoleBridgePort}. Run 'npx claude-console-bridge' to start it.\n\nError: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "get_browser_errors": {
      try {
        const data = await httpGet(`${bridgeUrl}/errors`);
        let errors = data.errors || data || [];
        if (args.limit) {
          errors = errors.slice(0, args.limit);
        }
        return {
          content: [
            {
              type: "text",
              text:
                errors.length > 0
                  ? JSON.stringify(errors, null, 2)
                  : "No browser errors captured.",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Console Bridge not available. Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "get_network_requests": {
      try {
        const data = await httpGet(`${bridgeUrl}/network`);
        let requests = data.requests || data || [];
        if (args.failed_only) {
          requests = requests.filter(
            (r) => r.status >= 400 || r.error || r.failed
          );
        }
        if (args.limit) {
          requests = requests.slice(0, args.limit);
        }
        return {
          content: [
            {
              type: "text",
              text:
                requests.length > 0
                  ? JSON.stringify(requests, null, 2)
                  : "No network requests captured.",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Console Bridge not available. Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "clear_debug_data": {
      try {
        await httpGet(`${bridgeUrl}/clear`);
        return {
          content: [{ type: "text", text: "Debug data cleared successfully." }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to clear data. Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Aether Engine handlers
    case "list_symbols": {
      try {
        // If path is a file, use its directory as project and filename as filter
        let projectPath = args.path || CONFIG.workspaceRoot;
        let fileFilter = null;
        if (args.path && args.path.match(/\.(py|js|ts|tsx|java|c|cpp|go|rs)$/i)) {
          projectPath = path.dirname(args.path);
          fileFilter = path.basename(args.path);
        }
        const result = await runAether("list_symbols", {
          project: projectPath,
          type: args.type,
          file: fileFilter,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Aether Engine error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }

    case "find_references": {
      try {
        const result = await runAether("find_references", {
          target: args.symbol,
          project: args.path || CONFIG.workspaceRoot,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Aether Engine error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }

    case "search_code": {
      try {
        const result = await runAether("search", {
          target: args.pattern,
          project: args.path || CONFIG.workspaceRoot,
          regex: true,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Aether Engine error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }

    case "get_symbol_info": {
      try {
        const result = await runAether("read_symbol", {
          target: args.symbol,
          file: args.file,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Aether Engine error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }

    case "index_project": {
      try {
        const result = await runAether("index", {
          project: args.path || CONFIG.workspaceRoot,
        });
        return {
          content: [
            {
              type: "text",
              text: `Project indexed successfully.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Aether Engine error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// Create and run MCP server
async function main() {
  const server = new Server(
    {
      name: "aether-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handleTool(name, args || {});
  });

  // List resources handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "aether://debug-summary",
          name: "Debug Summary",
          description: "Current browser errors and network requests summary",
          mimeType: "text/markdown",
        },
      ],
    };
  });

  // Read resource handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === "aether://debug-summary") {
      try {
        const data = await httpGet(
          `http://localhost:${CONFIG.consoleBridgePort}/summary`
        );
        return {
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: String(data),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: `Console Bridge not available: ${error.message}`,
            },
          ],
        };
      }
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Aether MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
