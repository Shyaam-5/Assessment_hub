"""
Audit logging service for tracking security-critical events.
Stores audit events in both logs and database for compliance and investigation.
"""

import json
import logging
import asyncio
from datetime import datetime
from typing import Any, Dict, Optional
from enum import Enum
from database import get_pool


class AuditEventType(Enum):
    """Enumeration of audit event types for security tracking."""
    
    # Authentication events
    AUTH_LOGIN_SUCCESS = "LOGIN_SUCCESS"
    AUTH_LOGIN_FAILURE = "LOGIN_FAILURE"
    AUTH_LOGOUT = "LOGOUT"
    AUTH_GOOGLE_SIGNIN = "GOOGLE_SIGNIN"
    AUTH_OTP_GENERATED = "OTP_GENERATED"
    AUTH_OTP_VERIFIED = "OTP_VERIFIED"
    AUTH_OTP_FAILED = "OTP_FAILED"
    AUTH_PASSWORD_CHANGED = "PASSWORD_CHANGED"
    AUTH_PASSWORD_RESET = "PASSWORD_RESET"
    
    # Admin actions
    ADMIN_USER_CREATED = "ADMIN_USER_CREATED"
    ADMIN_USER_MODIFIED = "ADMIN_USER_MODIFIED"
    ADMIN_USER_DELETED = "ADMIN_USER_DELETED"
    ADMIN_USER_ROLE_CHANGED = "ADMIN_USER_ROLE_CHANGED"
    ADMIN_TEST_CREATED = "ADMIN_TEST_CREATED"
    ADMIN_TEST_MODIFIED = "ADMIN_TEST_MODIFIED"
    ADMIN_TEST_DELETED = "ADMIN_TEST_DELETED"
    ADMIN_ANALYTICS_EXPORTED = "ADMIN_ANALYTICS_EXPORTED"
    
    # Access control events
    ACCESS_DENIED = "ACCESS_DENIED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    RESOURCE_ACCESSED = "RESOURCE_ACCESSED"
    
    # Submission and test events
    SUBMISSION_CREATED = "SUBMISSION_CREATED"
    SUBMISSION_MODIFIED = "SUBMISSION_MODIFIED"
    SUBMISSION_DELETED = "SUBMISSION_DELETED"
    TEST_STARTED = "TEST_STARTED"
    TEST_COMPLETED = "TEST_COMPLETED"
    TEST_PROCTORING_LOG = "TEST_PROCTORING_LOG"
    
    # Proctor events
    PROCTOR_VIOLATION = "PROCTOR_VIOLATION"
    PROCTOR_SESSION_STARTED = "PROCTOR_SESSION_STARTED"
    PROCTOR_SESSION_ENDED = "PROCTOR_SESSION_ENDED"
    PROCTOR_ACTION_TAKEN = "PROCTOR_ACTION_TAKEN"
    
    # System events
    SYSTEM_ERROR = "SYSTEM_ERROR"
    CONFIG_CHANGED = "CONFIG_CHANGED"
    DATABASE_QUERY_ERROR = "DATABASE_QUERY_ERROR"
    
    # Data access events
    DATA_EXPORT = "DATA_EXPORT"
    BULK_OPERATION = "BULK_OPERATION"
    SOCKET_EVENT = "SOCKET_EVENT"


