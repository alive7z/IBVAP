"""Unit tests for the Phase 10 Risk Intelligence Engine."""

import pytest

from risk.engine import RiskEngine, CONTEXT_TO_RULE, RISK_EXCLUDED_CONTEXT_TYPES
from risk.severity import classify
from risk.scoring import compute_max_possible_weight, normalize_score
from risk.temporal import is_in_cooldown, is_temporally_confirmed, is_within_evidence_window
from risk.rules import RiskRule, SeverityThresholds

# Dev-default risk rules mirroring the seeded DB (6 enabled rows).
RULES = [
    {"ruleCode": "RESTRICTED_ZONE_ENTRY", "weight": 3.0, "minimumDurationMs": 1000, "confidenceThreshold": 0.60, "cooldownSeconds": 30, "enabled": True},
    {"ruleCode": "VIRTUAL_FENCE_CROSSING", "weight": 3.0, "minimumDurationMs": 500, "confidenceThreshold": 0.65, "cooldownSeconds": 30, "enabled": True},
    {"ruleCode": "FENCE_PROXIMITY", "weight": 1.5, "minimumDurationMs": 2000, "confidenceThreshold": 0.50, "cooldownSeconds": 20, "enabled": True},
    {"ruleCode": "NIGHT_MOVEMENT", "weight": 2.0, "minimumDurationMs": 3000, "confidenceThreshold": 0.55, "cooldownSeconds": 45, "enabled": True},
    {"ruleCode": "TOWARD_BOUNDARY", "weight": 2.5, "minimumDurationMs": 3000, "confidenceThreshold": 0.60, "cooldownSeconds": 30, "enabled": True},
    {"ruleCode": "UNUSUAL_SPEED", "weight": 1.5, "minimumDurationMs": 0, "confidenceThreshold": 0.55, "cooldownSeconds": 30, "enabled": True},
]

THRESHOLDS = SeverityThresholds(info=0, low=20, medium=40, high=60, critical=80)


def _engine(**kwargs):
    base = {"enabled": True}
    base.update(kwargs)
    eng = RiskEngine(**base)
    eng.set_config(RULES, THRESHOLDS.__dict__ if hasattr(THRESHOLDS, "__dict__") else None, "CAM-01")
    return eng


def _ctx(track_id, ctype, confidence=0.9, metadata=None):
    event = {"trackId": track_id, "type": ctype}
    if metadata is not None:
        event["metadata"] = metadata
    return event


def _state(track_id, confidence=0.9):
    return {track_id: {"objectType": "PERSON", "confidence": confidence}}


class TestConfig:
    def test_config_status_ready(self):
        eng = RiskEngine()
        eng.set_config(RULES, None, "CAM-01")
        assert eng.config_status == "READY"
        assert eng.rules_loaded() == len(RULES)
        assert eng.rules_enabled() == len(RULES)

    def test_disabled_returns_nothing(self):
        eng = RiskEngine(enabled=False)
        eng.set_config(RULES, None, "CAM-01")
        assert eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1)) == []

    def test_config_unavailable_returns_nothing(self):
        eng = RiskEngine()
        eng.mark_config_unavailable()
        assert eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1)) == []

    def test_no_rules_status(self):
        eng = RiskEngine()
        eng.set_config([], None, "CAM-01")
        assert eng.config_status == "NO_RULES"

    def test_unmapped_enabled_rules_do_not_dilute_score_denominator(self):
        eng = _engine()
        # TOWARD_BOUNDARY (2.5) and UNUSUAL_SPEED (1.5) have no context-to-rule
        # mapping, so only the 9.5 points that can reach evaluate() are scorable.
        assert eng._max_possible_weight == pytest.approx(9.5)


class TestScoring:
    def test_normalize_clamps_upper(self):
        assert normalize_score(200.0, 100.0) == 100.0

    def test_normalize_clamps_lower(self):
        assert normalize_score(-5.0, 100.0) == 0.0

    def test_normalize_zero_max(self):
        assert normalize_score(10.0, 0.0) == 0.0

    def test_max_possible_weight(self):
        rules = [RiskRule.from_dict(r) for r in RULES]
        assert compute_max_possible_weight(rules) == pytest.approx(13.5)

    def test_full_score(self):
        # Full weight (13.5) / max (13.5) * 100 == 100.
        assert normalize_score(13.5, 13.5) == 100.0


