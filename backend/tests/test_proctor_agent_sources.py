import pytest

from services.proctor_agent import _resolve_proctor_event_source


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("comm", ("comm_proctoring_logs", "session_id")),
        ("skill", ("skill_proctoring_logs", "attempt_id")),
        ("global", ("global_proctoring_logs", "session_id")),
        ("aptitude", ("aptitude_proctoring_logs", "session_id")),
        ("GLOBAL", ("global_proctoring_logs", "session_id")),
    ],
)
def test_resolve_proctor_event_source_supported_values(source, expected):
    assert _resolve_proctor_event_source(source) == expected


def test_resolve_proctor_event_source_rejects_unknown_source():
    with pytest.raises(ValueError):
        _resolve_proctor_event_source("unknown")
