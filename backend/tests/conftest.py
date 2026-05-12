"""Pytest configuration shared by all backend tests.

This module:
  * Adds the backend root to `sys.path` so tests can `import routes...`,
    `import services...`, and `import config` directly.
  * Provides default values for environment variables that `config.py`
    reads at import time, so tests don't depend on a real `.env` file.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Make `backend/` importable as the top-level package root for tests.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Provide harmless defaults for env vars that the config loader checks.
# We only set them if the developer hasn't already exported real values.
os.environ.setdefault("DATABASE_URL", "mysql://user:pass@localhost:3306/test_db")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ALLOWED_ORIGINS", "")
