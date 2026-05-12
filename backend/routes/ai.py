"""AI generation & chat routes used by AdminPortal and AIChatbot."""

import logging
from logging_config import LogConfig
from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel
from services.ai_service import (
    _call_cerebras,
    parse_json,
    generate_coding_problems,
    generate_sql_problems,
)
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = LogConfig.get_logger(__name__)
audit_logger = get_audit_logger()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


async def _log_read_access(request: Request):
    if request.method == "GET":
        audit_logger.log_data_access(
            user_id=request.headers.get("x-user-id", "anonymous"),
            ip_address=_client_ip(request),
            resource_type="ai_read",
            query_params={"path": request.url.path, "query": request.url.query},
        )


router.dependencies.append(Depends(_log_read_access))


# ─── Request / Response Models ──────────────────────────────────────────


class GenerateProblemRequest(BaseModel):
    prompt: str
    type: str = "problem"          # "problem" | "task"
    language: str = "Python"


class GenerateCodingProblemRequest(BaseModel):
    topic: str = ""
    difficulty: str = "Medium"
    language: str = "Python"


class GenerateSQLProblemRequest(BaseModel):
    topic: str = ""
    difficulty: str = "Medium"


class GenerateAptitudeRequest(BaseModel):
    topic: str = ""
    difficulty: str = "Medium"
    count: int = 5
    section: str = "aptitude"


class AIChatRequest(BaseModel):
    messages: list[dict]
    context: str = "problem"


# ─── Helpers ─────────────────────────────────────────────────────────────


_CODING_SYSTEM = (
    "You are an expert coding challenge designer. "
    "Given the user's request, generate a single coding problem. "
    "Return ONLY valid JSON with these fields:\n"
    '- "title": string\n'
    '- "description": string (clear problem statement)\n'
    '- "difficulty": "Easy" | "Medium" | "Hard"\n'
    '- "language": string\n'
    '- "sampleInput": string\n'
    '- "expectedOutput": string\n'
    '- "starterCode": string\n'
    '- "testCases": array of {input, expectedOutput}\n'
)

_SQL_SYSTEM = (
    "You are an expert SQL instructor. "
    "Given the user's request, generate a single SQL problem. "
    "Return ONLY valid JSON with these fields:\n"
    '- "title": string\n'
    '- "description": string\n'
    '- "difficulty": "Easy" | "Medium" | "Hard"\n'
    '- "type": "SQL"\n'
    '- "language": "SQL"\n'
    '- "sqlSchema": string (CREATE TABLE statements)\n'
    '- "expectedQueryResult": string (expected result preview)\n'
    '- "sampleInput": string (the query task)\n'
    '- "expectedOutput": string\n'
)

_TASK_SYSTEM = (
    "You are an expert ML/AI task designer for a mentoring platform. "
    "Given the user's request, generate a single ML/AI task. "
    "Return ONLY valid JSON with these fields:\n"
    '- "title": string\n'
    '- "type": string (e.g. "Classification", "NLP", "Computer Vision")\n'
    '- "difficulty": "Easy" | "Medium" | "Hard"\n'
    '- "description": string\n'
    '- "requirements": string (bullet-point list)\n'
)

_DEFAULT_SQL_SCHEMA = (
    "CREATE TABLE employees (\n"
    "  id INT PRIMARY KEY,\n"
    "  name VARCHAR(100),\n"
    "  department VARCHAR(100),\n"
    "  salary DECIMAL(10,2)\n"
    ");\n\n"
    "CREATE TABLE departments (\n"
    "  id INT PRIMARY KEY,\n"
    "  name VARCHAR(100),\n"
    "  location VARCHAR(100)\n"
    ");"
)

_APTITUDE_SECTION_GUIDE = {
    "aptitude": "Quantitative aptitude: arithmetic, percentages, ratio-proportion, averages, profit-loss, time-speed-distance, basic data interpretation.",
    "verbal": "Verbal ability: grammar, sentence correction, synonyms/antonyms, reading comprehension, para-jumbles, vocabulary in context.",
    "logical": "Logical reasoning: number/letter series, coding-decoding, syllogism, arrangements, blood relations, pattern-based reasoning.",
}


def _language_key(language: str) -> str:
    key = (language or "python").strip().lower()
    if key in ("c++", "cpp"):
        return "cpp"
    if key in ("js", "javascript"):
        return "javascript"
    return key


