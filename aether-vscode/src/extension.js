const vscode = require("vscode");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let statusBarItem;
let checkInterval;
let bridgeProcess = null;
let outputChannel = null;

/**
 * Check if Console Bridge is running
 */
function checkConsoleBridge(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/data`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Update status bar based on connection status
 */
async function updateStatusBar() {
  const config = vscode.workspace.getConfiguration("aether-mcp");
  const port = config.get("consoleBridgePort", 9877);
  const isConnected = await checkConsoleBridge(port);

  if (isConnected) {
    statusBarItem.text = "$(check) Aether MCP";
    statusBarItem.tooltip = `Console Bridge connected on port ${port}\nClick for options`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(warning) Aether MCP";
    statusBarItem.tooltip = `Console Bridge not running on port ${port}\nClick to see options`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
}

/**
 * Get MCP configuration for Claude Code
 */
function getMcpConfig() {
  const config = vscode.workspace.getConfiguration("aether-mcp");
  const port = config.get("consoleBridgePort", 9877);
  const pythonPath = config.get("pythonPath", "python");

  // Find aether_engine.py
  let aetherPath = config.get("aetherEnginePath", "");
  if (!aetherPath) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const possiblePaths = [
      path.join(workspaceRoot, "aether", "aether_engine.py"),
      path.join(workspaceRoot, "..", "aether", "aether_engine.py"),
      "D:\\CRM\\Debugging\\aether\\aether_engine.py",
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        aetherPath = p;
        break;
      }
    }
  }

  // Get extension path for MCP server
  const extensionPath = path.join(__dirname, "mcp-server.js");

  return {
    mcpServers: {
      "aether-mcp": {
        command: "node",
        args: [extensionPath],
        env: {
          CONSOLE_BRIDGE_PORT: String(port),
          AETHER_ENGINE_PATH: aetherPath,
          PYTHON_PATH: pythonPath,
          WORKSPACE_ROOT: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
        },
      },
    },
  };
}

/**
 * Show status/options quick pick
 */
async function showStatus() {
  const config = vscode.workspace.getConfiguration("aether-mcp");
  const port = config.get("consoleBridgePort", 9877);
  const isConnected = await checkConsoleBridge(port);

  const items = [
    {
      label: isConnected ? "$(check) Console Bridge Connected" : "$(warning) Console Bridge Not Running",
      description: `Port ${port}`,
      action: "status",
    },
    {
      label: isConnected ? "$(debug-stop) Stop Console Bridge" : "$(play) Start Console Bridge",
      description: isConnected ? "Stop the background bridge process" : "Start Console Bridge in background",
      action: isConnected ? "stop-bridge" : "start-bridge-bg",
    },
    {
      label: "$(terminal) Start in Terminal",
      description: "Run Console Bridge in a visible terminal",
      action: "start-bridge-terminal",
    },
    {
      label: "$(copy) Copy MCP Config",
      description: "Copy configuration for Claude Code settings",
      action: "copy-config",
    },
    {
      label: "$(file-code) Open MCP Settings File",
      description: "Open Claude Code MCP settings",
      action: "open-settings",
    },
    {
      label: "$(output) Show Output Log",
      description: "View Aether MCP logs",
      action: "show-output",
    },
    {
      label: "$(gear) Extension Settings",
      description: "Configure Aether MCP settings",
      action: "settings",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Aether MCP Options",
  });

  if (!selected) return;

  switch (selected.action) {
    case "copy-config":
      await copyMcpConfig();
      break;
    case "open-settings":
      await openMcpSettings();
      break;
    case "start-bridge-bg":
      await startBridgeBackground();
      await updateStatusBar();
      break;
    case "stop-bridge":
      stopBridgeBackground();
      await updateStatusBar();
      vscode.window.showInformationMessage("Console Bridge stopped");
      break;
    case "start-bridge-terminal":
      await startConsoleBridgeTerminal();
      break;
    case "show-output":
      getOutputChannel().show();
      break;
    case "settings":
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "aether-mcp"
      );
      break;
  }
}

/**
 * Copy MCP config to clipboard
 */
async function copyMcpConfig() {
  const config = getMcpConfig();
  const configJson = JSON.stringify(config, null, 2);

  await vscode.env.clipboard.writeText(configJson);
  vscode.window.showInformationMessage(
    "MCP config copied! Paste into your Claude Code settings (~/.claude/settings.json)"
  );
}

/**
 * Open Claude Code MCP settings file
 */
async function openMcpSettings() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const settingsPath = path.join(homeDir, ".claude", "settings.json");

  if (fs.existsSync(settingsPath)) {
    const doc = await vscode.workspace.openTextDocument(settingsPath);
    await vscode.window.showTextDocument(doc);
  } else {
    // Create the directory and file if they don't exist
    const claudeDir = path.join(homeDir, ".claude");
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const config = getMcpConfig();
    fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2));

    const doc = await vscode.workspace.openTextDocument(settingsPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage("Created Claude Code settings with Aether MCP config!");
  }
}

/**
 * Start Console Bridge in terminal (manual)
 */
async function startConsoleBridgeTerminal() {
  const terminal = vscode.window.createTerminal("Console Bridge");
  terminal.show();
  terminal.sendText("npx claude-console-bridge");
}

/**
 * Find the Console Bridge CLI path
 */
function findBridgePath() {
  const possiblePaths = [
    // Local node_modules
    path.join(__dirname, "..", "node_modules", "claude-console-bridge", "index.js"),
    // Sibling project
    path.join(__dirname, "..", "..", "claude-console-bridge", "index.js"),
    // Global or workspace
    path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "", "claude-console-bridge", "index.js"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Start Console Bridge as background process
 */
async function startBridgeBackground() {
  const config = vscode.workspace.getConfiguration("aether-mcp");
  const port = config.get("consoleBridgePort", 9877);

  // Check if already running
  const isRunning = await checkConsoleBridge(port);
  if (isRunning) {
    getOutputChannel().appendLine(`Console Bridge already running on port ${port}`);
    return true;
  }

  // If we already have a process, don't start another
  if (bridgeProcess && !bridgeProcess.killed) {
    getOutputChannel().appendLine("Console Bridge process already exists");
    return true;
  }

  const bridgePath = findBridgePath();

  if (!bridgePath) {
    getOutputChannel().appendLine("Console Bridge not found. Install with: npm install claude-console-bridge");
    // Fall back to npx
    try {
      bridgeProcess = spawn("npx", ["claude-console-bridge"], {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
        shell: true,
        detached: false,
        env: { ...process.env, PORT: String(port) }
      });
    } catch (err) {
      getOutputChannel().appendLine(`Failed to start via npx: ${err.message}`);
      return false;
    }
  } else {
    getOutputChannel().appendLine(`Starting Console Bridge from: ${bridgePath}`);
    bridgeProcess = spawn("node", [bridgePath], {
      cwd: path.dirname(bridgePath),
      detached: false,
      env: { ...process.env, PORT: String(port) }
    });
  }

  bridgeProcess.stdout?.on("data", (data) => {
    getOutputChannel().appendLine(`[Bridge] ${data.toString().trim()}`);
  });

  bridgeProcess.stderr?.on("data", (data) => {
    getOutputChannel().appendLine(`[Bridge:err] ${data.toString().trim()}`);
  });

  bridgeProcess.on("error", (err) => {
    getOutputChannel().appendLine(`[Bridge] Error: ${err.message}`);
    bridgeProcess = null;
  });

  bridgeProcess.on("exit", (code) => {
    getOutputChannel().appendLine(`[Bridge] Exited with code ${code}`);
    bridgeProcess = null;
  });

  // Wait a moment and check if it started
  await new Promise(resolve => setTimeout(resolve, 2000));
  const started = await checkConsoleBridge(port);

  if (started) {
    getOutputChannel().appendLine(`Console Bridge started successfully on port ${port}`);
    vscode.window.showInformationMessage(`Aether: Console Bridge started on port ${port}`);
  } else {
    getOutputChannel().appendLine(`Console Bridge may not have started correctly`);
  }

  return started;
}

/**
 * Stop the background Console Bridge process
 */
function stopBridgeBackground() {
  if (bridgeProcess && !bridgeProcess.killed) {
    getOutputChannel().appendLine("Stopping Console Bridge...");
    bridgeProcess.kill();
    bridgeProcess = null;
    return true;
  }
  return false;
}

/**
 * Get or create output channel
 */
function getOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Aether MCP");
  }
  return outputChannel;
}

/**
 * Activate extension
 */
async function activate(context) {
  console.log("Aether MCP extension activating...");

  // Create output channel
  outputChannel = vscode.window.createOutputChannel("Aether MCP");
  context.subscriptions.push(outputChannel);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "aether-mcp.showStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("aether-mcp.showStatus", showStatus),
    vscode.commands.registerCommand("aether-mcp.copyMcpConfig", copyMcpConfig),
    vscode.commands.registerCommand("aether-mcp.startBridge", startBridgeBackground),
    vscode.commands.registerCommand("aether-mcp.stopBridge", () => {
      if (stopBridgeBackground()) {
        vscode.window.showInformationMessage("Console Bridge stopped");
      } else {
        vscode.window.showInformationMessage("Console Bridge was not running");
      }
    }),
    vscode.commands.registerCommand("aether-mcp.startServer", () => {
      vscode.window.showInformationMessage(
        "MCP server runs automatically when Claude Code connects. Use 'Copy MCP Config' to configure Claude Code."
      );
    }),
    vscode.commands.registerCommand("aether-mcp.stopServer", () => {
      vscode.window.showInformationMessage(
        "MCP server lifecycle is managed by Claude Code."
      );
    }),
    vscode.commands.registerCommand("aether-mcp.showOutput", () => {
      getOutputChannel().show();
    })
  );

  // Initial status update
  updateStatusBar();

  // Check connection periodically
  checkInterval = setInterval(updateStatusBar, 10000);

  // Watch for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aether-mcp")) {
        updateStatusBar();
      }
    })
  );

  // Auto-start Console Bridge if configured
  const config = vscode.workspace.getConfiguration("aether-mcp");
  const autoStartBridge = config.get("autoStartBridge", true);

  if (autoStartBridge) {
    getOutputChannel().appendLine("Auto-starting Console Bridge...");
    // Delay slightly to let VS Code finish loading
    setTimeout(async () => {
      await startBridgeBackground();
      updateStatusBar();
    }, 3000);
  }

  console.log("Aether MCP extension activated!");
}

/**
 * Deactivate extension
 */
function deactivate() {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Stop the Console Bridge if we started it
  stopBridgeBackground();

  if (outputChannel) {
    outputChannel.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
