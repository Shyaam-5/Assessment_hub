from __future__ import annotations

import pytest

from database import resolve_tenant_db_url


def test_resolve_tenant_db_url_prefers_direct_url_over_ref(monkeypatch):
    monkeypatch.setenv("TENANT_DB_A", "mysql://env-user:env-pass@env-host:3306/env_db")
    out = resolve_tenant_db_url(
        db_url="mysql://direct-user:direct-pass@direct-host:3306/direct_db",
        db_secret_ref="env://TENANT_DB_A",
    )
    assert out == "mysql://direct-user:direct-pass@direct-host:3306/direct_db"


def test_resolve_tenant_db_url_from_env_secret_ref(monkeypatch):
    monkeypatch.setenv("TENANT_DB_B", "mysql://user:pass@localhost:3306/tenant_b")
    out = resolve_tenant_db_url(db_url=None, db_secret_ref="env://TENANT_DB_B")
    assert out == "mysql://user:pass@localhost:3306/tenant_b"


def test_resolve_tenant_db_url_rejects_unsupported_ref():
    with pytest.raises(RuntimeError):
        resolve_tenant_db_url(db_url=None, db_secret_ref="vault://tenant/db/url")

