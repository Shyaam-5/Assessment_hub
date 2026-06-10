import logging
from logging_config import LogConfig
logger = LogConfig.get_logger(__name__)

"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

# Always load backend/.env (this file's directory), then override stale shell-level vars.
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=True)


class Settings:
    """Application settings parsed from environment."""

    def __init__(self):
        self.APP_ENV: str = os.getenv("APP_ENV", "development").strip().lower()

        # --- Database ---
        self.DATABASE_URL: str = self._normalize_db_url(os.getenv("DATABASE_URL", "").strip())
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
        self.SECRET_KEY: str = self._resolve_secret(
            "SECRET_KEY",
            fallback_factory=lambda: os.urandom(32).hex(),
            allow_runtime_fallback=self.APP_ENV not in {"production", "prod"},
            warning_message="SECRET_KEY is not set; using ephemeral runtime key.",
        )
        self.JWT_ACCESS_TOKEN_EXPIRES_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "720"))
        self.STARTUP_DB_PREFLIGHT: bool = os.getenv("STARTUP_DB_PREFLIGHT", "true").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        self.STARTUP_DB_PREFLIGHT_TENANTS: bool = os.getenv("STARTUP_DB_PREFLIGHT_TENANTS", "false").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        self.STARTUP_TENANT_SCHEMA_RECONCILE: bool = os.getenv("STARTUP_TENANT_SCHEMA_RECONCILE", "true").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        self.STARTUP_OPTIONAL_SERVICES_ENABLED: bool = os.getenv("STARTUP_OPTIONAL_SERVICES_ENABLED", "true").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        self.STARTUP_OPTIONAL_SCHEMA_SYNC_ENABLED: bool = os.getenv("STARTUP_OPTIONAL_SCHEMA_SYNC_ENABLED", "true").strip().lower() in (
            "1",
            "true",
            "yes",
        )

        # --- CORS ---
        _origins = os.getenv("ALLOWED_ORIGINS", "")
        self.ALLOWED_ORIGINS: list[str] = [o.strip() for o in _origins.split(",") if o.strip()] if _origins.strip() else []
        _socket_origins = os.getenv("SOCKET_ALLOWED_ORIGINS", "")
        self.SOCKET_ALLOWED_ORIGINS: list[str] = [o.strip() for o in _socket_origins.split(",") if o.strip()] if _socket_origins.strip() else list(self.ALLOWED_ORIGINS)

        # --- Groq Vision (for image analysis - must be a vision-capable model) ---
        self.GROQ_VISION_MODEL: str = os.getenv(
            "GROQ_VISION_MODEL",
            "meta-llama/llama-4-scout-17b-16e-instruct",
        ).strip()
        self.FRONTEND_URL: str = os.getenv("FRONTEND_URL", "").strip()
        self.SUBSCRIPTION_ID: str = os.getenv("SUBSCRIPTION_ID", "").strip()

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

        # --- Default super-admin seed (env-driven; no weak hardcoded passwords) ---
        self.SUPER_ADMIN_SEED_ENABLED: bool = os.getenv("SUPER_ADMIN_SEED_ENABLED", "true").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        self.SUPER_ADMIN_ROTATE_PASSWORDS_ON_STARTUP: bool = os.getenv(
            "SUPER_ADMIN_ROTATE_PASSWORDS_ON_STARTUP", "true"
        ).strip().lower() in ("1", "true", "yes")
        self.SUPER_ADMIN_1_ID: str = os.getenv("SUPER_ADMIN_1_ID", "admin-srikanth").strip()
        self.SUPER_ADMIN_1_NAME: str = os.getenv("SUPER_ADMIN_1_NAME", "Srikanth V").strip()
        self.SUPER_ADMIN_1_EMAIL: str = os.getenv("SUPER_ADMIN_1_EMAIL", "").strip()
        self.SUPER_ADMIN_1_PASSWORD: str = os.getenv("SUPER_ADMIN_1_PASSWORD", "").strip()
        self.SUPER_ADMIN_2_ID: str = os.getenv("SUPER_ADMIN_2_ID", "admin-shyaam").strip()
        self.SUPER_ADMIN_2_NAME: str = os.getenv("SUPER_ADMIN_2_NAME", "Shyaam Kumar").strip()
        self.SUPER_ADMIN_2_EMAIL: str = os.getenv("SUPER_ADMIN_2_EMAIL", "").strip()
        self.SUPER_ADMIN_2_PASSWORD: str = os.getenv("SUPER_ADMIN_2_PASSWORD", "").strip()

        # --- Environment Scan (prescan) settings ---
        self.PRESCAN_SECRET_KEY: str = self._resolve_secret(
            "PRESCAN_SECRET_KEY",
            inherited_value=self.SECRET_KEY,
            fallback_factory=lambda: os.urandom(32).hex(),
            allow_runtime_fallback=self.APP_ENV not in {"production", "prod"},
            warning_message="PRESCAN_SECRET_KEY is not set; using a generated runtime key.",
        )
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
        for i in range(1, 16):
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

    def _normalize_db_url(self, raw: str) -> str:
        v = (raw or "").strip()
        if v.upper().startswith("DATABASE_URL="):
            v = v.split("=", 1)[1].strip()
        return v

    def _resolve_secret(
        self,
        env_name: str,
        *,
        inherited_value: str = "",
        fallback_factory=None,
        allow_runtime_fallback: bool,
        warning_message: str,
    ) -> str:
        direct = os.getenv(env_name, "").strip()
        if direct:
            return direct
        if inherited_value:
            return inherited_value
        if allow_runtime_fallback and fallback_factory is not None:
            value = fallback_factory()
            logger.warning(warning_message)
            return value
        raise RuntimeError(f"{env_name} must be set when APP_ENV={self.APP_ENV or 'production'}")


settings = Settings()

