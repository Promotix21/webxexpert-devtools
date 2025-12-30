/**
 * Aether IDE - Renderer Process
 * Author: Rajesh Kumar (WebXExpert)
 *
 * Main renderer script for the Aether IDE
 */

const { ipcRenderer } = require('electron');
const path = require('path');

// xterm.js for real PTY terminal
const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');

// State
let currentFolder = null;
let openFiles = new Map();
let activeFile = null;
let editor = null;
let symbols = [];
let monacoReady = false;
let ptyAvailable = false;

// Check PTY availability on startup
ipcRenderer.invoke('pty-available').then(result => {
    ptyAvailable = result.available;
    console.log('PTY available:', ptyAvailable);
});

// ============================================
// Window Controls
// ============================================
document.getElementById('btn-minimize').addEventListener('click', () => {
    ipcRenderer.send('window-minimize');
});

document.getElementById('btn-maximize').addEventListener('click', () => {
    ipcRenderer.send('window-maximize');
});

document.getElementById('btn-close').addEventListener('click', () => {
    ipcRenderer.send('window-close');
});

// ============================================
// Menu Actions
// ============================================
document.getElementById('btn-new-file').addEventListener('click', createNewFile);
document.getElementById('btn-open-file').addEventListener('click', openFileDialog);
document.getElementById('btn-open-folder').addEventListener('click', openFolderDialog);
document.getElementById('btn-save').addEventListener('click', saveCurrentFile);
document.getElementById('btn-save-as').addEventListener('click', saveFileAs);

document.getElementById('btn-toggle-explorer').addEventListener('click', () => switchPanel('explorer'));
document.getElementById('btn-toggle-symbols').addEventListener('click', () => switchPanel('symbols'));
document.getElementById('btn-toggle-terminal').addEventListener('click', toggleTerminal);
document.getElementById('btn-devtools').addEventListener('click', () => {
    require('electron').remote?.getCurrentWindow()?.webContents?.toggleDevTools() ||
    ipcRenderer.send('toggle-devtools');
});

document.getElementById('btn-about').addEventListener('click', () => {
    ipcRenderer.invoke('show-about');
});

document.getElementById('btn-docs').addEventListener('click', () => {
    ipcRenderer.send('open-external', 'https://github.com/Promotix21/webxexpert-devtools');
});

// New Window
document.getElementById('btn-new-window')?.addEventListener('click', () => {
    ipcRenderer.invoke('new-window');
});

// ============================================
// Recent Projects
// ============================================
async function loadRecentProjects() {
    const recent = await ipcRenderer.invoke('get-recent-projects');
    renderRecentProjectsList(recent);
    renderRecentProjectsMenu(recent);
}

function renderRecentProjectsList(projects) {
    const container = document.getElementById('recent-projects-list');
    if (!container) return;

    if (!projects || projects.length === 0) {
        container.innerHTML = '<p class="empty-recent">No recent projects</p>';
        return;
    }

    container.innerHTML = projects.map(p => `
        <div class="recent-item" data-path="${p.path}">
            <span class="folder-icon">📁</span>
            <div class="project-info">
                <div class="project-name">${p.name}</div>
                <div class="project-path">${p.path}</div>
            </div>
            <button class="remove-btn" data-path="${p.path}" title="Remove">×</button>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) return;
            loadFolder(item.dataset.path);
        });
    });

    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await ipcRenderer.invoke('remove-recent-project', btn.dataset.path);
            loadRecentProjects();
        });
    });
}

function renderRecentProjectsMenu(projects) {
    const menu = document.getElementById('recent-projects-menu');
    if (!menu) return;

    // Clear existing items except the Clear Recent option
    const clearBtn = menu.querySelector('#btn-clear-recent');
    menu.innerHTML = '';

    if (projects && projects.length > 0) {
        projects.forEach(p => {
            const item = document.createElement('div');
            item.className = 'recent-menu-item';
            item.innerHTML = `
                <span class="name">${p.name}</span>
                <span class="path">${p.path}</span>
            `;
            item.addEventListener('click', () => loadFolder(p.path));
            menu.appendChild(item);
        });

        const divider = document.createElement('div');
        divider.className = 'menu-divider';
        menu.appendChild(divider);
    }

    const clearOption = document.createElement('div');
    clearOption.className = 'menu-option';
    clearOption.id = 'btn-clear-recent';
    clearOption.textContent = 'Clear Recent';
    clearOption.addEventListener('click', async () => {
        await ipcRenderer.invoke('clear-recent-projects');
        loadRecentProjects();
    });
    menu.appendChild(clearOption);
}

// Listen for project open from main process (multi-instance)
ipcRenderer.on('open-project', (event, projectPath) => {
    loadFolder(projectPath);
});

// Open folder buttons
document.getElementById('btn-open-folder-sidebar')?.addEventListener('click', openFolderDialog);
document.getElementById('btn-open-folder-action')?.addEventListener('click', openFolderDialog);
document.getElementById('btn-open-folder-welcome')?.addEventListener('click', openFolderDialog);

// ============================================
// Sidebar Panel Switching
// ============================================
document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const panel = tab.dataset.panel;
        switchPanel(panel);
    });
});

function switchPanel(panelName) {
    // Update tab active state
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.sidebar-tab[data-panel="${panelName}"]`);
    if (activeTab) activeTab.classList.add('active');

    // Update panel visibility
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    const activePanel = document.getElementById(`${panelName}-panel`);
    if (activePanel) activePanel.classList.add('active');
}

