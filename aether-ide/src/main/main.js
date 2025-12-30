/**
 * Aether IDE - Main Process
 * Author: WebXExpert
 *
 * Electron main process for the Aether IDE
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let aetherProcess = null;

// Determine Python command based on platform
const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
const pythonArgs = process.platform === 'win32' ? ['-3.12'] : [];

// Path to Aether engine
const aetherPath = path.join(__dirname, '..', '..', '..', 'aether', 'aether_engine.py');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
        title: 'Aether IDE - WebXExpert'
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    // Create application menu
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-new-file') },
                { label: 'Open File', accelerator: 'CmdOrCtrl+O', click: () => openFile() },
                { label: 'Open Folder', accelerator: 'CmdOrCtrl+Shift+O', click: () => openFolder() },
                { type: 'separator' },
                { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-save') },
                { label: 'Save As', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('menu-save-as') },
                { type: 'separator' },
                { label: 'Exit', accelerator: 'Alt+F4', click: () => app.quit() }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Toggle File Explorer', accelerator: 'CmdOrCtrl+B', click: () => mainWindow.webContents.send('toggle-explorer') },
                { label: 'Toggle Symbol Panel', accelerator: 'CmdOrCtrl+Shift+E', click: () => mainWindow.webContents.send('toggle-symbols') },
                { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+`', click: () => mainWindow.webContents.send('toggle-terminal') },
                { type: 'separator' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { role: 'resetZoom' }
            ]
        },
        {
            label: 'Aether',
            submenu: [
                { label: 'Index Project', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.send('aether-index') },
                { label: 'List Symbols', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('aether-symbols') },
                { label: 'Find References', accelerator: 'F12', click: () => mainWindow.webContents.send('aether-references') },
                { type: 'separator' },
                { label: 'Onboard Project', click: () => mainWindow.webContents.send('aether-onboard') }
            ]
        },
        {
            label: 'Help',
            submenu: [
                { label: 'About Aether IDE', click: () => showAbout() },
                { label: 'Documentation', click: () => require('electron').shell.openExternal('https://github.com/Promotix21/webxexpert-devtools') }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function showAbout() {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'About Aether IDE',
        message: 'Aether IDE v1.0.0',
        detail: 'A code editor with AST-powered symbol navigation.\n\nWebXExpert\nby Rajesh Kumar\n\nPowered by Aether Engine & Monaco Editor'
    });
}

async function openFile() {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'All Files', extensions: ['*'] },
            { name: 'JavaScript', extensions: ['js', 'jsx', 'ts', 'tsx'] },
            { name: 'Python', extensions: ['py'] },
            { name: 'Web', extensions: ['html', 'css', 'json'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        mainWindow.webContents.send('file-opened', result.filePaths[0]);
    }
}

async function openFolder() {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        mainWindow.webContents.send('folder-opened', result.filePaths[0]);
    }
}

// IPC Handlers for Aether Engine
ipcMain.handle('aether-command', async (event, action, args = []) => {
    return new Promise((resolve, reject) => {
        const cmdArgs = [...pythonArgs, aetherPath, action, ...args];

        const proc = spawn(pythonCmd, cmdArgs, {
            cwd: process.cwd(),
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
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultPath,
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
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
