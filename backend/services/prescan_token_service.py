"""
prescan_token_service.py
------------------------
HMAC-signed mobile scan token generation and validation.
Adapted from preScan/backend/services/token_service.py.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')
import time
from typing import Optional

logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 1800  # 30 minutes


def generate_mobile_token(session_token: str, secret_key: str) -> str:
    """Create an HMAC-signed mobile access token."""
    exp = int(time.time()) + TOKEN_TTL_SECONDS
    payload = json.dumps({"session_token": session_token, "exp": exp}, separators=(",", ":"))
    payload_hex = payload.encode("utf-8").hex()
    sig = hmac.new(
        secret_key.encode("utf-8"),
        payload_hex.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload_hex}.{sig}"


def validate_mobile_token(token: str, secret_key: str) -> Optional[str]:
    """Validate a mobile token and return the embedded session_token, or None."""
    try:
        payload_hex, sig = token.rsplit(".", 1)
    except ValueError:
        logger.warning("Mobile token format invalid")
        return None

    expected_sig = hmac.new(
        secret_key.encode("utf-8"),
        payload_hex.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_sig, sig):
        logger.warning("Mobile token signature mismatch")
        return None

    try:
        payload_json = bytes.fromhex(payload_hex).decode("utf-8")
        payload = json.loads(payload_json)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Mobile token decode error: %s", exc)
        return None

    if time.time() > payload.get("exp", 0):
        logger.info("Mobile token expired")
        return None

    return payload.get("session_token")

