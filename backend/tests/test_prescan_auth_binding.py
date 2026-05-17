from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routes import environment_scan


@pytest.mark.asyncio
async def test_effective_user_rejects_user_mismatch_for_student(monkeypatch):
    async def fake_get_user(user_id: str):
        return {"id": user_id, "role": "student", "name": "Stu", "email": "stu@example.com"}

    monkeypatch.setattr(environment_scan, "_get_user", fake_get_user)
    req = SimpleNamespace(state=SimpleNamespace(auth_user_id="student-1"))

    with pytest.raises(HTTPException) as exc:
        await environment_scan._effective_user(req, requested_user_id="student-2")

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_effective_user_allows_override_for_mentor(monkeypatch):
    async def fake_get_user(user_id: str):
        return {"id": user_id, "role": "mentor", "name": "Men", "email": "mentor@example.com"}

    monkeypatch.setattr(environment_scan, "_get_user", fake_get_user)
    req = SimpleNamespace(state=SimpleNamespace(auth_user_id="mentor-1"))

    user = await environment_scan._effective_user(req, requested_user_id="student-9")
    assert user["role"] == "mentor"

