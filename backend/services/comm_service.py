import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')

"""Communication Skills evaluation service using Cerebras AI.

Replaces the original Gemini-based llm_utils.py from the coms module.
Provides evaluation for:
  - Module A: Read & Speak (repetition mode)
  - Module B: Listen & Repeat (repetition mode)
  - Module C: Topic Speaking (topic mode)
  - Module D: Grammar Quiz (rule-based, no AI)
"""

import json
import random
import re

from services.ai_service import cerebras_chat, parse_json

# â”€â”€â”€ Static content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

SENTENCES_A = [
    "The sun rises in the east and sets in the west.",
    "Python is a powerful programming language used worldwide.",
    "Artificial intelligence is transforming the future of technology.",
    "Reading books expands knowledge and sharpens the mind.",
    "A balanced diet is essential for a healthy lifestyle.",
    "The quick brown fox jumps over the lazy dog.",
    "Water is the most essential resource for all living beings.",
    "Cloud computing allows data to be stored and accessed online.",
    "The earth revolves around the sun in an elliptical orbit.",
    "Machine learning enables computers to learn from data.",
    "Listening to music can reduce stress and improve mood.",
    "Teamwork is the key to achieving great success.",
    "Renewable energy sources are vital for a sustainable future.",
    "The internet has revolutionized communication and information sharing.",
    "Practice makes perfect, so never stop learning new things.",
]

SENTENCES_B = [
    "The sun rises in the east and sets in the west.",
    "Python is a powerful programming language used worldwide.",
    "Artificial intelligence is transforming the future of technology.",
    "Reading books expands knowledge and sharpens the mind.",
    "A balanced diet is essential for a healthy lifestyle.",
    "The quick brown fox jumps over the lazy dog.",
    "Water is the most essential resource for all living beings.",
    "Cloud computing allows data to be stored and accessed online.",
    "The earth revolves around the sun in an elliptical orbit.",
    "Machine learning enables computers to learn from data.",
    "Listening to music can reduce stress and improve mood.",
    "Teamwork is the key to achieving great success.",
    "Renewable energy sources are vital for a sustainable future.",
    "The internet has revolutionized communication and information sharing.",
]

TOPICS = [
    "The importance of renewable energy in today's world",
    "How technology is revolutionizing modern education",
    "The role of artificial intelligence in healthcare",
    "Your favorite hobby and why it brings you joy",
    "The impact of social media on modern society",
    "How to maintain a healthy lifestyle in busy times",
    "The importance of effective time management",
    "The benefits of reading books in the digital age",
    "Climate change and its global effects",
    "Your dream vacation destination and why",
]

QUESTIONS_BANK = [
    {"sentence": "I ___ (go) to the cinema yesterday.", "answer": "went", "category": "tenses_past_simple"},
    {"sentence": "She ___ (see) him at the park last week.", "answer": "saw", "category": "tenses_past_simple"},
    {"sentence": "They ___ (buy) a new house two years ago.", "answer": "bought", "category": "tenses_past_simple"},
    {"sentence": "Look! It ___ (rain) outside right now.", "answer": "is raining", "category": "tenses_present_continuous"},
    {"sentence": "We ___ (listen) to music at the moment.", "answer": "are listening", "category": "tenses_present_continuous"},
    {"sentence": "I ___ (sleep) when you called me.", "answer": "was sleeping", "category": "tenses_past_continuous"},
    {"sentence": "They ___ (play) football when the rain started.", "answer": "were playing", "category": "tenses_past_continuous"},
    {"sentence": "We have a meeting ___ Monday morning.", "answer": "on", "category": "prepositions_time"},
    {"sentence": "My birthday is ___ July.", "answer": "in", "category": "prepositions_time"},
    {"sentence": "The keys are ___ the table (surface).", "answer": "on", "category": "prepositions_place"},
    {"sentence": "I will meet you ___ the bus stop.", "answer": "at", "category": "prepositions_place"},
    {"sentence": "I saw ___ elephant at the zoo.", "answer": "an", "category": "articles"},
    {"sentence": "Can you pass me ___ salt, please? (Specific item)", "answer": "the", "category": "articles"},
    {"sentence": "He is ___ honest man.", "answer": "an", "category": "articles"},
    {"sentence": "She wants to buy ___ new car (general).", "answer": "a", "category": "articles"},
    {"sentence": "He runs very ___ (quick).", "answer": "quickly", "category": "adverbs"},
    {"sentence": "Please speak ___ (soft) in the library.", "answer": "softly", "category": "adverbs"},
    {"sentence": "She sings ___ (beautiful).", "answer": "beautifully", "category": "adverbs"},
    {"sentence": "They played ___ (happy) together.", "answer": "happily", "category": "adverbs"},
    {"sentence": "I ___ (read) that book already.", "answer": "have read", "category": "tenses_present_perfect"},
    {"sentence": "She ___ (live) here for ten years.", "answer": "has lived", "category": "tenses_present_perfect"},
    {"sentence": "He walked ___ the room (enter).", "answer": "into", "category": "prepositions_movement"},
    {"sentence": "The cat jumped ___ the wall.", "answer": "over", "category": "prepositions_movement"},
]


