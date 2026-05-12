"""Contract: auth routes reject invalid bodies before hitting the database (422)."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


def _client(monkeypatch):
    import dotenv

    monkeypatch.setenv("DATABASE_URL", "mysql://u:p@127.0.0.1:65533/nonexistent_auth_contract")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "")
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None, raising=True)
    import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.socket_app)


def test_verify_otp_requires_challenge_and_otp(monkeypatch):
    c = _client(monkeypatch)
    r = c.post("/api/auth/verify-otp", json={})
    assert r.status_code == 422


def test_complete_first_login_requires_fields(monkeypatch):
    c = _client(monkeypatch)
    r = c.post("/api/auth/complete-first-login", json={})
    assert r.status_code == 422


def test_login_requires_email_password(monkeypatch):
    c = _client(monkeypatch)
    r = c.post("/api/auth/login", json={"email": "a@b.com"})
    assert r.status_code == 422