def _fallback_generated_problem(prompt: str, req_type: str, language: str) -> dict:
    is_sql = (language or "").upper() == "SQL"
    if req_type == "task":
        return {
            "title": "AI Practice Task",
            "type": "Classification",
            "difficulty": "Medium",
            "description": f"Create and evaluate a small ML/AI workflow for: {prompt}",
            "requirements": "- Define objective\n- Prepare data\n- Train baseline\n- Evaluate with metrics",
        }
    if is_sql:
        return {
            "title": "SQL Practice Problem",
            "type": "SQL",
            "language": "SQL",
            "difficulty": "Medium",
            "description": f"Write a SQL query for the following request: {prompt}",
            "sqlSchema": _DEFAULT_SQL_SCHEMA,
            "expectedQueryResult": "name | department | salary",
            "sampleInput": "Return useful columns based on the prompt.",
            "expectedOutput": "Tabular result",
        }
    return {
        "title": "Coding Practice Problem",
        "language": language or "Python",
        "difficulty": "Medium",
        "description": f"Write a {language or 'Python'} program to solve: {prompt}",
        "sampleInput": "",
        "expectedOutput": "",
        "starterCode": "def solve():\n    pass",
        "testCases": [{"input": "", "expectedOutput": ""}],
    }


def _normalize_coding_problem(problem: dict, language: str) -> dict:
    starter_map = problem.get("starter_code") if isinstance(problem.get("starter_code"), dict) else {}
    lang_key = _language_key(problem.get("language") or language)
    starter_inline = problem.get("starterCode")
    if not isinstance(starter_inline, str):
        starter_inline = ""
    starter = (
        starter_inline
        or starter_map.get(lang_key)
        or starter_map.get("python")
        or ""
    )
    test_cases = problem.get("testCases")
    if not isinstance(test_cases, list):
        raw_cases = problem.get("test_cases")
        if isinstance(raw_cases, list):
            test_cases = [
                {
                    "input": c.get("input", ""),
                    "expected_output": c.get("expected_output", c.get("expectedOutput", "")),
                }
                for c in raw_cases if isinstance(c, dict)
            ]
        else:
            test_cases = []

    return {
        **problem,
        "question": problem.get("question") or problem.get("description") or problem.get("title") or "",
        "language": problem.get("language") or language,
        "difficulty": str(problem.get("difficulty", "Medium")).title(),
        "starterCode": starter,
        "testCases": test_cases,
        "hints": problem.get("hints") or [],
        "sampleInput": problem.get("sampleInput") or problem.get("sample_input") or "",
        "expectedOutput": problem.get("expectedOutput") or problem.get("sample_output") or "",
    }


def _normalize_sql_problem(problem: dict) -> dict:
    expected_output = (
        problem.get("expectedOutput")
        or problem.get("expected_output")
        or problem.get("expectedQueryResult")
        or ", ".join(problem.get("expected_columns", []))
        or "Tabular result"
    )
    hint = problem.get("hint") or ""
    return {
        **problem,
        "question": problem.get("question") or problem.get("description") or problem.get("title") or "",
        "difficulty": str(problem.get("difficulty", "Medium")).title(),
        "schema": problem.get("schema") or problem.get("sqlSchema") or _DEFAULT_SQL_SCHEMA,
        "expectedOutput": expected_output,
        "solutionQuery": problem.get("solutionQuery") or problem.get("reference_query") or "",
        "hints": problem.get("hints") or ([hint] if hint else []),
    }


