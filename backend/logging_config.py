"""
Centralized logging configuration for production environment.
Handles both application logs and audit logs with rotation and formatting.
"""

import logging
import logging.handlers
from pathlib import Path


class LogConfig:
    """Production logging configuration with file rotation and formatting."""

    # Create logs directory if it doesn't exist
    LOGS_DIR = Path(__file__).parent / "logs"
    LOGS_DIR.mkdir(exist_ok=True)

    # Log files
    APP_LOG_FILE = LOGS_DIR / "app.log"
    ERROR_LOG_FILE = LOGS_DIR / "errors.log"
    AUDIT_LOG_FILE = LOGS_DIR / "audit.log"
    SECURITY_LOG_FILE = LOGS_DIR / "security.log"
    
    # Log format
    DETAILED_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
    SECURITY_FORMAT = "%(asctime)s - SECURITY - %(levelname)s - %(message)s"

    @staticmethod
    def get_logger(name: str, log_level: str = "INFO") -> logging.Logger:
        """
        Get a configured logger with file and console handlers.
        
        Args:
            name: Logger name (typically __name__)
            log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        
        Returns:
            Configured logger instance
        """
        logger = logging.getLogger(name)
        
        # Avoid duplicate handlers if logger already configured
        if logger.handlers:
            return logger
        
        logger.setLevel(getattr(logging, log_level))
        
        # Console Handler (INFO and above)
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_formatter = logging.Formatter(LogConfig.DETAILED_FORMAT)
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)
        
        # File Handler with Rotation (all levels)
        file_handler = logging.handlers.RotatingFileHandler(
            LogConfig.APP_LOG_FILE,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=10,  # Keep 10 backup files
            encoding='utf-8'
        )
        file_handler.setLevel(logging.DEBUG)
        file_formatter = logging.Formatter(LogConfig.DETAILED_FORMAT)
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)
        
        # Error File Handler (ERROR and above)
        error_handler = logging.handlers.RotatingFileHandler(
            LogConfig.ERROR_LOG_FILE,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=10,
            encoding='utf-8'
        )
        error_handler.setLevel(logging.ERROR)
        error_formatter = logging.Formatter(LogConfig.DETAILED_FORMAT)
        error_handler.setFormatter(error_formatter)
        logger.addHandler(error_handler)
        
        return logger


class AuditLogConfig:
    """Audit logging configuration for security-critical events."""
    
    LOGS_DIR = LogConfig.LOGS_DIR
    AUDIT_LOG_FILE = LogConfig.AUDIT_LOG_FILE
    SECURITY_LOG_FILE = LogConfig.SECURITY_LOG_FILE
    SECURITY_FORMAT = LogConfig.SECURITY_FORMAT

    @staticmethod
    def get_audit_logger(name: str = "audit") -> logging.Logger:
        """
        Get an audit logger for security-critical events.
        
        Args:
            name: Logger name
        
        Returns:
            Configured audit logger instance
        """
        logger = logging.getLogger(name)
        
        if logger.handlers:
            return logger
        
        logger.setLevel(logging.INFO)
        
        # Audit File Handler
        audit_handler = logging.handlers.RotatingFileHandler(
            AuditLogConfig.AUDIT_LOG_FILE,
            maxBytes=10 * 1024 * 1024,
            backupCount=30,  # Keep 30 backup files for audit trail
            encoding='utf-8'
        )
        audit_handler.setLevel(logging.INFO)
        
        # Custom formatter for audit logs
        audit_formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s | USER:%(user_id)s | ACTION:%(action)s | DETAILS:%(details)s"
        )
        audit_handler.setFormatter(audit_formatter)
        logger.addHandler(audit_handler)
        
        return logger

    @staticmethod
    def get_security_logger(name: str = "security") -> logging.Logger:
        """
        Get a security logger for authentication and authorization events.
        
        Args:
            name: Logger name
        
        Returns:
            Configured security logger instance
        """
        logger = logging.getLogger(name)
        
        if logger.handlers:
            return logger
        
        logger.setLevel(logging.WARNING)
        
        # Console handler for security events
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.WARNING)
        console_formatter = logging.Formatter(AuditLogConfig.SECURITY_FORMAT)
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)
        
        # Security File Handler
        security_handler = logging.handlers.RotatingFileHandler(
            AuditLogConfig.SECURITY_LOG_FILE,
            maxBytes=10 * 1024 * 1024,
            backupCount=30,
            encoding='utf-8'
        )
        security_handler.setLevel(logging.WARNING)
        security_formatter = logging.Formatter(AuditLogConfig.SECURITY_FORMAT)
        security_handler.setFormatter(security_formatter)
        logger.addHandler(security_handler)
        
        return logger


# Initialize loggers
app_logger = LogConfig.get_logger("app", "INFO")
audit_logger = AuditLogConfig.get_audit_logger("audit")
security_logger = AuditLogConfig.get_security_logger("security")


def setup_logging(log_level: str = "INFO") -> None:
    """Initialize all application loggers once during startup."""
    LogConfig.get_logger("app", log_level)
    AuditLogConfig.get_audit_logger("audit")
    AuditLogConfig.get_security_logger("security")
