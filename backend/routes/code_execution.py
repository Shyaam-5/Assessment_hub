"""Code Execution using Judge0 API (free, no local dependencies).
SQL execution uses DuckDB for in-memory database operations.
"""

import re
import asyncio
import json
import logging
from logging_config import LogConfig
from fastapi import APIRouter, Request
from pydantic import BaseModel
import duckdb
import httpx
import pymysql.cursors
from audit_logger import get_audit_logger, AuditEventType
from database import get_pool

router = APIRouter(prefix="/api", tags=["code_execution"])
logger = LogConfig.get_logger(__name__)
audit_logger = get_audit_logger()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"

# â”€â”€â”€ Judge0 Language Mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# See: https://judge0.com/languages
_JUDGE0_LANGUAGES = {
    "python": 71,          # Python (3.8.1)
    "python3": 71,         # Python (3.8.1)
    "javascript": 55,      # JavaScript (Node.js 12.14.0)
    "js": 55,             # JavaScript (Node.js 12.14.0)
    "node": 55,           # JavaScript (Node.js 12.14.0)
    "java": 62,           # Java (OpenJDK 13.0.1)
    "c": 50,              # C (GCC 9.2.0)
    "cpp": 54,            # C++ (G++ 9.2.0)
    "c++": 54,            # C++ (G++ 9.2.0)
    "csharp": 51,         # C# (Mono 6.6.0.161)
    "go": 60,             # Go (1.12.6)
    "rust": 73,           # Rust (1.40.0)
    "php": 68,            # PHP (7.4.1)
    "ruby": 72,           # Ruby (2.7.0)
}

_JUDGE0_API = "https://ce.judge0.com/submissions"

# â”€â”€â”€ Safety: block dangerous code patterns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_DANGEROUS_PATTERNS_PY = [
    r'\bos\.system\b', r'\bos\.popen\b', r'\bos\.exec\w*\b',
    r'\bsubprocess\b', r'\b__import__\b', r'\beval\s*\(',
    r'\bexec\s*\(', r'\bcompile\s*\(', r'\bopen\s*\([^)]*[\'\"/]',
    r'\bsocket\b', r'\bhttp\.', r'\burllib\b', r'\brequests\b',
    r'\bshutil\.rmtree\b', r'\bos\.remove\b', r'\bos\.unlink\b',
    r'\bos\.rmdir\b', r'\bos\.rename\b', r'\bctypes\b',
    r'\bsignal\b', r'\bsys\.exit\b', r'\bquit\s*\(', r'\bexit\s*\(',
]
_DANGEROUS_PATTERNS_JS = [
    r'\bchild_process\b', r'\bfs\.write\b', r'\bfs\.unlink\b',
    r'\bfs\.rmdir\b', r'\bfs\.rm\b', r'\bprocess\.exit\b',
    r'\brequire\s*\(\s*["\']net["\']', r'\brequire\s*\(\s*["\']http["\']',
    r'\brequire\s*\(\s*["\']https["\']', r'\brequire\s*\(\s*["\']dgram["\']',
]
_DANGEROUS_PATTERNS_GENERAL = [
    r'\brm\s+-rf\b', r'\bformat\s+[cCdD]:', r'\bdel\s+/[sS]',
]
_DANGEROUS_PATTERNS_SQL = [
    r'\bDROP\s+TABLE\b', r'\bDROP\s+DATABASE\b', r'\bTRUNCATE\b',
    r'\bALTER\s+TABLE\b.*DROP\b', r'\bDELETE\s+FROM\b.*WHERE\s+1\s*=\s*1\b',
]

def _check_code_safety(code: str, language: str) -> str | None:
    """Return an error message if dangerous patterns are found, else None."""
    lang = language.lower()
    patterns = list(_DANGEROUS_PATTERNS_GENERAL)
    if lang in ('python', 'python3'):
        patterns.extend(_DANGEROUS_PATTERNS_PY)
    elif lang in ('javascript', 'js', 'node'):
        patterns.extend(_DANGEROUS_PATTERNS_JS)
    elif lang in ('sql', 'duckdb', 'sqlite3'):
        patterns.extend(_DANGEROUS_PATTERNS_SQL)
    for pat in patterns:
        if re.search(pat, code, re.IGNORECASE):
            return f"Blocked: code contains a restricted operation (matched: {pat.split(chr(92))[-1].rstrip(chr(92) + 'b')})"
    return None


class RunRequest(BaseModel):
    language: str
    code: str
    stdin: str | None = ""
    sqlSchema: str | None = ""
    problemId: str | None = None


class RunWithTestsRequest(BaseModel):
    language: str
    code: str
    problemId: str
    sqlSchema: str | None = ""
    isGlobalTest: bool | None = False


