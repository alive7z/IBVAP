"""Score computation from active risk evidence."""
from __future__ import annotations

from risk.rules import RiskRule


def normalize_score(
    active_weight_sum: float,
    max_possible_weight: float,
) -> float:
    """Normalize the sum of active rule weights to a 0–100 score.

    `max_possible_weight` is the sum of all enabled rule weights.
    """
    if max_possible_weight <= 0:
        return 0.0
    raw = (active_weight_sum / max_possible_weight) * 100.0
    return max(0.0, min(100.0, raw))


def compute_max_possible_weight(rules: list[RiskRule]) -> float:
    """Sum of weights for all enabled rules — the theoretical maximum."""
    return sum(r.weight for r in rules if r.enabled and r.weight > 0)
