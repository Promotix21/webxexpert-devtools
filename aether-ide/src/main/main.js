/**
 * Aether IDE - Main Process
 * Author: Rajesh Kumar (WebXExpert)
 *
 * Electron main process for the Aether IDE
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const os = require('os');

// Try to load node-pty
let pty;
try {
    pty = require('node-pty');
} catch (e) {
    console.error('node-pty not available:', e.message);
}

// Track all windows for multi-instance support
const windows = new Set();
const ptyProcesses = new Map();

// Recent projects storage
const userDataPath = app.getPath('userData');
const recentProjectsFile = path.join(userDataPath, 'recent-projects.json');

function loadRecentProjects() {
    try {
        if (fs.existsSync(recentProjectsFile)) {
            return JSON.parse(fs.readFileSync(recentProjectsFile, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to load recent projects:', e);
    }
    return [];
}

function saveRecentProjects(projects) {
    try {
        fs.writeFileSync(recentProjectsFile, JSON.stringify(projects, null, 2));
    } catch (e) {
        console.error('Failed to save recent projects:', e);
    }
}

function addRecentProject(projectPath) {
    let recent = loadRecentProjects();
    // Remove if already exists
    recent = recent.filter(p => p.path !== projectPath);
    // Add to beginning
    recent.unshift({
        path: projectPath,
        name: path.basename(projectPath),
        lastOpened: new Date().toISOString()
    });
    // Keep only last 10
    recent = recent.slice(0, 10);
    saveRecentProjects(recent);
    return recent;
}

// Determine Python command based on platform
const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
const pythonArgs = process.platform === 'win32' ? ['-3.12'] : [];

// Path to Aether engine - handle both dev and packaged mode
function getAetherPath() {
    if (app.isPackaged) {
        // In packaged app, aether is in resources/aether
        return path.join(process.resourcesPath, 'aether', 'aether_engine.py');
    } else {
        // In development, aether is in parent directory
        return path.join(__dirname, '..', '..', '..', 'aether', 'aether_engine.py');
    }
}

function createWindow(projectPath = null) {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: false, // Frameless for custom titlebar
        titleBarStyle: 'hidden',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
        title: 'Aether IDE - WebXExpert',
        backgroundColor: '#1e1e1e'
    });

    windows.add(win);

    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    // Send project path after window loads (if provided)
    if (projectPath) {
        win.webContents.on('did-finish-load', () => {
            win.webContents.send('open-project', projectPath);
            addRecentProject(projectPath);
        });
    }

    // Remove default menu for cleaner look
    Menu.setApplicationMenu(null);

    win.on('closed', () => {
        windows.delete(win);
    });

    return win;
}

// Window control IPC handlers (multi-instance aware)
ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
});

ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
        win.unmaximize();
    } else {
        win?.maximize();
    }
});

ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
});

// Recent projects handlers
ipcMain.handle('get-recent-projects', () => {
    return loadRecentProjects();
});

ipcMain.handle('add-recent-project', (event, projectPath) => {
    return addRecentProject(projectPath);
});

ipcMain.handle('clear-recent-projects', () => {
    saveRecentProjects([]);
    return [];
});

ipcMain.handle('remove-recent-project', (event, projectPath) => {
    let recent = loadRecentProjects();
    recent = recent.filter(p => p.path !== projectPath);
    saveRecentProjects(recent);
    return recent;
});

// New window / multi-instance
ipcMain.handle('new-window', (event, projectPath) => {
    createWindow(projectPath);
    return { success: true };
});

ipcMain.handle('open-project-in-new-window', (event, projectPath) => {
    createWindow(projectPath);
    addRecentProject(projectPath);
    return { success: true };
});

// Dialog handlers (multi-instance aware)
ipcMain.handle('open-file-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
            { name: 'All Files', extensions: ['*'] },
            { name: 'JavaScript', extensions: ['js', 'jsx', 'ts', 'tsx'] },
            { name: 'Python', extensions: ['py'] },
            { name: 'Web', extensions: ['html', 'css', 'json'] }
        ]
    });
    return result;
});

ipcMain.handle('open-folder-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
    });
    return result;
});

ipcMain.handle('show-about', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    await dialog.showMessageBox(win, {
        type: 'info',
        title: 'About Aether IDE',
        message: 'Aether IDE v1.0.0',
        detail: 'A code editor with AST-powered symbol navigation.\n\nWebXExpert\nby Rajesh Kumar\n\nPowered by Aether Engine & Monaco Editor'
    });
});

// IPC Handlers for Aether Engine
ipcMain.handle('aether-command', async (event, action, args = [], projectPath = null) => {
    return new Promise((resolve, reject) => {
        // Build command args with --project flag
        const cmdArgs = [...pythonArgs, getAetherPath(), action];

        // Add project path if provided
        if (projectPath) {
            cmdArgs.push('--project', projectPath);
        }

        // Add any additional arguments
        cmdArgs.push(...args);

        const proc = spawn(pythonCmd, cmdArgs, {
            cwd: projectPath || process.cwd(),
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    resolve({ raw: stdout });
                }
            } else {
                reject(new Error(stderr || `Aether exited with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
});

// Terminal command execution - use PowerShell on Windows for better compatibility
ipcMain.handle('run-terminal-command', async (event, command, cwd) => {
    return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'powershell.exe' : '/bin/bash';
        const shellArgs = isWindows ? ['-NoProfile', '-Command', command] : ['-c', command];

        const proc = spawn(shell, shellArgs, {
            cwd: cwd || process.cwd(),
            env: process.env
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({
                success: code === 0,
                stdout: stdout,
                stderr: stderr,
                error: code !== 0 ? `Exit code: ${code}` : null
            });
        });

        proc.on('error', (err) => {
            resolve({
                success: false,
                stdout: '',
                stderr: err.message,
                error: err.message
            });
        });
    });
});

// ============================================
// Real PTY Terminal Support
// ============================================
ipcMain.handle('pty-create', (event, id, cwd) => {
    if (!pty) {
        return { success: false, error: 'node-pty not available' };
    }

    try {
        const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd: cwd || process.cwd(),
            env: { ...process.env, TERM: 'xterm-256color' }
        });

        ptyProcess.onData((data) => {
            mainWindow?.webContents.send('pty-data', id, data);
        });

        ptyProcess.onExit(({ exitCode }) => {
            mainWindow?.webContents.send('pty-exit', id, exitCode);
            ptyProcesses.delete(id);
        });

        ptyProcesses.set(id, ptyProcess);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.on('pty-write', (event, id, data) => {
    const ptyProcess = ptyProcesses.get(id);
    if (ptyProcess) {
        ptyProcess.write(data);
    }
});

ipcMain.on('pty-resize', (event, id, cols, rows) => {
    const ptyProcess = ptyProcesses.get(id);
    if (ptyProcess) {
        ptyProcess.resize(cols, rows);
    }
});

ipcMain.on('pty-kill', (event, id) => {
    const ptyProcess = ptyProcesses.get(id);
    if (ptyProcess) {
        ptyProcess.kill();
        ptyProcesses.delete(id);
    }
});

// Check if PTY is available
ipcMain.handle('pty-available', () => {
    return { available: !!pty };
});

// File system operations
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('read-directory', async (event, dirPath) => {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        return {
            success: true,
            items: items.map(item => ({
                name: item.name,
                isDirectory: item.isDirectory(),
                path: path.join(dirPath, item.name)
            }))
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('show-save-dialog', async (event, defaultPath) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultPath,
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

// Open external link
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

// ============================================
// Detached Terminal Window
// ============================================
let detachedTerminalWindow = null;

ipcMain.handle('create-detached-terminal', async (event, cwd) => {
    if (detachedTerminalWindow) {
        detachedTerminalWindow.focus();
        return { success: true, existing: true };
    }

    detachedTerminalWindow = new BrowserWindow({
        width: 900,
        height: 600,
        minWidth: 400,
        minHeight: 300,
        title: 'Aether Terminal',
        backgroundColor: '#1e1e1e',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Load the terminal-only HTML
    detachedTerminalWindow.loadFile(path.join(__dirname, '..', 'renderer', 'terminal.html'));

    // Send the working directory after load
    detachedTerminalWindow.webContents.on('did-finish-load', () => {
        detachedTerminalWindow.webContents.send('init-terminal', cwd || process.cwd());
    });

    detachedTerminalWindow.on('closed', () => {
        detachedTerminalWindow = null;
    });

    return { success: true };
});

ipcMain.on('detached-terminal-ready', (event, id) => {
    // Forward PTY data to detached window
});

// Toggle main window fullscreen
ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