async def _execute_with_judge0(language: str, code: str, stdin_data: str = "") -> dict:
    """Execute code using Judge0 API (free service)."""
    try:
        lang_lower = language.lower()
        language_id = _JUDGE0_LANGUAGES.get(lang_lower)
        
        if not language_id:
            return {
                "output": "",
                "error": f"Language '{language}' not supported. Available: {', '.join(_JUDGE0_LANGUAGES.keys())}",
                "exitCode": 1,
            }
        
        payload = {
            "source_code": code,
            "language_id": language_id,
            "stdin": stdin_data or "",
        }
        
        # Call Judge0 API with wait=true (waits for completion)
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{_JUDGE0_API}/?base64_encoded=false&wait=true",
                json=payload,
            )
        
        if response.status_code not in (200, 201):
            return {
                "output": "",
                "error": f"Judge0 API error: {response.status_code}",
                "exitCode": 1,
            }
        
        result = response.json()
        
        # Judge0 response format
        stdout = result.get("stdout", "")
        stderr = result.get("stderr", "")
        status = result.get("status") or {}
        status_id = result.get("status_id") or status.get("id", 0)
        compile_output = result.get("compile_output", "")
        
        # Status codes: 1=in queue, 2=processing, 3=accepted, 4=wrong answer, 5=time limit, 6=compilation error, 7=runtime error, 8=internal error
        error_msg = ""
        if status_id == 6:  # Compilation error
            error_msg = compile_output or stderr or "Compilation error"
        elif status_id == 7:  # Runtime error
            error_msg = stderr or "Runtime error"
        elif status_id == 5:  # Time limit
            error_msg = "Execution timed out after 5 seconds"
        elif status_id in (4, 8):  # Wrong answer or internal error
            error_msg = stderr or "Execution failed"
        
        return {
            "output": stdout,
            "error": error_msg,
            "exitCode": 0 if status_id == 3 else 1,  # 3 = accepted
        }
        
    except asyncio.TimeoutError:
        return {
            "output": "",
            "error": "Execution timed out (Judge0 API timeout)",
            "exitCode": 124,
        }
    except Exception as e:
        return {
            "output": "",
            "error": f"Execution error: {str(e)}",
            "exitCode": 1,
        }



async def _execute_sql_duckdb(schema: str | None, query: str) -> dict:
    """Execute SQL query using DuckDB in-memory database."""
    try:
        def execute_sql():
            conn = duckdb.connect(':memory:')
            
            # Create schema if provided
            if schema:
                schema_statements = schema.split(';')
                for stmt in schema_statements:
                    stmt = stmt.strip()
                    if stmt:
                        conn.execute(stmt)
            
            # Execute user query
            result = conn.execute(query).fetchall()
            columns = [desc[0] for desc in conn.description] if conn.description else []
            
            # Format output nicely
            output = ""
            if columns:
                output = " | ".join(columns) + "\n"
                output += "-" * (sum(len(str(c)) for c in columns) + len(columns) * 3) + "\n"
            
            for row in result:
                output += " | ".join(str(cell) for cell in row) + "\n"
            
            conn.close()
            return output.strip()
        
        # Run in thread pool to avoid blocking
        result = await asyncio.to_thread(execute_sql)
        return {
            "output": result,
            "error": "",
            "exitCode": 0,
        }
    except Exception as e:
        return {
            "output": "",
            "error": f"SQL Error: {str(e)}",
            "exitCode": 1,
        }


def _normalize_output(value: str | None) -> str:
    text = (value or "").replace("\r", "").strip()
    return "\n".join(line.rstrip() for line in text.split("\n")).strip()


def _normalize_sql_output(value: str | None) -> str:
    rows = []
    for line in _normalize_output(value).split("\n"):
        stripped = line.strip()
        if not stripped or re.fullmatch(r"[-+|=\s]+", stripped):
            continue
        rows.append(re.sub(r"\s*\|\s*", "|", stripped))
    return "\n".join(rows)


def _extract_sql_rows(value: str | None) -> list[str]:
    rows = _normalize_sql_output(value).split("\n")
    if len(rows) <= 1:
        return [row for row in rows if row]
    return [row for row in rows[1:] if row]


def _outputs_match(actual: str, expected: str, language: str) -> bool:
    if language.lower() in {"sql", "duckdb", "sqlite3"}:
        actual_norm = _normalize_sql_output(actual)
        expected_norm = _normalize_sql_output(expected)
        return actual_norm == expected_norm or _extract_sql_rows(actual) == _extract_sql_rows(expected)
    return _normalize_output(actual) == _normalize_output(expected)


def _coerce_test_cases(raw_cases) -> list[dict]:
    if isinstance(raw_cases, str):
        try:
            raw_cases = json.loads(raw_cases)
        except json.JSONDecodeError:
            raw_cases = []
    if not isinstance(raw_cases, list):
        return []

    test_cases = []
    for index, case in enumerate(raw_cases, start=1):
        if not isinstance(case, dict):
            continue
        test_cases.append({
            "index": index,
            "input": str(case.get("input") or case.get("stdin") or ""),
            "expectedOutput": str(case.get("expectedOutput") or case.get("expected_output") or case.get("output") or ""),
            "isHidden": bool(case.get("isHidden") or case.get("is_hidden") or False),
            "description": str(case.get("description") or ""),
        })
    return test_cases


