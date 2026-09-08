"""Risk Intelligence Engine (Phase 10).

Operates on confirmed track context and evaluates configured risk rules.
Produces SUSPICIOUS_ACTIVITY risk observations — never alerts.

Architecture:
    Detection → Tracking → Context → Risk → (Phase 11: Alert)
"""
from __future__ import annotations

import time
from risk.rules import RiskRule, SeverityThresholds
from risk.scoring import compute_max_possible_weight, normalize_score
from risk.severity import SEVERITY_ORDER, classify
from risk.state import RiskEvalResult, TrackRiskState, RuleEvidence, build_risk_eval_result
from risk.temporal import is_in_cooldown, is_temporally_confirmed, is_within_evidence_window
from config import (
    RISK_CRITICAL_CONFIRM_MS,
    RISK_EVIDENCE_WINDOW_SECONDS,
    RISK_ENABLED,
    RISK_HIGH_CONFIRM_MS,
    RISK_SCORE_EMIT_DELTA,
    RISK_TRACK_TIMEOUT_SECONDS,
)
from utils.logger import get_logger

logger = get_logger("risk_engine")

# Risk-bearing context types → their corresponding rule_code mapping.
# Only these context types contribute to risk score.
CONTEXT_TO_RULE: dict[str, str] = {
    "RESTRICTED_ZONE_ENTRY": "RESTRICTED_ZONE_ENTRY",
    "VIRTUAL_FENCE_CROSSING": "VIRTUAL_FENCE_CROSSING",
    "FENCE_PROXIMITY": "FENCE_PROXIMITY",
    "NIGHT_MOVEMENT": "NIGHT_MOVEMENT",
    "LOITERING": "LOITERING",
}

# These rules represent current conditions. When a confirmed track is present
# and ContextEngine no longer reports one, the condition has genuinely ended.
# Transition evidence such as a fence crossing instead expires by the bounded
# recent-evidence window.
SUSTAINED_RULE_CODES = frozenset({
    "LOITERING",
    "RESTRICTED_ZONE_ENTRY",
    "FENCE_PROXIMITY",
})

# Context types that should NOT contribute risk even if a rule exists.
RISK_EXCLUDED_CONTEXT_TYPES = frozenset({
    "ZONE_ENTER",
    "ZONE_EXIT",
    "ZONE_PRESENCE",
    "TOWARD_CONFIGURED_BOUNDARY",
})