# â”€â”€â”€ AI evaluation via Cerebras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def evaluate_speaking(user_text: str, context_text: str, *, mode: str = "topic", metrics: dict | None = None) -> dict:
    """Evaluate a spoken response using Cerebras AI.

    Modes:
        'topic'      â€“ Module C free speaking (relevance/grammar/vocabulary/coherence, each 0-25).
        'repetition' â€“ Module A/B read & repeat (accuracy/pronunciation/fluency, 0-40/0-30/0-30).
    """

    if mode == "topic":
        prompt = (
            f'You are an English language evaluator. Evaluate the following spoken response '
            f'on the topic: "{context_text}"\n\n'
            f'User\'s transcribed response: "{user_text}"\n\n'
            "Evaluate based on:\n"
            "1. Relevance to the topic (0-25 points)\n"
            "2. Grammar and sentence structure (0-25 points)\n"
            "3. Vocabulary richness (0-25 points)\n"
            "4. Coherence and organization (0-25 points)\n\n"
            "Respond with ONLY valid JSON in this exact format:\n"
            '{"relevance_score":<0-25>,"grammar_score":<0-25>,"vocabulary_score":<0-25>,'
            '"coherence_score":<0-25>,"total_score":<0-100>,'
            '"feedback":"<detailed constructive feedback>",'
            '"strengths":["<s1>","<s2>"],"improvements":["<i1>","<i2>"]}'
        )
    elif mode == "repetition":
        metrics_info = ""
        if metrics and "wps" in metrics:
            wps = metrics.get("wps", 0)
            dur = metrics.get("duration", 0)
            metrics_info = (
                f"\nUser Performance Metrics:\n- Speaking Rate: {wps:.2f} words/second\n"
                f"- Duration: {dur:.2f} seconds\n(Normal conversational pace is ~2-5 wps)\n"
            )
        prompt = (
            f'You are an English pronunciation and reading assistant. '
            f'The user was asked to read/repeat: "{context_text}"\n\n'
            f'User\'s transcribed response: "{user_text}"\n{metrics_info}\n'
            "Instructions: Ignore differences in capitalization/punctuation.\n\n"
            "Evaluate based on:\n"
            "1. Accuracy â€“ correct words (0-40)\n"
            "2. Clarity/Pronunciation â€“ transcription closeness (0-30)\n"
            "3. Fluency/Pacing â€“ natural speech rate (0-30)\n\n"
            "Respond with ONLY valid JSON:\n"
            '{"accuracy_score":<0-40>,"pronunciation_score":<0-30>,"fluency_score":<0-30>,'
            '"total_score":<0-100>,"feedback":"<constructive feedback>",'
            '"strengths":["<s1>","<s2>"],"improvements":["<i1>","<i2>"]}'
        )
    else:
        return {"error": "Invalid mode", "total_score": 0}

    try:
        messages = [
            {"role": "system", "content": "You are an English language evaluation AI. Respond ONLY with valid JSON, no markdown."},
            {"role": "user", "content": prompt},
        ]
        result = await cerebras_chat(messages, temperature=0.3, max_tokens=1024)
        content = (
            result.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        evaluation = parse_json(content)
        if evaluation:
            return evaluation
        return {"error": "Failed to parse AI response", "feedback": "Could not generate AI feedback.", "total_score": 0}
    except Exception as e:
        print(f"Communication eval error: {e}")
        return {"error": str(e), "feedback": "AI evaluation unavailable.", "total_score": 0}


# â”€â”€â”€ Module A: Read & Speak â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def run_module_a(transcribed_text: str, duration: float, sentence_id: int, target_sentence: str | None = None) -> dict:
    # Use the actual sentence text passed from the frontend when available,
    # so the AI evaluates against the REAL prompt shown to the student.
    if target_sentence:
        target = target_sentence
    elif sentence_id is None or sentence_id < 0 or sentence_id >= len(SENTENCES_A):
        target = SENTENCES_A[0]
        sentence_id = 0
    else:
        target = SENTENCES_A[sentence_id]

    words = len(transcribed_text.split())
    wps = words / max(duration, 1e-6)

    # Legacy fluency calc (backup)
    if wps < 1:
        fluency_score = wps * 50
    elif 1 <= wps <= 3:
        fluency_score = 80 + ((wps - 1) / 2 * 20)
    else:
        fluency_score = max(0, 100 - (wps - 3) * 20)
    fluency_score = min(100, fluency_score)

    evaluation = await evaluate_speaking(
        transcribed_text, target, mode="repetition",
        metrics={"wps": wps, "duration": duration, "fluency_score": fluency_score},
    )

    return {
        "sentence_id": sentence_id,
        "target_sentence": target,
        "transcribed_text": transcribed_text,
        "pronunciation_score": evaluation.get("total_score", 0),
        "fluency_score": fluency_score,
        "duration_sec": duration,
        "wps": round(wps, 2),
        "feedback": evaluation.get("feedback", "Good effort!"),
        "strengths": evaluation.get("strengths", []),
        "improvements": evaluation.get("improvements", []),
    }


# â”€â”€â”€ Module B: Listen & Repeat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def run_module_b(transcribed_text: str, sentence_id: int, duration: float = 0, target_sentence: str | None = None) -> dict:
    # Use the actual sentence text when provided, so evaluation always
    # compares against the exact sentence the student heard/saw.
    if target_sentence:
        expected = target_sentence
    elif sentence_id < 0 or sentence_id >= len(SENTENCES_B):
        return {"error": "Invalid sentence_id", "success": False}
    else:
        expected = SENTENCES_B[sentence_id]
    user_text = transcribed_text.strip()
    words = len(user_text.split())
    wps = words / max(duration, 1e-6)

    evaluation = await evaluate_speaking(
        user_text, expected, mode="repetition",
        metrics={"wps": wps, "duration": duration},
    )

    return {
        "success": True,
        "score": evaluation.get("total_score", 0),
        "expected": expected,
        "transcription": user_text,
        "feedback": evaluation.get("feedback", "Keep practicing!"),
        "sentence_id": sentence_id,
        "strengths": evaluation.get("strengths", []),
        "improvements": evaluation.get("improvements", []),
    }


# â”€â”€â”€ Module C: Topic Speaking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def run_module_c(transcribed_text: str, topic_id: int | None = None) -> dict:
    topic = "General Topic"
    if topic_id is not None:
        try:
            tid = int(topic_id)
            if 0 <= tid < len(TOPICS):
                topic = TOPICS[tid]
        except (ValueError, TypeError):
            pass

    user_text = transcribed_text.strip()
    evaluation = await evaluate_speaking(user_text, topic, mode="topic")

    return {
        "success": True,
        "topic": topic,
        "transcription": user_text,
        "score": evaluation.get("total_score", 0),
        "relevance_score": evaluation.get("relevance_score", 0),
        "grammar_score": evaluation.get("grammar_score", 0),
        "vocabulary_score": evaluation.get("vocabulary_score", 0),
        "coherence_score": evaluation.get("coherence_score", 0),
        "feedback": evaluation.get("feedback", "No feedback available."),
        "strengths": evaluation.get("strengths", []),
        "improvements": evaluation.get("improvements", []),
    }


# â”€â”€â”€ Module D: Grammar Quiz (no AI â€“ rule based) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_quiz(num_questions: int = 5, excluded_indices: list[int] | None = None) -> dict:
    if excluded_indices is None:
        excluded_indices = []

    available = [i for i in range(len(QUESTIONS_BANK)) if i not in excluded_indices]
    if not available:
        available = list(range(len(QUESTIONS_BANK)))

    selected = random.sample(available, min(num_questions, len(available)))

    questions = []
    for i, idx in enumerate(selected):
        q = QUESTIONS_BANK[idx]
        questions.append({
            "id": idx,
            "sentence": q["sentence"],
            "category": q["category"],
            "number": i + 1,
        })

    return {
        "success": True,
        "questions": questions,
        "total_questions": len(questions),
        "quiz_id": f"quiz_{random.randint(1000, 9999)}",
    }


def submit_quiz_answers(submissions: list[dict]) -> dict:
    score = 0
    results = []

    for i, sub in enumerate(submissions):
        idx = int(sub.get("id", -1))
        user_answer = sub.get("answer", "").strip().lower()

        if 0 <= idx < len(QUESTIONS_BANK):
            q = QUESTIONS_BANK[idx]
            correct = q["answer"].lower()
            is_correct = user_answer == correct
            if is_correct:
                score += 1
            results.append({
                "question_number": i + 1,
                "question_id": idx,
                "sentence": q["sentence"],
                "user_answer": user_answer or "(no answer)",
                "correct_answer": q["answer"],
                "correct": is_correct,
            })
        else:
            results.append({
                "question_number": i + 1,
                "question_id": idx,
                "sentence": "Unknown Question",
                "user_answer": user_answer,
                "correct_answer": "N/A",
                "correct": False,
            })

    total = len(submissions)
    pct = (score / total) * 100 if total > 0 else 0

    return {
        "success": True,
        "score": score,
        "correct_count": score,
        "total": total,
        "percentage": round(pct, 1),
        "review": results,
    }


# â”€â”€â”€ TTS audio generation (edge-tts â€” human-sounding voices) â”€â”€â”€â”€

async def generate_tts_audio(text: str, sentence_id: int | str, output_dir: str) -> str | None:
    """Generate TTS MP3 for a sentence using edge-tts (Microsoft Neural TTS).

    Args:
        text:        The actual sentence text to speak.
        sentence_id: Used only for the output filename.
        output_dir:  Directory to save the generated MP3 file.

    Returns the relative URL path or None on failure.
    """
    import os
    import hashlib
    import edge_tts

    os.makedirs(output_dir, exist_ok=True)

    # Build a stable filename from content hash so each unique sentence gets its own cache file
    text_hash = hashlib.md5(str(text).encode()).hexdigest()[:10]
    filename = f"sentence_{sentence_id}_{text_hash}.mp3"
    filepath = os.path.join(output_dir, filename)

    if os.path.exists(filepath):
        return f"/uploads/tts/{filename}"

    try:
        comm = edge_tts.Communicate(text, "en-GB-SoniaNeural")
        await comm.save(filepath)
        return f"/uploads/tts/{filename}"
    except Exception as e:
        print(f"edge-tts generation error: {e}")
        return None

