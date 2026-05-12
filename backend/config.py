import logging
from logging_config import LogConfig
logger = LogConfig.get_logger(__name__)

"""Application configuration loaded from environment variables."""

import os
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings parsed from environment."""

    def __init__(self):
        # --- Database ---
        self.DATABASE_URL: str = os.getenv("DATABASE_URL", "")
        db = urlparse(self.DATABASE_URL)
        self.DB_HOST: str = db.hostname or "localhost"
        self.DB_PORT: int = int(db.port or 4000)
        self.DB_USER: str = db.username or "root"
        self.DB_PASSWORD: str = db.password or ""
        self.DB_NAME: str = (db.path or "/test").lstrip("/")

        # --- Groq AI ---
        self.GROQ_API_URL: str = "https://api.groq.com/openai/v1/chat/completions"
        self.GROQ_API_KEYS: list[str] = self._load_groq_keys()
        self.GROQ_API_KEY: str = self.GROQ_API_KEYS[0] if self.GROQ_API_KEYS else ""
        self.GROQ_MODEL: str = os.getenv("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct").strip()
        fallback_models = os.getenv(
            "GROQ_FALLBACK_MODELS",
            "meta-llama/llama-4-maverick-17b-128e-instruct,meta-llama/llama-4-scout-17b-16e-instruct",
        )
        self.GROQ_FALLBACK_MODELS: list[str] = [
            m.strip() for m in fallback_models.split(",")
            if m.strip() and m.strip() != self.GROQ_MODEL
        ]
        self.GROQ_FALLBACK_MODEL: str = self.GROQ_FALLBACK_MODELS[0] if self.GROQ_FALLBACK_MODELS else self.GROQ_MODEL

        # --- Server ---
        self.PORT: int = int(os.getenv("PORT", "8000"))
        self.SERVER_LAN_IP: str = os.getenv("SERVER_LAN_IP", "localhost")
        self.SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production-secret-key")

        # --- CORS ---
        _origins = os.getenv("ALLOWED_ORIGINS", "")
        self.ALLOWED_ORIGINS: list[str] = [o.strip() for o in _origins.split(",") if o.strip()] if _origins.strip() else []

        # --- Groq Vision (for image analysis - must be a vision-capable model) ---
        self.GROQ_VISION_MODEL: str = os.getenv(
            "GROQ_VISION_MODEL",
            "meta-llama/llama-4-scout-17b-16e-instruct",
        ).strip()
        self.FRONTEND_URL: str = os.getenv("FRONTEND_URL", "").strip()

        # --- Google Sign-In (OIDC id_token verification; must match SPA client ID) ---
        self.GOOGLE_OAUTH_CLIENT_ID: str = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
        # Allow small skew between this machine's clock and Google's (avoids "Token used too early").
        self.GOOGLE_OAUTH_CLOCK_SKEW_SECONDS: int = int(os.getenv("GOOGLE_OAUTH_CLOCK_SKEW_SECONDS", "120"))

        # --- Login OTP (email; falls back to server logs if SMTP unset) ---
        self.OTP_EXPIRY_MINUTES: int = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))
        self.OTP_MAX_FAILED_ATTEMPTS: int = int(os.getenv("OTP_MAX_FAILED_ATTEMPTS", "5"))
        self.FIRST_LOGIN_PASSWORD_MIN_LEN: int = int(os.getenv("FIRST_LOGIN_PASSWORD_MIN_LEN", "8"))
        self.SMTP_HOST: str = os.getenv("SMTP_HOST", "").strip()
        self.SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
        self.SMTP_USER: str = os.getenv("SMTP_USER", "").strip()
        self.SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "").strip()
        self.SMTP_FROM: str = os.getenv("SMTP_FROM", "").strip()
        self.SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").strip().lower() in (
            "1",
            "true",
            "yes",
        )

        # --- Environment Scan (prescan) settings ---
        self.PRESCAN_SECRET_KEY: str = os.getenv("PRESCAN_SECRET_KEY", os.getenv("SECRET_KEY", "change-me-prescan-secret-key"))
        self.FRAME_INTERVAL_MS: int = int(os.getenv("FRAME_INTERVAL_MS", "1500"))
        self.MIN_FRAMES_PER_ANGLE: int = int(os.getenv("MIN_FRAMES_PER_ANGLE", "5"))
        self.MAX_SCAN_DURATION_S: int = int(os.getenv("MAX_SCAN_DURATION_S", "180"))
        self.MIN_TOTAL_FRAMES: int = int(os.getenv("MIN_TOTAL_FRAMES", "20"))
        self.MIN_SCAN_DURATION_S: int = int(os.getenv("MIN_SCAN_DURATION_S", "30"))

    def get_mobile_scan_url(self, session_token: str) -> str:
        """Return the frontend URL for mobile scan."""
        base = self.FRONTEND_URL.rstrip("/") if self.FRONTEND_URL else f"http://{self.SERVER_LAN_IP}:{self.PORT}"
        return f"{base}/scan/mobile?token={session_token}"

    # ---- helpers ----
    def _load_groq_keys(self) -> list[str]:
        keys: list[str] = []
        for var in ("GROQ_API_KEY",):
            v = os.getenv(var, "")
            if v.strip():
                keys.append(v.strip())
        for i in range(1, 10):
            v = os.getenv(f"GROQ_API_KEY_{i}", "")
            if v.strip():
                keys.append(v.strip())
        # deduplicate while preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for k in keys:
            if k not in seen:
                seen.add(k)
                unique.append(k)
        return unique


settings = Settings()

