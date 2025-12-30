# Aether IDE

**WebXExpert**
*by Rajesh Kumar*

A lightweight code editor with AST-powered symbol navigation, built on Electron and Monaco Editor.

## Features

- **Monaco Editor** - Same editor engine as VS Code
- **Aether Integration** - AST-based symbol indexing for 30+ languages
- **Symbol Navigation** - Jump to definitions, find references
- **File Explorer** - Browse and manage project files
- **Cross-Platform** - Windows, Mac, Linux

## Quick Start

```bash
# Install dependencies
npm install

# Run the IDE
npm start

# Build for distribution
npm run build:win   # Windows
npm run build:mac   # macOS
npm run build:linux # Linux
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open File |
| `Ctrl+Shift+O` | Open Folder |
| `Ctrl+S` | Save |
| `Ctrl+Shift+I` | Index Project |
| `Ctrl+B` | Toggle Explorer |
| `F12` | Find References |

## Requirements

- Node.js 14+
- Python 3.10-3.12 (for Aether engine)

## License

MIT