// ============================================
// File Dialog Functions
// ============================================
async function openFileDialog() {
    const result = await ipcRenderer.invoke('open-file-dialog');
    if (!result.canceled && result.filePaths.length > 0) {
        openFile(result.filePaths[0]);
    }
}

async function openFolderDialog() {
    const result = await ipcRenderer.invoke('open-folder-dialog');
    if (!result.canceled && result.filePaths.length > 0) {
        loadFolder(result.filePaths[0]);
    }
}

// ============================================
// Monaco Editor
// ============================================
function initMonaco() {
    const monacoPath = path.join(__dirname, '..', '..', 'node_modules', 'monaco-editor', 'min', 'vs');

    // Create script element for loader
    const loaderScript = document.createElement('script');
    loaderScript.src = monacoPath + '/loader.js';
    loaderScript.onload = () => {
        require.config({ paths: { vs: monacoPath } });

        require(['vs/editor/editor.main'], function () {
            // Set Monaco theme
            monaco.editor.defineTheme('aether-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#1e1e1e',
                    'editor.foreground': '#cccccc',
                    'editorLineNumber.foreground': '#6e6e6e',
                    'editorCursor.foreground': '#ffffff',
                    'editor.selectionBackground': '#264f78',
                    'editor.lineHighlightBackground': '#2d2d2d'
                }
            });

            monaco.editor.setTheme('aether-dark');

            // Create editor instance
            const editorContainer = document.getElementById('editor-container');
            editor = monaco.editor.create(editorContainer, {
                value: '',
                language: 'javascript',
                theme: 'aether-dark',
                automaticLayout: true,
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                tabSize: 4,
                insertSpaces: true
            });

            // Hide editor initially
            const monacoEl = editorContainer.querySelector('.monaco-editor');
            if (monacoEl) monacoEl.style.display = 'none';

            // Track changes
            editor.onDidChangeModelContent(() => {
                if (activeFile && openFiles.has(activeFile)) {
                    const file = openFiles.get(activeFile);
                    file.modified = true;
                    updateTab(activeFile);
                }
            });

            // Keyboard shortcuts
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrentFile);

            monacoReady = true;
            console.log('Monaco Editor initialized');
        });
    };
    document.head.appendChild(loaderScript);
}

// ============================================
// File Tree Functions
// ============================================
async function loadFolder(folderPath) {
    currentFolder = folderPath;
    document.querySelector('.titlebar-title').textContent = `Aether IDE - ${path.basename(folderPath)}`;

    const result = await ipcRenderer.invoke('read-directory', folderPath);

    if (result.success) {
        const fileTree = document.getElementById('file-tree');
        fileTree.innerHTML = '';
        renderFileTree(result.items, fileTree, folderPath);
        updateStatus(`Opened: ${path.basename(folderPath)}`);

        // Save to recent projects
        await ipcRenderer.invoke('add-recent-project', folderPath);
        loadRecentProjects();

        // Check Git status for the folder
        checkGitStatus();
    }
}

function renderFileTree(items, container, parentPath) {
    // Sort: folders first, then files, alphabetically
    items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });

    items.forEach(item => {
        // Skip hidden files and common ignore patterns
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === '__pycache__' || item.name === 'dist' || item.name === 'build') {
            return;
        }

        const itemEl = document.createElement('div');
        itemEl.className = `file-item ${item.isDirectory ? 'folder' : 'file'}`;
        itemEl.innerHTML = `<span class="icon"></span><span class="name">${item.name}</span>`;
        itemEl.dataset.path = item.path;

        if (item.isDirectory) {
            const children = document.createElement('div');
            children.className = 'file-children';
            children.style.display = 'none';

            itemEl.addEventListener('click', async (e) => {
                e.stopPropagation();
                const isExpanded = itemEl.classList.contains('expanded');

                if (isExpanded) {
                    itemEl.classList.remove('expanded');
                    children.style.display = 'none';
                } else {
                    itemEl.classList.add('expanded');
                    children.style.display = 'block';

                    if (children.children.length === 0) {
                        const result = await ipcRenderer.invoke('read-directory', item.path);
                        if (result.success) {
                            renderFileTree(result.items, children, item.path);
                        }
                    }
                }
            });

            container.appendChild(itemEl);
            container.appendChild(children);
        } else {
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openFile(item.path);
            });
            container.appendChild(itemEl);
        }
    });
}

// ============================================
// File Operations
// ============================================
async function openFile(filePath) {
    if (!monacoReady) {
        console.log('Monaco not ready yet');
        return;
    }

    if (openFiles.has(filePath)) {
        activateFile(filePath);
        return;
    }

    const result = await ipcRenderer.invoke('read-file', filePath);

    if (result.success) {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap = {
            '.js': 'javascript', '.jsx': 'javascript',
            '.ts': 'typescript', '.tsx': 'typescript',
            '.py': 'python', '.html': 'html', '.css': 'css',
            '.json': 'json', '.md': 'markdown', '.rs': 'rust',
            '.go': 'go', '.java': 'java', '.c': 'c', '.cpp': 'cpp',
            '.h': 'c', '.cs': 'csharp', '.rb': 'ruby', '.php': 'php',
            '.sh': 'shell', '.ps1': 'powershell', '.sql': 'sql',
            '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml'
        };

        const language = languageMap[ext] || 'plaintext';
        const model = monaco.editor.createModel(result.content, language, monaco.Uri.file(filePath));

        openFiles.set(filePath, {
            content: result.content,
            modified: false,
            model: model
        });

        createTab(filePath);
        activateFile(filePath);
        loadFileSymbols(filePath);
    }
}

