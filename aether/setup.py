#!/usr/bin/env python3
"""
Aether Engine - Setup Script for pip installation
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README if exists
readme_path = Path(__file__).parent / "README.md"
long_description = ""
if readme_path.exists():
    long_description = readme_path.read_text(encoding="utf-8")

setup(
    name="aether-code-engine",
    version="0.1.0",
    author="WebXExpert",
    author_email="contact@webxexpert.com",
    description="AST-based code intelligence engine with tree-sitter",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/your-username/aether",
    license="MIT",

    py_modules=["aether_engine"],

    python_requires=">=3.10",

    install_requires=[
        "tree-sitter>=0.21.0,<0.23.0",
        "tree-sitter-languages>=1.10.0",
    ],

    entry_points={
        "console_scripts": [
            "aether=aether_engine:main",
        ],
    },

    classifiers=[
        "Development Status :: 4 - Beta",
        "Environment :: Console",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Code Generators",
        "Topic :: Software Development :: Compilers",
        "Topic :: Text Processing :: Indexing",
    ],

    keywords="ast tree-sitter code-intelligence refactoring symbols",

    project_urls={
        "Bug Reports": "https://github.com/your-username/aether/issues",
        "Source": "https://github.com/your-username/aether",
    },
)