async def _load_problem(problem_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT id, sample_input, expected_output, sql_schema, expected_query_result, test_cases
                FROM problems
                WHERE id = %s
                LIMIT 1
                """,
                (problem_id,),
            )
            return await cur.fetchone()


async def _run_against_test_cases(language: str, code: str, sql_schema: str, test_cases: list[dict]) -> list[dict]:
    results = []
    for case in test_cases:
        if language.lower() in {"sql", "duckdb", "sqlite3"}:
            execution = await _execute_sql_duckdb(sql_schema, code)
        else:
            execution = await _execute_with_judge0(language, code, case.get("input", ""))

        actual_output = execution.get("output", "")
        expected_output = case.get("expectedOutput", "")
        passed = execution.get("exitCode") == 0 and _outputs_match(actual_output, expected_output, language)
        results.append({
            "index": case.get("index"),
            "input": case.get("input", ""),
            "actualOutput": actual_output,
            "expectedOutput": expected_output,
            "passed": passed,
            "isHidden": bool(case.get("isHidden")),
            "description": case.get("description", ""),
            "error": execution.get("error", ""),
        })
    return results


@router.post("/run")
async def run_code(body: RunRequest, request: Request):
    """Execute code using Judge0 API or DuckDB for SQL."""
    lang_lower = body.language.lower()
    logger.info("Code execution request language=%s", body.language)

    # Safety check â€” block dangerous code patterns
    safety_err = _check_code_safety(body.code, lang_lower)
    if safety_err:
        audit_logger.log_event(
            AuditEventType.PERMISSION_DENIED,
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_type="code_execution",
            action="Blocked unsafe code execution request",
            details={"language": body.language},
            status="FAILURE",
        )
        return {"output": "", "error": safety_err, "exitCode": 1}

    try:
        # SQL execution: use DuckDB (in-memory, free)
        if lang_lower in ["sql", "duckdb", "sqlite3"]:
            result = await _execute_sql_duckdb(body.sqlSchema, body.code)
            audit_logger.log_event(
                AuditEventType.RESOURCE_ACCESSED,
                user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
                ip_address=_client_ip(request),
                resource_type="code_execution",
                action="SQL code executed",
                details={"exitCode": result.get("exitCode")},
                status="SUCCESS" if result.get("exitCode") == 0 else "FAILURE",
            )
            return result
        
        # Other languages: use Judge0 API (free, supports 50+ languages)
        else:
            result = await _execute_with_judge0(body.language, body.code, body.stdin or "")
            audit_logger.log_event(
                AuditEventType.RESOURCE_ACCESSED,
                user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
                ip_address=_client_ip(request),
                resource_type="code_execution",
                action="Code executed",
                details={"language": body.language, "exitCode": result.get("exitCode")},
                status="SUCCESS" if result.get("exitCode") == 0 else "FAILURE",
            )
            return result
            
    except Exception as e:
        return {
            "output": "",
            "error": f"Execution error: {str(e)}",
            "exitCode": 1,
        }


@router.post("/run-with-tests")
async def run_with_tests(body: RunWithTestsRequest, request: Request):
    lang_lower = body.language.lower()
    safety_err = _check_code_safety(body.code, lang_lower)
    if safety_err:
        return {"success": False, "error": safety_err, "testResults": []}

    problem = await _load_problem(body.problemId)
    if not problem:
        return {"success": False, "error": "Problem not found", "testResults": []}

    test_cases = _coerce_test_cases(problem.get("test_cases"))
    if not test_cases:
        fallback_expected = (
            problem.get("expected_query_result")
            if lang_lower in {"sql", "duckdb", "sqlite3"}
            else problem.get("expected_output")
        ) or ""
        fallback_input = "" if lang_lower in {"sql", "duckdb", "sqlite3"} else (problem.get("sample_input") or "")
        if fallback_expected:
            test_cases = [{
                "index": 1,
                "input": str(fallback_input),
                "expectedOutput": str(fallback_expected),
                "isHidden": False,
                "description": "Default validation case",
            }]

    if not test_cases:
        return {"success": False, "error": "No test cases configured for this problem", "testResults": []}

    sql_schema = body.sqlSchema or problem.get("sql_schema") or ""
    test_results = await _run_against_test_cases(body.language, body.code, sql_schema, test_cases)
    passed = sum(1 for result in test_results if result.get("passed"))
    total = len(test_results)

    audit_logger.log_event(
        AuditEventType.RESOURCE_ACCESSED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="code_execution",
        action="Code executed with tests",
        details={"language": body.language, "problemId": body.problemId, "passed": passed, "total": total},
        status="SUCCESS" if passed == total else "FAILURE",
    )

    return {
        "success": True,
        "testResults": test_results,
        "summary": {
            "passed": passed,
            "total": total,
            "percentage": round((passed / total) * 100) if total else 0,
        },
    }

