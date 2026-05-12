"""Deliver one-time login codes by email (SMTP) or log them when SMTP is not configured."""

from __future__ import annotations

import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings

logger = logging.getLogger(__name__)


def send_login_otp_email(to_email: str, code: str, expires_minutes: int) -> None:
    """Send OTP to the user's email, or log it when SMTP is not configured."""
    if not settings.SMTP_HOST:
        logger.warning(
            "[OTP] SMTP not configured â€” login code for %s: %s (expires in %s min). "
            "Set SMTP_HOST, SMTP_FROM, and credentials to send by email.",
            to_email,
            code,
            expires_minutes,
        )
        return

    if not settings.SMTP_FROM:
        logger.warning(
            "[OTP] SMTP_FROM is not set â€” cannot send email to %s. Code: %s",
            to_email,
            code,
        )
        return

    subject = f"Your login code ({expires_minutes} min)"
    body = (
        f"Your verification code is: {code}\n\n"
        f"It expires in {expires_minutes} minutes.\n"
        "If you did not try to sign in, you can ignore this message.\n"
    )

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain", "utf-8"))
    payload = msg.as_string()

    if settings.SMTP_PORT == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30, context=context) as server:
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            server.sendmail(settings.SMTP_FROM, [to_email], payload)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
        if settings.SMTP_USE_TLS:
            context = ssl.create_default_context()
            server.starttls(context=context)
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        server.sendmail(settings.SMTP_FROM, [to_email], payload)