def _normalize_aptitude_questions(questions: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            continue

        options = q.get("options")
        if not isinstance(options, list):
            options = [
                q.get("option1") or q.get("option_1"),
                q.get("option2") or q.get("option_2"),
                q.get("option3") or q.get("option_3"),
                q.get("option4") or q.get("option_4"),
            ]
        options = [str(o or "").strip() for o in options][:4]
        while len(options) < 4:
            options.append("")

        answer = q.get("correctAnswer", q.get("correct_answer", 0))
        if isinstance(answer, str):
            a = answer.strip()
            if len(a) == 1 and a.upper() in ("A", "B", "C", "D"):
                answer = ord(a.upper()) - ord("A")
            elif a.isdigit():
                answer = int(a)
            else:
                idx = options.index(a) if a in options else 0
                answer = idx
        if not isinstance(answer, int) or answer < 0 or answer > 3:
            answer = 0

        normalized.append({
            **q,
            "id": q.get("id", i + 1),
            "options": options,
            "correctAnswer": answer,
            "category": q.get("category") or q.get("skill") or "general",
            "difficulty": str(q.get("difficulty", "Medium")).title(),
            "explanation": q.get("explanation", ""),
        })
    return normalized


def _normalize_aptitude_section(section: str) -> str:
    s = (section or "").strip().lower()
    if s in ("quant", "quantitative", "qa"):
        return "aptitude"
    if s in ("verbal", "english"):
        return "verbal"
    if s in ("logical", "reasoning", "lr"):
        return "logical"
    return "aptitude"


def _fallback_aptitude_questions(section: str, topic: str, difficulty: str, count: int) -> list[dict]:
    focus = topic.strip() or section
    templates = {
        "aptitude": [
            {
                "question": f"In a {focus} problem, if a value increases by 20% and then decreases by 20%, what is the net change?",
                "options": ["No change", "4% decrease", "4% increase", "2% decrease"],
                "correctAnswer": 1,
                "explanation": "Let value be 100 -> 120 -> 96, so net change is -4%.",
            },
            {
                "question": "A train covers 120 km in 2 hours. What is its speed?",
                "options": ["40 km/h", "50 km/h", "60 km/h", "70 km/h"],
                "correctAnswer": 2,
                "explanation": "Speed = distance/time = 120/2 = 60 km/h.",
            },
        ],
        "verbal": [
            {
                "question": "Choose the correct synonym of 'meticulous'.",
                "options": ["Careless", "Thorough", "Loud", "Hasty"],
                "correctAnswer": 1,
                "explanation": "Meticulous means very careful and detailed.",
            },
            {
                "question": "Select the grammatically correct sentence.",
                "options": ["She don't like coffee.", "She doesn't likes coffee.", "She doesn't like coffee.", "She not like coffee."],
                "correctAnswer": 2,
                "explanation": "Subject-verb agreement: she + doesn't + base verb.",
            },
        ],
        "logical": [
            {
                "question": "Find the next number in the series: 2, 6, 12, 20, 30, ?",
                "options": ["36", "40", "42", "44"],
                "correctAnswer": 2,
                "explanation": "Differences are +4, +6, +8, +10, so next is +12 => 42.",
            },
            {
                "question": "If all roses are flowers and some flowers fade quickly, which conclusion is valid?",
                "options": ["All roses fade quickly", "Some roses may fade quickly", "No roses fade quickly", "Only roses are flowers"],
                "correctAnswer": 1,
                "explanation": "Only a possibility can be inferred, not certainty for all roses.",
            },
        ],
    }
    base = templates.get(section, templates["aptitude"])
    out: list[dict] = []
    for i in range(max(1, count)):
        t = base[i % len(base)]
        out.append({
            "id": i + 1,
            "question": t["question"],
            "options": t["options"],
            "correctAnswer": t["correctAnswer"],
            "category": section,
            "difficulty": difficulty.title(),
            "explanation": t["explanation"],
        })
    return out


async def _generate_section_questions(section: str, topic: str, difficulty: str, count: int) -> list[dict]:
    guidance = _APTITUDE_SECTION_GUIDE.get(section, _APTITUDE_SECTION_GUIDE["aptitude"])
    focus = topic.strip() or section
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert assessment question setter. "
                f"Generate {count} {difficulty} level MCQ questions for section '{section}'. "
                "Return ONLY a valid JSON array.\n"
                "Each object must have fields: question (string), options (array of exactly 4 strings), "
                "correctAnswer (number 0-3), category (string), explanation (string), difficulty (string)."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Section: {section}\n"
                f"Focus topic: {focus}\n"
                f"Guidance: {guidance}\n"
                "Questions should be practical, varied, and non-technical unless explicitly requested.\n"
                "Return JSON array only."
            ),
        },
    ]

    try:
        raw = await _call_cerebras(messages, temperature=0.8, max_tokens=3500)
        parsed = parse_json(raw)
        if isinstance(parsed, list) and parsed:
            questions = _normalize_aptitude_questions(parsed)
            for q in questions:
                q["category"] = q.get("category") or section
                q["difficulty"] = str(q.get("difficulty") or difficulty).title()
            return questions[:count]
    except Exception:
        pass

    return _fallback_aptitude_questions(section, focus, difficulty, count)


# ─── Routes ──────────────────────────────────────────────────────────────