function activateFile(filePath) {
    if (!openFiles.has(filePath)) return;

    activeFile = filePath;
    const file = openFiles.get(filePath);

    editor.setModel(file.model);

    document.getElementById('welcome-screen').style.display = 'none';
    const monacoEl = document.querySelector('.monaco-editor');
    if (monacoEl) monacoEl.style.display = 'block';

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-path="${CSS.escape(filePath)}"]`);
    if (tab) tab.classList.add('active');

    document.querySelectorAll('.file-item').forEach(f => f.classList.remove('selected'));
    const fileItem = document.querySelector(`.file-item[data-path="${CSS.escape(filePath)}"]`);
    if (fileItem) fileItem.classList.add('selected');
}

function createNewFile() {
    if (!monacoReady) return;

    const untitledPath = `untitled-${Date.now()}.txt`;
    const model = monaco.editor.createModel('', 'plaintext');

    openFiles.set(untitledPath, {
        content: '',
        modified: true,
        model: model
    });

    createTab(untitledPath);
    activateFile(untitledPath);
}

function createTab(filePath) {
    const tabs = document.getElementById('tabs');
    const fileName = path.basename(filePath);

    const tab = document.createElement('div');
    tab.className = 'tab active';
    tab.dataset.path = filePath;
    tab.innerHTML = `
        <span class="name">${fileName}</span>
        <span class="close">×</span>
    `;

    tab.querySelector('.name').addEventListener('click', () => activateFile(filePath));
    tab.querySelector('.close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeFile(filePath);
    });

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabs.appendChild(tab);
}

function updateTab(filePath) {
    const tab = document.querySelector(`.tab[data-path="${CSS.escape(filePath)}"]`);
    if (!tab) return;

    const file = openFiles.get(filePath);
    if (file?.modified) {
        tab.classList.add('modified');
    } else {
        tab.classList.remove('modified');
    }
}

function closeFile(filePath) {
    const file = openFiles.get(filePath);
    if (!file) return;

    file.model.dispose();
    openFiles.delete(filePath);

    const tab = document.querySelector(`.tab[data-path="${CSS.escape(filePath)}"]`);
    if (tab) tab.remove();

    if (openFiles.size > 0) {
        const nextFile = openFiles.keys().next().value;
        activateFile(nextFile);
    } else {
        activeFile = null;
        document.getElementById('welcome-screen').style.display = 'flex';
        const monacoEl = document.querySelector('.monaco-editor');
        if (monacoEl) monacoEl.style.display = 'none';
    }
}

async function saveCurrentFile() {
    if (!activeFile || !openFiles.has(activeFile)) return;

    const file = openFiles.get(activeFile);
    const content = file.model.getValue();

    if (activeFile.startsWith('untitled-')) {
        saveFileAs();
        return;
    }

    const result = await ipcRenderer.invoke('write-file', activeFile, content);

    if (result.success) {
        file.content = content;
        file.modified = false;
        updateTab(activeFile);
        updateStatus('File saved');
    } else {
        updateStatus('Failed to save: ' + result.error);
    }
}

async function saveFileAs() {
    if (!activeFile || !openFiles.has(activeFile)) return;

    const result = await ipcRenderer.invoke('show-save-dialog', activeFile);
    if (!result.canceled && result.filePath) {
        const file = openFiles.get(activeFile);
        const content = file.model.getValue();
        await ipcRenderer.invoke('write-file', result.filePath, content);
        updateStatus('Saved as: ' + path.basename(result.filePath));
    }
}

// ============================================
// Sidebar Collapse
// ============================================
document.getElementById('sidebar-collapse')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});

// ============================================
// Tools Menu Handlers
// ============================================
document.getElementById('btn-tool-build')?.addEventListener('click', () => runInNewTerminal('npm run build', 'Build'));
document.getElementById('btn-tool-start')?.addEventListener('click', () => runInNewTerminal('npm start', 'Start'));
document.getElementById('btn-tool-test')?.addEventListener('click', () => runInNewTerminal('npm test', 'Test'));
document.getElementById('btn-tool-docker-up')?.addEventListener('click', () => runInNewTerminal('docker-compose up -d', 'Docker Up'));
document.getElementById('btn-tool-docker-down')?.addEventListener('click', () => runInNewTerminal('docker-compose down', 'Docker Down'));
document.getElementById('btn-tool-kill-node')?.addEventListener('click', () => {
    runInNewTerminal('taskkill /F /IM node.exe 2>$null; Write-Host "Node processes killed"', 'Kill Node');
});
document.getElementById('btn-tool-kill-port')?.addEventListener('click', () => {
    const port = prompt('Enter port number to kill:');
    if (port && /^\d+$/.test(port)) {
        runInNewTerminal(`Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; Write-Host "Killed process on port ${port}"`, `Kill :${port}`);
    }
});
document.getElementById('btn-tool-kill-all')?.addEventListener('click', killAllTerminals);

// ============================================
// Git Integration
// ============================================
let isGitRepo = false;
let currentBranch = '';

async function checkGitStatus() {
    if (!currentFolder) return;

    try {
        const result = await ipcRenderer.invoke('run-terminal-command', 'git rev-parse --is-inside-work-tree', currentFolder);
        isGitRepo = result.success && result.stdout.trim() === 'true';

        if (isGitRepo) {
            const branchResult = await ipcRenderer.invoke('run-terminal-command', 'git branch --show-current', currentFolder);
            currentBranch = branchResult.stdout.trim() || 'HEAD';
            document.querySelector('.branch-name').textContent = currentBranch;
            await refreshGitChanges();
        } else {
            document.querySelector('.branch-name').textContent = 'Not a git repository';
        }
    } catch (err) {
        document.querySelector('.branch-name').textContent = 'Git not available';
    }
}

async function refreshGitChanges() {
    if (!isGitRepo || !currentFolder) return;

    const stagedEl = document.getElementById('staged-changes');
    const unstagedEl = document.getElementById('unstaged-changes');

    try {
        // Get staged changes
        const stagedResult = await ipcRenderer.invoke('run-terminal-command', 'git diff --cached --name-status', currentFolder);
        const stagedFiles = parseStagedChanges(stagedResult.stdout);
        renderChanges(stagedEl, stagedFiles, true);

        // Get unstaged changes
        const statusResult = await ipcRenderer.invoke('run-terminal-command', 'git status --porcelain', currentFolder);
        const unstagedFiles = parseUnstagedChanges(statusResult.stdout);
        renderChanges(unstagedEl, unstagedFiles, false);

        updateGitStatus('Ready');
    } catch (err) {
        updateGitStatus('Error: ' + err.message);
    }
}

function parseStagedChanges(output) {
    if (!output.trim()) return [];
    return output.trim().split('\n').map(line => {
        const [status, ...fileParts] = line.split('\t');
        return { status: status.trim(), file: fileParts.join('\t') };
    }).filter(f => f.file);
}

function parseUnstagedChanges(output) {
    if (!output.trim()) return [];
    return output.trim().split('\n').map(line => {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        return { status: status.trim() || '?', file };
    }).filter(f => f.file);
}

function renderChanges(container, changes, isStaged) {
    if (changes.length === 0) {
        container.innerHTML = `<div class="empty-state small">No ${isStaged ? 'staged ' : ''}changes</div>`;
        return;
    }

    container.innerHTML = changes.map(c => {
        const statusClass = c.status === 'A' ? 'added' : c.status === 'M' ? 'modified' : c.status === 'D' ? 'deleted' : 'untracked';
        return `<div class="change-item" data-file="${c.file}">
            <span class="change-status ${statusClass}">${c.status}</span>
            <span class="change-file">${path.basename(c.file)}</span>
        </div>`;
    }).join('');
}

function updateGitStatus(message) {
    const el = document.getElementById('git-status');
    if (el) el.textContent = message;
}

// Git menu handlers
document.getElementById('btn-git-clone')?.addEventListener('click', async () => {
    const url = prompt('Enter repository URL to clone:');
    if (url) {
        runInNewTerminal(`git clone ${url}`, 'Git Clone');
    }
});

document.getElementById('btn-git-init')?.addEventListener('click', async () => {
    if (!currentFolder) { alert('Open a folder first'); return; }
    runInNewTerminal('git init', 'Git Init');
    setTimeout(checkGitStatus, 2000);
});

document.getElementById('btn-git-status')?.addEventListener('click', () => {
    if (!currentFolder) return;
    runInNewTerminal('git status', 'Git Status');
});

document.getElementById('btn-git-add')?.addEventListener('click', async () => {
    if (!currentFolder) return;
    updateGitStatus('Staging changes...');
    await ipcRenderer.invoke('run-terminal-command', 'git add -A', currentFolder);
    await refreshGitChanges();
    updateGitStatus('All changes staged');
});

document.getElementById('btn-git-commit')?.addEventListener('click', async () => {
    const message = prompt('Enter commit message:');
    if (message) {
        runInNewTerminal(`git commit -m "${message.replace(/"/g, '\\"')}"`, 'Git Commit');
        setTimeout(refreshGitChanges, 2000);
    }
});