class TestSeverity:
    def test_info_low_range(self):
        assert classify(0, THRESHOLDS) == "INFO"
        assert classify(10, THRESHOLDS) == "INFO"
        assert classify(19, THRESHOLDS) == "INFO"

    def test_low_range(self):
        assert classify(20, THRESHOLDS) == "LOW"
        assert classify(39, THRESHOLDS) == "LOW"

    def test_medium_range(self):
        assert classify(40, THRESHOLDS) == "MEDIUM"
        assert classify(59, THRESHOLDS) == "MEDIUM"

    def test_high_range(self):
        assert classify(60, THRESHOLDS) == "HIGH"
        assert classify(79, THRESHOLDS) == "HIGH"

    def test_critical_range(self):
        assert classify(80, THRESHOLDS) == "CRITICAL"
        assert classify(100, THRESHOLDS) == "CRITICAL"


class TestTemporal:
    def test_zero_duration_always_confirmed(self):
        assert is_temporally_confirmed(0, now=10, minimum_duration_ms=0)

    def test_duration_confirmed_after_elapse(self):
        assert is_temporally_confirmed(0.0, now=2.0, minimum_duration_ms=1000)

    def test_duration_not_confirmed_before_elapse(self):
        assert not is_temporally_confirmed(0.0, now=0.5, minimum_duration_ms=1000)

    def test_cooldown_blocks(self):
        assert is_in_cooldown(last_emitted_at=10.0, now=10, cooldown_seconds=30)
        assert not is_in_cooldown(last_emitted_at=10.0, now=41, cooldown_seconds=30)

    def test_never_emitted_not_in_cooldown(self):
        # last_emitted_at == 0.0 is the "never emitted" sentinel. A first
        # emission must never be blocked, otherwise HIGH/CRITICAL (which carry
        # cooldowns) can never fire within the 30s evidence window.
        assert not is_in_cooldown(last_emitted_at=0.0, now=2, cooldown_seconds=45)
        assert not is_in_cooldown(last_emitted_at=0.0, now=30, cooldown_seconds=45)

    def test_zero_cooldown_never_blocks(self):
        assert not is_in_cooldown(last_emitted_at=0.0, now=0, cooldown_seconds=0)

    def test_evidence_window(self):
        assert is_within_evidence_window(last_observed_at=0.0, now=20, window_seconds=30)
        assert not is_within_evidence_window(last_observed_at=0.0, now=31, window_seconds=30)


class TestDetectionAloneIsZeroRisk:
    def test_no_context_no_risk(self):
        eng = _engine()
        obs = eng.evaluate([], _state(1), now=1)
        assert obs == []
        state = eng.get_track_state(1)
        assert state.current_score == 0.0
        assert state.current_severity == "INFO"


class TestRiskScoringGrades:
    def test_single_risk_rule_yields_nonzero_score(self):
        eng = _engine()
        # RESTRICTED_ZONE_ENTRY weight=3.0, duration=1000ms.
        eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=1.0)
        obs = eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=3.0)
        assert len(obs) == 1
        assert obs[0]["score"] == pytest.approx(3.0 / 9.5 * 100, abs=0.1)
        assert obs[0]["severity"] == "LOW"
        assert obs[0]["trackId"] == 1

    def test_multiple_rules_accumulate(self):
        eng = _engine()
        ctype = ["RESTRICTED_ZONE_ENTRY", "VIRTUAL_FENCE_CROSSING"]
        # Both weight 3.0 => 6.0/9.5*100 = 63.2; first HIGH candidate is
        # temporarily MEDIUM during the HIGH confirmation window.
        eng.evaluate([_ctx(1, c) for c in ctype], _state(1), now=1.0)
        obs = eng.evaluate([_ctx(1, c) for c in ctype], _state(1), now=2.0)
        assert len(obs) == 1
        assert obs[0]["score"] == pytest.approx(6.0 / 9.5 * 100, abs=0.1)
        assert obs[0]["severity"] == "MEDIUM"