class AuditLogger:
    """Service for logging audit events."""
    
    def __init__(self, db_connection=None):
        """
        Initialize audit logger.
        
        Args:
            db_connection: Optional database connection for storing audit events
        """
        self.logger = logging.getLogger("audit")
        self.security_logger = logging.getLogger("security")
        self.db = db_connection
    
    def log_event(
        self,
        event_type: AuditEventType,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        resource_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        action: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        status: str = "SUCCESS",
        error_message: Optional[str] = None,
    ) -> None:
        """
        Log an audit event to file and database.
        
        Args:
            event_type: Type of event (from AuditEventType enum)
            user_id: ID of user performing the action
            ip_address: Source IP address
            resource_id: ID of affected resource
            resource_type: Type of resource (user, test, submission, etc.)
            action: Description of action taken
            details: Additional context as dictionary
            status: SUCCESS, FAILURE, or other status
            error_message: Error details if applicable
        """
        timestamp = datetime.utcnow().isoformat()
        
        # Build audit record
        audit_record = {
            "timestamp": timestamp,
            "event_type": event_type.value,
            "user_id": user_id or "SYSTEM",
            "ip_address": ip_address or "UNKNOWN",
            "resource_id": resource_id,
            "resource_type": resource_type,
            "action": action or event_type.value,
            "status": status,
            "details": details or {},
            "error_message": error_message,
        }
        
        # Log to file with special context
        log_context = {
            "user_id": user_id or "SYSTEM",
            "action": event_type.value,
            "details": json.dumps(audit_record),
        }
        
        # Choose logger based on event type
        if any(keyword in event_type.value for keyword in ["AUTH", "ACCESS_DENIED", "PERMISSION", "VIOLATION"]):
            self.security_logger.warning(
                f"{event_type.value}: {action or ''} | User: {user_id} | IP: {ip_address}",
                extra=log_context
            )
        else:
            self.logger.info(
                f"{event_type.value}: {action or ''} | User: {user_id}",
                extra=log_context
            )
        
        # Store in database if available
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._store_audit_event_db(audit_record))
        except RuntimeError:
            self.logger.warning("No running event loop; skipped async audit DB write.")
    
    async def _store_audit_event_db(self, audit_record: Dict[str, Any]) -> None:
        """Store audit event in database for long-term retention."""
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO audit_events (
                            timestamp, event_type, user_id, ip_address, resource_id,
                            resource_type, action, status, error_message, details
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            audit_record["timestamp"].replace("T", " "),
                            audit_record["event_type"],
                            audit_record["user_id"],
                            audit_record["ip_address"],
                            audit_record["resource_id"],
                            audit_record["resource_type"],
                            audit_record["action"],
                            audit_record["status"],
                            audit_record["error_message"],
                            json.dumps(audit_record.get("details") or {}),
                        ),
                    )
        except Exception as exc:
            self.logger.error("Failed to store audit event in database: %s", exc)
    
    def log_authentication(
        self,
        event_type: AuditEventType,
        user_id: Optional[str],
        ip_address: str,
        success: bool,
        error_message: Optional[str] = None,
        auth_method: Optional[str] = None,
    ) -> None:
        """Log authentication event."""
        self.log_event(
            event_type=event_type,
            user_id=user_id,
            ip_address=ip_address,
            resource_type="AUTH",
            action=f"Authentication: {auth_method or 'PASSWORD'}",
            details={
                "auth_method": auth_method,
                "success": success,
            },
            status="SUCCESS" if success else "FAILURE",
            error_message=error_message,
        )
    
    def log_access_denied(
        self,
        user_id: Optional[str],
        ip_address: str,
        resource_id: str,
        resource_type: str,
        reason: str,
    ) -> None:
        """Log access denied event."""
        self.log_event(
            event_type=AuditEventType.ACCESS_DENIED,
            user_id=user_id,
            ip_address=ip_address,
            resource_id=resource_id,
            resource_type=resource_type,
            action=f"Access denied to {resource_type}",
            details={"reason": reason},
            status="FAILURE",
        )
    
    def log_admin_action(
        self,
        admin_id: str,
        ip_address: str,
        event_type: AuditEventType,
        resource_id: Optional[str],
        resource_type: str,
        changes: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log administrative action."""
        self.log_event(
            event_type=event_type,
            user_id=admin_id,
            ip_address=ip_address,
            resource_id=resource_id,
            resource_type=resource_type,
            action=f"Admin: {event_type.value}",
            details={
                "changes": changes,
                "admin_action": True,
            },
        )
    
    def log_data_access(
        self,
        user_id: str,
        ip_address: str,
        resource_type: str,
        query_params: Optional[Dict[str, Any]] = None,
        record_count: Optional[int] = None,
    ) -> None:
        """Log data access event."""
        self.log_event(
            event_type=AuditEventType.DATA_EXPORT,
            user_id=user_id,
            ip_address=ip_address,
            resource_type=resource_type,
            action=f"Accessed {resource_type}",
            details={
                "query_params": query_params,
                "record_count": record_count,
            },
        )
    
    def log_proctor_event(
        self,
        event_type: AuditEventType,
        student_id: str,
        ip_address: Optional[str],
        session_id: Optional[str],
        violation_type: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log proctoring-related event."""
        self.log_event(
            event_type=event_type,
            user_id=student_id,
            ip_address=ip_address or "UNKNOWN",
            resource_id=session_id,
            resource_type="PROCTORING",
            action=f"Proctoring: {violation_type or event_type.value}",
            details={
                "violation_type": violation_type,
                **(details or {}),
            },
        )
    
    def log_error(
        self,
        error_message: str,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        exception_details: Optional[str] = None,
    ) -> None:
        """Log system error event."""
        self.log_event(
            event_type=AuditEventType.SYSTEM_ERROR,
            user_id=user_id,
            ip_address=ip_address,
            action="System error occurred",
            details={
                "exception": exception_details,
            },
            status="FAILURE",
            error_message=error_message,
        )

    def log_socket_event(
        self,
        event_name: str,
        sid: str,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log Socket.IO event activity."""
        self.log_event(
            event_type=AuditEventType.SOCKET_EVENT,
            user_id=user_id,
            ip_address=ip_address,
            resource_id=sid,
            resource_type="SOCKET",
            action=f"socket:{event_name}",
            details={"payload": payload or {}},
            status="SUCCESS",
        )


# Global audit logger instance
_audit_logger: Optional[AuditLogger] = None


def get_audit_logger(db_connection=None) -> AuditLogger:
    """Get or create the global audit logger instance."""
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = AuditLogger(db_connection)
    return _audit_logger
