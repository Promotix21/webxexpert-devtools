#!/usr/bin/env python3
"""
Aether Engine - AST-based Symbol Indexing and Manipulation
A cross-platform code intelligence engine using tree-sitter.

Features:
- Symbol indexing and search (function, class, method, variable, etc.)
- Reference finding across codebase
- Symbol replacement with diff preview
- Insert before/after symbols
- Line-level operations (delete, insert, replace)
- Rename symbol across codebase
- Memory system for persistent context
- Project onboarding and analysis
- Pattern search with regex support

Author: WebXExpert
License: MIT
"""

import sys
import os
import re
import json
import argparse
import hashlib
import difflib
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Set
from dataclasses import dataclass, asdict, field
from enum import Enum

# Ensure UTF-8 encoding for cross-platform compatibility
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

# -----------------------------------------------------------------------------
# LOGGING - All logs go to stderr, never stdout
# -----------------------------------------------------------------------------

def log_info(msg: str) -> None:
    """Log info message to stderr."""
    print(f"[AETHER:INFO] {msg}", file=sys.stderr)

def log_error(msg: str) -> None:
    """Log error message to stderr."""
    print(f"[AETHER:ERROR] {msg}", file=sys.stderr)

def log_warn(msg: str) -> None:
    """Log warning message to stderr."""
    print(f"[AETHER:WARN] {msg}", file=sys.stderr)

def log_debug(msg: str, verbose: bool = False) -> None:
    """Log debug message to stderr if verbose mode."""
    if verbose:
        print(f"[AETHER:DEBUG] {msg}", file=sys.stderr)

# -----------------------------------------------------------------------------
# CONSTANTS & CONFIGURATION
# -----------------------------------------------------------------------------

class SymbolType(Enum):
    FUNCTION = "function"
    CLASS = "class"
    METHOD = "method"
    VARIABLE = "variable"
    INTERFACE = "interface"
    TYPE_ALIAS = "type_alias"
    ENUM = "enum"
    CONSTANT = "constant"
    IMPORT = "import"
    EXPORT = "export"
    PROPERTY = "property"
    PARAMETER = "parameter"
    MODULE = "module"
    NAMESPACE = "namespace"

# Language file extensions mapping
LANGUAGE_MAP: Dict[str, str] = {
    ".py": "python",
    ".pyi": "python",
    ".pyw": "python",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hxx": "cpp",
    ".cs": "c_sharp",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".erb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".lua": "lua",
    ".r": "r",
    ".R": "r",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".html": "html",
    ".htm": "html",
    ".vue": "vue",
    ".svelte": "svelte",
    ".css": "css",
    ".scss": "scss",
    ".sass": "scss",
    ".less": "css",
    ".sql": "sql",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".fish": "bash",
    ".ps1": "powershell",
    ".psm1": "powershell",
    ".md": "markdown",
    ".mdx": "markdown",
    ".dart": "dart",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hrl": "erlang",
    ".hs": "haskell",
    ".lhs": "haskell",
    ".ml": "ocaml",
    ".mli": "ocaml",
    ".clj": "clojure",
    ".cljs": "clojure",
    ".cljc": "clojure",
    ".elm": "elm",
    ".zig": "zig",
    ".nim": "nim",
    ".v": "v",
    ".sol": "solidity",
}

# Directories and files to ignore
IGNORE_DIRS: Set[str] = {
    "node_modules", ".git", ".svn", ".hg", "__pycache__", ".pytest_cache",
    ".mypy_cache", ".tox", ".nox", ".eggs", "dist", "build",
    ".next", ".nuxt", ".output", ".vercel", ".netlify", "coverage",
    ".nyc_output", ".cache", ".parcel-cache", ".turbo", "venv", ".venv",
    "env", ".env", "virtualenv", ".virtualenv", "target", "out", "bin",
    "obj", ".idea", ".vscode", ".vs", "vendor", "bower_components",
    "jspm_packages", ".gradle", ".maven", "Pods", ".dart_tool",
    ".pub-cache", ".angular", ".serverless", ".terraform", "languages",
    ".aether", ".serena", "site-packages", "lib", "lib64", "include",
    "Scripts", "pyvenv.cfg", ".tsbuildinfo", ".eslintcache"
}

IGNORE_FILES: Set[str] = {
    ".DS_Store", "Thumbs.db", ".gitignore", ".gitattributes",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock",
    "poetry.lock", "Pipfile.lock", "composer.lock", "Gemfile.lock",
    ".npmrc", ".yarnrc", ".editorconfig", ".prettierrc", ".eslintrc",
    "tsconfig.tsbuildinfo", ".browserslistrc"
}

# Max file size to parse (5MB)
MAX_FILE_SIZE = 5 * 1024 * 1024

# Aether config directory name
AETHER_DIR = ".aether"
MEMORIES_DIR = "memories"
CONFIG_FILE = "config.json"
ONBOARDING_FILE = "onboarding.json"

# -----------------------------------------------------------------------------
# DATA STRUCTURES
# -----------------------------------------------------------------------------

@dataclass
class Symbol:
    """Represents a code symbol (function, class, method, etc.)."""
    id: str                    # Unique ID: "path/file.ext::Scope::Name"
    name: str                  # Symbol name
    type: str                  # Symbol type (function, class, etc.)
    file: str                  # Relative file path
    start_line: int            # 1-based start line
    end_line: int              # 1-based end line
    start_col: int             # 0-based start column
    end_col: int               # 0-based end column
    scope: Optional[str]       # Parent scope (class name, etc.)
    signature: Optional[str]   # Function signature if applicable
    docstring: Optional[str]   # Docstring/comment if available
    language: str              # Programming language
    decorators: List[str] = field(default_factory=list)  # Decorators/annotations
    modifiers: List[str] = field(default_factory=list)   # public/private/static etc.

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "file": self.file,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "start_col": self.start_col,
            "end_col": self.end_col,
            "scope": self.scope,
            "signature": self.signature,
            "docstring": self.docstring,
            "language": self.language,
            "decorators": self.decorators,
            "modifiers": self.modifiers
        }

@dataclass
class Reference:
    """Represents a reference to a symbol."""
    file: str
    line: int
    column: int
    context: str  # The line of code containing the reference
    is_definition: bool = False
    is_import: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file": self.file,
            "line": self.line,
            "column": self.column,
            "context": self.context,
            "is_definition": self.is_definition,
            "is_import": self.is_import
        }

@dataclass
class Memory:
    """Represents a stored memory/context."""
    name: str
    content: str
    created_at: str
    updated_at: str
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "content": self.content,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "tags": self.tags
        }

