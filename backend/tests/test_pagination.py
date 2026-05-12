"""Tests for `services.pagination.paginated_response`."""

from __future__ import annotations

from services.pagination import paginated_response


def test_paginated_response_basic_shape():
    out = paginated_response(data=[1, 2, 3], total=10, page=1, limit=5)
    assert out["data"] == [1, 2, 3]
    assert out["pagination"]["total"] == 10
    assert out["pagination"]["page"] == 1
    assert out["pagination"]["limit"] == 5
    assert out["pagination"]["totalPages"] == 2
    assert out["pagination"]["hasMore"] is True


def test_paginated_response_last_page_has_no_more():
    out = paginated_response(data=[10], total=10, page=2, limit=5)
    assert out["pagination"]["totalPages"] == 2
    assert out["pagination"]["hasMore"] is False


def test_paginated_response_total_pages_rounds_up():
    out = paginated_response(data=[], total=11, page=1, limit=5)
    assert out["pagination"]["totalPages"] == 3  # ceil(11/5) = 3


def test_paginated_response_handles_zero_limit_safely():
    # Defensive: a 0 limit must not raise ZeroDivisionError.
    out = paginated_response(data=[], total=0, page=1, limit=0)
    assert out["pagination"]["totalPages"] == 1
    assert out["pagination"]["hasMore"] is False


def test_paginated_response_handles_zero_total():
    out = paginated_response(data=[], total=0, page=1, limit=10)
    assert out["pagination"]["totalPages"] == 0
    assert out["pagination"]["hasMore"] is False
