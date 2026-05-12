"""
angle_tracker.py
----------------
Tracks which room angles have been covered during an environment scan.
Adapted from preScan/backend/services/angle_tracker.py.
"""
from __future__ import annotations
import logging
from logging_config import LogConfig

logger = LogConfig.get_logger(__name__)
from dataclasses import dataclass, field
from typing import Dict, Tuple

ANGLE_QUADRANTS: Dict[str, Tuple] = {
    "front": (315, 360, 0, 45),  # wraps around 0/360
    "right": (45, 135),
    "back": (135, 225),
    "left": (225, 315),
}

MIN_DWELL_FRAMES = 5


@dataclass
class AngleTracker:
    """Tracks which room angles have been covered during a scan."""

    covered: Dict[str, bool] = field(
        default_factory=lambda: {"front": False, "left": False, "right": False, "back": False}
    )
    dwell_counts: Dict[str, int] = field(
        default_factory=lambda: {"front": 0, "left": 0, "right": 0, "back": 0}
    )
    current_angle: str = "front"

    def alpha_to_angle(self, alpha: float) -> str:
        alpha = alpha % 360.0
        # front wraps around 0 / 360
        if alpha >= 315 or alpha < 45:
            return "front"
        for label, bounds in ANGLE_QUADRANTS.items():
            if label == "front":
                continue
            low, high = bounds[0], bounds[1]
            if low <= alpha < high:
                return label
        return "front"

    def update(self, device_orientation: Dict[str, float]) -> str:
        alpha = float(device_orientation.get("alpha", 0.0))
        angle = self.alpha_to_angle(alpha)
        self.current_angle = angle
        self.dwell_counts[angle] = self.dwell_counts.get(angle, 0) + 1
        if self.dwell_counts[angle] >= MIN_DWELL_FRAMES:
            self.covered[angle] = True
        return angle

    def coverage_percent(self) -> float:
        covered_count = sum(1 for v in self.covered.values() if v)
        return (covered_count / len(self.covered)) * 100.0

    def all_covered(self) -> bool:
        return all(self.covered.values())


