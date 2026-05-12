"""Tests for `routes.code_execution._check_code_safety`.

We verify that obviously-unsafe patterns are blocked, while genuinely
benign code is allowed through.
"""

from __future__ import annotations

import pytest

from routes import code_execution as ce


# ────────────────────────────────────────────────────────────────────
# Python: dangerous patterns
# ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("snippet", [
    "import os; os.system('rm -rf /')",
    "os.popen('ls')",
    "subprocess.run(['ls'])",
    "__import__('os').system('whoami')",
    "eval('print(1)')",
    "exec('print(2)')",
    "compile('1', '', 'eval')",
    "open('/etc/passwd', 'r')",
    "import socket; s = socket.socket()",
    "import urllib.request",
    "import requests",
    "shutil.rmtree('/tmp/x')",
    "os.remove('foo')",
    "os.unlink('foo')",
    "os.rmdir('foo')",
    "os.rename('a', 'b')",
    "import ctypes",
    "import signal",
    "sys.exit(0)",
    "quit()",
    "exit()",
])
def test_dangerous_python_patterns_are_blocked(snippet):
    err = ce._check_code_safety(snippet, "python")
    assert err is not None
    assert err.lower().startswith("blocked")


def test_safe_python_code_is_allowed():
    safe = (
        "def fact(n):\n"
        "    return 1 if n <= 1 else n * fact(n-1)\n"
        "print(fact(5))\n"
    )
    assert ce._check_code_safety(safe, "python") is None


def test_python3_alias_uses_python_pattern_set():
    assert ce._check_code_safety("os.system('ls')", "python3") is not None


# ────────────────────────────────────────────────────────────────────
# JavaScript: dangerous patterns
# ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("snippet", [
    "const cp = require('child_process')",
    "fs.write(...)",
    "fs.unlink('x')",
    "fs.rmdir('x')",
    "fs.rm('x')",
    "process.exit(0)",
    "const net = require('net')",
    'const http = require("http")',
    "const dgram = require('dgram')",
])
def test_dangerous_js_patterns_are_blocked(snippet):
    err = ce._check_code_safety(snippet, "javascript")
    assert err is not None


def test_safe_js_code_is_allowed():
    safe = "const a = [1,2,3]; console.log(a.map(x => x*2));"
    assert ce._check_code_safety(safe, "javascript") is None


# ────────────────────────────────────────────────────────────────────
# General/destructive shell patterns apply across languages
# ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("lang", ["python", "javascript", "java", "c", "cpp", "sql"])
def test_general_destructive_patterns_block_every_language(lang):
    assert ce._check_code_safety("// rm -rf /", lang) is not None


def test_unknown_language_still_blocks_general_destructive_patterns():
    # Even a language we don't have specific patterns for must still
    # reject obviously destructive shell snippets.
    assert ce._check_code_safety("rm -rf /home", "rust") is not None


def test_unknown_language_allows_safe_code():
    assert ce._check_code_safety("fn main() { println!(\"hi\"); }", "rust") is None
