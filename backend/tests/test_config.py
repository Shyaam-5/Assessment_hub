"""Tests for `config.Settings` — config loading from environment variables."""

from __future__ import annotations

import importlib

import pytest


def _reload_config(monkeypatch, env: dict):
    """Apply a fresh env dict and reload the config module.

    `config.py` calls `load_dotenv()` at module import, which would re-inject
    whatever happens to be in `backend/.env` and shadow the env we set here.
    We stub it to a no-op so each test sees only the env it explicitly sets.
    """
    # Wipe any GROQ_API_KEY_* keys so previous test leftovers don't bleed in.
    for k in list(__import__("os").environ.keys()):
        if k.startswith("GROQ_API_KEY") or k in {
            "DATABASE_URL", "GROQ_MODEL", "GROQ_FALLBACK_MODELS", "PORT",
            "SERVER_LAN_IP", "SECRET_KEY", "ALLOWED_ORIGINS",
            "GROQ_VISION_MODEL", "FRONTEND_URL", "PRESCAN_SECRET_KEY", "GOOGLE_OAUTH_CLIENT_ID",
            "GOOGLE_OAUTH_CLOCK_SKEW_SECONDS",
            "OTP_EXPIRY_MINUTES", "OTP_MAX_FAILED_ATTEMPTS", "FIRST_LOGIN_PASSWORD_MIN_LEN",
            "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SMTP_USE_TLS",
            "FRAME_INTERVAL_MS", "MIN_FRAMES_PER_ANGLE", "MAX_SCAN_DURATION_S",
            "MIN_TOTAL_FRAMES", "MIN_SCAN_DURATION_S",
        }:
            monkeypatch.delenv(k, raising=False)

    for k, v in env.items():
        monkeypatch.setenv(k, v)

    # Prevent `config.py`'s top-level `load_dotenv()` from re-importing the
    # real .env file during the reload. We patch at the source module (`dotenv`)
    # because `importlib.reload` will re-execute `from dotenv import load_dotenv`
    # and rebind the symbol on `config`.
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None, raising=True)

    import config as config_module
    return importlib.reload(config_module)


def test_database_url_parses_host_port_user_password_and_name(monkeypatch):
    cfg = _reload_config(
        monkeypatch,
        {"DATABASE_URL": "mysql://alice:s3cret@db.example.com:4000/mydb"},
    )
    s = cfg.settings
    assert s.DB_HOST == "db.example.com"
    assert s.DB_PORT == 4000
    assert s.DB_USER == "alice"
    assert s.DB_PASSWORD == "s3cret"
    assert s.DB_NAME == "mydb"


def test_database_url_falls_back_to_sensible_defaults(monkeypatch):
    cfg = _reload_config(monkeypatch, {"DATABASE_URL": ""})
    s = cfg.settings
    assert s.DB_HOST == "localhost"
    assert s.DB_PORT == 4000  # noted default in code
    assert s.DB_USER == "root"
    assert s.DB_PASSWORD == ""
    assert s.DB_NAME == "test"  # `/test` stripped of leading slash


def test_groq_keys_are_loaded_and_deduplicated(monkeypatch):
    cfg = _reload_config(
        monkeypatch,
        {
            "GROQ_API_KEY": "key-A",
            "GROQ_API_KEY_1": "key-B",
            "GROQ_API_KEY_2": "key-A",  # duplicate of primary
            "GROQ_API_KEY_3": "key-C",
        },
    )
    s = cfg.settings
    assert s.GROQ_API_KEYS == ["key-A", "key-B", "key-C"]
    assert s.GROQ_API_KEY == "key-A"


def test_groq_keys_empty_when_no_env(monkeypatch):
    cfg = _reload_config(monkeypatch, {})
    s = cfg.settings
    assert s.GROQ_API_KEYS == []
    assert s.GROQ_API_KEY == ""


def test_groq_fallback_strips_primary_model(monkeypatch):
    cfg = _reload_config(
        monkeypatch,
        {
            "GROQ_MODEL": "primary-model",
            "GROQ_FALLBACK_MODELS": "primary-model, fallback-1, fallback-2",
        },
    )
    s = cfg.settings
    # Primary should be filtered out of fallbacks
    assert s.GROQ_FALLBACK_MODELS == ["fallback-1", "fallback-2"]
    assert s.GROQ_FALLBACK_MODEL == "fallback-1"


def test_allowed_origins_parses_comma_separated_list(monkeypatch):
    cfg = _reload_config(
        monkeypatch,
        {"ALLOWED_ORIGINS": " https://a.com , https://b.com ,, https://c.com "},
    )
    s = cfg.settings
    assert s.ALLOWED_ORIGINS == ["https://a.com", "https://b.com", "https://c.com"]


def test_allowed_origins_empty_when_unset(monkeypatch):
    cfg = _reload_config(monkeypatch, {"ALLOWED_ORIGINS": ""})
    assert cfg.settings.ALLOWED_ORIGINS == []


def test_get_mobile_scan_url_uses_frontend_url_when_set(monkeypatch):
    cfg = _reload_config(
        monkeypatch,
        {"FRONTEND_URL": "https://frontend.example.com/"},
    )
    s = cfg.settings
    assert s.get_mobile_scan_url("abc123") == "https://frontend.example.com/scan/mobile?token=abc123"


def test_get_mobile_scan_url_falls_back_to_lan_ip(monkeypatch):
    cfg = _reload_config(
        monkeypatch,
        {"FRONTEND_URL": "", "SERVER_LAN_IP": "192.168.1.10", "PORT": "9090"},
    )
    s = cfg.settings
    assert s.get_mobile_scan_url("tok") == "http://192.168.1.10:9090/scan/mobile?token=tok"
