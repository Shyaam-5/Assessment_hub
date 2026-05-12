"""Tests for `routes.auth` helpers (no DB required)."""

from __future__ import annotations

import pytest

from routes import auth as auth_module


# ────────────────────────────────────────────────────────────────────
# _hash_password / _verify_password round-trip + edge cases
# ────────────────────────────────────────────────────────────────────

def test_hash_password_returns_a_bcrypt_hash():
    h = auth_module._hash_password("hunter2")
    # bcrypt strings always start with "$2"
    assert h.startswith("$2")
    assert h != "hunter2"
    assert len(h) >= 60


def test_verify_password_accepts_correct_password():
    h = auth_module._hash_password("correct horse battery staple")
    assert auth_module._verify_password("correct horse battery staple", h) is True


def test_verify_password_rejects_wrong_password():
    h = auth_module._hash_password("right")
    assert auth_module._verify_password("wrong", h) is False


def test_verify_password_returns_false_for_empty_hash():
    # An empty stored hash must NEVER authenticate.
    assert auth_module._verify_password("anything", "") is False


def test_verify_password_returns_false_for_malformed_hash():
    # Previously a malformed hash fell back to plaintext compare. Now it must fail closed.
    assert auth_module._verify_password("plaintext", "plaintext") is False
    assert auth_module._verify_password("plaintext", "not-a-bcrypt-hash") is False


def test_verify_password_does_not_raise_on_none_password():
    # _verify_password is documented as exception-free: a None plaintext should fail closed.
    h = auth_module._hash_password("pw")
    # Bypass type checker — simulate a defensive call from a code path that didn't validate input.
    assert auth_module._verify_password(None, h) is False  # type: ignore[arg-type]


# ────────────────────────────────────────────────────────────────────
# _clean_user normalisation
# ────────────────────────────────────────────────────────────────────

def test_clean_user_strips_password_and_camelizes_fields():
    row = {
        "id": "u1",
        "name": "Alice",
        "email": "a@x.com",
        "password": "$2b$secret",
        "role": "student",
        "mentor_id": "m1",
        "created_at": "2025-01-01 12:00:00",
        "batch": "B1",
        "phone": "555",
        "status": "active",
    }
    out = auth_module._clean_user(row)
    assert "password" not in out
    assert out["mentorId"] == "m1"
    assert out["createdAt"] == "2025-01-01 12:00:00"
    assert out["batch"] == "B1"
    assert out["phone"] == "555"
    assert out["status"] == "active"
    # Also ensure the snake_case keys are gone (we re-mapped them)
    assert "mentor_id" not in out
    assert "created_at" not in out


def test_clean_user_fills_missing_optional_fields_with_none():
    # Frontend relies on these keys existing even when DB has NULLs
    row = {"id": "u2", "name": "Bob", "email": "b@x.com"}
    out = auth_module._clean_user(row)
    assert out["batch"] is None
    assert out["phone"] is None
    assert out["status"] is None
    assert out["mentorId"] is None
    assert out["createdAt"] == ""


def test_clean_user_does_not_mutate_input_row():
    row = {"id": "u3", "password": "secret", "mentor_id": "m9", "created_at": "x"}
    snapshot = dict(row)
    auth_module._clean_user(row)
    assert row == snapshot, "_clean_user must not mutate the source dict"
