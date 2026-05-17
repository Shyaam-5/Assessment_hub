from __future__ import annotations

import importlib


def test_org_scoped_room_naming_helpers():
    import main as main_module

    importlib.reload(main_module)

    assert main_module._org_admin_room("org-1") == "admin_room:org-1"
    assert main_module._org_mentor_room("org-1", "mentor-7") == "mentor:org-1:mentor-7"


def test_cors_origin_policy_for_runtime():
    import main as main_module

    importlib.reload(main_module)

    assert main_module._cors_origins_for_runtime(["https://app.example.com"]) == ["https://app.example.com"]
    old = main_module.settings.APP_ENV
    try:
        main_module.settings.APP_ENV = "production"
        assert main_module._cors_origins_for_runtime([]) == []
        main_module.settings.APP_ENV = "development"
        assert main_module._cors_origins_for_runtime([]) == "*"
    finally:
        main_module.settings.APP_ENV = old