class TestTemporalConfirmation:
    def test_rule_needs_duration(self):
        eng = _engine()
        # RESTRICTED requires 1000ms; at now=0.2 not yet confirmed.
        obs = eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=0.2)
        assert obs == []
        # After 1.0s, confirmed.
        obs = eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=1.2)
        assert len(obs) == 1

    def test_pending_evidence_survives_live_epoch_cleanup(self):
        """Live wall-clock timestamps must not erase pending evidence each frame."""
        eng = _engine()
        live_now = 1_789_000_000.0

        # FENCE_PROXIMITY needs 2 seconds.  Its pending state must survive the
        # first evaluation even though epoch time is far beyond the 60s timeout.
        assert eng.evaluate(
            [_ctx(17, "FENCE_PROXIMITY")], _state(17), now=live_now
        ) == []
        state = eng.get_track_state(17)
        assert state is not None
        assert state.active_evidence["FENCE_PROXIMITY"].first_observed_at == live_now

        obs = eng.evaluate(
            [_ctx(17, "FENCE_PROXIMITY")], _state(17), now=live_now + 2.1
        )
        assert len(obs) == 1
        assert obs[0]["trackId"] == 17
        assert obs[0]["score"] == pytest.approx(1.5 / 9.5 * 100, abs=0.1)
        assert obs[0]["severity"] == "INFO"
        assert obs[0]["reasons"] == [{"code": "FENCE_PROXIMITY", "weight": 1.5}]


