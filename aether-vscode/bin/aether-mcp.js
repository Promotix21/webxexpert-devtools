#!/usr/bin/env node

/**
 * Standalone Aether MCP Server
 *
 * This can be run directly without VS Code:
 *   npx aether-mcp
 *
 * Or configured in Claude Code settings:
 *   {
 *     "mcpServers": {
 *       "aether-mcp": {
 *         "command": "node",
 *         "args": ["path/to/aether-mcp.js"],
 *         "env": {
 *           "CONSOLE_BRIDGE_PORT": "9877",
 *           "WORKSPACE_ROOT": "/path/to/project"
 *         }
 *       }
 *     }
 *   }
 */

require("../src/mcp-server.js");
