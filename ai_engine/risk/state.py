"""Per-track risk evaluation state."""
from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class RuleEvidence:
    """Tracks the temporal state of one risk rule for one track."""
    rule_code: str
    first_observed_at: float = 0.0
    last_observed_at: float = 0.0
    confirmed_at: float | None = None
    active: bool = False
    score_contribution: float = 0.0
    last_emitted_at: float = 0.0
    weight: float = 0.0
    duration_seconds: float = 0.0
    score_override: float = 0.0


@dataclass
class TrackRiskState:
    """Full risk state for a single tracked object."""
    camera_code: str
    track_id: int
    object_type: str = "PERSON"
    confidence: float = 0.0
    current_score: float = 0.0
    current_severity: str = "INFO"
    active_evidence: dict[str, RuleEvidence] = field(default_factory=dict)
    reasons: list[dict] = field(default_factory=list)
    last_evaluation_at: float = 0.0
    last_emitted_score: float = -1.0
    last_emitted_severity: str = ""
    last_emitted_at: float = 0.0
    first_risk_at: float | None = None
    last_rule_failures: dict[str, str] = field(default_factory=dict)

    def active_rule_codes(self) -> set[str]:
        return {code for code, ev in self.active_evidence.items() if ev.active}

    def active_weight_sum(self) -> float:
        return sum(ev.score_contribution for ev in self.active_evidence.values() if ev.active)

    def total_reasons(self) -> list[dict]:
        reasons = []
        for ev in self.active_evidence.values():
            if not ev.active:
                continue
            reason = {"code": ev.rule_code, "weight": ev.weight}
            if ev.score_override > 0:
                reason["durationSeconds"] = round(ev.duration_seconds, 2)
                reason["scoreContribution"] = round(ev.score_override, 2)
            reasons.append(reason)
        return reasons

    def total_evidence(self) -> list[dict]:
        evidence = []
        for ev in self.active_evidence.values():
            if not ev.active:
                continue
            item = {"type": ev.rule_code}
            if ev.score_override > 0:
                item["durationSeconds"] = round(ev.duration_seconds, 2)
                item["scoreContribution"] = round(ev.score_override, 2)
            evidence.append(item)
        return evidence


@dataclass
class RiskEvalResult:
    """Result of a single risk evaluation for one track."""
    track_id: int
    score: float
    severity: str
    reasons: list[dict]
    evidence: list[dict]
    should_emit: bool
    is_first_risk: bool
    severity_changed: bool


def build_risk_eval_result(
    state: TrackRiskState,
    score: float,
    severity: str,
    should_emit: bool,
    is_first_risk: bool,
    severity_changed: bool,
) -> RiskEvalResult:
    return RiskEvalResult(
        track_id=state.track_id,
        score=score,
        severity=severity,
        reasons=state.total_reasons(),
        evidence=state.total_evidence(),
        should_emit=should_emit,
        is_first_risk=is_first_risk,
        severity_changed=severity_changed,
    )