document.getElementById('btn-git-push')?.addEventListener('click', () => {
    runInNewTerminal('git push', 'Git Push');
});

document.getElementById('btn-git-pull')?.addEventListener('click', () => {
    runInNewTerminal('git pull', 'Git Pull');
    setTimeout(refreshGitChanges, 3000);
});

document.getElementById('btn-git-branch')?.addEventListener('click', () => {
    runInNewTerminal('git branch -a', 'Git Branches');
});

document.getElementById('btn-git-log')?.addEventListener('click', () => {
    runInNewTerminal('git log --oneline -20', 'Git Log');
});

// Git panel quick buttons
document.getElementById('btn-git-stage-all')?.addEventListener('click', async () => {
    if (!currentFolder || !isGitRepo) return;
    updateGitStatus('Staging all...');
    await ipcRenderer.invoke('run-terminal-command', 'git add -A', currentFolder);
    await refreshGitChanges();
});

document.getElementById('btn-git-commit-quick')?.addEventListener('click', async () => {
    if (!currentFolder || !isGitRepo) return;
    const message = document.getElementById('commit-message').value.trim();
    if (!message) { alert('Enter a commit message'); return; }

    updateGitStatus('Committing...');
    const result = await ipcRenderer.invoke('run-terminal-command', `git commit -m "${message.replace(/"/g, '\\"')}"`, currentFolder);
    if (result.success) {
        document.getElementById('commit-message').value = '';
        updateGitStatus('Committed successfully');
    } else {
        updateGitStatus('Commit failed');
    }
    await refreshGitChanges();
});

