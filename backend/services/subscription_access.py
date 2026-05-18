"""Subscription-plan permission utilities shared across routes."""

from __future__ import annotations

from typing import Any


PERMISSION_CATALOG: dict[str, list[str]] = {
    "user_mgmt": ["users.create", "users.view", "users.update", "users.delete"],
    "roles": ["roles.create", "roles.view", "roles.update", "roles.delete"],
    "tests": ["tests.create", "tests.view", "tests.update", "tests.delete", "tests.assign", "tests.view_allocated", "tests.attempt"],
    "coding": ["coding.create", "coding.assign", "coding.evaluate", "coding.attempt"],
    "communication": ["communication.create", "communication.assign", "communication.evaluate", "communication.attempt"],
    "aptitude": ["aptitude.create", "aptitude.assign", "aptitude.evaluate", "aptitude.attempt"],
    "analytics": ["analytics.view", "analytics.export"],
    "proctoring": ["proctoring.view", "proctoring.override", "proctoring.manage"],
    "submissions": ["submissions.view", "submissions.manage"],
    "results": ["results.view_own"],
}

VALID_PERMISSIONS = {perm for perms in PERMISSION_CATALOG.values() for perm in perms}

SUBSCRIPTION_PLANS: dict[str, dict[str, Any]] = {
    "free_trial": {
        "label": "Free Trial",
        "allowed_permissions": {
            "tests.create",
            "tests.view",
            "tests.view_allocated",
            "tests.attempt",
            "coding.attempt",
            "communication.attempt",
            "aptitude.attempt",
            "analytics.view",
            "proctoring.view",
            "submissions.view",
            "results.view_own",
        },
    },
    "basic": {
        "label": "Basic",
        "allowed_permissions": {
            "users.create", "users.view", "users.update", "users.delete",
            "roles.create", "roles.view", "roles.update", "roles.delete",
            "tests.create", "tests.view", "tests.update", "tests.assign", "tests.view_allocated", "tests.attempt",
            "coding.create", "coding.assign", "coding.evaluate", "coding.attempt",
            "communication.create", "communication.assign", "communication.evaluate", "communication.attempt",
            "aptitude.create", "aptitude.assign", "aptitude.evaluate", "aptitude.attempt",
            "analytics.view",
            "proctoring.view",
            "submissions.view", "submissions.manage",
            "results.view_own",
        },
    },
    "pro": {
        "label": "Pro",
        "allowed_permissions": set(VALID_PERMISSIONS),
    },
}

DEFAULT_SUBSCRIPTION_TYPE = "free_trial"


def normalized_subscription_type(value: str | None) -> str:
    st = (value or "").strip().lower()
    if not st:
        return DEFAULT_SUBSCRIPTION_TYPE
    if st not in SUBSCRIPTION_PLANS:
        return DEFAULT_SUBSCRIPTION_TYPE
    return st


def allowed_permissions_for_subscription(subscription_type: str) -> set[str]:
    plan = SUBSCRIPTION_PLANS.get(subscription_type) or SUBSCRIPTION_PLANS[DEFAULT_SUBSCRIPTION_TYPE]
    return set(plan["allowed_permissions"])
