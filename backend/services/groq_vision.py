"""
groq_vision.py
--------------
Groq Vision service for environment scan frame analysis.
Adapted from preScan/backend/services/groq_vision.py.
"""
from __future__ import annotations

import asyncio
import json
import logging
from logging_config import LogConfig
logger = LogConfig.get_logger(__name__)
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from config import settings

logger = LogConfig.get_logger(__name__)

UNAUTHORIZED_CLASSES = {"cell phone", "laptop", "tablet", "smartwatch", "remote"}
STUDY_MATERIAL_CLASSES = {"book", "notebook", "paper", "magazine"}
HEADPHONE_CLASSES = {"headphones", "earphones", "earbuds"}

EXAM_ANALYSIS_PROMPT = """You are an AI proctor analyzing a room scan image for an online exam environment check.

Carefully examine this image and respond ONLY with a valid JSON object. No markdown, no explanation.

Detect:
1. Number of people (count faces/bodies)
2. Unauthorized devices: mobile phones, tablets, laptops (not the exam computer), smartwatches
3. Study materials: books, notebooks, papers, printed notes
4. Headphones or earphones

JSON format:
{
  "people_count": <integer>,
  "detections": [
    {"class_name": "<object>", "confidence": <0.0-1.0>, "location": "<brief location>"}
  ],
  "scene_description": "<one sentence>",
  "is_room_scan": <true/false - false if image is too dark/blurry to analyze>
}

Be strict. If you see anything suspicious, include it in detections.
Only count authorized items like the exam monitor/computer/mouse/keyboard as permitted - do not flag them."""


@dataclass
class Detection:
    class_name: str
    confidence: float
    location: str = ""


@dataclass
class FrameVerdict:
    frame_index: int
    is_flagged: bool
    flag_reasons: List[str]
    detections: List[Detection]
    people_count: int

    def model_dump(self):
        return {
            "frame_index": self.frame_index,
            "is_flagged": self.is_flagged,
            "flag_reasons": self.flag_reasons,
            "detections": [{"class_name": d.class_name, "confidence": d.confidence, "location": d.location} for d in self.detections],
            "people_count": self.people_count,
        }


def _clean_json_response(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


class GroqVisionService:
    """Groq Vision service for exam environment analysis."""

    def __init__(self) -> None:
        self._api_key = settings.GROQ_API_KEY
        self._model = settings.GROQ_VISION_MODEL  # Must be a vision-capable model
        self._fallback_model = settings.GROQ_FALLBACK_MODEL
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self._api_key)
            except ImportError:
                raise RuntimeError("groq package not installed. Run: pip install groq")
        return self._client

    def _create_chat_completion(self, client, model: str, image_b64: str):
        return client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                        {"type": "text", "text": EXAM_ANALYSIS_PROMPT},
                    ],
                }
            ],
            max_tokens=512,
            temperature=0.1,
        )

    @staticmethod
    def _is_decommissioned_error(exc: Exception) -> bool:
        return "model_decommissioned" in str(exc).lower() or "decommissioned" in str(exc).lower()

    def _call_groq_sync(self, image_b64: str) -> Dict[str, Any]:
        client = self._get_client()
        model_used = self._model
        try:
            response = self._create_chat_completion(client, model_used, image_b64)
        except Exception as exc:
            should_fallback = (
                self._is_decommissioned_error(exc)
                and bool(self._fallback_model)
                and self._fallback_model != model_used
            )
            if not should_fallback:
                raise
            logger.warning("Groq model '%s' unavailable, falling back to '%s'.", model_used, self._fallback_model)
            model_used = self._fallback_model
            self._model = model_used
            response = self._create_chat_completion(client, model_used, image_b64)

        raw_text = response.choices[0].message.content or "{}"
        return {"raw_text": raw_text, "model": model_used}

    def _parse_groq_response(self, raw_text: str) -> Dict[str, Any]:
        cleaned = _clean_json_response(raw_text)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start != -1 and end > start:
                try:
                    return json.loads(cleaned[start:end])
                except json.JSONDecodeError:
                    pass
        return {}

    def _build_frame_verdict(self, frame_index: int, parsed: Dict[str, Any]) -> FrameVerdict:
        people_count: int = int(parsed.get("people_count", 1))
        raw_detections: List[Dict] = parsed.get("detections", [])

        detections: List[Detection] = []
        for det in raw_detections:
            try:
                detections.append(Detection(
                    class_name=str(det.get("class_name", "unknown")),
                    confidence=float(det.get("confidence", 0.5)),
                    location=str(det.get("location", "")),
                ))
            except Exception:
                continue

        flag_reasons: List[str] = []
        if people_count > 1:
            flag_reasons.append(f"multiple_people:{people_count}")
        for det in detections:
            cn = det.class_name.lower()
            if any(uc in cn for uc in UNAUTHORIZED_CLASSES):
                flag_reasons.append(f"unauthorized_device:{det.class_name}")
            if any(sm in cn for sm in STUDY_MATERIAL_CLASSES):
                flag_reasons.append(f"study_material:{det.class_name}")
            if any(hp in cn for hp in HEADPHONE_CLASSES):
                flag_reasons.append(f"headphones:{det.class_name}")

        flag_reasons = list(dict.fromkeys(flag_reasons))

        return FrameVerdict(
            frame_index=frame_index,
            is_flagged=len(flag_reasons) > 0,
            flag_reasons=flag_reasons,
            detections=detections,
            people_count=people_count,
        )

    async def analyze_frame(self, image_b64: str, frame_index: int) -> FrameVerdict:
        if "," in image_b64 and image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[1]

        try:
            result = await asyncio.to_thread(self._call_groq_sync, image_b64)
            parsed = self._parse_groq_response(result.get("raw_text", "{}"))
            verdict = self._build_frame_verdict(frame_index, parsed)
            logger.debug("Frame %d: people=%d flagged=%s", frame_index, verdict.people_count, verdict.is_flagged)
            return verdict
        except Exception as exc:
            logger.error("Groq vision error on frame %d: %s", frame_index, exc)
            return FrameVerdict(
                frame_index=frame_index,
                is_flagged=False,
                flag_reasons=[],
                detections=[],
                people_count=1,
            )


# Module-level singleton
groq_service = GroqVisionService()

