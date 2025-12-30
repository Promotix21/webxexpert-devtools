/**
 * Aether IDE - Renderer Process
 * Author: WebXExpert
 *
 * Main renderer script for the Aether IDE
 */

const { ipcRenderer } = require('electron');
const path = require('path');

// State
let currentFolder = null;
let openFiles = new Map(); // path -> { content, modified, model }
let activeFile = null;
let editor = null;
let terminal = null;
let symbols = [];

// Initialize Monaco Editor
require.config({ paths: { vs: '../../node_modules/monaco-editor/min/vs' } });

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
    editorContainer.querySelector('.monaco-editor').style.display = 'none';

    // Track changes
    editor.onDidChangeModelContent(() => {
        if (activeFile && openFiles.has(activeFile)) {
            const file = openFiles.get(activeFile);
            file.modified = true;
            updateTab(activeFile);
        }
    });

    // Keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveCurrentFile();
    });

    console.log('Monaco Editor initialized');
});

// Initialize Terminal (if xterm is available)
function initTerminal() {
    if (typeof Terminal !== 'undefined') {
        const terminalContainer = document.getElementById('terminal-container');
        terminal = new Terminal({
            theme: {
                background: '#1e1e1e',
                foreground: '#cccccc',
                cursor: '#ffffff'
            },
            fontFamily: "'Cascadia Code', Consolas, monospace",
            fontSize: 13,
            cursorBlink: true
        });
        terminal.open(terminalContainer);

        if (typeof FitAddon !== 'undefined') {
            const fitAddon = new FitAddon.FitAddon();
            terminal.loadAddon(fitAddon);
            fitAddon.fit();

            window.addEventListener('resize', () => fitAddon.fit());
        }

        terminal.writeln('Aether IDE Terminal');
        terminal.writeln('-------------------');
        terminal.write('$ ');
    }
}

// Sidebar tab switching
document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const panel = tab.dataset.panel;

        // Update tab active state
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update panel visibility
        document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`${panel}-panel`).classList.add('active');
    });
});

// File Tree Functions
async function loadFolder(folderPath) {
    currentFolder = folderPath;
    const result = await ipcRenderer.invoke('read-directory', folderPath);

    if (result.success) {
        const fileTree = document.getElementById('file-tree');
        fileTree.innerHTML = '';
        renderFileTree(result.items, fileTree, folderPath);
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
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === '__pycache__') {
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

                    // Load children if not already loaded
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

// File Operations
async function openFile(filePath) {
    // Check if already open
    if (openFiles.has(filePath)) {
        activateFile(filePath);
        return;
    }

    const result = await ipcRenderer.invoke('read-file', filePath);

    if (result.success) {
        // Detect language
        const ext = path.extname(filePath).toLowerCase();
        const languageMap = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.md': 'markdown',
            '.rs': 'rust',
            '.go': 'go',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.h': 'c',
            '.cs': 'csharp',
            '.rb': 'ruby',
            '.php': 'php',
            '.sh': 'shell',
            '.ps1': 'powershell',
            '.sql': 'sql',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.xml': 'xml'
        };

        const language = languageMap[ext] || 'plaintext';

        // Create Monaco model
        const model = monaco.editor.createModel(result.content, language, monaco.Uri.file(filePath));

        openFiles.set(filePath, {
            content: result.content,
            modified: false,
            model: model
        });

        createTab(filePath);
        activateFile(filePath);

        // Load symbols for this file
        loadFileSymbols(filePath);
    }
}

function activateFile(filePath) {
    if (!openFiles.has(filePath)) return;

    activeFile = filePath;
    const file = openFiles.get(filePath);

    // Set editor model
    editor.setModel(file.model);

    // Show editor, hide welcome
    document.getElementById('welcome-screen').style.display = 'none';
    document.querySelector('.monaco-editor').style.display = 'block';

    // Update tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-path="${CSS.escape(filePath)}"]`);
    if (tab) tab.classList.add('active');

    // Update file tree selection
    document.querySelectorAll('.file-item').forEach(f => f.classList.remove('selected'));
    const fileItem = document.querySelector(`.file-item[data-path="${CSS.escape(filePath)}"]`);
    if (fileItem) fileItem.classList.add('selected');
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

    tab.querySelector('.name').addEventListener('click', () => {
        activateFile(filePath);
    });

    tab.querySelector('.close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeFile(filePath);
    });

    // Deactivate other tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabs.appendChild(tab);
}

function updateTab(filePath) {
    const tab = document.querySelector(`.tab[data-path="${CSS.escape(filePath)}"]`);
    if (!tab) return;

    const file = openFiles.get(filePath);
    if (file.modified) {
        tab.classList.add('modified');
    } else {
        tab.classList.remove('modified');
    }
}

function closeFile(filePath) {
    const file = openFiles.get(filePath);
    if (!file) return;

    // TODO: Check for unsaved changes

    // Dispose model
    file.model.dispose();
    openFiles.delete(filePath);

    // Remove tab
    const tab = document.querySelector(`.tab[data-path="${CSS.escape(filePath)}"]`);
    if (tab) tab.remove();

    // Activate another file or show welcome
    if (openFiles.size > 0) {
        const nextFile = openFiles.keys().next().value;
        activateFile(nextFile);
    } else {
        activeFile = null;
        document.getElementById('welcome-screen').style.display = 'flex';
        document.querySelector('.monaco-editor').style.display = 'none';
    }
}

