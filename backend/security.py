"""Minimal JWT utilities (HS256) for auth tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + pad).encode("ascii"))


def create_access_token(payload: dict[str, Any], secret: str, expires_minutes: int = 60) -> str:
    now = int(time.time())
    body = dict(payload)
    body.setdefault("iat", now)
    body.setdefault("exp", now + max(60, int(expires_minutes) * 60))
    header = {"alg": "HS256", "typ": "JWT"}
    h_enc = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_enc = _b64url_encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_enc}.{p_enc}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{h_enc}.{p_enc}.{_b64url_encode(sig)}"


def decode_access_token(token: str, secret: str) -> dict[str, Any]:
    parts = (token or "").split(".")
    if len(parts) != 3:
        raise ValueError("Malformed token")
    h_enc, p_enc, s_enc = parts
    signing_input = f"{h_enc}.{p_enc}".encode("ascii")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual = _b64url_decode(s_enc)
    if not hmac.compare_digest(expected, actual):
        raise ValueError("Invalid signature")
    payload = json.loads(_b64url_decode(p_enc).decode("utf-8"))
    now = int(time.time())
    exp = int(payload.get("exp") or 0)
    if exp <= now:
        raise ValueError("Token expired")
    return payload