class TestLoiteringDurationEscalation:
    TIERS = [
        {"minimumDurationSeconds": 10, "score": 15},
        {"minimumDurationSeconds": 20, "score": 25},
        {"minimumDurationSeconds": 30, "score": 40},
        {"minimumDurationSeconds": 45, "score": 50},
        {"minimumDurationSeconds": 60, "score": 65},
        {"minimumDurationSeconds": 120, "score": 80, "exclusive": True},
    ]

    @classmethod
    def _engine(cls):
        rules = RULES + [{
            "ruleCode": "LOITERING",
            "weight": 2.0,
            # Tier duration supersedes this legacy temporal gate.
            "minimumDurationMs": 15000,
            "confidenceThreshold": 0.60,
            "cooldownSeconds": 60,
            "enabled": True,
            "durationTiers": cls.TIERS,
        }]
        eng = RiskEngine()
        eng.set_config(rules, THRESHOLDS.__dict__, "CAM-01")
        return eng

    @staticmethod
    def _loiter(duration):
        return _ctx(130, "LOITERING", metadata={"durationSeconds": duration})

    def test_exact_default_progression_and_meaningful_emissions(self):
        eng = self._engine()
        expected = [(9.99, 0), (10, 15), (20, 25), (30, 40), (45, 50), (60, 65), (120, 65), (120.01, 80)]
        emitted_scores = []
        for now, (duration, score) in enumerate(expected, start=1):
            obs = eng.evaluate([self._loiter(duration)], _state(130), now=float(now))
            assert eng.get_track_state(130).current_score == pytest.approx(score)
            emitted_scores.extend(item["score"] for item in obs)
        assert emitted_scores == [15, 25, 40, 50, 65, 80]
        assert eng.get_track_state(130).current_severity == "CRITICAL"

    def test_twenty_duplicate_observations_cannot_stack_score(self):
        eng = self._engine()
        duplicate = self._loiter(20)
        obs = eng.evaluate([duplicate] * 20, _state(130), now=20.0)
        assert len(obs) == 1
        assert obs[0]["score"] == 25
        assert obs[0]["reasons"][0]["scoreContribution"] == 25
        for now in range(21, 41):
            assert eng.evaluate([duplicate] * 20, _state(130), now=float(now)) == []
        assert eng.get_track_state(130).current_score == 25

    def test_person_detected_callbacks_never_affect_risk_score(self):
        eng = self._engine()
        callbacks = [_ctx(130, "PERSON_DETECTED") for _ in range(20)]
        assert eng.evaluate(callbacks, _state(130), now=10.0) == []
        assert eng.get_track_state(130).current_score == 0

    def test_repeated_entry_is_unsupported_and_cannot_affect_risk(self):
        eng = self._engine()
        repeated = [_ctx(130, "REPEATED_ENTRY") for _ in range(20)]
        assert eng.evaluate(repeated, _state(130), now=10.0) == []
        assert eng.get_track_state(130).current_score == 0

    def test_loitering_end_resets_tier_without_erasing_other_evidence(self):
        eng = self._engine()
        first = eng.evaluate([self._loiter(30)], _state(130), now=1.0)
        assert first[0]["score"] == 40
        assert eng.get_track_state(130).current_score == 40
        eng.evaluate([], _state(130), now=2.0)
        assert eng.get_track_state(130).current_score == 0
        restarted = eng.evaluate([self._loiter(10)], _state(130), now=3.0)
        assert restarted[0]["score"] == 15

    def test_short_track_gap_does_not_reset_loiter_tier_or_duplicate_event(self):
        eng = self._engine()
        first = eng.evaluate([self._loiter(45)], _state(130), now=45.0)
        assert first[0]["score"] == 50

        # An empty current-track map is an observation gap, not an explicit
        # end of the loiter condition. The bounded evidence window still
        # expires genuinely lost tracks.
        assert eng.evaluate([], {}, now=46.0) == []
        assert eng.get_track_state(130).current_score == 50

        # Same ByteTrack ID recovers with the continuous ContextEngine
        # duration; no duplicate 50-point event is emitted.
        assert eng.evaluate([self._loiter(46)], _state(130), now=46.1) == []
        assert eng.get_track_state(130).current_score == 50

    def test_genuinely_expired_track_loses_loiter_risk_state(self):
        eng = self._engine()
        assert eng.evaluate([self._loiter(45)], _state(130), now=45.0)[0]["score"] == 50

        # Evidence first expires at the bounded evidence window, then the empty
        # track state itself is removed at the configured track timeout.
        eng.evaluate([], {}, now=76.0)
        assert eng.get_track_state(130).current_score == 0
        eng.evaluate([], {}, now=106.0)
        assert eng.get_track_state(130) is None

    def test_new_stream_session_reset_cannot_inherit_reused_track_id_risk(self):
        eng = self._engine()
        assert eng.evaluate([self._loiter(30)], _state(130), now=30.0)[0]["score"] == 40

        eng.reset()

        assert eng.get_track_state(130) is None
        assert eng.evaluate([], _state(130), now=31.0) == []
        assert eng.get_track_state(130).current_score == 0

    def test_independent_rule_combines_with_loitering(self):
        eng = self._engine()
        events = [
            self._loiter(30),
            _ctx(130, "RESTRICTED_ZONE_ENTRY"),
        ]
        obs = eng.evaluate(events, _state(130), now=1.0)
        # Restricted needs 1s, while LOITERING immediately contributes 40.
        assert obs[0]["score"] == 40
        obs = eng.evaluate(events, _state(130), now=2.1)
        expected = 40 + (3.0 / 11.5 * 100)
        assert obs[0]["score"] == pytest.approx(expected, abs=0.1)
        assert {r["code"] for r in obs[0]["reasons"]} == {
            "LOITERING", "RESTRICTED_ZONE_ENTRY"
        }

    def test_loiter_tier_change_bypasses_high_cooldown_when_already_high(self):
        eng = RiskEngine(enabled=True)
        eng.set_config(
            [
                {
                    "ruleCode": "LOITERING",
                    "weight": 9,
                    "minimumDurationMs": 15000,
                    "confidenceThreshold": 0,
                    "cooldownSeconds": 60,
                    "enabled": True,
                    "durationTiers": self.TIERS,
                },
                {
                    "ruleCode": "RESTRICTED_ZONE_ENTRY",
                    "weight": 1,
                    "minimumDurationMs": 0,
                    "confidenceThreshold": 0,
                    "cooldownSeconds": 60,
                    "enabled": True,
                },
            ],
            {
                "info": 0, "low": 20, "medium": 40,
                "high": 60, "critical": 80,
            },
            "CAM-01",
        )

        restricted = _ctx(130, "RESTRICTED_ZONE_ENTRY")
        first = eng.evaluate([self._loiter(45), restricted], _state(130), now=45.0)
        assert first[0]["score"] == 60
        assert first[0]["severity"] == "MEDIUM"
        confirmed = eng.evaluate([self._loiter(45), restricted], _state(130), now=49.0)
        assert confirmed[0]["score"] == 60
        assert confirmed[0]["severity"] == "HIGH"

        # This remains HIGH and is inside its 60-second cooldown. The 50 -> 65
        # loiter tier is still a meaningful risk update and must be emitted.
        second = eng.evaluate([self._loiter(60), restricted], _state(130), now=60.0)
        assert second[0]["score"] == 75
        assert second[0]["severity"] == "HIGH"


