from routes import analytics


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def execute(self, query):
        self.query = query

    async def fetchall(self):
        return self._rows


class _FakeConn:
    def __init__(self, rows):
        self._rows = rows

    def cursor(self, *_args, **_kwargs):
        return _FakeCursor(self._rows)


async def _resolve(rows):
    analytics._submission_plagiarism_filter_cache = None
    return await analytics._resolve_submission_plagiarism_filter(_FakeConn(rows))


def test_plagiarism_filter_prefers_both_columns():
    result = __import__("asyncio").run(_resolve([
        {"Field": "flagged_submission"},
        {"Field": "plagiarism_detected"},
    ]))
    assert result == "(s.flagged_submission = 1 OR LOWER(COALESCE(s.plagiarism_detected,''))='true')"


def test_plagiarism_filter_supports_legacy_column_only():
    result = __import__("asyncio").run(_resolve([
        {"Field": "plagiarism_detected"},
    ]))
    assert result == "LOWER(COALESCE(s.plagiarism_detected,''))='true'"


def test_plagiarism_filter_returns_safe_false_when_no_columns():
    result = __import__("asyncio").run(_resolve([]))
    assert result == "1=0"