document.getElementById('btn-git-push-quick')?.addEventListener('click', async () => {
    if (!currentFolder || !isGitRepo) return;
    updateGitStatus('Pushing...');
    const result = await ipcRenderer.invoke('run-terminal-command', 'git push', currentFolder);
    updateGitStatus(result.success ? 'Pushed successfully' : 'Push failed');
});

document.getElementById('btn-git-pull-quick')?.addEventListener('click', async () => {
    if (!currentFolder || !isGitRepo) return;
    updateGitStatus('Pulling...');
    const result = await ipcRenderer.invoke('run-terminal-command', 'git pull', currentFolder);
    updateGitStatus(result.success ? 'Pulled successfully' : 'Pull failed');
    await refreshGitChanges();
});

document.getElementById('btn-git-refresh')?.addEventListener('click', () => {
    checkGitStatus();
});

// ============================================
// Claude Integration Guide
// ============================================
document.getElementById('btn-integration')?.addEventListener('click', () => {
    const guideHtml = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;" onclick="this.remove()">
            <div style="background:#1e1e1e;border:1px solid #3c3c3c;border-radius:8px;max-width:700px;max-height:80vh;overflow-y:auto;padding:24px;" onclick="event.stopPropagation()">
                <h2 style="color:#4ec9b0;margin-bottom:16px;">Claude Integration Guide</h2>
                <h3 style="color:#dcdcaa;margin:16px 0 8px;">How Aether IDE Works with Claude</h3>
                <p style="color:#ccc;line-height:1.6;">Aether IDE integrates with Claude CLI to provide AI-powered coding assistance directly in your terminal.</p>

                <h3 style="color:#dcdcaa;margin:16px 0 8px;">Prerequisites</h3>
                <ul style="color:#ccc;line-height:1.8;padding-left:20px;">
                    <li>Claude CLI installed globally: <code style="background:#2d2d2d;padding:2px 6px;border-radius:3px;">npm install -g @anthropic-ai/claude-code</code></li>
                    <li>Anthropic API key configured</li>
                    <li>For real terminal: Visual Studio Build Tools (for node-pty)</li>
                </ul>

                <h3 style="color:#dcdcaa;margin:16px 0 8px;">Using Claude in Aether IDE</h3>
                <ol style="color:#ccc;line-height:1.8;padding-left:20px;">
                    <li>Open a project folder (Ctrl+Shift+O)</li>
                    <li>Index the project using Aether panel</li>
                    <li>Open terminal (Ctrl+\`) and type <code style="background:#2d2d2d;padding:2px 6px;border-radius:3px;">claude</code></li>
                    <li>Claude will have context from indexed symbols</li>
                </ol>

                <h3 style="color:#dcdcaa;margin:16px 0 8px;">Aether Engine Commands</h3>
                <ul style="color:#ccc;line-height:1.8;padding-left:20px;">
                    <li><strong>Index Project:</strong> Scans and indexes all symbols (functions, classes, variables)</li>
                    <li><strong>Onboard Project:</strong> Creates project summary for Claude context</li>
                    <li><strong>Find References:</strong> Locates all usages of a symbol</li>
                    <li><strong>View Memories:</strong> Shows stored project insights</li>
                </ul>

                <h3 style="color:#dcdcaa;margin:16px 0 8px;">Keyboard Shortcuts</h3>
                <table style="width:100%;color:#ccc;border-collapse:collapse;">
                    <tr><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Ctrl+O</td><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Open File</td></tr>
                    <tr><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Ctrl+Shift+O</td><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Open Folder</td></tr>
                    <tr><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Ctrl+S</td><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Save</td></tr>
                    <tr><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Ctrl+\`</td><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Toggle Terminal</td></tr>
                    <tr><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Ctrl+Shift+I</td><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Index Project</td></tr>
                    <tr><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Ctrl+Shift+G</td><td style="padding:4px;border-bottom:1px solid #3c3c3c;">Source Control</td></tr>
                    <tr><td style="padding:4px;">F5/F6/F7</td><td style="padding:4px;">Build/Start/Test</td></tr>
                </table>

                <div style="margin-top:20px;text-align:right;">
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:#0078d4;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', guideHtml);
});

// ============================================
// Real PTY Terminal System with xterm.js
// ============================================
let terminals = new Map();
let activeTerminalId = null;
let terminalCounter = 0;

// Listen for PTY data from main process
ipcRenderer.on('pty-data', (event, id, data) => {
    const term = terminals.get(id);
    if (term && term.xterm) {
        term.xterm.write(data);
    }
});

// Listen for PTY exit
ipcRenderer.on('pty-exit', (event, id, exitCode) => {
    const term = terminals.get(id);
    if (term && term.xterm) {
        term.xterm.write(`\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m\r\n`);
    }
});

async function createTerminal(name = null) {
    const id = `term-${++terminalCounter}`;
    const termName = name || `Terminal ${terminalCounter}`;

    // Create tab
    const tabsContainer = document.getElementById('terminal-tabs');
    const tab = document.createElement('div');
    tab.className = 'terminal-tab active';
    tab.dataset.id = id;
    tab.innerHTML = `<span>${termName}</span><span class="close-tab">×</span>`;

    tab.querySelector('span:first-child').addEventListener('click', () => activateTerminal(id));
    tab.querySelector('.close-tab').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTerminal(id);
    });

    // Deactivate other tabs
    tabsContainer.querySelectorAll('.terminal-tab').forEach(t => t.classList.remove('active'));
    tabsContainer.appendChild(tab);

    // Create terminal instance container
    const instancesContainer = document.getElementById('terminal-instances');
    const instance = document.createElement('div');
    instance.className = 'terminal-instance active';
    instance.dataset.id = id;

    // Deactivate other instances
    instancesContainer.querySelectorAll('.terminal-instance').forEach(i => i.classList.remove('active'));
    instancesContainer.appendChild(instance);

    // Create xterm.js terminal
    const xterm = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        theme: {
            background: '#1e1e1e',
            foreground: '#cccccc',
            cursor: '#ffffff',
            cursorAccent: '#1e1e1e',
            selectionBackground: '#264f78',
            black: '#1e1e1e',
            red: '#f44747',
            green: '#6a9955',
            yellow: '#dcdcaa',
            blue: '#569cd6',
            magenta: '#c586c0',
            cyan: '#4ec9b0',
            white: '#d4d4d4',
            brightBlack: '#808080',
            brightRed: '#f44747',
            brightGreen: '#6a9955',
            brightYellow: '#dcdcaa',
            brightBlue: '#569cd6',
            brightMagenta: '#c586c0',
            brightCyan: '#4ec9b0',
            brightWhite: '#ffffff'
        },
        allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(instance);

    // Fit terminal to container
    setTimeout(() => {
        fitAddon.fit();
    }, 100);

    // Store terminal info
    terminals.set(id, {
        name: termName,
        xterm: xterm,
        fitAddon: fitAddon,
        ptyConnected: false
    });

    activeTerminalId = id;

    // Try to create PTY
    if (ptyAvailable) {
        const result = await ipcRenderer.invoke('pty-create', id, currentFolder || process.cwd());
        if (result.success) {
            terminals.get(id).ptyConnected = true;

            // Send input to PTY
            xterm.onData(data => {
                ipcRenderer.send('pty-write', id, data);
            });

            // Handle resize
            xterm.onResize(({ cols, rows }) => {
                ipcRenderer.send('pty-resize', id, cols, rows);
            });
        } else {
            xterm.write(`\x1b[31mFailed to start PTY: ${result.error}\x1b[0m\r\n`);
            xterm.write(`\x1b[33mFalling back to basic mode. Run: npm install && npm run postinstall\x1b[0m\r\n`);
        }
    } else {
        xterm.write(`\x1b[33mPTY not available. Install node-pty for full terminal support.\x1b[0m\r\n`);
        xterm.write(`\x1b[33mRun: npm install && npm run postinstall\x1b[0m\r\n`);
    }

    // Focus terminal
    xterm.focus();

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        const term = terminals.get(id);
        if (term && term.ptyConnected) {
            ipcRenderer.send('pty-resize', id, xterm.cols, xterm.rows);
        }
    });
    resizeObserver.observe(instance);

    return id;
}

function activateTerminal(id) {
    if (!terminals.has(id)) return;

    activeTerminalId = id;

    // Update tabs
    document.querySelectorAll('.terminal-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.id === id);
    });

    // Update instances
    document.querySelectorAll('.terminal-instance').forEach(i => {
        i.classList.toggle('active', i.dataset.id === id);
    });

    // Focus xterm
    const term = terminals.get(id);
    if (term && term.xterm) {
        term.xterm.focus();
        term.fitAddon.fit();
    }
}

function closeTerminal(id) {
    const term = terminals.get(id);
    if (term) {
        // Kill PTY process
        if (term.ptyConnected) {
            ipcRenderer.send('pty-kill', id);
        }
        // Dispose xterm
        if (term.xterm) {
            term.xterm.dispose();
        }
    }

    terminals.delete(id);

    document.querySelector(`.terminal-tab[data-id="${id}"]`)?.remove();
    document.querySelector(`.terminal-instance[data-id="${id}"]`)?.remove();

    // Activate another terminal or hide panel
    if (terminals.size > 0) {
        const nextId = terminals.keys().next().value;
        activateTerminal(nextId);
    } else {
        document.getElementById('terminal-panel').classList.remove('visible');
    }
}

function killAllTerminals() {
    terminals.forEach((term, id) => {
        if (term.ptyConnected) {
            ipcRenderer.send('pty-kill', id);
        }
        if (term.xterm) {
            term.xterm.dispose();
        }
    });
    document.getElementById('terminal-tabs').innerHTML = '';
    document.getElementById('terminal-instances').innerHTML = '';
    terminals.clear();
    terminalCounter = 0;
}

async function runInTerminal(command, termId = null) {
    const id = termId || activeTerminalId;
    const term = terminals.get(id);

    if (!term) return;

    if (term.ptyConnected) {
        // Send command to PTY
        ipcRenderer.send('pty-write', id, command + '\r');
    } else {
        // Fallback: run command and show output
        term.xterm.write(`\x1b[36m$ ${command}\x1b[0m\r\n`);
        const result = await ipcRenderer.invoke('run-terminal-command', command, currentFolder);
        if (result.stdout) {
            term.xterm.write(result.stdout.replace(/\n/g, '\r\n'));
        }
        if (result.stderr) {
            term.xterm.write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
        }
        term.xterm.write('\r\n');
    }
}

function runInNewTerminal(command, name) {
    // Show terminal panel
    const terminalPanel = document.getElementById('terminal-panel');
    if (!terminalPanel.classList.contains('visible')) {
        terminalPanel.classList.add('visible');
    }

    createTerminal(name).then(id => {
        // Wait for PTY to be ready, then send command
        setTimeout(() => runInTerminal(command, id), 500);
    });
}

function toggleTerminal() {
    const terminalPanel = document.getElementById('terminal-panel');
    terminalPanel.classList.toggle('visible');

    if (terminalPanel.classList.contains('visible')) {
        if (terminals.size === 0) {
            createTerminal();
        } else {
            const instance = document.querySelector(`.terminal-instance[data-id="${activeTerminalId}"]`);
            instance?.querySelector('.terminal-input')?.focus();
        }
    }
}

// Terminal panel controls
document.getElementById('terminal-close')?.addEventListener('click', () => {
    document.getElementById('terminal-panel').classList.remove('visible');
});

document.getElementById('terminal-new')?.addEventListener('click', () => {
    createTerminal();
});

document.getElementById('terminal-clear')?.addEventListener('click', () => {
    const instance = document.querySelector(`.terminal-instance[data-id="${activeTerminalId}"]`);
    const output = instance?.querySelector('.terminal-output');
    if (output) output.innerHTML = '';
});

document.getElementById('terminal-maximize')?.addEventListener('click', () => {
    document.getElementById('terminal-panel').classList.toggle('maximized');
});

// Terminal fullscreen (inside IDE)
document.getElementById('terminal-fullscreen')?.addEventListener('click', () => {
    const panel = document.getElementById('terminal-panel');
    panel.classList.toggle('fullscreen');

    // Refit all terminals when entering/exiting fullscreen
    terminals.forEach(term => {
        if (term.fitAddon) {
            setTimeout(() => term.fitAddon.fit(), 100);
        }
    });
});

// Terminal pop-out (detached window)
document.getElementById('terminal-popout')?.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('create-detached-terminal', currentFolder);
    if (result.success) {
        console.log('Detached terminal created');
    }
});

// ESC to exit terminal fullscreen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const panel = document.getElementById('terminal-panel');
        if (panel.classList.contains('fullscreen')) {
            panel.classList.remove('fullscreen');
            terminals.forEach(term => {
                if (term.fitAddon) setTimeout(() => term.fitAddon.fit(), 100);
            });
        }
    }
    // F11 toggle fullscreen terminal
    if (e.key === 'F11' && document.getElementById('terminal-panel').classList.contains('visible')) {
        e.preventDefault();
        document.getElementById('terminal-fullscreen')?.click();
    }
});

// Terminal resize
let isResizing = false;
let startY = 0;
let startHeight = 0;

document.getElementById('terminal-resize')?.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = document.getElementById('terminal-panel').offsetHeight;
    document.body.style.cursor = 'ns-resize';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = startY - e.clientY;
    const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, startHeight + delta));
    document.getElementById('terminal-panel').style.height = newHeight + 'px';
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Aether Integration
// ============================================
async function loadFileSymbols(filePath) {
    if (!currentFolder) return;

    try {
        const result = await ipcRenderer.invoke('aether-command', 'list_symbols', [], currentFolder);
        if (result.symbols) {
            symbols = result.symbols.filter(s =>
                s.file === filePath || s.file?.endsWith(path.basename(filePath))
            );
            renderSymbols(symbols);
        }
    } catch (err) {
        console.error('Failed to load symbols:', err);
    }
}

async function indexProject() {
    if (!currentFolder) {
        updateStatus('No folder open');
        return;
    }

    updateStatus('Indexing project...');

    try {
        const result = await ipcRenderer.invoke('aether-command', 'index', [], currentFolder);
        updateStatus(`Indexed: ${result.total_symbols || 0} symbols in ${result.files_indexed || 0} files`);

        const symbolsResult = await ipcRenderer.invoke('aether-command', 'list_symbols', [], currentFolder);
        if (symbolsResult.symbols) {
            symbols = symbolsResult.symbols;
            renderSymbols(symbols);
        }
    } catch (err) {
        updateStatus('Index failed: ' + err.message);
    }
}

async function onboardProject() {
    if (!currentFolder) {
        updateStatus('No folder open');
        return;
    }

    updateStatus('Onboarding project...');

    try {
        await ipcRenderer.invoke('aether-command', 'onboard', [], currentFolder);
        updateStatus('Project onboarded successfully');
    } catch (err) {
        updateStatus('Onboard failed: ' + err.message);
    }
}

function renderSymbols(symbolList) {
    const symbolTree = document.getElementById('symbol-tree');

    if (!symbolList || symbolList.length === 0) {
        symbolTree.innerHTML = '<div class="empty-state">No symbols found</div>';
        return;
    }

    symbolTree.innerHTML = '';

    const grouped = {};
    symbolList.forEach(s => {
        if (!grouped[s.type]) grouped[s.type] = [];
        grouped[s.type].push(s);
    });

    Object.keys(grouped).sort().forEach(type => {
        const typeHeader = document.createElement('div');
        typeHeader.style.cssText = 'padding: 8px 12px; font-size: 11px; color: #858585; text-transform: uppercase;';
        typeHeader.textContent = type + 's';
        symbolTree.appendChild(typeHeader);

        grouped[type].forEach(sym => {
            const item = document.createElement('div');
            item.className = 'symbol-item';
            item.innerHTML = `
                <span class="symbol-icon ${sym.type.toLowerCase()}">${getSymbolIcon(sym.type)}</span>
                <span class="symbol-name">${sym.name}</span>
                <span class="symbol-type">:${sym.start_line}</span>
            `;

            item.addEventListener('click', () => {
                if (sym.file) {
                    openFile(sym.file).then(() => {
                        if (editor && sym.start_line) {
                            editor.revealLineInCenter(sym.start_line);
                            editor.setPosition({ lineNumber: sym.start_line, column: 1 });
                            editor.focus();
                        }
                    });
                }
            });

            symbolTree.appendChild(item);
        });
    });
}

function getSymbolIcon(type) {
    const icons = {
        'function': 'ƒ', 'class': 'C', 'method': 'm', 'variable': 'v',
        'constant': 'K', 'interface': 'I', 'enum': 'E', 'property': 'p',
        'type': 'T', 'module': 'M'
    };
    return icons[type?.toLowerCase()] || '•';
}

function updateStatus(message) {
    const status = document.getElementById('aether-status');
    if (status) status.textContent = message;
}

// Symbol filter
document.getElementById('symbol-search')?.addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    const filtered = symbols.filter(s =>
        s.name.toLowerCase().includes(filter) || s.type.toLowerCase().includes(filter)
    );
    renderSymbols(filtered);
});

// Aether button handlers
document.getElementById('btn-index')?.addEventListener('click', indexProject);
document.getElementById('btn-onboard')?.addEventListener('click', onboardProject);
document.getElementById('btn-find-refs')?.addEventListener('click', async () => {
    if (!activeFile || !editor) return;

    const position = editor.getPosition();
    const word = editor.getModel()?.getWordAtPosition(position);

    if (word) {
        updateStatus(`Finding references for "${word.word}"...`);
        try {
            const result = await ipcRenderer.invoke('aether-command', 'find_references', [word.word], currentFolder);
            updateStatus(`Found ${result.references?.length || 0} references`);
            console.log('References:', result);
        } catch (err) {
            updateStatus('Find references failed: ' + err.message);
        }
    } else {
        updateStatus('Place cursor on a symbol first');
    }
});

document.getElementById('btn-memories')?.addEventListener('click', async () => {
    if (!currentFolder) {
        updateStatus('No folder open');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('aether-command', 'list_memories', [], currentFolder);
        const count = result.memories?.length || 0;
        updateStatus(`${count} memories found`);
        if (count > 0) {
            console.log('Memories:', result.memories);
        }
    } catch (err) {
        updateStatus('No memories yet');
    }
});

document.getElementById('refresh-explorer')?.addEventListener('click', () => {
    if (currentFolder) loadFolder(currentFolder);
});

document.getElementById('refresh-symbols')?.addEventListener('click', indexProject);

// ============================================
// Keyboard Shortcuts
// ============================================
document.addEventListener('keydown', (e) => {
    // Ctrl+O - Open File
    if (e.ctrlKey && e.key === 'o' && !e.shiftKey) {
        e.preventDefault();
        openFileDialog();
    }
    // Ctrl+Shift+O - Open Folder
    if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        openFolderDialog();
    }
    // Ctrl+S - Save
    if (e.ctrlKey && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        saveCurrentFile();
    }
    // Ctrl+Shift+N - New Window
    if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        ipcRenderer.invoke('new-window');
    }
    // Ctrl+N - New File
    if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        createNewFile();
    }
    // Ctrl+` - Toggle Terminal
    if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
    }
    // Ctrl+B - Toggle Explorer
    if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        switchPanel('explorer');
    }
    // Ctrl+Shift+E - Toggle Symbols
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        switchPanel('symbols');
    }
    // Ctrl+Shift+I - Index Project
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        indexProject();
    }
    // Ctrl+Shift+G - Source Control
    if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        switchPanel('git');
    }
    // F5 - Build
    if (e.key === 'F5') {
        e.preventDefault();
        runInNewTerminal('npm run build', 'Build');
    }
    // F6 - Start
    if (e.key === 'F6') {
        e.preventDefault();
        runInNewTerminal('npm start', 'Start');
    }
    // F7 - Test
    if (e.key === 'F7') {
        e.preventDefault();
        runInNewTerminal('npm test', 'Test');
    }
    // Ctrl+Enter - Quick commit (when in Git panel)
    if (e.ctrlKey && e.key === 'Enter') {
        const commitInput = document.getElementById('commit-message');
        if (document.activeElement === commitInput) {
            e.preventDefault();
            document.getElementById('btn-git-commit-quick')?.click();
        }
    }
});

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initMonaco();
    loadRecentProjects();
    updateStatus('Ready');
    console.log('Aether IDE initialized');
});
