"""Tests for pure helpers in `routes.submissions` — no DB / network required."""

from __future__ import annotations

import pytest

from routes import submissions as sub


# ────────────────────────────────────────────────────────────────────
# _parse_sql_output / _normalise / _compare_sql_outputs
# ────────────────────────────────────────────────────────────────────

def test_parse_sql_output_returns_none_for_empty_input():
    assert sub._parse_sql_output("") is None
    assert sub._parse_sql_output("   ") is None
    assert sub._parse_sql_output(None) is None  # type: ignore[arg-type]


def test_parse_sql_output_strips_separator_lines():
    raw = (
        "id|name\n"
        "------\n"
        "1|Alice\n"
        "2|Bob\n"
    )
    assert sub._parse_sql_output(raw) == [
        ["id", "name"],
        ["1", "Alice"],
        ["2", "Bob"],
    ]


def test_parse_sql_output_handles_whitespace_columns():
    raw = "id  name\n1  Alice\n2  Bob\n"
    out = sub._parse_sql_output(raw)
    assert out == [["id", "name"], ["1", "Alice"], ["2", "Bob"]]


def test_normalise_lowercases_and_collapses_whitespace():
    assert sub._normalise("  Hello   WORLD  ") == "hello world"
    assert sub._normalise("") == ""
    assert sub._normalise(None) == ""  # type: ignore[arg-type]


def test_compare_sql_outputs_is_order_independent():
    a = [["1", "Alice"], ["2", "Bob"]]
    b = [["2", "Bob"], ["1", "Alice"]]
    assert sub._compare_sql_outputs(a, b) is True


def test_compare_sql_outputs_handles_case_and_whitespace():
    a = [["alice"], ["BOB"]]
    b = [["  Alice "], ["bob "]]
    assert sub._compare_sql_outputs(a, b) is True


def test_compare_sql_outputs_returns_false_on_length_mismatch():
    assert sub._compare_sql_outputs([["x"]], [["x"], ["y"]]) is False


def test_compare_sql_outputs_returns_false_when_either_side_is_none():
    assert sub._compare_sql_outputs(None, [["x"]]) is False
    assert sub._compare_sql_outputs([["x"]], None) is False
    assert sub._compare_sql_outputs(None, None) is False


# ────────────────────────────────────────────────────────────────────
# _evaluate_sql
# ────────────────────────────────────────────────────────────────────

def test_evaluate_sql_returns_100_for_correct_match():
    data = {"run": {"output": "id|name\n1|Alice\n", "code": 0}}
    res = sub._evaluate_sql(data, "id|name\n1|Alice\n")
    assert res["score"] == 100
    assert res["status"] == "accepted"


def test_evaluate_sql_returns_30_for_wrong_output():
    data = {"run": {"output": "id|name\n1|Alice\n", "code": 0}}
    res = sub._evaluate_sql(data, "id|name\n2|Bob\n")
    assert res["score"] == 30
    assert res["status"] == "rejected"


def test_evaluate_sql_returns_0_for_execution_failure():
    data = {"run": {"output": "syntax error near WHERE", "code": 1}}
    res = sub._evaluate_sql(data, "id|name\n1|Alice\n")
    assert res["score"] == 0
    assert res["status"] == "rejected"
    assert "syntax error" in res["aiExplanation"]


# ────────────────────────────────────────────────────────────────────
# _apply_penalties — penalty maths and integrity flag
# ────────────────────────────────────────────────────────────────────

def test_apply_penalties_sql_short_circuits_with_no_penalty():
    score, fb, integrity = sub._apply_penalties(
        100, "ok", "SQL", tab_switches=99, plagiarism_detected=True,
        copy_paste=10, camera_blocked=10, phone_detected=10,
        face_not_detected=10, multiple_faces=10, face_lookaway=10,
    )
    assert score == 100
    assert fb == "ok"
    assert integrity is False


def test_apply_penalties_caps_tab_switch_penalty_at_25():
    # 100 - min(99*5, 25) = 75
    score, _, integrity = sub._apply_penalties(100, "", "Python", tab_switches=99)
    assert score == 75
    assert integrity is True  # >= 3 tab switches


def test_apply_penalties_marks_integrity_for_3_plus_tab_switches():
    _, _, integrity = sub._apply_penalties(80, "", "Python", tab_switches=3)
    assert integrity is True


def test_apply_penalties_does_not_mark_integrity_for_few_tab_switches():
    _, _, integrity = sub._apply_penalties(80, "", "Python", tab_switches=2)
    assert integrity is False


def test_apply_penalties_plagiarism_keeps_30_percent_and_flags():
    score, fb, integrity = sub._apply_penalties(
        80, "", "Python", plagiarism_detected=True
    )
    assert score == int(80 * 0.3)
    assert integrity is True
    assert "Plagiarism" in fb


def test_apply_penalties_phone_detection_always_flags_integrity():
    _, _, integrity = sub._apply_penalties(80, "", "Python", phone_detected=1)
    assert integrity is True


def test_apply_penalties_camera_block_flags_only_at_threshold():
    _, _, integrity = sub._apply_penalties(80, "", "Python", camera_blocked=1)
    assert integrity is False
    _, _, integrity = sub._apply_penalties(80, "", "Python", camera_blocked=2)
    assert integrity is True


def test_apply_penalties_floor_at_zero_after_combined_penalties():
    # Tab cap=25, copy_paste cap=15, camera cap=30, phone cap=45 -> 115 > 50
    score, _, _ = sub._apply_penalties(
        50, "", "Python", tab_switches=10, copy_paste=10,
        camera_blocked=10, phone_detected=10,
    )
    assert score == 0


def test_apply_penalties_integrity_is_or_accumulated():
    """Regression: a True integrity flag from an earlier check (e.g. phone) must
    not be reset to False when a later check (e.g. only 1 tab switch) runs.
    Today that ordering already works; this test prevents regression if the
    order is changed in future."""
    # Manually exercise via plagiarism (which always flips True) + tab=1 (which would assign False
    # under the buggy assignment-style code) — verify final stays True.
    _, _, integrity = sub._apply_penalties(
        90, "", "Python", tab_switches=1, plagiarism_detected=True,
    )
    assert integrity is True


# ────────────────────────────────────────────────────────────────────
# _final_status thresholds
# ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("score, expected", [
    (100, "accepted"),
    (70, "accepted"),
    (69, "partial"),
    (40, "partial"),
    (39, "rejected"),
    (0, "rejected"),
])
def test_final_status_thresholds(score, expected):
    assert sub._final_status(score) == expected


# ────────────────────────────────────────────────────────────────────
# _extract_json — multi-strategy parser
# ────────────────────────────────────────────────────────────────────

def test_extract_json_direct_object():
    assert sub._extract_json('{"a": 1, "b": "x"}') == {"a": 1, "b": "x"}


def test_extract_json_returns_empty_dict_for_garbage():
    assert sub._extract_json("not json at all") == {}
    assert sub._extract_json("") == {}


def test_extract_json_extracts_from_markdown_code_block():
    text = """Here is the answer:
```json
{"score": 90, "status": "accepted"}
```
Hope that helps!
"""
    out = sub._extract_json(text)
    assert out == {"score": 90, "status": "accepted"}


def test_extract_json_extracts_from_unlabeled_code_block():
    text = "```\n{\"k\": 1}\n```"
    assert sub._extract_json(text) == {"k": 1}


def test_extract_json_finds_first_braced_object_when_no_code_block():
    text = "blah blah { \"score\": 50 } trailing junk"
    assert sub._extract_json(text) == {"score": 50}