class RiskEngine:
    def __init__(self, enabled: bool = RISK_ENABLED):
        self._enabled = enabled
        self._rules: dict[str, RiskRule] = {}
        self._severity_thresholds = SeverityThresholds()
        self._max_possible_weight: float = 0.0
        self._config_status = "NOT_CONFIGURED"
        self._tracks: dict[int, TrackRiskState] = {}
        self._camera_code: str = ""

        # Metrics.
        self._metrics = {
            "tracksRiskEvaluated": 0,
            "riskEvaluations": 0,
            "infoStates": 0,
            "lowStates": 0,
            "mediumStates": 0,
            "highStates": 0,
            "criticalStates": 0,
            "riskObservationsGenerated": 0,
            "riskObservationsDelivered": 0,
            "duplicateObservationsSuppressed": 0,
        }

    @property
    def enabled(self) -> bool:
        return self._enabled and self._config_status != "CONFIG_UNAVAILABLE"

    @property
    def config_status(self) -> str:
        return self._config_status

    def set_config(
        self,
        rules: list[dict],
        severity_thresholds: dict | None = None,
        camera_code: str = "",
    ) -> None:
        self._rules = {}
        self._camera_code = camera_code
        valid_rules = []
        for rd in rules:
            rule = RiskRule.from_dict(rd)
            if not rule.validate():
                logger.warning("Invalid rule ignored: %s (weight=%.2f)", rule.rule_code, rule.weight)
                continue
            if rule.enabled:
                self._rules[rule.rule_code] = rule
                valid_rules.append(rule)
            else:
                # Store disabled rules so we can re-enable without reload.
                self._rules[rule.rule_code] = rule

        # Normalize only against rules this engine can actually receive from
        # the context pipeline.  Configured-but-unmapped rules otherwise make
        # 100% unreachable and dilute every real live score.
        scorable_rule_codes = frozenset(CONTEXT_TO_RULE.values())
        scorable_rules = [r for r in valid_rules if r.rule_code in scorable_rule_codes]
        self._max_possible_weight = compute_max_possible_weight(scorable_rules)
        unscorable_codes = sorted(
            r.rule_code for r in valid_rules if r.rule_code not in scorable_rule_codes
        )
        if unscorable_codes:
            logger.warning(
                "Enabled rules excluded from score denominator because no context mapping exists: %s",
                unscorable_codes,
            )
        if severity_thresholds:
            self._severity_thresholds = SeverityThresholds.from_dict(severity_thresholds)

        if self._rules:
            self._config_status = "READY"
        else:
            self._config_status = "NO_RULES"

        enabled_count = sum(1 for r in self._rules.values() if r.enabled)
        logger.info(
            "Risk config loaded: %d rules (%d enabled), max_weight=%.2f, thresholds=[%d/%d/%d/%d/%d]",
            len(self._rules), enabled_count, self._max_possible_weight,
            self._severity_thresholds.info, self._severity_thresholds.low,
            self._severity_thresholds.medium, self._severity_thresholds.high,
            self._severity_thresholds.critical,
        )

    def mark_config_unavailable(self) -> None:
        self._config_status = "CONFIG_UNAVAILABLE"

    def rules_loaded(self) -> int:
        return len(self._rules)

    def rules_enabled(self) -> int:
        return sum(1 for r in self._rules.values() if r.enabled)

    def set_camera_code(self, code: str) -> None:
        self._camera_code = code

    # ---- Main evaluation ----
    def evaluate(
        self,
        context_events: list[dict],
        track_states: dict[int, dict],
        now: float | None = None,
        occurred_at: float | None = None,
        source_timestamp_ms: int = 0,
    ) -> list[dict]:
        """Evaluate risk for all tracks based on context evidence.

        `context_events`: list of context event dicts from the context engine.
        `track_states`: {trackId: {objectType, confidence, referencePoint}} — current track metadata.
        `now`: evaluation time for duration/cooldown math (video-relative for
        files, wall-clock epoch seconds for live streams).
        `occurred_at`: real UTC epoch for occurredAt.
        `source_timestamp_ms`: source position for the current frame.

        Returns a list of risk observation dicts to deliver to Node.
        """
        if not self._enabled or self._config_status == "CONFIG_UNAVAILABLE":
            return []

        if now is None:
            now = time.time()
        if occurred_at is None:
            occurred_at = time.time()

        self._metrics["riskEvaluations"] += 1

        # Map context events to per-track active evidence.
        evidence_map: dict[int, dict[str, dict]] = {}
        duration_tier_changed_tracks: set[int] = set()
        for ce in context_events:
            tid = ce.get("trackId", 0)
            ctype = ce.get("type", "")
            if ctype in RISK_EXCLUDED_CONTEXT_TYPES:
                continue
            rule_code = CONTEXT_TO_RULE.get(ctype)
            if rule_code and rule_code in self._rules:
                per_track = evidence_map.setdefault(tid, {})
                existing = per_track.get(rule_code)
                if existing is None:
                    per_track[rule_code] = ce
                elif rule_code == "LOITERING":
                    # Duplicate observations never stack. If duplicates differ,
                    # retain only the greatest reported continuous duration.
                    old_duration = (existing.get("metadata") or {}).get("durationSeconds", 0)
                    new_duration = (ce.get("metadata") or {}).get("durationSeconds", 0)
                    if new_duration > old_duration:
                        per_track[rule_code] = ce

        # Ensure every confirmed track has a state entry, and refresh the
        # per-frame confidence/object type so rule confidence_threshold gates
        # use the CURRENT tracker confidence, not the value seen on the very
        # first frame the track was created (which is often still low).
        for tid, meta in track_states.items():
            state = self._tracks.get(tid)
            if state is None:
                self._tracks[tid] = TrackRiskState(
                    camera_code=self._camera_code,
                    track_id=tid,
                    object_type=meta.get("objectType", "PERSON"),
                    confidence=meta.get("confidence", 0.0),
                )
            else:
                state.object_type = meta.get("objectType", state.object_type)
                state.confidence = meta.get("confidence", state.confidence)
            self._tracks[tid].last_rule_failures = {}

        # Update active evidence timestamps.
        for tid, rule_events in evidence_map.items():
            state = self._tracks.get(tid)
            if not state:
                continue
            # Pending temporal evidence is still an evaluation of this track.
            # Without refreshing this timestamp, live epoch-based `now` values
            # make _cleanup() treat a newly-created state (timestamp 0) as more
            # than RISK_TRACK_TIMEOUT_SECONDS old on its very first frame.  The
            # state is then recreated every frame and minimum-duration rules can
            # never accumulate enough time to confirm.
            state.last_evaluation_at = now
            for code, context_event in rule_events.items():
                rule = self._rules.get(code)
                if not rule or not rule.enabled:
                    continue
                # Check confidence threshold.
                if state.confidence < rule.confidence_threshold:
                    state.last_rule_failures[code] = (
                        f"confidence_below_threshold:{state.confidence:.3f}"
                        f"<{rule.confidence_threshold:.3f}"
                    )
                    continue
                ev = state.active_evidence.get(code)
                if ev is None:
                    ev = RuleEvidence(rule_code=code, weight=rule.weight)
                    state.active_evidence[code] = ev
                ev.last_observed_at = now
                if code == "LOITERING" and rule.duration_tiers:
                    try:
                        duration_seconds = max(
                            0.0,
                            float((context_event.get("metadata") or {}).get("durationSeconds", 0)),
                        )
                    except (TypeError, ValueError):
                        duration_seconds = 0.0
                    duration_score = rule.duration_score(duration_seconds)
                    previous_duration_score = ev.score_override
                    ev.duration_seconds = duration_seconds
                    ev.score_override = duration_score
                    ev.active = duration_score > 0
                    ev.score_contribution = rule.weight if ev.active else 0.0
                    if ev.active and ev.confirmed_at is None:
                        ev.confirmed_at = now
                    if duration_score != previous_duration_score:
                        duration_tier_changed_tracks.add(tid)
                        logger.info(
                            "Track %d: LOITERING duration %.1fs crossed tier %.0f -> %.0f",
                            tid,
                            duration_seconds,
                            previous_duration_score,
                            duration_score,
                        )
                    continue
                if ev.first_observed_at == 0.0:
                    ev.first_observed_at = now
                # Temporal confirmation.
                if not ev.active and is_temporally_confirmed(
                    ev.first_observed_at, now, rule.minimum_duration_ms
                ):
                    ev.active = True
                    ev.confirmed_at = now
                    ev.score_contribution = rule.weight
                    logger.debug("Track %d: rule %s confirmed (dur=%dms)", tid, code, rule.minimum_duration_ms)

        # Sustained evidence represents current condition state and must end
        # when ContextEngine no longer reports it for a currently visible
        # track. A missing track is only a temporary observation gap; retain
        # state until the normal bounded evidence/track timeouts.
        for tid, state in self._tracks.items():
            if tid not in track_states:
                continue
            current_rules = evidence_map.get(tid, {})
            for rule_code in SUSTAINED_RULE_CODES:
                ev = state.active_evidence.get(rule_code)
                if not ev or rule_code in current_rules:
                    continue
                ev.active = False
                ev.score_contribution = 0.0
                ev.first_observed_at = 0.0
                ev.confirmed_at = None
                if rule_code == "LOITERING":
                    ev.score_override = 0.0
                    ev.duration_seconds = 0.0

        # Expire evidence outside window, deactivate.
        for state in self._tracks.values():
            for code, ev in list(state.active_evidence.items()):
                if not is_within_evidence_window(ev.last_observed_at, now, RISK_EVIDENCE_WINDOW_SECONDS):
                    ev.active = False
                    ev.score_contribution = 0.0
                    ev.first_observed_at = 0.0
                    ev.confirmed_at = None

        # Evaluate and emit.
        risk_observations: list[dict] = []
        for tid, state in list(self._tracks.items()):
            # Skip tracks with no active evidence.
            duration_score = sum(
                ev.score_override
                for ev in state.active_evidence.values()
                if ev.active and ev.score_override > 0
            )
            active_weight = sum(
                ev.score_contribution
                for ev in state.active_evidence.values()
                if ev.active and ev.score_override <= 0
            )
            if active_weight <= 0 and duration_score <= 0:
                state.current_score = 0.0
                state.current_severity = "INFO"
                # End the risk episode. A later genuine loiter episode on the
                # same still-tracked person must be able to emit its first tier
                # again; process-lifetime score memory is not deduplication.
                state.last_emitted_score = 0.0
                state.last_emitted_severity = "INFO"
                state.last_emitted_at = 0.0
                state.first_risk_at = None
                continue

            # Preserve bounded state across a short detector miss, but never
            # create/escalate a risk event while that track is not currently
            # confirmed in this frame.
            if tid not in track_states:
                continue

            score = min(
                100.0,
                normalize_score(active_weight, self._max_possible_weight) + duration_score,
            )
            severity = classify(score, self._severity_thresholds)
            reasons = state.total_reasons()
            evidence = state.total_evidence()

            # CRITICAL guardrail: require ≥2 independent confirmed evidence signals.
            independent_count = len(state.active_rule_codes())
            duration_reached_critical = duration_score >= self._severity_thresholds.critical
            if severity == "CRITICAL" and independent_count < 2 and not duration_reached_critical:
                severity = "HIGH"
                # Reclassify — score stays the same but severity is capped.

            # Temporal confirmation for HIGH/CRITICAL.
            duration_confirmed_severity = duration_score >= self._severity_thresholds.high
            if severity in ("HIGH", "CRITICAL") and not duration_confirmed_severity:
                confirm_ms = RISK_HIGH_CONFIRM_MS if severity == "HIGH" else RISK_CRITICAL_CONFIRM_MS
                if state.first_risk_at is None:
                    state.first_risk_at = now
                elapsed_ms = (now - state.first_risk_at) * 1000
                if elapsed_ms < confirm_ms:
                    # Not yet confirmed — downgrade to MEDIUM temporarily.
                    if severity == "CRITICAL":
                        severity = "HIGH" if independent_count >= 2 else "MEDIUM"
                    else:
                        severity = "MEDIUM"

            state.current_score = score
            state.current_severity = severity
            state.reasons = reasons
            state.last_evaluation_at = now

            # Metrics.
            self._metrics["tracksRiskEvaluated"] += 1
            if severity == "INFO":
                self._metrics["infoStates"] += 1
            elif severity == "LOW":
                self._metrics["lowStates"] += 1
            elif severity == "MEDIUM":
                self._metrics["mediumStates"] += 1
            elif severity == "HIGH":
                self._metrics["highStates"] += 1
            elif severity == "CRITICAL":
                self._metrics["criticalStates"] += 1

            # Decide whether to emit.
            should_emit = False
            is_first_risk = False
            severity_changed = False

            if score > 0:
                if state.last_emitted_at == 0.0:
                    # First non-zero risk.
                    should_emit = True
                    is_first_risk = True
                elif severity != state.last_emitted_severity:
                    severity_changed = True
                    should_emit = True
                elif abs(score - state.last_emitted_score) >= RISK_SCORE_EMIT_DELTA:
                    should_emit = True

            if should_emit:
                cooldown = self._get_cooldown_for_severity(severity)
                # An escalation to a MORE severe level must never be swallowed by
                # the cooldown — otherwise HIGH/CRITICAL (which carry cooldowns
                # of up to 45s, longer than the 30s evidence window) could never
                # fire after an initial LOW/MEDIUM observation, which would
                # starve the entire alerting chain.
                is_escalation = severity_changed and (
                    self._severity_rank(severity) < self._severity_rank(state.last_emitted_severity)
                )
                # A duration-tier crossing is a new, meaningful state, not a
                # duplicate. It must reach Node even when an independent rule
                # made the track HIGH before the loiter tier changed.
                duration_tier_changed = tid in duration_tier_changed_tracks
                if (
                    not is_in_cooldown(state.last_emitted_at, now, cooldown)
                    or is_escalation
                    or duration_tier_changed
                ):
                    state.last_emitted_score = score
                    state.last_emitted_severity = severity
                    state.last_emitted_at = now
                    self._metrics["riskObservationsGenerated"] += 1
                    risk_observations.append({
                        "trackId": tid,
                        "objectType": state.object_type,
                        "score": round(score, 2),
                        "severity": severity,
                        "reasons": reasons,
                        "evidence": evidence,
                        "occurredAt": occurred_at,
                        "sourceTimestampMs": source_timestamp_ms,
                    })
                else:
                    self._metrics["duplicateObservationsSuppressed"] += 1

        self._cleanup(now)
        return risk_observations

    def _get_cooldown_for_severity(self, severity: str) -> int:
        """Use the max cooldown across active rules as a track-level cooldown."""
        if not self._rules:
            return 0
        if severity in ("HIGH", "CRITICAL"):
            return max(r.cooldown_seconds for r in self._rules.values() if r.enabled)
        return 0

    def _severity_rank(self, severity: str) -> int:
        """Lower index = more severe (SEVERITY_ORDER is highest-first)."""
        try:
            return SEVERITY_ORDER.index(severity)
        except ValueError:
            return -1

    def _cleanup(self, now: float) -> None:
        stale = [tid for tid, s in self._tracks.items()
                 if now - s.last_evaluation_at > RISK_TRACK_TIMEOUT_SECONDS]
        for tid in stale:
            del self._tracks[tid]

    def snapshot_metrics(self) -> dict:
        return {**self._metrics, "rulesLoaded": self.rules_loaded(), "rulesEnabled": self.rules_enabled()}

    def get_track_state(self, track_id: int) -> TrackRiskState | None:
        return self._tracks.get(track_id)

    def trace_state(self, track_id: int, now: float | None = None) -> dict:
        """Structured diagnostics for one track; no scoring side effects."""
        state = self._tracks.get(track_id)
        if not state:
            return {
                "currentRiskScore": 0.0,
                "previousRiskScore": 0.0,
                "severity": "INFO",
                "matchedRules": [],
                "failedRules": [
                    {"code": code, "reason": "no_track_risk_state"}
                    for code, rule in self._rules.items() if rule.enabled
                ],
                "evidence": [],
            }
        if now is None:
            now = time.time()

        matched = []
        failed = []
        evidence = []
        for code, rule in self._rules.items():
            if not rule.enabled:
                failed.append({"code": code, "reason": "disabled"})
                continue
            ev = state.active_evidence.get(code)
            if ev and ev.active:
                contribution = (
                    ev.score_override
                    if ev.score_override > 0
                    else normalize_score(ev.score_contribution, self._max_possible_weight)
                )
                matched.append({
                    "code": code,
                    "contribution": round(contribution, 2),
                    "durationSeconds": round(ev.duration_seconds, 2),
                })
            else:
                reason = state.last_rule_failures.get(code)
                if not reason and ev and ev.first_observed_at:
                    elapsed_ms = max(0.0, (now - ev.first_observed_at) * 1000)
                    reason = (
                        f"minimum_duration_pending:{elapsed_ms:.0f}"
                        f"<{rule.minimum_duration_ms}ms"
                    )
                failed.append({"code": code, "reason": reason or "no_active_evidence"})
            if ev:
                evidence.append({
                    "code": code,
                    "active": ev.active,
                    "confidence": round(state.confidence, 4),
                    "durationSeconds": round(ev.duration_seconds, 2),
                    "ageSeconds": round(max(0.0, now - ev.last_observed_at), 2),
                })

        loiter = state.active_evidence.get("LOITERING")
        return {
            "currentRiskScore": round(state.current_score, 2),
            "previousRiskScore": round(max(state.last_emitted_score, 0.0), 2),
            "severity": state.current_severity,
            "loiterDurationTier": round(loiter.score_override, 2) if loiter else 0.0,
            "matchedRules": matched,
            "failedRules": failed,
            "evidence": evidence,
        }

    def reset(self) -> None:
        self._tracks.clear()
