"""Email delivery: OTP login codes and account notifications (HTML templates)."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings
from logging_config import LogConfig

logger = LogConfig.get_logger(__name__)


# ─── Shared HTML wrapper ────────────────────────────────────────────────────

def _wrap_html(title: str, content_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:560px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6c63ff 0%,#4f46e5 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              Assessment Hub
            </h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.80);font-size:13px;">{title}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            {content_html}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:18px 40px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:11px;">
              &copy; Assessment Hub &bull; Automated message &mdash; please do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ─── SMTP send helper ────────────────────────────────────────────────────────

def _send(to_email: str, subject: str, plain: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    payload = msg.as_string()

    if settings.SMTP_PORT == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30, context=ctx) as s:
            if settings.SMTP_USER:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            s.sendmail(settings.SMTP_FROM, [to_email], payload)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as s:
        if settings.SMTP_USE_TLS:
            s.starttls(context=ssl.create_default_context())
        if settings.SMTP_USER:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        s.sendmail(settings.SMTP_FROM, [to_email], payload)


def _smtp_ready() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM)


# ─── OTP login email ─────────────────────────────────────────────────────────

def send_login_otp_email(to_email: str, code: str, expires_minutes: int) -> None:
    if not _smtp_ready():
        logger.warning(
            "[OTP] SMTP not configured — login code for %s: %s (expires in %s min).",
            to_email, code, expires_minutes,
        )
        return

    subject = f"Your login verification code — {expires_minutes} min"
    plain = (
        f"Your verification code is: {code}\n\n"
        f"It expires in {expires_minutes} minutes.\n"
        "If you did not try to sign in, you can safely ignore this message.\n"
    )
    content = f"""
      <p style="margin:0 0 20px;color:#374151;font-size:15px;">
        Hi there,
      </p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        Use the code below to complete your sign-in. It expires in
        <strong>{expires_minutes} minutes</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td align="center">
          <div style="display:inline-block;background:#f0f0ff;border:2px dashed #6c63ff;
                      border-radius:8px;padding:16px 40px;font-size:32px;font-weight:700;
                      letter-spacing:8px;color:#4f46e5;font-family:monospace;">
            {code}
          </div>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;margin-bottom:16px;">
        <tr><td style="padding:12px 16px;color:#9a3412;font-size:13px;">
          If you did not request this code, please ignore this email.
          Your account is still secure.
        </td></tr>
      </table>
    """
    html = _wrap_html("Sign-in verification", content)
    _send(to_email, subject, plain, html)


# ─── Account creation email ──────────────────────────────────────────────────

def send_account_created_email(
    to_email: str,
    name: str,
    login_email: str,
    password: str,
    role: str | None = None,
    extra_note: str = "",
) -> None:
    """Send a styled welcome email with login credentials."""
    if not _smtp_ready():
        logger.warning(
            "[MAIL] SMTP not configured — account created for %s (password omitted from log).",
            to_email,
        )
        return

    subject = "Welcome to Assessment Hub — Your Account Details"
    plain = (
        f"Hello {name},\n\n"
        "Your Assessment Hub account has been created.\n\n"
        f"  Login Email : {login_email}\n"
        f"  Password    : {password}\n"
        + (f"  Role        : {role}\n" if role else "")
        + "\nPlease log in and change your password immediately.\n"
        + (f"\n{extra_note}\n" if extra_note else "")
        + "\nIf you did not expect this email, contact your administrator.\n"
    )

    role_row = (
        f"""<tr>
              <td style="padding:6px 0;color:#6b7280;font-size:13px;width:130px;">Role</td>
              <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">{role}</td>
            </tr>"""
        if role else ""
    )
    extra_html = (
        f"""<table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;margin-bottom:20px;">
              <tr><td style="padding:12px 16px;color:#166534;font-size:13px;line-height:1.5;">
                {extra_note}
              </td></tr>
            </table>"""
        if extra_note else ""
    )

    content = f"""
      <p style="margin:0 0 16px;color:#374151;font-size:15px;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        Your <strong>Assessment Hub</strong> account is ready. Use the credentials below to sign in.
      </p>

      <!-- Credentials box -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f8f9ff;border:1px solid #e0e0ff;border-radius:8px;margin-bottom:20px;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:7px 0;color:#6b7280;font-size:13px;width:130px;vertical-align:top;">Login Email</td>
              <td style="padding:7px 0;color:#111827;font-size:13px;font-weight:600;">{login_email}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#6b7280;font-size:13px;vertical-align:top;">Password</td>
              <td style="padding:7px 0;">
                <span style="background:#eef2ff;color:#4f46e5;font-family:monospace;
                             font-size:15px;font-weight:700;padding:4px 10px;border-radius:4px;
                             letter-spacing:1px;">
                  {password}
                </span>
              </td>
            </tr>
            {role_row}
          </table>
        </td></tr>
      </table>

      <!-- Warning -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;margin-bottom:20px;">
        <tr><td style="padding:12px 16px;color:#9a3412;font-size:13px;">
          &#9888;&#65039; <strong>Change your password</strong> immediately after your first login.
          This temporary password should not be shared with anyone.
        </td></tr>
      </table>

      {extra_html}

      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
        If you did not expect this email, please contact your administrator.
      </p>
    """
    html = _wrap_html("Account Created", content)
    _send(to_email, subject, plain, html)


# ─── Password reset email ─────────────────────────────────────────────────────

def send_password_reset_email(to_email: str, name: str, new_password: str) -> None:
    """Send a styled password-reset notification with the new temporary password."""
    if not _smtp_ready():
        logger.warning("[MAIL] SMTP not configured — cannot send password reset to %s.", to_email)
        return

    subject = "Your Assessment Hub Password Has Been Reset"
    plain = (
        f"Hello {name},\n\n"
        "Your password has been reset by your administrator.\n\n"
        f"  New Password : {new_password}\n\n"
        "You will be asked to change it after your next login.\n"
        "If you did not expect this change, contact your administrator immediately.\n"
    )
    content = f"""
      <p style="margin:0 0 16px;color:#374151;font-size:15px;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        Your administrator has reset your <strong>Assessment Hub</strong> password.
        Use the temporary password below to sign in.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f8f9ff;border:1px solid #e0e0ff;border-radius:8px;margin-bottom:20px;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:7px 0;color:#6b7280;font-size:13px;width:130px;">New Password</td>
              <td style="padding:7px 0;">
                <span style="background:#eef2ff;color:#4f46e5;font-family:monospace;
                             font-size:15px;font-weight:700;padding:4px 10px;border-radius:4px;
                             letter-spacing:1px;">
                  {new_password}
                </span>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;margin-bottom:20px;">
        <tr><td style="padding:12px 16px;color:#9a3412;font-size:13px;">
          &#9888;&#65039; You will be prompted to <strong>set a new password</strong> on your next login.
        </td></tr>
      </table>

      <p style="margin:0;color:#9ca3af;font-size:12px;">
        If you did not expect this change, contact your administrator immediately.
      </p>
    """
    html = _wrap_html("Password Reset", content)
    _send(to_email, subject, plain, html)


# ─── Exam allocation email ───────────────────────────────────────────────────

def send_exam_allocated_email(
    to_email: str,
    name: str,
    exam_title: str,
    exam_type: str,
    deadline: str | None = None,
) -> None:
    """Notify a student that an exam has been assigned to them."""
    if not _smtp_ready():
        logger.warning("[MAIL] SMTP not configured — cannot notify %s about exam allocation.", to_email)
        return

    subject = f"New {exam_type} Assigned: {exam_title}"
    deadline_line = f"\n  Deadline    : {deadline}" if deadline else ""
    plain = (
        f"Hello {name},\n\n"
        f"A new {exam_type.lower()} has been assigned to you.\n\n"
        f"  Exam        : {exam_title}"
        f"{deadline_line}\n\n"
        "Please log in to your portal to view and complete it.\n"
        "If you have any questions, contact your administrator.\n"
    )

    deadline_block = ""
    if deadline:
        deadline_block = f"""
        <tr>
          <td style="padding:7px 0;color:#6b7280;font-size:13px;width:130px;vertical-align:top;">Deadline</td>
          <td style="padding:7px 0;color:#dc2626;font-size:13px;font-weight:600;">{deadline}</td>
        </tr>"""

    content = f"""
      <p style="margin:0 0 16px;color:#374151;font-size:15px;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        A new <strong>{exam_type}</strong> has been assigned to you on
        <strong>Assessment Hub</strong>. Please log in to your portal to complete it.
      </p>

      <!-- Exam details box -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f8f9ff;border:1px solid #e0e0ff;border-radius:8px;margin-bottom:20px;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:7px 0;color:#6b7280;font-size:13px;width:130px;vertical-align:top;">Exam Type</td>
              <td style="padding:7px 0;color:#111827;font-size:13px;">{exam_type}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#6b7280;font-size:13px;vertical-align:top;">Title</td>
              <td style="padding:7px 0;color:#4f46e5;font-size:14px;font-weight:700;">{exam_title}</td>
            </tr>
            {deadline_block}
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;margin-bottom:20px;">
        <tr><td style="padding:12px 16px;color:#166534;font-size:13px;">
          &#128218; Log in to your <strong>Assessment Hub</strong> portal to view and start this exam.
        </td></tr>
      </table>

      <p style="margin:0;color:#9ca3af;font-size:12px;">
        If you were not expecting this assignment, please contact your administrator.
      </p>
    """
    html = _wrap_html(f"New {exam_type} Assigned", content)
    _send(to_email, subject, plain, html)


# ─── Generic notification (kept for non-account emails) ─────────────────────

def send_notification_email(to_email: str, subject: str, body: str) -> None:
    """Send a plain-text notification. For account emails use send_account_created_email."""
    if not _smtp_ready():
        logger.warning("[MAIL] SMTP not configured — cannot send to %s | %s", to_email, subject)
        return

    content = "".join(
        f"<p style='margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;'>{line}</p>"
        for line in body.split("\n") if line.strip()
    )
    html = _wrap_html(subject, content)
    _send(to_email, subject, body, html)