class TestConfidenceThreshold:
    def test_low_confidence_does_not_trigger(self):
        eng = _engine()
        # RESTRICTED_ZONE_ENTRY confidence_threshold=0.60, so 0.5 should not fire.
        obs = eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1, confidence=0.5), now=1.5)
        assert obs == []

    def test_confidence_refreshed_from_tracker_each_frame(self):
        # Regression: the live pipeline creates tracks at low confidence
        # (first lock ~0.45) and confidence rises as the person is re-detected
        # (0.80). Rule gates must use the CURRENT per-frame confidence and not
        # get stuck on the creation-time value, or live risk never fires.
        loiter_rule = [
            {"ruleCode": "LOITERING", "weight": 2.0, "minimumDurationMs": 15000,
             "confidenceThreshold": 0.60, "cooldownSeconds": 60, "enabled": True},
        ]
        eng = RiskEngine()
        eng.set_config(loiter_rule, THRESHOLDS.__dict__ if hasattr(THRESHOLDS, "__dict__") else None, "CAM-01")
        # Frame 1: LOITERING is fed while confidence is still below the 0.60
        # threshold -> no evidence yet.
        assert eng.evaluate(
            [_ctx(1, "LOITERING")], _state(1, confidence=0.45), now=1.0
        ) == []
        # Frame 2: same track, tracker now reports 0.80 -> the LOITERING rule
        # must start accumulating evidence with first_observed_at = THIS frame.
        assert eng.evaluate(
            [_ctx(1, "LOITERING")], _state(1, confidence=0.80), now=2.0
        ) == []
        state = eng.get_track_state(1)
        assert state is not None
        assert state.confidence == 0.80
        assert "LOITERING" in state.active_evidence
        # After the 15s minimum elapses with continued re-feed, score appears.
        obs = eng.evaluate(
            [_ctx(1, "LOITERING")], _state(1, confidence=0.80), now=17.0
        )
        assert len(obs) == 1
        assert obs[0]["score"] > 0


class TestCooldown:
    def test_cooldown_blocks_same_severity_but_not_escalation(self):
        # Use a single max-weight RESTRICTED_ZONE_ENTRY rule (reaching HIGH,
        # which carries cooldown) so we can observe both behaviors.
        single_rule = [{
            "ruleCode": "RESTRICTED_ZONE_ENTRY", "weight": 13.5, "minimumDurationMs": 0,
            "confidenceThreshold": 0.0, "cooldownSeconds": 30, "enabled": True,
        }]
        eng2 = RiskEngine()
        eng2.set_config(single_rule, THRESHOLDS.__dict__ if hasattr(THRESHOLDS, "__dict__") else None, "CAM-01")
        # now=5 emits the first (MEDIUM, inside the 1s HIGH confirm window).
        eng2.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=5.0)
        # now=6: confirm window elapsed → MEDIUM→HIGH escalation. The
        # escalation must NOT be suppressed by the 30s cooldown, or alerts
        # would never fire for escalating incidents.
        obs = eng2.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=6.0)
        assert len(obs) == 1
        assert obs[0]["severity"] == "HIGH"
        # now=7: unchanged (same HIGH) → nothing re-emitted.
        assert eng2.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=7.0) == []


class TestCriticalGuardrail:
    def test_critical_requires_two_independent_signals(self):
        eng = _engine()
        # A single max-weight rule can reach 100 score but only 1 signal —
        # must be capped below CRITICAL.
        # Build custom config where one rule is weight 13.5 (max) to max the score.
        single_rule = [{
            "ruleCode": "RESTRICTED_ZONE_ENTRY", "weight": 13.5, "minimumDurationMs": 0,
            "confidenceThreshold": 0.0, "cooldownSeconds": 0, "enabled": True,
        }]
        eng2 = RiskEngine()
        eng2.set_config(single_rule, THRESHOLDS.__dict__ if hasattr(THRESHOLDS, "__dict__") else None, "CAM-01")
        eng2.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=1.0)
        # Advance beyond RISK_CRITICAL_CONFIRM_MS (2000ms) so the confirm
        # window no longer caps the severity.
        obs = eng2.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=5.0)
        assert len(obs) >= 1
        # Score can be 100 but a single signal must be capped below CRITICAL.
        assert all(o["severity"] == "HIGH" for o in obs if o["score"] >= 80)


