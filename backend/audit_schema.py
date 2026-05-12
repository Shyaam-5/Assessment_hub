import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')

"""
Database schema for audit logging and security event storage.
Contains SQL migrations for creating audit tables.
"""

AUDIT_TABLES_SCHEMA = """
-- Audit Events Table
-- Stores all security-critical events for compliance and investigation
CREATE TABLE IF NOT EXISTS audit_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    ip_address VARCHAR(45),
    resource_id VARCHAR(255),
    resource_type VARCHAR(100),
    action VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    error_message LONGTEXT,
    details JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_timestamp (timestamp),
    INDEX idx_user_id (user_id),
    INDEX idx_event_type (event_type),
    INDEX idx_ip_address (ip_address),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Authentication Audit Table
-- Tracks login attempts and authentication events
CREATE TABLE IF NOT EXISTS auth_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    email VARCHAR(255),
    ip_address VARCHAR(45) NOT NULL,
    auth_method VARCHAR(50),
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(255),
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_agent LONGTEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_ip_address (ip_address),
    INDEX idx_success (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin Actions Table
-- Logs all administrative actions for accountability
CREATE TABLE IF NOT EXISTS admin_actions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id VARCHAR(255) NOT NULL,
    admin_email VARCHAR(255),
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    description LONGTEXT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_id (admin_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_action_type (action_type),
    INDEX idx_resource_type (resource_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data Access Audit Table
-- Tracks access to sensitive data for compliance
CREATE TABLE IF NOT EXISTS data_access_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    data_type VARCHAR(100),
    query_type VARCHAR(50),
    filters JSON,
    record_count INT,
    ip_address VARCHAR(45),
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_data_type (data_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proctoring Events Table
-- Tracks all proctoring-related events and violations
CREATE TABLE IF NOT EXISTS proctoring_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    violation_type VARCHAR(100),
    severity VARCHAR(20),
    details JSON,
    action_taken VARCHAR(255),
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_student_id (student_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_event_type (event_type),
    INDEX idx_severity (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API Request Audit Table
-- Logs API requests for debugging and security analysis
CREATE TABLE IF NOT EXISTS api_request_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(255) UNIQUE,
    user_id VARCHAR(255),
    method VARCHAR(10),
    endpoint VARCHAR(500),
    query_string LONGTEXT,
    request_body LONGTEXT,
    response_status INT,
    response_time_ms INT,
    ip_address VARCHAR(45),
    user_agent LONGTEXT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_endpoint (endpoint),
    INDEX idx_response_status (response_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Security Alerts Table
-- Tracks potential security issues and anomalies
CREATE TABLE IF NOT EXISTS security_alerts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    user_id VARCHAR(255),
    ip_address VARCHAR(45),
    description LONGTEXT,
    alert_details JSON,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by VARCHAR(255),
    resolved_at DATETIME,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_severity (severity),
    INDEX idx_resolved (resolved),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create views for easy querying

-- View: Recent authentication failures
CREATE OR REPLACE VIEW v_auth_failures AS
SELECT 
    id, user_id, email, ip_address, failure_reason, timestamp,
    COUNT(*) OVER (PARTITION BY ip_address ORDER BY timestamp RANGE BETWEEN INTERVAL 1 HOUR PRECEDING AND CURRENT ROW) as failures_last_hour
FROM auth_audit
WHERE success = FALSE
ORDER BY timestamp DESC;

-- View: Recent admin actions
CREATE OR REPLACE VIEW v_recent_admin_actions AS
SELECT 
    id, admin_id, action_type, resource_type, resource_id, 
    ip_address, description, timestamp
FROM admin_actions
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY timestamp DESC;

-- View: Suspicious activity summary
CREATE OR REPLACE VIEW v_suspicious_activity AS
SELECT 
    'failed_auth' as activity_type,
    ip_address,
    COUNT(*) as count,
    MAX(timestamp) as last_seen
FROM auth_audit
WHERE success = FALSE AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY)
GROUP BY ip_address
HAVING COUNT(*) >= 5
UNION ALL
SELECT 
    'rate_limit_exceeded' as activity_type,
    ip_address,
    COUNT(*) as count,
    MAX(timestamp) as last_seen
FROM api_request_audit
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY ip_address
HAVING COUNT(*) >= 100
ORDER BY count DESC;
"""


async def create_audit_tables(db_connection) -> None:
    """
    Create all audit-related tables in the database.
    
    Args:
        db_connection: Database connection object
    """
    try:
        async with db_connection.cursor() as cursor:
            # Execute each table creation statement
            statements = AUDIT_TABLES_SCHEMA.split(';')
            for statement in statements:
                statement = statement.strip()
                if statement:
                    await cursor.execute(statement)
            
            await db_connection.commit()
            print("âœ“ Audit tables created successfully")
    except Exception as e:
        print(f"âœ— Error creating audit tables: {e}")
        raise


async def drop_audit_tables(db_connection) -> None:
    """
    Drop all audit-related tables from the database (for cleanup).
    
    Args:
        db_connection: Database connection object
    """
    try:
        async with db_connection.cursor() as cursor:
            tables = [
                "api_request_audit",
                "security_alerts",
                "proctoring_events",
                "data_access_audit",
                "admin_actions",
                "auth_audit",
                "audit_events",
            ]
            for table in tables:
                await cursor.execute(f"DROP TABLE IF EXISTS {table}")
            
            await db_connection.commit()
            print("âœ“ Audit tables dropped successfully")
    except Exception as e:
        print(f"âœ— Error dropping audit tables: {e}")
        raise

