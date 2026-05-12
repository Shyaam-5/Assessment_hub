"""POST /api/auth/google — configuration and validation (no real Google tokens)."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


def _fresh_client(monkeypatch, *, google_client_id: str):
    import dotenv

    monkeypatch.setenv("DATABASE_URL", "mysql://u:p@127.0.0.1:65533/empty_test_db")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", google_client_id)
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None, raising=True)

    import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.socket_app)


def test_google_login_not_configured_returns_503(monkeypatch):
    client = _fresh_client(monkeypatch, google_client_id="")
    r = client.post("/api/auth/google", json={"credential": "fake-jwt"})
    assert r.status_code == 503
    assert "not configured" in r.json()["detail"].lower()


def test_google_login_missing_credential_returns_400(monkeypatch):
    client = _fresh_client(monkeypatch, google_client_id="")
    r = client.post("/api/auth/google", json={"credential": "   "})
    assert r.status_code == 400
