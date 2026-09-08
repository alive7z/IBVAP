"""Risk rule definition — loaded from Node DB via the risk-config API."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DurationTier:
    minimum_duration_seconds: float
    score: float
    exclusive: bool = False

    def matches(self, duration_seconds: float) -> bool:
        if self.exclusive:
            return duration_seconds > self.minimum_duration_seconds
        return duration_seconds >= self.minimum_duration_seconds


@dataclass(frozen=True)
class RiskRule:
    rule_code: str
    weight: float = 1.0
    minimum_duration_ms: int = 0
    confidence_threshold: float = 0.0
    cooldown_seconds: int = 0
    enabled: bool = True
    category: str = ""
    duration_tiers: tuple[DurationTier, ...] = ()

    def validate(self) -> bool:
        if self.weight < 0:
            return False
        if self.confidence_threshold < 0 or self.confidence_threshold > 1:
            return False
        if self.minimum_duration_ms < 0:
            return False
        if self.cooldown_seconds < 0:
            return False
        previous = -1.0
        for tier in self.duration_tiers:
            if tier.minimum_duration_seconds < 0 or not 0 <= tier.score <= 100:
                return False
            if tier.minimum_duration_seconds < previous:
                return False
            previous = tier.minimum_duration_seconds
        return True

    def duration_score(self, duration_seconds: float) -> float:
        score = 0.0
        for tier in self.duration_tiers:
            if tier.matches(duration_seconds):
                score = tier.score
        return score

    @staticmethod
    def from_dict(d: dict) -> "RiskRule":
        duration_tiers = tuple(
            DurationTier(
                minimum_duration_seconds=float(
                    tier.get("minimumDurationSeconds", tier.get("minimum_duration_seconds", 0))
                ),
                score=float(tier.get("score", 0)),
                exclusive=bool(tier.get("exclusive", False)),
            )
            for tier in (d.get("durationTiers", d.get("duration_tiers", [])) or [])
        )
        return RiskRule(
            rule_code=d.get("ruleCode", d.get("rule_code", "")),
            weight=float(d.get("weight", 1.0)),
            minimum_duration_ms=int(d.get("minimumDurationMs", d.get("minimum_duration_ms", 0))),
            confidence_threshold=float(d.get("confidenceThreshold", d.get("confidence_threshold", 0.0))),
            cooldown_seconds=int(d.get("cooldownSeconds", d.get("cooldown_seconds", 0))),
            enabled=bool(d.get("enabled", True)),
            category=d.get("category", ""),
            duration_tiers=duration_tiers,
        )


@dataclass(frozen=True)
class SeverityThresholds:
    info: int = 0
    low: int = 20
    medium: int = 40
    high: int = 60
    critical: int = 80

    @staticmethod
    def from_dict(d: dict) -> "SeverityThresholds":
        return SeverityThresholds(
            info=int(d.get("info", 0)),
            low=int(d.get("low", 20)),
            medium=int(d.get("medium", 40)),
            high=int(d.get("high", 60)),
            critical=int(d.get("critical", 80)),
        )