@dataclass
class ProjectInfo:
    """Project metadata and structure info."""
    name: str
    root: str
    languages: List[str]
    frameworks: List[str]
    total_files: int
    total_symbols: int
    structure: Dict[str, Any]
    build_commands: Dict[str, str]
    test_commands: Dict[str, str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

# -----------------------------------------------------------------------------
# TREE-SITTER PARSER
# -----------------------------------------------------------------------------

class TreeSitterParser:
    """Handles tree-sitter parsing for multiple languages."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.parsers: Dict[str, Any] = {}
        self._init_parsers()

    def _init_parsers(self) -> None:
        """Initialize tree-sitter parsers for supported languages."""
        try:
            import tree_sitter_languages
            self.ts_languages = tree_sitter_languages
            log_debug("tree-sitter-languages loaded successfully", self.verbose)
        except ImportError as e:
            log_error(f"Failed to import tree-sitter-languages: {e}")
            log_error("Install with: pip install tree-sitter-languages")
            self.ts_languages = None

    def get_parser(self, language: str) -> Optional[Any]:
        """Get or create a parser for the specified language."""
        if self.ts_languages is None:
            return None

        if language in self.parsers:
            return self.parsers[language]

        try:
            parser = self.ts_languages.get_parser(language)
            self.parsers[language] = parser
            log_debug(f"Created parser for {language}", self.verbose)
            return parser
        except Exception as e:
            log_debug(f"No parser available for {language}: {e}", self.verbose)
            return None

    def parse(self, code: str, language: str) -> Optional[Any]:
        """Parse code and return the syntax tree."""
        parser = self.get_parser(language)
        if parser is None:
            return None

        try:
            tree = parser.parse(bytes(code, "utf-8"))
            return tree
        except Exception as e:
            log_error(f"Parse error for {language}: {e}")
            return None

    def get_language(self, language: str) -> Optional[Any]:
        """Get the language object for queries."""
        if self.ts_languages is None:
            return None
        try:
            return self.ts_languages.get_language(language)
        except Exception:
            return None

# -----------------------------------------------------------------------------
# SYMBOL EXTRACTOR - Language-specific extraction logic
# -----------------------------------------------------------------------------

class SymbolExtractor:
    """Extracts symbols from parsed syntax trees."""

    # Node types that represent symbols in different languages
    SYMBOL_NODE_TYPES = {
        "python": {
            "function_definition": SymbolType.FUNCTION,
            "class_definition": SymbolType.CLASS,
            "decorated_definition": None,  # Handle specially
            "assignment": SymbolType.VARIABLE,
        },
        "javascript": {
            "function_declaration": SymbolType.FUNCTION,
            "function_expression": SymbolType.FUNCTION,
            "arrow_function": SymbolType.FUNCTION,
            "class_declaration": SymbolType.CLASS,
            "class_expression": SymbolType.CLASS,
            "method_definition": SymbolType.METHOD,
            "variable_declarator": SymbolType.VARIABLE,
            "lexical_declaration": None,
            "variable_declaration": None,
            "export_statement": None,
        },
        "typescript": {
            "function_declaration": SymbolType.FUNCTION,
            "function_expression": SymbolType.FUNCTION,
            "arrow_function": SymbolType.FUNCTION,
            "class_declaration": SymbolType.CLASS,
            "class_expression": SymbolType.CLASS,
            "method_definition": SymbolType.METHOD,
            "method_signature": SymbolType.METHOD,
            "interface_declaration": SymbolType.INTERFACE,
            "type_alias_declaration": SymbolType.TYPE_ALIAS,
            "enum_declaration": SymbolType.ENUM,
            "variable_declarator": SymbolType.VARIABLE,
            "module": SymbolType.MODULE,
            "namespace": SymbolType.NAMESPACE,
        },
        "tsx": {
            "function_declaration": SymbolType.FUNCTION,
            "function_expression": SymbolType.FUNCTION,
            "arrow_function": SymbolType.FUNCTION,
            "class_declaration": SymbolType.CLASS,
            "class_expression": SymbolType.CLASS,
            "method_definition": SymbolType.METHOD,
            "interface_declaration": SymbolType.INTERFACE,
            "type_alias_declaration": SymbolType.TYPE_ALIAS,
            "enum_declaration": SymbolType.ENUM,
            "variable_declarator": SymbolType.VARIABLE,
        },
        "java": {
            "method_declaration": SymbolType.METHOD,
            "constructor_declaration": SymbolType.METHOD,
            "class_declaration": SymbolType.CLASS,
            "interface_declaration": SymbolType.INTERFACE,
            "enum_declaration": SymbolType.ENUM,
            "field_declaration": SymbolType.VARIABLE,
            "annotation_type_declaration": SymbolType.INTERFACE,
        },
        "go": {
            "function_declaration": SymbolType.FUNCTION,
            "method_declaration": SymbolType.METHOD,
            "type_declaration": SymbolType.TYPE_ALIAS,
            "type_spec": SymbolType.TYPE_ALIAS,
            "var_declaration": SymbolType.VARIABLE,
            "const_declaration": SymbolType.CONSTANT,
            "var_spec": SymbolType.VARIABLE,
            "const_spec": SymbolType.CONSTANT,
        },
        "rust": {
            "function_item": SymbolType.FUNCTION,
            "impl_item": SymbolType.CLASS,
            "struct_item": SymbolType.CLASS,
            "enum_item": SymbolType.ENUM,
            "trait_item": SymbolType.INTERFACE,
            "type_item": SymbolType.TYPE_ALIAS,
            "const_item": SymbolType.CONSTANT,
            "static_item": SymbolType.VARIABLE,
            "mod_item": SymbolType.MODULE,
            "macro_definition": SymbolType.FUNCTION,
        },
        "c": {
            "function_definition": SymbolType.FUNCTION,
            "function_declarator": SymbolType.FUNCTION,
            "declaration": SymbolType.VARIABLE,
            "struct_specifier": SymbolType.CLASS,
            "enum_specifier": SymbolType.ENUM,
            "type_definition": SymbolType.TYPE_ALIAS,
            "preproc_def": SymbolType.CONSTANT,
        },
        "cpp": {
            "function_definition": SymbolType.FUNCTION,
            "class_specifier": SymbolType.CLASS,
            "struct_specifier": SymbolType.CLASS,
            "enum_specifier": SymbolType.ENUM,
            "declaration": SymbolType.VARIABLE,
            "namespace_definition": SymbolType.NAMESPACE,
            "template_declaration": None,
        },
        "c_sharp": {
            "method_declaration": SymbolType.METHOD,
            "constructor_declaration": SymbolType.METHOD,
            "class_declaration": SymbolType.CLASS,
            "interface_declaration": SymbolType.INTERFACE,
            "struct_declaration": SymbolType.CLASS,
            "enum_declaration": SymbolType.ENUM,
            "property_declaration": SymbolType.PROPERTY,
            "field_declaration": SymbolType.VARIABLE,
            "namespace_declaration": SymbolType.NAMESPACE,
            "delegate_declaration": SymbolType.TYPE_ALIAS,
        },
        "ruby": {
            "method": SymbolType.METHOD,
            "singleton_method": SymbolType.METHOD,
            "class": SymbolType.CLASS,
            "module": SymbolType.MODULE,
            "assignment": SymbolType.VARIABLE,
        },
        "php": {
            "function_definition": SymbolType.FUNCTION,
            "method_declaration": SymbolType.METHOD,
            "class_declaration": SymbolType.CLASS,
            "interface_declaration": SymbolType.INTERFACE,
            "trait_declaration": SymbolType.CLASS,
            "property_declaration": SymbolType.PROPERTY,
            "namespace_definition": SymbolType.NAMESPACE,
        },
        "kotlin": {
            "function_declaration": SymbolType.FUNCTION,
            "class_declaration": SymbolType.CLASS,
            "object_declaration": SymbolType.CLASS,
            "interface_declaration": SymbolType.INTERFACE,
            "property_declaration": SymbolType.PROPERTY,
        },
        "swift": {
            "function_declaration": SymbolType.FUNCTION,
            "class_declaration": SymbolType.CLASS,
            "struct_declaration": SymbolType.CLASS,
            "protocol_declaration": SymbolType.INTERFACE,
            "enum_declaration": SymbolType.ENUM,
            "typealias_declaration": SymbolType.TYPE_ALIAS,
        },
    }

    def __init__(self, verbose: bool = False):
        self.verbose = verbose

    def extract_symbols(self, tree: Any, code: str, file_path: str,
                        language: str) -> List[Symbol]:
        """Extract all symbols from a syntax tree."""
        symbols = []
        lines = code.split('\n')

        def get_node_text(node: Any) -> str:
            """Get the text content of a node."""
            return code[node.start_byte:node.end_byte]

        def get_name_from_node(node: Any, lang: str) -> Optional[str]:
            """Extract the name identifier from a node."""
            # Try common patterns for finding name
            for child in node.children:
                if child.type in ('identifier', 'name', 'property_identifier',
                                  'type_identifier', 'constant', 'simple_identifier'):
                    return get_node_text(child)
                # For variable declarators
                if child.type == 'variable_declarator':
                    for subchild in child.children:
                        if subchild.type in ('identifier', 'name'):
                            return get_node_text(subchild)

            # Python-specific: function/class name is second child
            if lang == 'python' and len(node.children) >= 2:
                if node.children[1].type == 'identifier':
                    return get_node_text(node.children[1])

            # Go-specific
            if lang == 'go':
                for child in node.children:
                    if child.type == 'identifier':
                        return get_node_text(child)
                    if child.type in ('type_spec', 'var_spec', 'const_spec'):
                        for subchild in child.children:
                            if subchild.type == 'identifier':
                                return get_node_text(subchild)

            # Fallback: look for any identifier
            for child in node.children:
                if 'identifier' in child.type or 'name' in child.type:
                    return get_node_text(child)

            return None

        def get_signature(node: Any, lang: str) -> Optional[str]:
            """Extract function/method signature."""
            if lang == 'python':
                for child in node.children:
                    if child.type == 'parameters':
                        return get_node_text(child)
            elif lang in ('javascript', 'typescript', 'tsx'):
                for child in node.children:
                    if child.type == 'formal_parameters':
                        return get_node_text(child)
            elif lang == 'go':
                for child in node.children:
                    if child.type == 'parameter_list':
                        return get_node_text(child)
            elif lang in ('java', 'c_sharp', 'kotlin'):
                for child in node.children:
                    if child.type == 'formal_parameters':
                        return get_node_text(child)
            return None

        def get_docstring(node: Any, lang: str, lines: List[str]) -> Optional[str]:
            """Extract docstring or leading comment."""
            if lang == 'python':
                for child in node.children:
                    if child.type == 'block':
                        for block_child in child.children:
                            if block_child.type == 'expression_statement':
                                for expr_child in block_child.children:
                                    if expr_child.type == 'string':
                                        doc = get_node_text(expr_child)
                                        if doc.startswith('"""') or doc.startswith("'''"):
                                            return doc[3:-3].strip()
                                        return doc.strip('"\'')
                            break

            # Check for leading comment
            start_line = node.start_point[0]
            if start_line > 0:
                prev_line = lines[start_line - 1].strip()
                if prev_line.startswith('//') or prev_line.startswith('#'):
                    return prev_line.lstrip('/#').strip()
                if prev_line.endswith('*/'):
                    # Multi-line comment - try to find start
                    for i in range(start_line - 1, max(0, start_line - 10), -1):
                        if '/*' in lines[i]:
                            comment_lines = lines[i:start_line]
                            return ' '.join(l.strip().lstrip('/*').rstrip('*/').strip()
                                          for l in comment_lines if l.strip())
                            break

            return None

        def get_decorators(node: Any, lang: str) -> List[str]:
            """Extract decorators/annotations."""
            decorators = []
            if lang == 'python':
                if node.type == 'decorated_definition':
                    for child in node.children:
                        if child.type == 'decorator':
                            decorators.append(get_node_text(child))
            elif lang in ('java', 'kotlin', 'c_sharp'):
                # Look for annotations in parent or siblings
                parent = node.parent
                if parent:
                    for child in parent.children:
                        if child.type in ('annotation', 'attribute', 'modifiers'):
                            if child.end_point[0] < node.start_point[0]:
                                decorators.append(get_node_text(child))
            return decorators

        def get_modifiers(node: Any, lang: str) -> List[str]:
            """Extract access modifiers (public, private, static, etc.)."""
            modifiers = []
            if lang in ('java', 'c_sharp', 'kotlin', 'typescript'):
                for child in node.children:
                    if child.type in ('modifiers', 'accessibility_modifier'):
                        text = get_node_text(child)
                        modifiers.extend(text.split())
                    elif child.type in ('public', 'private', 'protected', 'static',
                                       'final', 'abstract', 'readonly', 'async'):
                        modifiers.append(child.type)
            return modifiers

        def walk_tree(node: Any, scope: Optional[str] = None,
                      decorators: List[str] = None) -> None:
            """Recursively walk the tree and extract symbols."""
            if decorators is None:
                decorators = []

            node_types = self.SYMBOL_NODE_TYPES.get(language, {})
            symbol_type = node_types.get(node.type)

            # Special handling for decorated definitions (Python)
            if node.type == 'decorated_definition' and language == 'python':
                decos = get_decorators(node, language)
                for child in node.children:
                    if child.type in ('function_definition', 'class_definition'):
                        walk_tree(child, scope, decos)
                return

            # Special handling for variable declarations
            if node.type in ('lexical_declaration', 'variable_declaration',
                            'var_declaration', 'const_declaration'):
                for child in node.children:
                    if child.type in ('variable_declarator', 'var_spec', 'const_spec'):
                        walk_tree(child, scope, decorators)
                return

            if symbol_type is not None:
                name = get_name_from_node(node, language)
                if name:
                    # Create unique ID
                    scope_part = f"::{scope}" if scope else ""
                    symbol_id = f"{file_path}{scope_part}::{name}"

                    # Get additional info
                    signature = get_signature(node, language)
                    docstring = get_docstring(node, language, lines)
                    node_decorators = decorators or get_decorators(node, language)
                    modifiers = get_modifiers(node, language)

                    symbol = Symbol(
                        id=symbol_id,
                        name=name,
                        type=symbol_type.value,
                        file=file_path,
                        start_line=node.start_point[0] + 1,  # 1-based
                        end_line=node.end_point[0] + 1,
                        start_col=node.start_point[1],
                        end_col=node.end_point[1],
                        scope=scope,
                        signature=signature,
                        docstring=docstring,
                        language=language,
                        decorators=node_decorators,
                        modifiers=modifiers
                    )
                    symbols.append(symbol)
                    log_debug(f"Found symbol: {symbol.id}", self.verbose)

                    # Update scope for nested symbols
                    if symbol_type in (SymbolType.CLASS, SymbolType.INTERFACE,
                                      SymbolType.MODULE, SymbolType.NAMESPACE):
                        scope = name

            # Recurse into children
            for child in node.children:
                new_scope = scope
                if node.type in ('class_body', 'interface_body', 'block',
                               'declaration_list', 'class_declaration'):
                    new_scope = scope
                walk_tree(child, new_scope)

        walk_tree(tree.root_node)
        return symbols

# -----------------------------------------------------------------------------
# REFERENCE FINDER
# -----------------------------------------------------------------------------

class ReferenceFinder:
    """Finds references to symbols across files."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose

    def find_references(self, symbol_name: str, files: Dict[str, str],
                       include_imports: bool = True) -> List[Reference]:
        """Find all references to a symbol name across files."""
        references = []
        # Compile pattern for word boundary matching
        pattern = re.compile(r'\b' + re.escape(symbol_name) + r'\b')

        for file_path, content in files.items():
            lines = content.split('\n')
            for i, line in enumerate(lines):
                for match in pattern.finditer(line):
                    # Determine if this is an import
                    is_import = any(kw in line.lower() for kw in
                                   ['import ', 'from ', 'require(', 'using ', 'use '])

                    # Determine if this is a definition
                    is_def = any(kw in line for kw in
                               ['def ', 'function ', 'class ', 'interface ',
                                'struct ', 'enum ', 'type ', 'const ', 'let ', 'var '])

                    if not include_imports and is_import:
                        continue

                    references.append(Reference(
                        file=file_path,
                        line=i + 1,  # 1-based
                        column=match.start(),
                        context=line.strip(),
                        is_definition=is_def,
                        is_import=is_import
                    ))

        return references

# -----------------------------------------------------------------------------
# CODE MODIFIER - Handles all code modifications
# -----------------------------------------------------------------------------

class CodeModifier:
    """Handles symbol replacement, line operations, and code insertions."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose

    def _generate_diff(self, old_content: str, new_content: str,
                       file_path: str) -> str:
        """Generate unified diff between old and new content."""
        diff = difflib.unified_diff(
            old_content.split('\n'),
            new_content.split('\n'),
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
            lineterm=''
        )
        return '\n'.join(diff)

    def replace_symbol(self, symbol: Symbol, new_code: str,
                       file_content: str, dry_run: bool = True) -> Dict[str, Any]:
        """Replace a symbol's code with new code."""
        lines = file_content.split('\n')
        start_idx = symbol.start_line - 1
        end_idx = symbol.end_line

        if start_idx < 0 or end_idx > len(lines):
            return {
                "success": False,
                "diff": "",
                "message": f"Invalid line range: {symbol.start_line}-{symbol.end_line}"
            }

        original_lines = lines[start_idx:end_idx]
        original_code = '\n'.join(original_lines)

        # Detect and preserve indentation
        first_line = original_lines[0] if original_lines else ""
        indent = len(first_line) - len(first_line.lstrip())
        indent_str = first_line[:indent]

        # Apply indentation to new code
        new_code_lines = new_code.split('\n')
        indented_new_code = []
        for i, line in enumerate(new_code_lines):
            if i == 0:
                indented_new_code.append(indent_str + line.lstrip())
            elif line.strip():
                # Preserve relative indentation from new code
                line_indent = len(line) - len(line.lstrip())
                indented_new_code.append(indent_str + line)
            else:
                indented_new_code.append(line)

        new_lines = lines[:start_idx] + indented_new_code + lines[end_idx:]
        new_content = '\n'.join(new_lines)
        diff_str = self._generate_diff(file_content, new_content, symbol.file)

        result = {
            "success": True,
            "diff": diff_str,
            "original_code": original_code,
            "new_code": '\n'.join(indented_new_code),
            "message": "Dry run - no changes applied" if dry_run else "Changes applied"
        }

        if not dry_run:
            result["new_content"] = new_content

        return result

    def insert_before_symbol(self, symbol: Symbol, code: str,
                            file_content: str, dry_run: bool = True) -> Dict[str, Any]:
        """Insert code before a symbol."""
        lines = file_content.split('\n')
        insert_idx = symbol.start_line - 1

        # Get indentation of the symbol
        symbol_line = lines[insert_idx] if insert_idx < len(lines) else ""
        indent = len(symbol_line) - len(symbol_line.lstrip())
        indent_str = symbol_line[:indent]

        # Apply indentation to inserted code
        code_lines = code.split('\n')
        indented_code = [indent_str + line.lstrip() if line.strip() else line
                        for line in code_lines]
        indented_code.append('')  # Add blank line after

        new_lines = lines[:insert_idx] + indented_code + lines[insert_idx:]
        new_content = '\n'.join(new_lines)
        diff_str = self._generate_diff(file_content, new_content, symbol.file)

        result = {
            "success": True,
            "diff": diff_str,
            "inserted_at_line": symbol.start_line,
            "message": "Dry run - no changes applied" if dry_run else "Changes applied"
        }

        if not dry_run:
            result["new_content"] = new_content

        return result

    def insert_after_symbol(self, symbol: Symbol, code: str,
                           file_content: str, dry_run: bool = True) -> Dict[str, Any]:
        """Insert code after a symbol."""
        lines = file_content.split('\n')
        insert_idx = symbol.end_line  # After the last line

        # Get indentation of the symbol
        symbol_line = lines[symbol.start_line - 1] if symbol.start_line <= len(lines) else ""
        indent = len(symbol_line) - len(symbol_line.lstrip())
        indent_str = symbol_line[:indent]

        # Apply indentation to inserted code
        code_lines = code.split('\n')
        indented_code = ['']  # Add blank line before
        indented_code.extend([indent_str + line.lstrip() if line.strip() else line
                             for line in code_lines])

        new_lines = lines[:insert_idx] + indented_code + lines[insert_idx:]
        new_content = '\n'.join(new_lines)
        diff_str = self._generate_diff(file_content, new_content, symbol.file)

        result = {
            "success": True,
            "diff": diff_str,
            "inserted_at_line": symbol.end_line + 1,
            "message": "Dry run - no changes applied" if dry_run else "Changes applied"
        }

        if not dry_run:
            result["new_content"] = new_content

        return result

    def delete_lines(self, file_path: str, start_line: int, end_line: int,
                    file_content: str, dry_run: bool = True) -> Dict[str, Any]:
        """Delete a range of lines from a file."""
        lines = file_content.split('\n')

        if start_line < 1 or end_line > len(lines) or start_line > end_line:
            return {
                "success": False,
                "message": f"Invalid line range: {start_line}-{end_line} (file has {len(lines)} lines)"
            }

        deleted_lines = lines[start_line - 1:end_line]
        new_lines = lines[:start_line - 1] + lines[end_line:]
        new_content = '\n'.join(new_lines)
        diff_str = self._generate_diff(file_content, new_content, file_path)

        result = {
            "success": True,
            "diff": diff_str,
            "deleted_lines": deleted_lines,
            "lines_deleted": end_line - start_line + 1,
            "message": "Dry run - no changes applied" if dry_run else "Changes applied"
        }

        if not dry_run:
            result["new_content"] = new_content

        return result

    def insert_at_line(self, file_path: str, line_number: int, code: str,
                      file_content: str, dry_run: bool = True) -> Dict[str, Any]:
        """Insert code at a specific line number."""
        lines = file_content.split('\n')

        if line_number < 1 or line_number > len(lines) + 1:
            return {
                "success": False,
                "message": f"Invalid line number: {line_number} (file has {len(lines)} lines)"
            }

        insert_idx = line_number - 1
        code_lines = code.split('\n')

        new_lines = lines[:insert_idx] + code_lines + lines[insert_idx:]
        new_content = '\n'.join(new_lines)
        diff_str = self._generate_diff(file_content, new_content, file_path)

        result = {
            "success": True,
            "diff": diff_str,
            "inserted_at_line": line_number,
            "lines_inserted": len(code_lines),
            "message": "Dry run - no changes applied" if dry_run else "Changes applied"
        }

        if not dry_run:
            result["new_content"] = new_content

        return result

    def replace_lines(self, file_path: str, start_line: int, end_line: int,
                     new_code: str, file_content: str, dry_run: bool = True) -> Dict[str, Any]:
        """Replace a range of lines with new code."""
        lines = file_content.split('\n')

        if start_line < 1 or end_line > len(lines) or start_line > end_line:
            return {
                "success": False,
                "message": f"Invalid line range: {start_line}-{end_line}"
            }

        original_lines = lines[start_line - 1:end_line]
        new_code_lines = new_code.split('\n')

        new_lines = lines[:start_line - 1] + new_code_lines + lines[end_line:]
        new_content = '\n'.join(new_lines)
        diff_str = self._generate_diff(file_content, new_content, file_path)

        result = {
            "success": True,
            "diff": diff_str,
            "original_lines": original_lines,
            "new_lines": new_code_lines,
            "message": "Dry run - no changes applied" if dry_run else "Changes applied"
        }

        if not dry_run:
            result["new_content"] = new_content

        return result

    def rename_symbol(self, old_name: str, new_name: str,
                     files: Dict[str, str], dry_run: bool = True) -> Dict[str, Any]:
        """Rename a symbol across all files."""
        changes = []
        modified_files = {}
        pattern = re.compile(r'\b' + re.escape(old_name) + r'\b')

        for file_path, content in files.items():
            if pattern.search(content):
                new_content = pattern.sub(new_name, content)
                if new_content != content:
                    diff_str = self._generate_diff(content, new_content, file_path)
                    count = len(pattern.findall(content))
                    changes.append({
                        "file": file_path,
                        "replacements": count,
                        "diff": diff_str
                    })
                    if not dry_run:
                        modified_files[file_path] = new_content

        result = {
            "success": True,
            "old_name": old_name,
            "new_name": new_name,
            "files_affected": len(changes),
            "total_replacements": sum(c["replacements"] for c in changes),
            "changes": changes,
            "message": "Dry run - no changes applied" if dry_run else "Changes applied"
        }

        if not dry_run:
            result["modified_files"] = modified_files

        return result

# -----------------------------------------------------------------------------
# MEMORY MANAGER - Persistent context storage
# -----------------------------------------------------------------------------

class MemoryManager:
    """Manages persistent memories/context for the project."""

    def __init__(self, project_root: Path, verbose: bool = False):
        self.project_root = project_root
        self.verbose = verbose
        self.aether_dir = project_root / AETHER_DIR
        self.memories_dir = self.aether_dir / MEMORIES_DIR
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        """Ensure .aether/memories directory exists."""
        self.memories_dir.mkdir(parents=True, exist_ok=True)

    def _get_memory_path(self, name: str) -> Path:
        """Get the file path for a memory."""
        safe_name = re.sub(r'[^\w\-_]', '_', name)
        return self.memories_dir / f"{safe_name}.json"

    def write_memory(self, name: str, content: str,
                    tags: List[str] = None) -> Dict[str, Any]:
        """Write or update a memory."""
        path = self._get_memory_path(name)
        now = datetime.utcnow().isoformat() + "Z"

        if path.exists():
            existing = json.loads(path.read_text(encoding='utf-8'))
            created_at = existing.get('created_at', now)
        else:
            created_at = now

        memory = Memory(
            name=name,
            content=content,
            created_at=created_at,
            updated_at=now,
            tags=tags or []
        )

        path.write_text(json.dumps(memory.to_dict(), indent=2), encoding='utf-8')
        log_debug(f"Wrote memory: {name}", self.verbose)

        return {
            "success": True,
            "memory": memory.to_dict(),
            "message": f"Memory '{name}' saved"
        }

    def read_memory(self, name: str) -> Dict[str, Any]:
        """Read a memory by name."""
        path = self._get_memory_path(name)

        if not path.exists():
            return {
                "success": False,
                "error": "not_found",
                "message": f"Memory not found: {name}"
            }

        data = json.loads(path.read_text(encoding='utf-8'))
        return {
            "success": True,
            "memory": data
        }

    def list_memories(self, tag_filter: Optional[str] = None) -> Dict[str, Any]:
        """List all memories, optionally filtered by tag."""
        memories = []

        for path in self.memories_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
                if tag_filter is None or tag_filter in data.get('tags', []):
                    memories.append({
                        "name": data.get('name'),
                        "tags": data.get('tags', []),
                        "updated_at": data.get('updated_at'),
                        "preview": data.get('content', '')[:100] + "..."
                            if len(data.get('content', '')) > 100 else data.get('content', '')
                    })
            except (json.JSONDecodeError, KeyError):
                continue

        return {
            "success": True,
            "total": len(memories),
            "memories": sorted(memories, key=lambda x: x.get('updated_at', ''), reverse=True)
        }

    def delete_memory(self, name: str) -> Dict[str, Any]:
        """Delete a memory."""
        path = self._get_memory_path(name)

        if not path.exists():
            return {
                "success": False,
                "error": "not_found",
                "message": f"Memory not found: {name}"
            }

        path.unlink()
        return {
            "success": True,
            "message": f"Memory '{name}' deleted"
        }

# -----------------------------------------------------------------------------
# PROJECT ANALYZER - Onboarding and structure analysis
# -----------------------------------------------------------------------------

class ProjectAnalyzer:
    """Analyzes project structure and provides onboarding info."""

    # Framework detection patterns
    FRAMEWORK_PATTERNS = {
        "next.js": ["next.config.js", "next.config.mjs", "next.config.ts"],
        "react": ["react", "react-dom"],  # Check in package.json
        "vue": ["vue.config.js", "nuxt.config.js", "nuxt.config.ts"],
        "angular": ["angular.json", ".angular"],
        "express": ["express"],  # Check in package.json
        "nestjs": ["nest-cli.json", "@nestjs/core"],
        "django": ["manage.py", "django"],
        "flask": ["flask"],
        "fastapi": ["fastapi"],
        "spring": ["pom.xml", "build.gradle"],
        "rails": ["Gemfile", "config/routes.rb"],
        "laravel": ["artisan", "composer.json"],
    }

    BUILD_COMMANDS = {
        "npm": {"build": "npm run build", "test": "npm test", "dev": "npm run dev"},
        "yarn": {"build": "yarn build", "test": "yarn test", "dev": "yarn dev"},
        "pnpm": {"build": "pnpm build", "test": "pnpm test", "dev": "pnpm dev"},
        "pip": {"install": "pip install -r requirements.txt", "test": "pytest"},
        "poetry": {"install": "poetry install", "test": "poetry run pytest"},
        "cargo": {"build": "cargo build", "test": "cargo test", "run": "cargo run"},
        "go": {"build": "go build", "test": "go test ./...", "run": "go run ."},
        "maven": {"build": "mvn package", "test": "mvn test"},
        "gradle": {"build": "./gradlew build", "test": "./gradlew test"},
    }

    def __init__(self, project_root: Path, verbose: bool = False):
        self.project_root = project_root
        self.verbose = verbose
        self.aether_dir = project_root / AETHER_DIR
        self.onboarding_file = self.aether_dir / ONBOARDING_FILE

    def _detect_languages(self) -> List[str]:
        """Detect programming languages used in the project."""
        languages = set()
        for ext, lang in LANGUAGE_MAP.items():
            pattern = f"**/*{ext}"
            if list(self.project_root.glob(pattern))[:1]:  # Check if any exist
                languages.add(lang)
        return sorted(languages)

    def _detect_frameworks(self) -> List[str]:
        """Detect frameworks used in the project."""
        frameworks = []

        # Check for config files
        for framework, patterns in self.FRAMEWORK_PATTERNS.items():
            for pattern in patterns:
                if (self.project_root / pattern).exists():
                    frameworks.append(framework)
                    break

        # Check package.json for JS frameworks
        pkg_json = self.project_root / "package.json"
        if pkg_json.exists():
            try:
                pkg = json.loads(pkg_json.read_text(encoding='utf-8'))
                all_deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
                for framework, patterns in self.FRAMEWORK_PATTERNS.items():
                    for pattern in patterns:
                        if pattern in all_deps:
                            if framework not in frameworks:
                                frameworks.append(framework)
                            break
            except json.JSONDecodeError:
                pass

        # Check requirements.txt for Python frameworks
        req_txt = self.project_root / "requirements.txt"
        if req_txt.exists():
            try:
                reqs = req_txt.read_text(encoding='utf-8').lower()
                for framework, patterns in self.FRAMEWORK_PATTERNS.items():
                    for pattern in patterns:
                        if pattern.lower() in reqs:
                            if framework not in frameworks:
                                frameworks.append(framework)
                            break
            except Exception:
                pass

        return frameworks

    def _detect_build_system(self) -> Tuple[str, Dict[str, str]]:
        """Detect the build system and return commands."""
        if (self.project_root / "package-lock.json").exists():
            return "npm", self.BUILD_COMMANDS["npm"]
        if (self.project_root / "yarn.lock").exists():
            return "yarn", self.BUILD_COMMANDS["yarn"]
        if (self.project_root / "pnpm-lock.yaml").exists():
            return "pnpm", self.BUILD_COMMANDS["pnpm"]
        if (self.project_root / "Cargo.toml").exists():
            return "cargo", self.BUILD_COMMANDS["cargo"]
        if (self.project_root / "go.mod").exists():
            return "go", self.BUILD_COMMANDS["go"]
        if (self.project_root / "pyproject.toml").exists():
            return "poetry", self.BUILD_COMMANDS["poetry"]
        if (self.project_root / "requirements.txt").exists():
            return "pip", self.BUILD_COMMANDS["pip"]
        if (self.project_root / "pom.xml").exists():
            return "maven", self.BUILD_COMMANDS["maven"]
        if (self.project_root / "build.gradle").exists():
            return "gradle", self.BUILD_COMMANDS["gradle"]

        return "unknown", {}

    def _analyze_structure(self) -> Dict[str, Any]:
        """Analyze directory structure."""
        structure = {
            "root_files": [],
            "directories": [],
            "key_files": {}
        }

        # Get root level items
        for item in sorted(self.project_root.iterdir()):
            if item.name.startswith('.') and item.name not in ['.env.example', '.gitignore']:
                continue
            if item.name in IGNORE_DIRS:
                continue

            if item.is_file():
                structure["root_files"].append(item.name)
            elif item.is_dir():
                # Count files in directory
                try:
                    file_count = sum(1 for _ in item.rglob('*') if _.is_file())
                    structure["directories"].append({
                        "name": item.name,
                        "file_count": min(file_count, 9999)  # Cap for display
                    })
                except PermissionError:
                    structure["directories"].append({"name": item.name, "file_count": "?"})

        # Identify key files
        key_files = [
            "README.md", "README.rst", "README.txt",
            "package.json", "requirements.txt", "Cargo.toml", "go.mod",
            "Makefile", "Dockerfile", "docker-compose.yml",
            ".env.example", "tsconfig.json", "pyproject.toml"
        ]
        for kf in key_files:
            path = self.project_root / kf
            if path.exists():
                structure["key_files"][kf] = True

        return structure

    def onboard(self, force: bool = False) -> Dict[str, Any]:
        """Perform project onboarding analysis."""
        # Check if already onboarded
        if self.onboarding_file.exists() and not force:
            data = json.loads(self.onboarding_file.read_text(encoding='utf-8'))
            return {
                "success": True,
                "already_onboarded": True,
                "project_info": data
            }

        # Perform analysis
        languages = self._detect_languages()
        frameworks = self._detect_frameworks()
        build_system, build_commands = self._detect_build_system()
        structure = self._analyze_structure()

        # Count files
        total_files = sum(1 for _ in self.project_root.rglob('*')
                         if _.is_file() and not any(p in _.parts for p in IGNORE_DIRS))

        project_info = ProjectInfo(
            name=self.project_root.name,
            root=str(self.project_root),
            languages=languages,
            frameworks=frameworks,
            total_files=total_files,
            total_symbols=0,  # Will be filled after indexing
            structure=structure,
            build_commands=build_commands,
            test_commands={"test": build_commands.get("test", "")}
        )

        # Save onboarding info
        self.aether_dir.mkdir(parents=True, exist_ok=True)
        self.onboarding_file.write_text(
            json.dumps(project_info.to_dict(), indent=2),
            encoding='utf-8'
        )

        return {
            "success": True,
            "already_onboarded": False,
            "project_info": project_info.to_dict()
        }

    def check_onboarding(self) -> Dict[str, Any]:
        """Check if project has been onboarded."""
        if self.onboarding_file.exists():
            data = json.loads(self.onboarding_file.read_text(encoding='utf-8'))
            return {
                "success": True,
                "onboarded": True,
                "project_info": data
            }
        return {
            "success": True,
            "onboarded": False,
            "message": "Project has not been onboarded. Run 'onboard' command."
        }

# -----------------------------------------------------------------------------
# PATTERN SEARCHER
# -----------------------------------------------------------------------------

class PatternSearcher:
    """Search for patterns across the codebase."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose

    def search(self, pattern: str, files: Dict[str, str],
              is_regex: bool = True, case_sensitive: bool = True,
              max_results: int = 100) -> Dict[str, Any]:
        """Search for a pattern across all indexed files."""
        results = []
        flags = 0 if case_sensitive else re.IGNORECASE

        try:
            if is_regex:
                regex = re.compile(pattern, flags)
            else:
                regex = re.compile(re.escape(pattern), flags)
        except re.error as e:
            return {
                "success": False,
                "error": "invalid_pattern",
                "message": f"Invalid regex pattern: {e}"
            }

        for file_path, content in files.items():
            if len(results) >= max_results:
                break

            lines = content.split('\n')
            for i, line in enumerate(lines):
                if len(results) >= max_results:
                    break

                for match in regex.finditer(line):
                    results.append({
                        "file": file_path,
                        "line": i + 1,
                        "column": match.start(),
                        "match": match.group(),
                        "context": line.strip()
                    })

        return {
            "success": True,
            "pattern": pattern,
            "is_regex": is_regex,
            "case_sensitive": case_sensitive,
            "total_matches": len(results),
            "truncated": len(results) >= max_results,
            "results": results
        }

# -----------------------------------------------------------------------------
# AETHER ENGINE - Main orchestrator
# -----------------------------------------------------------------------------

class AetherEngine:
    """Main engine that coordinates all components."""

    def __init__(self, project_root: str, verbose: bool = False):
        self.project_root = Path(project_root).resolve()
        self.verbose = verbose

        # Initialize components
        self.parser = TreeSitterParser(verbose)
        self.extractor = SymbolExtractor(verbose)
        self.reference_finder = ReferenceFinder(verbose)
        self.modifier = CodeModifier(verbose)
        self.memory_manager = MemoryManager(self.project_root, verbose)
        self.project_analyzer = ProjectAnalyzer(self.project_root, verbose)
        self.pattern_searcher = PatternSearcher(verbose)

        # Caches
        self.symbols: List[Symbol] = []
        self.files: Dict[str, str] = {}
        self.indexed = False

    def _should_ignore(self, path: Path) -> bool:
        """Check if a path should be ignored."""
        for part in path.parts:
            if part in IGNORE_DIRS:
                return True
            # Ignore hidden directories except specific ones
            if part.startswith('.') and part not in ['.github', '.vscode']:
                return True
        if path.name in IGNORE_FILES:
            return True
        return False

    def _get_language(self, file_path: Path) -> Optional[str]:
        """Get the language for a file based on extension."""
        return LANGUAGE_MAP.get(file_path.suffix.lower())

    def _find_symbol(self, symbol_id: str) -> Tuple[Optional[Symbol], Optional[Dict]]:
        """Find a symbol by ID or name. Returns (symbol, error_dict)."""
        found = None
        matches = []

        for symbol in self.symbols:
            if symbol.id == symbol_id:
                return symbol, None
            if symbol.name == symbol_id:
                matches.append(symbol)

        if len(matches) == 1:
            return matches[0], None
        elif len(matches) > 1:
            return None, {
                "success": False,
                "error": "ambiguous_name",
                "message": f"Multiple symbols named '{symbol_id}'. Use full ID.",
                "matches": [s.to_dict() for s in matches]
            }

        return None, {
            "success": False,
            "error": "not_found",
            "message": f"Symbol not found: {symbol_id}"
        }

    def _write_file(self, file_path: str, content: str) -> None:
        """Write content to a file."""
        full_path = self.project_root / file_path
        full_path.write_text(content, encoding='utf-8')
        self.files[file_path] = content
        self.indexed = False  # Invalidate index

    # -------------------------------------------------------------------------
    # Core Operations
    # -------------------------------------------------------------------------

    def index_project(self) -> Dict[str, Any]:
        """Index all symbols in the project."""
        log_info(f"Indexing project: {self.project_root}")

        self.symbols = []
        self.files = {}
        files_processed = 0
        files_skipped = 0
        errors = []
        language_stats: Dict[str, int] = {}

        for file_path in self.project_root.rglob('*'):
            if not file_path.is_file():
                continue

            if self._should_ignore(file_path):
                continue

            language = self._get_language(file_path)
            if language is None:
                continue

            try:
                if file_path.stat().st_size > MAX_FILE_SIZE:
                    log_debug(f"Skipping large file: {file_path}", self.verbose)
                    files_skipped += 1
                    continue
            except OSError:
                continue

            try:
                content = file_path.read_text(encoding='utf-8', errors='replace')
            except Exception as e:
                log_debug(f"Error reading {file_path}: {e}", self.verbose)
                errors.append({"file": str(file_path), "error": str(e)})
                continue

            try:
                rel_path = file_path.relative_to(self.project_root)
            except ValueError:
                rel_path = file_path

            rel_path_str = str(rel_path).replace('\\', '/')
            self.files[rel_path_str] = content

            tree = self.parser.parse(content, language)
            if tree:
                file_symbols = self.extractor.extract_symbols(
                    tree, content, rel_path_str, language
                )
                self.symbols.extend(file_symbols)
                files_processed += 1
                language_stats[language] = language_stats.get(language, 0) + 1
                log_debug(f"Indexed {rel_path_str}: {len(file_symbols)} symbols", self.verbose)
            else:
                files_skipped += 1

        self.indexed = True

        # Update onboarding with symbol count
        onboarding = self.project_analyzer.check_onboarding()
        if onboarding.get("onboarded"):
            info = onboarding["project_info"]
            info["total_symbols"] = len(self.symbols)
            (self.project_root / AETHER_DIR / ONBOARDING_FILE).write_text(
                json.dumps(info, indent=2), encoding='utf-8'
            )

        return {
            "success": True,
            "project_root": str(self.project_root),
            "files_processed": files_processed,
            "files_skipped": files_skipped,
            "total_symbols": len(self.symbols),
            "languages": language_stats,
            "errors": errors if errors else None
        }

    def list_symbols(self, filter_type: Optional[str] = None,
                     filter_file: Optional[str] = None,
                     filter_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all indexed symbols with optional filtering."""
        if not self.indexed:
            self.index_project()

        result = []
        for symbol in self.symbols:
            if filter_type and symbol.type != filter_type:
                continue
            if filter_file and filter_file not in symbol.file:
                continue
            if filter_name and filter_name.lower() not in symbol.name.lower():
                continue
            result.append(symbol.to_dict())

        return result

    def get_symbols_overview(self, file_path: str) -> Dict[str, Any]:
        """Get an overview of top-level symbols in a file."""
        if not self.indexed:
            self.index_project()

        # Normalize path
        file_path = file_path.replace('\\', '/')

        file_symbols = [s for s in self.symbols if s.file == file_path]

        if not file_symbols:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"No symbols found in file: {file_path}"
            }

        # Group by type
        by_type: Dict[str, List[Dict]] = {}
        for s in file_symbols:
            if s.type not in by_type:
                by_type[s.type] = []
            by_type[s.type].append({
                "name": s.name,
                "line": s.start_line,
                "scope": s.scope,
                "signature": s.signature
            })

        return {
            "success": True,
            "file": file_path,
            "total_symbols": len(file_symbols),
            "by_type": by_type
        }

    def read_symbol(self, symbol_id: str) -> Dict[str, Any]:
        """Read the full code of a symbol by its ID or name."""
        if not self.indexed:
            self.index_project()

        symbol, error = self._find_symbol(symbol_id)
        if error:
            return error

        content = self.files.get(symbol.file)
        if not content:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"File not in index: {symbol.file}"
            }

        lines = content.split('\n')
        start_idx = symbol.start_line - 1
        end_idx = symbol.end_line
        code = '\n'.join(lines[start_idx:end_idx])

        return {
            "success": True,
            "symbol": symbol.to_dict(),
            "code": code
        }

    def find_references(self, symbol_name: str,
                       include_imports: bool = True) -> Dict[str, Any]:
        """Find all references to a symbol."""
        if not self.indexed:
            self.index_project()

        refs = self.reference_finder.find_references(
            symbol_name, self.files, include_imports
        )

        return {
            "success": True,
            "symbol_name": symbol_name,
            "total_references": len(refs),
            "references": [r.to_dict() for r in refs]
        }

    # -------------------------------------------------------------------------
    # Modification Operations
    # -------------------------------------------------------------------------

    def replace_symbol(self, symbol_id: str, new_code: str,
                       dry_run: bool = True) -> Dict[str, Any]:
        """Replace a symbol's code."""
        if not self.indexed:
            self.index_project()

        symbol, error = self._find_symbol(symbol_id)
        if error:
            return error

        content = self.files.get(symbol.file)
        if not content:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"File not in index: {symbol.file}"
            }

        result = self.modifier.replace_symbol(symbol, new_code, content, dry_run)

        if result["success"] and not dry_run and result.get("new_content"):
            self._write_file(symbol.file, result["new_content"])
            result["message"] = f"Changes written to {symbol.file}"

        result["symbol"] = symbol.to_dict()
        return result

    def insert_before_symbol(self, symbol_id: str, code: str,
                            dry_run: bool = True) -> Dict[str, Any]:
        """Insert code before a symbol."""
        if not self.indexed:
            self.index_project()

        symbol, error = self._find_symbol(symbol_id)
        if error:
            return error

        content = self.files.get(symbol.file)
        if not content:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"File not in index: {symbol.file}"
            }

        result = self.modifier.insert_before_symbol(symbol, code, content, dry_run)

        if result["success"] and not dry_run and result.get("new_content"):
            self._write_file(symbol.file, result["new_content"])
            result["message"] = f"Code inserted before {symbol.name} in {symbol.file}"

        result["symbol"] = symbol.to_dict()
        return result

    def insert_after_symbol(self, symbol_id: str, code: str,
                           dry_run: bool = True) -> Dict[str, Any]:
        """Insert code after a symbol."""
        if not self.indexed:
            self.index_project()

        symbol, error = self._find_symbol(symbol_id)
        if error:
            return error

        content = self.files.get(symbol.file)
        if not content:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"File not in index: {symbol.file}"
            }

        result = self.modifier.insert_after_symbol(symbol, code, content, dry_run)

        if result["success"] and not dry_run and result.get("new_content"):
            self._write_file(symbol.file, result["new_content"])
            result["message"] = f"Code inserted after {symbol.name} in {symbol.file}"

        result["symbol"] = symbol.to_dict()
        return result

    def delete_lines(self, file_path: str, start_line: int, end_line: int,
                    dry_run: bool = True) -> Dict[str, Any]:
        """Delete a range of lines from a file."""
        if not self.indexed:
            self.index_project()

        file_path = file_path.replace('\\', '/')
        content = self.files.get(file_path)

        if not content:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"File not in index: {file_path}"
            }

        result = self.modifier.delete_lines(file_path, start_line, end_line, content, dry_run)

        if result["success"] and not dry_run and result.get("new_content"):
            self._write_file(file_path, result["new_content"])
            result["message"] = f"Lines {start_line}-{end_line} deleted from {file_path}"

        return result

    def insert_at_line(self, file_path: str, line_number: int, code: str,
                      dry_run: bool = True) -> Dict[str, Any]:
        """Insert code at a specific line number."""
        if not self.indexed:
            self.index_project()

        file_path = file_path.replace('\\', '/')
        content = self.files.get(file_path)

        if not content:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"File not in index: {file_path}"
            }

        result = self.modifier.insert_at_line(file_path, line_number, code, content, dry_run)

        if result["success"] and not dry_run and result.get("new_content"):
            self._write_file(file_path, result["new_content"])
            result["message"] = f"Code inserted at line {line_number} in {file_path}"

        return result

    def replace_lines(self, file_path: str, start_line: int, end_line: int,
                     new_code: str, dry_run: bool = True) -> Dict[str, Any]:
        """Replace a range of lines with new code."""
        if not self.indexed:
            self.index_project()

        file_path = file_path.replace('\\', '/')
        content = self.files.get(file_path)

        if not content:
            return {
                "success": False,
                "error": "file_not_found",
                "message": f"File not in index: {file_path}"
            }

        result = self.modifier.replace_lines(file_path, start_line, end_line, new_code, content, dry_run)

        if result["success"] and not dry_run and result.get("new_content"):
            self._write_file(file_path, result["new_content"])
            result["message"] = f"Lines {start_line}-{end_line} replaced in {file_path}"

        return result

    def rename_symbol(self, old_name: str, new_name: str,
                     dry_run: bool = True) -> Dict[str, Any]:
        """Rename a symbol across the entire codebase."""
        if not self.indexed:
            self.index_project()

        result = self.modifier.rename_symbol(old_name, new_name, self.files, dry_run)

        if result["success"] and not dry_run and result.get("modified_files"):
            for file_path, content in result["modified_files"].items():
                self._write_file(file_path, content)
            result["message"] = f"Renamed '{old_name}' to '{new_name}' in {result['files_affected']} files"
            del result["modified_files"]  # Don't include in output

        return result

    # -------------------------------------------------------------------------
    # Memory Operations
    # -------------------------------------------------------------------------

    def write_memory(self, name: str, content: str,
                    tags: List[str] = None) -> Dict[str, Any]:
        """Write or update a memory."""
        return self.memory_manager.write_memory(name, content, tags)

    def read_memory(self, name: str) -> Dict[str, Any]:
        """Read a memory by name."""
        return self.memory_manager.read_memory(name)

    def list_memories(self, tag_filter: Optional[str] = None) -> Dict[str, Any]:
        """List all memories."""
        return self.memory_manager.list_memories(tag_filter)

    def delete_memory(self, name: str) -> Dict[str, Any]:
        """Delete a memory."""
        return self.memory_manager.delete_memory(name)

    # -------------------------------------------------------------------------
    # Project Operations
    # -------------------------------------------------------------------------

    def onboard(self, force: bool = False) -> Dict[str, Any]:
        """Perform project onboarding."""
        return self.project_analyzer.onboard(force)

    def check_onboarding(self) -> Dict[str, Any]:
        """Check if project has been onboarded."""
        return self.project_analyzer.check_onboarding()

    # -------------------------------------------------------------------------
    # Search Operations
    # -------------------------------------------------------------------------

    def search_pattern(self, pattern: str, is_regex: bool = True,
                      case_sensitive: bool = True,
                      max_results: int = 100) -> Dict[str, Any]:
        """Search for a pattern across the codebase."""
        if not self.indexed:
            self.index_project()

        return self.pattern_searcher.search(
            pattern, self.files, is_regex, case_sensitive, max_results
        )

