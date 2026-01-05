# Aether IDE - Claude Integration Guide

This project uses **Aether IDE** by WebXExpert (Rajesh Kumar), an Electron-based code editor with integrated AI assistance.

## Aether Engine Commands

The Aether Engine provides AST-powered code intelligence. Use these commands in the terminal:

```bash
# Index the current project (scans all code files for symbols)
python aether_engine.py index --project .

# Onboard project (creates AI-friendly summary)
python aether_engine.py onboard --project .

# List all indexed symbols
python aether_engine.py list_symbols --project .

# Find references to a symbol
python aether_engine.py find_references <symbol_name> --project .

# View stored memories/insights
python aether_engine.py list_memories --project .

# Add a memory/insight
python aether_engine.py write_memory "memory_name" --content "<content>" --project .
```

## Project Structure

When working in Aether IDE, the typical structure includes:

- `.aether/` - Aether cache and memories
  - `index.json` - Symbol index
  - `memories/` - Stored project insights
- `src/` - Source code
- `package.json` or `requirements.txt` - Dependencies

## Terminal Features

The integrated terminal supports:

- **Multiple tabs**: Create multiple terminal instances
- **Full screen mode**: Press F11 or click fullscreen button
- **Pop-out window**: Detach terminal to separate window (can move to other monitor)
- **Real PTY**: Full PowerShell/Bash support for interactive commands

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+O | Open File |
| Ctrl+Shift+O | Open Folder |
| Ctrl+S | Save |
| Ctrl+N | New File |
| Ctrl+` | Toggle Terminal |
| Ctrl+B | File Explorer |
| Ctrl+Shift+E | Symbols Panel |
| Ctrl+Shift+G | Git/Source Control |
| Ctrl+Shift+I | Index Project |
| F5 | Build (npm run build) |
| F6 | Start (npm start) |
| F7 | Test (npm test) |
| F11 | Toggle Terminal Fullscreen |
| ESC | Exit Fullscreen |

## Git Integration

Aether IDE has built-in Git support:

- View current branch
- Stage/unstage changes
- Commit with message
- Push/Pull
- View branches and log

Access via Ctrl+Shift+G or the Git menu.

## Working with Claude

1. **Index your project first**: Click "Index Project" in the Aether panel or press Ctrl+Shift+I
2. **Use the terminal**: Press Ctrl+` to open terminal, then run `claude` to start Claude CLI
3. **Reference symbols**: After indexing, you can ask Claude about specific functions, classes, or variables
4. **Store insights**: Use "Add Memory" to save important project context for future sessions

## File Types Supported

Aether Engine indexes these file types:
- Python (.py)
- JavaScript/TypeScript (.js, .jsx, .ts, .tsx)
- HTML/CSS (.html, .css)
- JSON (.json)
- Markdown (.md)
- Rust (.rs)
- Go (.go)
- Java (.java)
- C/C++ (.c, .cpp, .h)

## Best Practices

1. Always index the project when opening a new codebase
2. Use "Onboard Project" to generate a summary for large projects
3. Store important architectural decisions as memories
4. Use the Git panel for version control operations
5. Pop out the terminal when working with Claude for extended sessions