@router.post("/generate-problem")
async def generate_problem(body: GenerateProblemRequest, request: Request):
    """Generate a single problem/task from a free-text prompt (AIChatbot)."""
    is_sql = body.language.upper() == "SQL"

    if body.type == "task":
        system_prompt = _TASK_SYSTEM
    elif is_sql:
        system_prompt = _SQL_SYSTEM
    else:
        system_prompt = _CODING_SYSTEM

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": body.prompt},
    ]

    logger.info("AI generate-problem request type=%s language=%s", body.type, body.language)
    try:
        raw = await _call_cerebras(messages, temperature=0.8, max_tokens=4096)
        generated = parse_json(raw)
        if generated and isinstance(generated, dict):
            if is_sql:
                generated.setdefault("type", "SQL")
                generated.setdefault("language", "SQL")
            elif body.type != "task":
                generated.setdefault("language", body.language)
            audit_logger.log_event(
                AuditEventType.RESOURCE_ACCESSED,
                user_id=request.headers.get("x-user-id", "anonymous"),
                ip_address=_client_ip(request),
                resource_type="ai_generation",
                action="Generated problem/task",
                details={"type": body.type, "language": body.language},
            )
            return {"success": True, "generated": generated}
        return {"success": True, "generated": _fallback_generated_problem(body.prompt, body.type, body.language), "fallback": True}
    except Exception as exc:
        return {
            "success": True,
            "generated": _fallback_generated_problem(body.prompt, body.type, body.language),
            "fallback": True,
            "details": str(exc),
        }


@router.post("/generate-coding-problem")
async def generate_coding_problem(body: GenerateCodingProblemRequest, request: Request):
    """Generate a coding problem for the admin problem bank."""
    skills = [s.strip() for s in body.topic.split(",") if s.strip()] or [body.language]

    logger.info("AI generate-coding-problem topic=%s difficulty=%s", body.topic, body.difficulty)
    try:
        problems = await generate_coding_problems(
            skills, count=1, difficulty_level=body.difficulty.lower(),
        )
        if problems:
            return {"problem": _normalize_coding_problem(problems[0], body.language)}
        return {
            "problem": _normalize_coding_problem(
                _fallback_generated_problem(body.topic or "coding challenge", "problem", body.language),
                body.language,
            ),
            "fallback": True,
        }
    except Exception as exc:
        return {
            "problem": _normalize_coding_problem(
                _fallback_generated_problem(body.topic or "coding challenge", "problem", body.language),
                body.language,
            ),
            "fallback": True,
            "details": str(exc),
        }


@router.post("/generate-sql-problem")
async def generate_sql_problem(body: GenerateSQLProblemRequest, request: Request):
    """Generate a SQL problem for the admin problem bank."""
    skills = [s.strip() for s in body.topic.split(",") if s.strip()] or ["SQL"]

    logger.info("AI generate-sql-problem topic=%s difficulty=%s", body.topic, body.difficulty)
    try:
        problems = await generate_sql_problems(skills, count=1)
        if problems:
            return {"problem": _normalize_sql_problem(problems[0])}
        return {
            "problem": _normalize_sql_problem(
                _fallback_generated_problem(body.topic or "SQL query task", "problem", "SQL"),
            ),
            "fallback": True,
        }
    except Exception as exc:
        return {
            "problem": _normalize_sql_problem(
                _fallback_generated_problem(body.topic or "SQL query task", "problem", "SQL"),
            ),
            "fallback": True,
            "details": str(exc),
        }


@router.post("/generate-aptitude")
async def generate_aptitude(body: GenerateAptitudeRequest, request: Request):
    """Generate aptitude / MCQ questions."""
    section = _normalize_aptitude_section(body.section)
    topic = (body.topic or "").strip()
    count = max(1, min(int(body.count or 1), 20))
    difficulty = (body.difficulty or "Medium").strip().title()

    logger.info("AI generate-aptitude section=%s count=%s", body.section, body.count)
    try:
        questions = await _generate_section_questions(section, topic, difficulty, count)
        return {"questions": questions, "section": section}
    except Exception as exc:
        return {"questions": _fallback_aptitude_questions(section, topic, difficulty, count), "section": section, "error": str(exc)}


@router.post("/chat")
async def ai_chat(body: AIChatRequest, request: Request):
    """Conversational AI chat with optional problem generation detection."""
    system_content = (
        "You are an AI coding assistant for a mentoring platform. "
        "Help users with programming concepts, problem creation, debugging, and best practices. "
        "Be encouraging and educational. "
        "If the user asks you to create or generate a problem, include a JSON block in your "
        "response with the problem specification."
    )

    messages = [{"role": "system", "content": system_content}]
    for m in body.messages[-10:]:
        messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    logger.info("AI chat request messages=%d", len(body.messages or []))
    try:
        raw = await _call_cerebras(messages, temperature=0.7, max_tokens=2048)

        generated_content = None
        parsed = parse_json(raw)
        if parsed and isinstance(parsed, dict) and "title" in parsed:
            generated_content = parsed

        return {"response": raw, "generatedContent": generated_content, "success": True}
    except Exception as exc:
        return {
            "response": "Sorry, I'm having trouble responding right now.",
            "generatedContent": None,
            "success": False,
            "details": str(exc),
        }