async function saveCurrentFile() {
    if (!activeFile || !openFiles.has(activeFile)) return;

    const file = openFiles.get(activeFile);
    const content = file.model.getValue();

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

// Aether Integration
async function loadFileSymbols(filePath) {
    try {
        const result = await ipcRenderer.invoke('aether-command', 'list_symbols', [currentFolder || path.dirname(filePath), '--filter', `file:${filePath}`]);

        if (result.symbols) {
            symbols = result.symbols.filter(s => s.file === filePath || s.file.endsWith(path.basename(filePath)));
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
        const result = await ipcRenderer.invoke('aether-command', 'index', [currentFolder]);
        updateStatus(`Indexed: ${result.total_symbols || 0} symbols in ${result.files_indexed || 0} files`);

        // Reload symbols
        const symbolsResult = await ipcRenderer.invoke('aether-command', 'list_symbols', [currentFolder]);
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
        const result = await ipcRenderer.invoke('aether-command', 'onboard', [currentFolder]);
        updateStatus('Project onboarded successfully');
        console.log('Onboard result:', result);
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

    // Group by type
    const grouped = {};
    symbolList.forEach(s => {
        if (!grouped[s.type]) grouped[s.type] = [];
        grouped[s.type].push(s);
    });

    Object.keys(grouped).sort().forEach(type => {
        const typeHeader = document.createElement('div');
        typeHeader.className = 'symbol-type-header';
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
                // Navigate to symbol
                if (sym.file) {
                    openFile(sym.file).then(() => {
                        editor.revealLineInCenter(sym.start_line);
                        editor.setPosition({ lineNumber: sym.start_line, column: 1 });
                        editor.focus();
                    });
                } else if (activeFile) {
                    editor.revealLineInCenter(sym.start_line);
                    editor.setPosition({ lineNumber: sym.start_line, column: 1 });
                    editor.focus();
                }
            });

            symbolTree.appendChild(item);
        });
    });
}

function getSymbolIcon(type) {
    const icons = {
        'function': 'ƒ',
        'class': 'C',
        'method': 'm',
        'variable': 'v',
        'constant': 'K',
        'interface': 'I',
        'enum': 'E',
        'property': 'p',
        'type': 'T',
        'module': 'M'
    };
    return icons[type.toLowerCase()] || '•';
}

function updateStatus(message) {
    document.getElementById('aether-status').textContent = message;
}

// Symbol filter
document.getElementById('symbol-search').addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    const filtered = symbols.filter(s =>
        s.name.toLowerCase().includes(filter) ||
        s.type.toLowerCase().includes(filter)
    );
    renderSymbols(filtered);
});

// Terminal toggle
document.getElementById('terminal-close').addEventListener('click', () => {
    document.getElementById('terminal-panel').classList.remove('visible');
});

// Aether button handlers
document.getElementById('btn-index').addEventListener('click', indexProject);
document.getElementById('btn-onboard').addEventListener('click', onboardProject);
document.getElementById('btn-find-refs').addEventListener('click', async () => {
    if (!activeFile) return;

    const position = editor.getPosition();
    const word = editor.getModel().getWordAtPosition(position);

    if (word) {
        updateStatus(`Finding references for "${word.word}"...`);
        try {
            const result = await ipcRenderer.invoke('aether-command', 'find_references', [currentFolder || path.dirname(activeFile), word.word]);
            updateStatus(`Found ${result.references?.length || 0} references`);
            console.log('References:', result);
        } catch (err) {
            updateStatus('Find references failed');
        }
    }
});

document.getElementById('btn-memories').addEventListener('click', async () => {
    if (!currentFolder) return;

    try {
        const result = await ipcRenderer.invoke('aether-command', 'list_memories', [currentFolder]);
        console.log('Memories:', result);
        updateStatus(`${result.memories?.length || 0} memories found`);
    } catch (err) {
        updateStatus('Failed to load memories');
    }
});

document.getElementById('refresh-explorer').addEventListener('click', () => {
    if (currentFolder) loadFolder(currentFolder);
});

document.getElementById('refresh-symbols').addEventListener('click', () => {
    if (currentFolder) indexProject();
});

// IPC event handlers
ipcRenderer.on('folder-opened', (event, folderPath) => {
    loadFolder(folderPath);
    updateStatus('Opened: ' + path.basename(folderPath));
});

ipcRenderer.on('file-opened', (event, filePath) => {
    openFile(filePath);
});

ipcRenderer.on('menu-save', () => {
    saveCurrentFile();
});

ipcRenderer.on('menu-save-as', async () => {
    if (!activeFile) return;

    const result = await ipcRenderer.invoke('show-save-dialog', activeFile);
    if (!result.canceled && result.filePath) {
        const file = openFiles.get(activeFile);
        const content = file.model.getValue();
        await ipcRenderer.invoke('write-file', result.filePath, content);
        updateStatus('Saved as: ' + path.basename(result.filePath));
    }
});

ipcRenderer.on('menu-new-file', () => {
    // Create untitled file
    const untitledPath = `untitled-${Date.now()}.txt`;
    const model = monaco.editor.createModel('', 'plaintext');

    openFiles.set(untitledPath, {
        content: '',
        modified: true,
        model: model
    });

    createTab(untitledPath);
    activateFile(untitledPath);
});

ipcRenderer.on('toggle-explorer', () => {
    document.querySelector('.sidebar-tab[data-panel="explorer"]').click();
});

ipcRenderer.on('toggle-symbols', () => {
    document.querySelector('.sidebar-tab[data-panel="symbols"]').click();
});

ipcRenderer.on('toggle-terminal', () => {
    const terminalPanel = document.getElementById('terminal-panel');
    terminalPanel.classList.toggle('visible');
    if (terminalPanel.classList.contains('visible') && !terminal) {
        initTerminal();
    }
});

ipcRenderer.on('aether-index', indexProject);
ipcRenderer.on('aether-symbols', () => {
    document.querySelector('.sidebar-tab[data-panel="symbols"]').click();
});
ipcRenderer.on('aether-onboard', onboardProject);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Aether IDE initialized');
    updateStatus('Ready');
});
