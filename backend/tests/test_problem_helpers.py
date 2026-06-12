from __future__ import annotations

from routes import problems


def test_normalize_test_cases_handles_mixed_input_shapes():
    out = problems._normalize_test_cases([
        {
            "input": "1 2 3",
            "expected_output": "6",
            "is_hidden": True,
            "points": 15,
            "description": "sum case",
        },
        {
            "sampleInput": "4 5",
            "expectedOutput": "9",
        },
    ])

    assert len(out) == 2
    assert out[0]["input"] == "1 2 3"
    assert out[0]["expectedOutput"] == "6"
    assert out[0]["isHidden"] is True
    assert out[0]["points"] == 15
    assert out[0]["description"] == "sum case"
    assert out[1]["input"] == "4 5"
    assert out[1]["expectedOutput"] == "9"
    assert out[1]["isHidden"] is False
    assert out[1]["points"] == 10
    assert out[0]["id"]
    assert out[1]["id"]


def test_problem_sample_input_prefers_sample_input_over_legacy_test_input():
    body = problems.ProblemCreate(
        mentorId="m1",
        title="Problem",
        description="desc",
        sampleInput="sample",
        testInput="legacy",
    )
    assert problems._problem_sample_input(body) == "sample"


def test_problem_sample_input_falls_back_to_legacy_test_input():
    body = problems.ProblemCreate(
        mentorId="m1",
        title="Problem",
        description="desc",
        sampleInput=None,
        testInput="legacy",
    )
    assert problems._problem_sample_input(body) == "legacy"


def test_enrich_problem_normalizes_test_cases_and_test_input_alias():
    enriched = problems._enrich_problem({
        "id": "p1",
        "mentor_id": "m1",
        "title": "Problem",
        "description": "desc",
        "sample_input": "2 3",
        "expected_output": "5",
        "sql_schema": None,
        "expected_query_result": None,
        "test_cases": [
            {"input": "2 3", "expected_output": "5"},
            {"sampleInput": "4 5", "expectedOutput": "9", "points": 20},
        ],
        "type": "Coding",
        "language": "Python",
        "created_at": "2026-06-12T00:00:00Z",
        "enable_proctoring": "false",
        "enable_video_audio": "false",
        "enable_microphone": "false",
        "disable_copy_paste": "false",
        "track_tab_switches": "false",
        "max_tab_switches": 3,
        "detect_phone_usage": "false",
        "detect_camera_blocking": "false",
        "enforce_fullscreen": "false",
        "enable_face_detection": "false",
        "detect_multiple_faces": "false",
        "track_face_lookaway": "false",
        "auto_submit_on_violation": "false",
        "excluded_violation_types": '["window_blur"]',
    })

    assert enriched["sampleInput"] == "2 3"
    assert enriched["testInput"] == "2 3"
    assert enriched["expectedOutput"] == "5"
    assert len(enriched["testCases"]) == 2
    assert enriched["testCases"][0]["expectedOutput"] == "5"
    assert enriched["testCases"][1]["input"] == "4 5"
    assert enriched["testCases"][1]["points"] == 20