class TestHighSeverityReachable:
    def test_first_high_emission_not_blocked_by_cooldown(self):
        # 3 independent risk signals: (3+1.5+2)/9.5*100 = 68.4. With the
        # HIGH confirmation guardrail satisfied, the first HIGH emission must
        # succeed even though HIGH rules carry a 45s cooldown (the "never
        # emitted" sentinel must not block it).
        eng = _engine()
        events = [
            _ctx(1, "RESTRICTED_ZONE_ENTRY"),
            _ctx(1, "FENCE_PROXIMITY"),
            _ctx(1, "NIGHT_MOVEMENT"),
        ]
        # Seed first-observed timestamps so durations can elapse.
        eng.evaluate(events, _state(1), now=0.5)
        # All four confirmed by now=4.0 (NIGHT_MOVEMENT needs 3s). HIGH-candidate
        # but inside the 1000ms HIGH confirm window → downgraded MEDIUM.
        first = eng.evaluate(events, _state(1), now=4.0)
        assert first and first[0]["severity"] == "MEDIUM"
        # 1s later the HIGH confirm window has elapsed; the first real HIGH
        # emission must not be swallowed by the 45s cooldown.
        second = eng.evaluate(events, _state(1), now=5.0)
        assert second
        assert second[0]["score"] == pytest.approx((3.0 + 1.5 + 2.0) / 9.5 * 100, abs=0.1)
        assert second[0]["severity"] == "HIGH"


class TestStateCleanup:
    def test_stale_track_removed(self):
        eng = _engine()
        eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=1.5)
        assert eng.get_track_state(1) is not None
        # Advance far beyond RISK_TRACK_TIMEOUT_SECONDS (60).
        eng.evaluate([], _state(1), now=1000.0)
        assert eng.get_track_state(1) is None


class TestConfigFailure:
    def test_invalid_rule_ignored(self):
        eng = RiskEngine()
        bad_rules = [
            {"ruleCode": "NEG", "weight": -5, "enabled": True},
            {"ruleCode": "OK", "weight": 2, "enabled": True},
        ]
        eng.set_config(bad_rules, None, "CAM-01")
        # "NEG" invalid weight<0 ignored; "OK" loaded.
        assert eng.rules_loaded() == 1
        assert eng.rules_enabled() == 1

    def test_disabled_rule_not_counted_enabled(self):
        eng = RiskEngine()
        rules = [
            {"ruleCode": "A", "weight": 1, "enabled": True},
            {"ruleCode": "B", "weight": 2, "enabled": False},
        ]
        eng.set_config(rules, None, "CAM-01")
        assert eng.rules_loaded() == 2
        assert eng.rules_enabled() == 1


class TestMetrics:
    def test_metrics_report(self):
        eng = _engine()
        eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=1.0)
        eng.evaluate([_ctx(1, "RESTRICTED_ZONE_ENTRY")], _state(1), now=3.0)
        m = eng.snapshot_metrics()
        assert m["rulesEnabled"] == len(RULES)
        assert m["riskEvaluations"] >= 1
        assert m["riskObservationsGenerated"] >= 1


class TestRuleMapping:
    def test_known_mappings_cover_risk_context_types(self):
        risky = {"RESTRICTED_ZONE_ENTRY", "VIRTUAL_FENCE_CROSSING", "FENCE_PROXIMITY",
                 "NIGHT_MOVEMENT", "LOITERING"}
        assert set(CONTEXT_TO_RULE.keys()) == risky

    def test_repeated_entry_is_not_a_risk_mapping_without_reidentification(self):
        assert "REPEATED_ENTRY" not in CONTEXT_TO_RULE

    def test_non_risk_context_excluded(self):
        for ctype in ("ZONE_ENTER", "ZONE_EXIT", "ZONE_PRESENCE"):
            assert ctype in RISK_EXCLUDED_CONTEXT_TYPES
            assert ctype not in CONTEXT_TO_RULE
