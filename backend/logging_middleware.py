"""
FastAPI middleware for request/response logging and security event tracking.
Provides comprehensive audit trail for all API requests.
"""

import time
import logging
from uuid import uuid4
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from audit_logger import get_audit_logger, AuditEventType
from database import get_primary_pool


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all HTTP requests and responses."""
    
    def __init__(self, app):
        super().__init__(app)
        self.logger = logging.getLogger("app")
        self.audit_logger = get_audit_logger()
        
        self.max_body_chars = 4000
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log incoming request and outgoing response."""
        
        # Extract request info
        start_time = time.time()
        request_id = request.headers.get("x-request-id") or str(uuid4())
        user_id = getattr(request.state, "auth_user_id", None) or "anonymous"
        organization_id = (
            request.headers.get("x-org-id")
            or getattr(request.state, "organization_id", None)
            or ""
        ).strip() or None
        client_ip = self._get_client_ip(request)
        req_body = await self._safe_request_body(request)
        
        # Store in request state for later use
        request.state.user_id = user_id
        request.state.organization_id = organization_id
        request.state.client_ip = client_ip
        request.state.request_id = request_id
        
        # Log request
        self.logger.debug(
            f"REQUEST | ID: {request_id} | {request.method} {request.url.path} | "
            f"User: {user_id} | IP: {client_ip}"
        )
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            # Log response
            self.logger.info(
                f"RESPONSE | ID: {request_id} | {request.method} {request.url.path} | "
                f"Status: {response.status_code} | Duration: {process_time:.2f}s"
            )
            
            await self._log_api_request_audit(
                request_id=request_id,
                user_id=user_id,
                request=request,
                response_status=response.status_code,
                process_time=process_time,
                ip_address=client_ip,
                request_body=req_body,
                organization_id=organization_id,
            )
            self._track_sensitive_endpoint(
                request.method, request.url.path, response.status_code, user_id, client_ip
            )
            
            # Add request ID to response headers
            response.headers["x-request-id"] = request_id
            
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            self.logger.error(
                f"ERROR | ID: {request_id} | {request.method} {request.url.path} | "
                f"Duration: {process_time:.2f}s | Error: {str(e)}"
            )
            
            # Log error event
            self.audit_logger.log_error(
                str(e),
                user_id=user_id,
                ip_address=client_ip,
                exception_details=repr(e),
            )
            await self._log_api_request_audit(
                request_id=request_id,
                user_id=user_id,
                request=request,
                response_status=500,
                process_time=process_time,
                ip_address=client_ip,
                request_body=req_body,
                organization_id=organization_id,
            )
            raise

    async def _safe_request_body(self, request: Request) -> str:
        """Capture request body while redacting known secrets."""
        try:
            raw = await request.body()
            if not raw:
                return ""
            text = raw.decode("utf-8", errors="replace")
            content_type = (request.headers.get("content-type") or "").lower()
            if "application/json" in content_type:
                import json
                parsed = json.loads(text)
                sanitized = self._redact_sensitive_fields(parsed)
                text = json.dumps(sanitized, ensure_ascii=True)
            if len(text) > self.max_body_chars:
                text = text[: self.max_body_chars] + "...[truncated]"
            return text
        except Exception:
            return ""

    def _redact_sensitive_fields(self, value):
        sensitive = {"password", "otp", "token", "credential", "secret", "authorization"}
        if isinstance(value, dict):
            redacted = {}
            for k, v in value.items():
                if str(k).lower() in sensitive:
                    redacted[k] = "***REDACTED***"
                else:
                    redacted[k] = self._redact_sensitive_fields(v)
            return redacted
        if isinstance(value, list):
            return [self._redact_sensitive_fields(v) for v in value]
        return value

    async def _log_api_request_audit(
        self,
        request_id: str,
        user_id: str,
        request: Request,
        response_status: int,
        process_time: float,
        ip_address: str,
        request_body: str,
        organization_id: str | None,
    ) -> None:
        details = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "query": request.url.query,
            "status_code": response_status,
            "duration_ms": int(process_time * 1000),
            "user_agent": request.headers.get("user-agent", ""),
        }
        self.audit_logger.log_event(
            event_type=AuditEventType.RESOURCE_ACCESSED,
            user_id=user_id if user_id != "anonymous" else None,
            organization_id=organization_id,
            ip_address=ip_address,
            resource_id=request_id,
            resource_type="API",
            action=f"{request.method} {request.url.path}",
            details=details,
            status="SUCCESS" if 200 <= response_status < 400 else "FAILURE",
        )

        try:
            pool = await get_primary_pool()
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO api_request_audit (
                            request_id, user_id, organization_id, method, endpoint, query_string, request_body,
                            response_status, response_time_ms, ip_address, user_agent
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            request_id,
                            user_id if user_id != "anonymous" else None,
                            organization_id,
                            request.method,
                            request.url.path,
                            request.url.query,
                            request_body,
                            response_status,
                            int(process_time * 1000),
                            ip_address,
                            request.headers.get("user-agent", ""),
                        ),
                    )
        except Exception as exc:
            self.logger.error("Failed to store API request audit: %s", exc)
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request, accounting for proxies."""
        # Check for X-Forwarded-For header (behind proxy)
        if "x-forwarded-for" in request.headers:
            return request.headers["x-forwarded-for"].split(",")[0].strip()
        
        # Check for CF-Connecting-IP (Cloudflare)
        if "cf-connecting-ip" in request.headers:
            return request.headers["cf-connecting-ip"]
        
        # Fallback to direct connection
        return request.client.host if request.client else "unknown"
    
    def _track_sensitive_endpoint(
        self,
        method: str,
        path: str,
        status_code: int,
        user_id: str,
        client_ip: str,
    ) -> None:
        """Track access to sensitive endpoints for audit trail."""
        
        sensitive_patterns = {
            "/api/admin/": AuditEventType.RESOURCE_ACCESSED,
            "/api/analytics/": AuditEventType.DATA_EXPORT,
            "/api/submissions": AuditEventType.SUBMISSION_CREATED if method == "POST" else AuditEventType.RESOURCE_ACCESSED,
            "/api/auth/login": AuditEventType.AUTH_LOGIN_SUCCESS if status_code == 200 else AuditEventType.AUTH_LOGIN_FAILURE,
            "/api/skill-tests/": AuditEventType.TEST_STARTED if method == "POST" else AuditEventType.RESOURCE_ACCESSED,
        }
        
        for pattern, event_type in sensitive_patterns.items():
            if path.startswith(pattern):
                parts = path.split("/")
                resource_type = parts[2] if len(parts) > 2 else "unknown"
                self.audit_logger.log_event(
                    event_type=event_type,
                    user_id=user_id if user_id != "anonymous" else None,
                    ip_address=client_ip,
                    resource_type=resource_type,
                    action=f"{method} {path}",
                    details={
                        "status_code": status_code,
                        "method": method,
                    },
                    status="SUCCESS" if 200 <= status_code < 300 else "FAILURE",
                )
                break


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add security headers to response."""
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Basic rate limiting middleware for security."""
    
    def __init__(self, app):
        super().__init__(app)
        self.logger = logging.getLogger("security")
        self.audit_logger = get_audit_logger()
        self.request_counts = {}  # IP -> (window_start_ts, request_count)
        self.max_requests_per_minute = 60
        self.window_seconds = 60
        self.max_tracked_ips = 10000
        self._cleanup_interval_seconds = 300
        self._last_cleanup_at = 0.0
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Apply rate limiting check."""
        # Extract client IP
        if "x-forwarded-for" in request.headers:
            client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "unknown"

        now = time.time()
        self._cleanup_stale_counters(now)
        window_start, current_count = self.request_counts.get(client_ip, (now, 0))
        if now - window_start >= self.window_seconds:
            window_start, current_count = now, 0
        current_count += 1
        self.request_counts[client_ip] = (window_start, current_count)
        
        if current_count > self.max_requests_per_minute:
            self.logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            self.audit_logger.log_event(
                event_type=AuditEventType.PERMISSION_DENIED,
                user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
                ip_address=client_ip,
                action="Rate limit exceeded",
                details={"request_count": current_count},
                status="FAILURE",
            )
            return Response("Rate limit exceeded", status_code=429)
        
        return await call_next(request)

    def _cleanup_stale_counters(self, now: float) -> None:
        if (
            len(self.request_counts) < self.max_tracked_ips
            and now - self._last_cleanup_at < self._cleanup_interval_seconds
        ):
            return
        stale_before = now - (self.window_seconds * 2)
        self.request_counts = {
            ip: payload
            for ip, payload in self.request_counts.items()
            if payload[0] >= stale_before
        }
        if len(self.request_counts) > self.max_tracked_ips:
            newest = sorted(
                self.request_counts.items(),
                key=lambda item: item[1][0],
                reverse=True,
            )[: self.max_tracked_ips]
            self.request_counts = dict(newest)
        self._last_cleanup_at = now