# -----------------------------------------------------------------------------
# CLI INTERFACE
# -----------------------------------------------------------------------------

def output_json(data: Any) -> None:
    """Output data as JSON to stdout."""
    print(json.dumps(data, indent=2, ensure_ascii=False))

def main():
    parser = argparse.ArgumentParser(
        description="Aether Engine - AST-based Code Intelligence",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Indexing and listing
  aether_engine.py index
  aether_engine.py list_symbols
  aether_engine.py list_symbols --type function --file auth
  aether_engine.py symbols_overview src/auth.ts

  # Reading symbols
  aether_engine.py read_symbol ProcessUserData
  aether_engine.py read_symbol "src/auth.ts::AuthService::login"

  # Finding references
  aether_engine.py find_references ProcessUserData

  # Modifying code (all default to dry-run)
  aether_engine.py replace_symbol MyFunction --code "def MyFunction(): pass"
  aether_engine.py replace_symbol MyFunction --code "..." --apply
  aether_engine.py insert_before MyFunction --code "# Comment"
  aether_engine.py insert_after MyFunction --code "# End comment"
  aether_engine.py rename_symbol oldName newName
  aether_engine.py rename_symbol oldName newName --apply

  # Line operations
  aether_engine.py delete_lines src/file.py 10 20
  aether_engine.py insert_at_line src/file.py 15 --code "new code"
  aether_engine.py replace_lines src/file.py 10 20 --code "new code"

  # Memory system
  aether_engine.py write_memory "auth_notes" --content "Auth uses JWT..."
  aether_engine.py read_memory "auth_notes"
  aether_engine.py list_memories
  aether_engine.py delete_memory "auth_notes"

  # Project analysis
  aether_engine.py onboard
  aether_engine.py check_onboarding

  # Search
  aether_engine.py search "TODO|FIXME" --regex
  aether_engine.py search "processUser" --no-regex
        """
    )

    parser.add_argument(
        "action",
        choices=[
            # Core
            "index", "list_symbols", "symbols_overview", "read_symbol", "find_references",
            # Modifications
            "replace_symbol", "insert_before", "insert_after", "rename_symbol",
            "delete_lines", "insert_at_line", "replace_lines",
            # Memory
            "write_memory", "read_memory", "list_memories", "delete_memory",
            # Project
            "onboard", "check_onboarding",
            # Search
            "search"
        ],
        help="Action to perform"
    )

    parser.add_argument(
        "target",
        nargs="?",
        help="Symbol ID/name, file path, memory name, or search pattern"
    )

    parser.add_argument(
        "target2",
        nargs="?",
        help="Second target (e.g., new name for rename, end line for line ops)"
    )

    parser.add_argument(
        "--project", "-p",
        default=".",
        help="Project root directory (default: current directory)"
    )

    parser.add_argument(
        "--type", "-t",
        help="Filter symbols by type (function, class, method, etc.)"
    )

    parser.add_argument(
        "--file", "-f",
        help="Filter symbols by file path (partial match)"
    )

    parser.add_argument(
        "--name", "-n",
        help="Filter symbols by name (partial match)"
    )

    parser.add_argument(
        "--code", "-c",
        help="New code for modifications"
    )

    parser.add_argument(
        "--content",
        help="Content for memory operations"
    )

    parser.add_argument(
        "--tags",
        help="Comma-separated tags for memory"
    )

    parser.add_argument(
        "--start-line",
        type=int,
        help="Start line for line operations"
    )

    parser.add_argument(
        "--end-line",
        type=int,
        help="End line for line operations"
    )

    parser.add_argument(
        "--line",
        type=int,
        help="Line number for insert_at_line"
    )

    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually apply changes (default is dry-run)"
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Force operation (e.g., re-onboard)"
    )

    parser.add_argument(
        "--regex",
        action="store_true",
        default=True,
        help="Treat search pattern as regex (default)"
    )

    parser.add_argument(
        "--no-regex",
        action="store_true",
        help="Treat search pattern as literal string"
    )

    parser.add_argument(
        "--case-sensitive",
        action="store_true",
        default=True,
        help="Case sensitive search (default)"
    )

    parser.add_argument(
        "--ignore-case", "-i",
        action="store_true",
        help="Case insensitive search"
    )

    parser.add_argument(
        "--max-results",
        type=int,
        default=100,
        help="Maximum search results (default: 100)"
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging to stderr"
    )

    args = parser.parse_args()

    # Initialize engine
    try:
        engine = AetherEngine(args.project, verbose=args.verbose)
    except Exception as e:
        output_json({"success": False, "error": "init_failed", "message": str(e)})
        sys.exit(1)

    # Execute action
    try:
        result = None

        # Core operations
        if args.action == "index":
            result = engine.index_project()

        elif args.action == "list_symbols":
            symbols = engine.list_symbols(
                filter_type=args.type,
                filter_file=args.file,
                filter_name=args.name
            )
            result = {"success": True, "total": len(symbols), "symbols": symbols}

        elif args.action == "symbols_overview":
            if not args.target:
                output_json({"success": False, "error": "missing_target",
                           "message": "File path required"})
                sys.exit(1)
            result = engine.get_symbols_overview(args.target)

        elif args.action == "read_symbol":
            if not args.target:
                output_json({"success": False, "error": "missing_target",
                           "message": "Symbol ID or name required"})
                sys.exit(1)
            result = engine.read_symbol(args.target)

        elif args.action == "find_references":
            if not args.target:
                output_json({"success": False, "error": "missing_target",
                           "message": "Symbol name required"})
                sys.exit(1)
            result = engine.find_references(args.target)

        # Modification operations
        elif args.action == "replace_symbol":
            if not args.target or not args.code:
                output_json({"success": False, "error": "missing_args",
                           "message": "Symbol ID and --code required"})
                sys.exit(1)
            result = engine.replace_symbol(args.target, args.code, dry_run=not args.apply)

        elif args.action == "insert_before":
            if not args.target or not args.code:
                output_json({"success": False, "error": "missing_args",
                           "message": "Symbol ID and --code required"})
                sys.exit(1)
            result = engine.insert_before_symbol(args.target, args.code, dry_run=not args.apply)

        elif args.action == "insert_after":
            if not args.target or not args.code:
                output_json({"success": False, "error": "missing_args",
                           "message": "Symbol ID and --code required"})
                sys.exit(1)
            result = engine.insert_after_symbol(args.target, args.code, dry_run=not args.apply)

        elif args.action == "rename_symbol":
            if not args.target or not args.target2:
                output_json({"success": False, "error": "missing_args",
                           "message": "Old name and new name required"})
                sys.exit(1)
            result = engine.rename_symbol(args.target, args.target2, dry_run=not args.apply)

        elif args.action == "delete_lines":
            file_path = args.target
            start_line = int(args.target2) if args.target2 else args.start_line
            end_line = args.end_line
            if not file_path or not start_line or not end_line:
                output_json({"success": False, "error": "missing_args",
                           "message": "File path, start line, and end line required"})
                sys.exit(1)
            result = engine.delete_lines(file_path, start_line, end_line, dry_run=not args.apply)

        elif args.action == "insert_at_line":
            file_path = args.target
            line_num = int(args.target2) if args.target2 else args.line
            if not file_path or not line_num or not args.code:
                output_json({"success": False, "error": "missing_args",
                           "message": "File path, line number, and --code required"})
                sys.exit(1)
            result = engine.insert_at_line(file_path, line_num, args.code, dry_run=not args.apply)

        elif args.action == "replace_lines":
            file_path = args.target
            start_line = int(args.target2) if args.target2 else args.start_line
            end_line = args.end_line
            if not file_path or not start_line or not end_line or not args.code:
                output_json({"success": False, "error": "missing_args",
                           "message": "File path, start line, end line, and --code required"})
                sys.exit(1)
            result = engine.replace_lines(file_path, start_line, end_line, args.code, dry_run=not args.apply)

        # Memory operations
        elif args.action == "write_memory":
            if not args.target or not args.content:
                output_json({"success": False, "error": "missing_args",
                           "message": "Memory name and --content required"})
                sys.exit(1)
            tags = args.tags.split(',') if args.tags else []
            result = engine.write_memory(args.target, args.content, tags)

        elif args.action == "read_memory":
            if not args.target:
                output_json({"success": False, "error": "missing_args",
                           "message": "Memory name required"})
                sys.exit(1)
            result = engine.read_memory(args.target)

        elif args.action == "list_memories":
            result = engine.list_memories(tag_filter=args.target)

        elif args.action == "delete_memory":
            if not args.target:
                output_json({"success": False, "error": "missing_args",
                           "message": "Memory name required"})
                sys.exit(1)
            result = engine.delete_memory(args.target)

        # Project operations
        elif args.action == "onboard":
            result = engine.onboard(force=args.force)

        elif args.action == "check_onboarding":
            result = engine.check_onboarding()

        # Search
        elif args.action == "search":
            if not args.target:
                output_json({"success": False, "error": "missing_args",
                           "message": "Search pattern required"})
                sys.exit(1)
            result = engine.search_pattern(
                args.target,
                is_regex=not args.no_regex,
                case_sensitive=not args.ignore_case,
                max_results=args.max_results
            )

        else:
            result = {"success": False, "error": "unknown_action",
                     "message": f"Unknown action: {args.action}"}

        output_json(result)
        sys.exit(0 if result.get("success", False) else 1)

    except Exception as e:
        import traceback
        output_json({
            "success": False,
            "error": "execution_failed",
            "message": str(e),
            "traceback": traceback.format_exc() if args.verbose else str(e.__class__.__name__)
        })
        sys.exit(1)

if __name__ == "__main__":
    main()
