import logging
logger = logging.getLogger(__name__)

"""One-off script to create a new user in the database."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import pymysql
import pymysql.cursors
import bcrypt
from config import settings


def create_user():
    email = "dummy@edu.com"
    password = "dummy123"
    name = "Dummy User"
    role = "student"

    # Hash the password with bcrypt
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Build SSL context if needed (TiDB Cloud)
    ssl_arg = None
    if settings.DB_PORT == 4000:
        import ssl as _ssl
        ctx = _ssl.create_default_context()
        ctx.check_hostname = True
        ctx.verify_mode = _ssl.CERT_REQUIRED
        ssl_arg = ctx

    conn = pymysql.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        ssl=ssl_arg,
    )

    try:
        with conn.cursor() as cur:
            # Check if user already exists
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            existing = cur.fetchone()
            if existing:
                print(f"User with email '{email}' already exists with id: {existing['id']}")
                return

            # Generate user ID (same logic as admin route)
            cur.execute("SELECT COUNT(*) AS cnt FROM users WHERE role = %s", (role,))
            cnt = cur.fetchone()["cnt"]
            user_id = f"{role}-{str(cnt + 1).zfill(3)}"

            # Insert the user
            cur.execute(
                "INSERT INTO users (id, name, email, password, role, mentor_id, batch, phone, status, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', NOW())",
                (user_id, name, email, hashed, role, None, None, None),
            )
        conn.commit()
        print(f"User created successfully!")
        print(f"  ID:    {user_id}")
        print(f"  Name:  {name}")
        print(f"  Email: {email}")
        print(f"  Role:  {role}")
    finally:
        conn.close()


if __name__ == "__main__":
    create_user()

