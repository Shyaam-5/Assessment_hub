from decimal import Decimal

from routes.skill_tests import (
    _normalize_sql_rows,
    _normalize_sql_value,
    _query_has_order_by,
    _results_match,
)


def test_normalize_sql_value_handles_common_types():
    assert _normalize_sql_value(None) == "NULL"
    assert _normalize_sql_value(Decimal("100.00")) == "100"
    assert _normalize_sql_value(12.3400) == "12.34"
    assert _normalize_sql_value(" Alice ") == "Alice"


def test_normalize_sql_rows_preserves_row_structure():
    rows = _normalize_sql_rows([(1, Decimal("2.50")), ("x", None)])
    assert rows == [("1", "2.5"), ("x", "NULL")]


def test_results_match_ignores_row_order_when_not_required():
    expected_columns = ["name", "salary"]
    expected_rows = [("Alice", 100), ("Bob", 200)]
    actual_columns = ["name", "salary"]
    actual_rows = [("Bob", 200), ("Alice", 100)]

    assert _results_match(expected_columns, expected_rows, actual_columns, actual_rows, enforce_order=False)
    assert not _results_match(expected_columns, expected_rows, actual_columns, actual_rows, enforce_order=True)


def test_results_match_rejects_column_mismatch():
    assert not _results_match(
        ["name", "salary"],
        [("Alice", 100)],
        ["employee_name", "salary"],
        [("Alice", 100)],
        enforce_order=False,
    )


def test_query_has_order_by_detection():
    assert _query_has_order_by("select * from employees order by salary desc")
    assert not _query_has_order_by("select department, count(*) from employees group by department")
