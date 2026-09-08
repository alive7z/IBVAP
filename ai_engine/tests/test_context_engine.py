"""Integration tests for the Phase 9 ContextEngine orchestrator."""

import time

import pytest

from context.engine import ContextEngine

BOTTOM_BAND = [
    {"x": 0.35, "y": 0.85},
    {"x": 0.75, "y": 0.85},
    {"x": 0.75, "y": 1.00},
    {"x": 0.35, "y": 1.00},
]

CONFIG = {
    "cameraCode": "CAM-01",
    "zones": [
        {
            "zoneCode": "ZONE-07",
            "name": "Bottom Band",
            "zoneType": "RESTRICTED",
            "riskLevel": "HIGH",
            "coordinates": BOTTOM_BAND,
            "enabled": True,
        },
        {
            "zoneCode": "ZONE-08",
            "name": "Center Fence",
            "zoneType": "VIRTUAL_FENCE",
            "coordinates": [{"x": 0.50, "y": 0.10}, {"x": 0.50, "y": 0.90}],
            "enabled": True,
        },
    ],
}


def _track(track_id, x, y, object_type="PERSON"):
    return [{"trackId": track_id, "objectType": object_type, "referencePoint": {"x": x, "y": y}}]


def _engine(**kwargs):
    base = {
        "enabled": True,
        "confirm_frames": 2,
        "loitering_seconds": 5.0,
        "repeated_count": 3,
        "repeated_window": 60,
    }
    base.update(kwargs)
    eng = ContextEngine(zone_config=CONFIG, **base)
    return eng


class TestConfig:
    def test_config_status_ready(self):
        eng = _engine()
        assert eng.config_status == "READY"
        assert eng.zones_loaded() == 2
        assert eng.fences_loaded() == 1

    def test_no_zones_status(self):
        eng = ContextEngine(enabled=True, zone_config={"zones": []})
        assert eng.config_status == "NO_ZONES"

    def test_disabled_returns_nothing(self):
        eng = _engine(enabled=False)
        assert eng.update(_track(1, 0.53, 0.98)) == []

    def test_config_unavailable_returns_nothing(self):
        eng = _engine()
        eng.mark_config_unavailable()
        assert eng.update(_track(1, 0.53, 0.98)) == []

    def test_unchanged_config_refresh_preserves_live_track_state(self):
        eng = _engine(loitering_seconds=5.0)
        eng.update(_track(1, 0.53, 0.98), now=0.0)
        eng.update(_track(1, 0.53, 0.98), now=4.0)

        changed = eng.set_config(CONFIG)

        assert changed is False
        events = eng.update(_track(1, 0.53, 0.98), now=5.0)
        assert [event["type"] for event in events].count("LOITERING") == 1
        assert eng.loitering_evidence(1)["metadata"]["durationSeconds"] == 5.0

    def test_changed_geometry_resets_context_episode_explicitly(self):
        eng = _engine(loitering_seconds=5.0)
        eng.update(_track(1, 0.53, 0.98), now=0.0)
        changed_config = {**CONFIG, "zones": [dict(CONFIG["zones"][0], name="Changed")]}

        changed = eng.set_config(changed_config)

        assert changed is True
        assert eng.trace_state(1) == {}


class TestRestrictedEntry:
    def test_fires_after_confirmation(self):
        eng = _engine()
        # Outside then two inside -> ENTER confirmed.
        events = []
        events += eng.update(_track(1, 0.53, 0.20), now=1)
        events += eng.update(_track(1, 0.53, 0.98), now=2)
        events += eng.update(_track(1, 0.53, 0.98), now=3)
        types = [e["type"] for e in events]
        assert "RESTRICTED_ZONE_ENTRY" in types
        ev = next(e for e in events if e["type"] == "RESTRICTED_ZONE_ENTRY")
        assert ev["objectType"] == "PERSON"
        assert ev["metadata"]["zoneCode"] == "ZONE-07"
        assert ev["metadata"]["zoneType"] == "RESTRICTED"
        assert "risk" not in ev

    def test_does_not_fire_on_only_one_inside_frame(self):
        eng = _engine(confirm_frames=2)
        events = eng.update(_track(1, 0.53, 0.98), now=1)
        assert all(e["type"] != "RESTRICTED_ZONE_ENTRY" for e in events)

    def test_enter_emits_once(self):
        eng = _engine()
        for now in range(1, 10):
            events = eng.update(_track(1, 0.53, 0.98), now=now)
            assert sum(1 for e in events if e["type"] == "RESTRICTED_ZONE_ENTRY") <= 1

    def test_virtual_fence_polygon_is_not_treated_as_enterable_zone(self):
        config = {
            "zones": [{
                "zoneCode": "FENCE-POLY",
                "name": "Fence Polyline",
                "zoneType": "VIRTUAL_FENCE",
                "coordinates": [
                    {"x": 0.1, "y": 0.1}, {"x": 0.9, "y": 0.1},
                    {"x": 0.9, "y": 0.9}, {"x": 0.1, "y": 0.9},
                ],
                "enabled": True,
            }],
        }
        eng = ContextEngine(zone_config=config, enabled=True, confirm_frames=1)
        events = eng.update(_track(1, 0.5, 0.5), now=1.0)
        assert all(event["type"] not in {"ZONE_ENTER", "REPEATED_ENTRY"} for event in events)

    def test_active_restricted_evidence_continues_without_duplicate_rows(self):
        eng = _engine()
        emitted = []
        emitted += eng.update(_track(1, 0.53, 0.98), now=1.0)
        emitted += eng.update(_track(1, 0.53, 0.98), now=2.0)
        emitted += eng.update(_track(1, 0.53, 0.98), now=3.0)

        assert sum(e["type"] == "RESTRICTED_ZONE_ENTRY" for e in emitted) == 1
        active = eng.active_risk_evidence(1)
        assert any(e["type"] == "RESTRICTED_ZONE_ENTRY" for e in active)

    def test_repeated_entry_is_not_emitted_without_persistent_identity(self):
        eng = _engine(confirm_frames=1, repeated_count=2)
        events = []
        events += eng.update(_track(1, 0.53, 0.98), now=1.0)
        events += eng.update(_track(1, 0.53, 0.20), now=2.0)
        events += eng.update(_track(1, 0.53, 0.98), now=3.0)
        assert all(e["type"] != "REPEATED_ENTRY" for e in events)

        other = eng.update(_track(2, 0.53, 0.98), now=4.0)
        assert all(e["type"] != "REPEATED_ENTRY" for e in other)


class TestExit:
    def test_exit_emits_after_confirmation(self):
        eng = _engine()
        eng.update(_track(1, 0.53, 0.98), now=1)
        eng.update(_track(1, 0.53, 0.98), now=2)  # ENTER
        events = []
        events += eng.update(_track(1, 0.53, 0.20), now=3)
        events += eng.update(_track(1, 0.53, 0.20), now=4)
        types = [e["type"] for e in events]
        assert "ZONE_EXIT" in types


class TestLoitering:
    def test_loitering_emits(self):
        eng = _engine(loitering_seconds=5.0)
        events = []
        t = 0.0
        for _ in range(6):
            events += eng.update(_track(1, 0.53, 0.98), now=t)
            t += 1.0
        types = [e["type"] for e in events]
        assert "LOITERING" in types

    def test_loitering_emits_once(self):
        eng = _engine(loitering_seconds=5.0)
        counts = 0
        t = 0.0
        for _ in range(20):
            events = eng.update(_track(1, 0.53, 0.98), now=t)
            counts += sum(1 for e in events if e["type"] == "LOITERING")
            t += 1.0
        assert counts == 1

    def test_loitering_evidence_duration_progresses_without_duplicate_events(self):
        eng = _engine(loitering_seconds=5.0)
        event_count = 0
        for now in range(0, 13):
            events = eng.update(_track(1, 0.53, 0.98), now=float(now))
            event_count += sum(1 for e in events if e["type"] == "LOITERING")
        evidence = eng.loitering_evidence(1)
        assert event_count == 1
        assert evidence is not None
        assert evidence["metadata"]["durationSeconds"] == pytest.approx(12.0)

    def test_loitering_evidence_resets_when_condition_ends(self):
        eng = _engine(loitering_seconds=5.0)
        eng.update(_track(1, 0.53, 0.98), now=0.0)
        eng.update(_track(1, 0.53, 0.98), now=5.0)
        assert eng.loitering_evidence(1) is not None
        eng.update(_track(1, 0.8, 0.5), now=6.0)
        assert eng.loitering_evidence(1) is None


class TestFenceProximity:
    def test_active_proximity_continues_without_duplicate_context_rows(self):
        eng = _engine()
        emitted = []
        for now in (1.0, 2.0, 3.0):
            emitted += eng.update(_track(1, 0.50, 0.50), now=now)

        assert sum(e["type"] == "FENCE_PROXIMITY" for e in emitted) == 1
        active = eng.active_risk_evidence(1)
        assert any(e["type"] == "FENCE_PROXIMITY" for e in active)

        eng.update(_track(1, 0.20, 0.50), now=4.0)
        assert all(
            e["type"] != "FENCE_PROXIMITY"
            for e in eng.active_risk_evidence(1)
        )


class TestNightMovement:
    def test_night_movement_emits_when_moving(self):
        # Force always-night for deterministic test.
        eng = _engine(night_start=0, night_end=0)
        events = []
        for i in range(8):
            x = 0.1 + i * 0.1
            events += eng.update(_track(1, x, 0.5), now=float(i))
        types = [e["type"] for e in events]
        assert "NIGHT_MOVEMENT" in types

    def test_night_movement_emits_once(self):
        eng = _engine(night_start=0, night_end=0)
        counts = 0
        for i in range(20):
            x = 0.1 + (i % 5) * 0.2
            events = eng.update(_track(1, x, 0.5), now=float(i))
            counts += sum(1 for e in events if e["type"] == "NIGHT_MOVEMENT")
        assert counts == 1


class TestCleanup:
    def test_expired_track_removed(self):
        eng = _engine()
        eng.update(_track(1, 0.53, 0.98), now=1)
        assert 1 in eng._tracks
        # 31s later -> beyond timeout (default 30).
        eng.update(_track(2, 0.53, 0.98), now=32)
        assert 1 not in eng._tracks

    def test_trajectory_bounded(self):
        from context.trajectory import Trajectory
        tr = Trajectory(maxlen=5)
        for i in range(50):
            tr.add({"x": 0.1, "y": 0.1, "timestamp": float(i)})
        assert len(tr) == 5

    def test_new_session_reused_track_id_inherits_no_zone_or_fence_state(self):
        eng = _engine(confirm_frames=2)
        eng.update(_track(1, 0.53, 0.98), now=1.0)
        old_events = eng.update(_track(1, 0.53, 0.98), now=2.0)
        assert any(e["type"] == "RESTRICTED_ZONE_ENTRY" for e in old_events)

        eng.reset()

        # Same numeric ID in the new session starts tentative context state;
        # one frame cannot inherit the prior confirmed-inside state.
        assert eng.update(_track(1, 0.53, 0.98), now=3.0) == []
        new_events = eng.update(_track(1, 0.53, 0.98), now=4.0)
        assert any(e["type"] == "RESTRICTED_ZONE_ENTRY" for e in new_events)


class TestOverlaysRegression:
    def test_fence_overlays_returns_objects_not_strings(self):
        eng = _engine()
        overlays = eng.fence_overlays()
        assert len(overlays) == 1
        o = overlays[0]
        assert o["zoneCode"] == "ZONE-08"
        assert o["name"] == "Center Fence"
        assert "a" in o and "b" in o

    def test_zone_overlays_returns_dicts(self):
        eng = _engine()
        overlays = eng.zone_overlays()
        assert len(overlays) == 2
        codes = {o["zoneCode"] for o in overlays}
        assert "ZONE-07" in codes
        assert "ZONE-08" in codes

    def test_fence_overlay_after_process_frame(self):
        eng = _engine()
        eng.update(_track(1, 0.30, 0.50), now=1)
        eng.update(_track(1, 0.70, 0.50), now=2)
        overlays = eng.fence_overlays()
        assert len(overlays) == 1
        assert isinstance(overlays[0]["zoneCode"], str)


class TestCountInvariant:
    """Phase 9 invariant: sum(per-type counts) == total unique observations,
    and every observationId is unique. Mirrors main.py collection logic."""

    def test_invariant_holds_across_full_config(self):
        # Drive several tracks across all zones/fences in CONFIG, then assert
        # the per-type sum equals the total generated observation count from the
        # engine's own metric (contextObservationsGenerated).
        from collections import Counter
        import datetime

        eng = _engine()
        # A fixed wall-clock epoch at daytime so night does not fire.
        occurred = datetime.datetime(2026, 8, 31, 12, 0, 0, tzinfo=datetime.timezone.utc).timestamp()

        events = []
        t = 0.0
        frame_sec = 0.2  # 5 fps sampling

        def step(x, y, tid):
            nonlocal t
            ev = eng.update(_track(tid, x, y), now=t, occurred_at=occurred, source_timestamp_ms=int(t * 1000))
            events.extend(ev)
            t += frame_sec

        # Track 1: enters restricted ZONE-07 bottom band.
        step(0.53, 0.20, 1)
        step(0.53, 0.98, 1)  # ENTER confirm
        step(0.53, 0.98, 1)
        # Track 2: crosses virtual fence ZONE-08 (0.5,0.1)-(0.5,0.9).
        step(0.30, 0.50, 2)
        step(0.70, 0.50, 2)
        step(0.70, 0.50, 2)

        # Dedup identical to main.py.
        seen = set()
        obs = []
        for c in events:
            key = (c["type"], c["trackId"])
            for k in ("zoneCode", "fenceCode"):
                if c["metadata"].get(k):
                    key = (c["type"], c["trackId"], c["metadata"][k])
            if key in seen:
                continue
            seen.add(key)
            obs.append(c)

        per_type = Counter(c["type"] for c in obs)
        assert sum(per_type.values()) == len(obs)
        # Ensure the engine metric also matches.
        assert len(obs) == eng.snapshot_metrics()["contextObservationsGenerated"]

    def test_observation_ids_unique(self):
        # In main.py each generated observation gets a fresh uuid; verify the
        # engine returns distinct logical observations (no duplicate type/keys).
        import datetime
        eng = _engine()
        occurred = datetime.datetime(2026, 8, 31, 12, 0, 0, tzinfo=datetime.timezone.utc).timestamp()
        all_events = []
        t = 0.0
        for _ in range(5):
            all_events += eng.update(_track(1, 0.53, 0.98), now=t, occurred_at=occurred,
                                     source_timestamp_ms=int(t * 1000))
            all_events += eng.update(_track(2, 0.20, 0.50), now=t, occurred_at=occurred,
                                     source_timestamp_ms=int(t * 1000))
            t += 0.2
        # Each returned observation must be distinct (no repeated emit).
        keys = [(c["type"], c["trackId"]) for c in all_events]
        assert len(keys) == len(set(keys))


class TestTimestampArchitecture:
    def _engine_day(self):
        import datetime
        return _engine(), datetime.datetime(2026, 8, 31, 12, 0, 0, tzinfo=datetime.timezone.utc).timestamp()

    def test_occurred_at_is_real_utc_not_1970(self):
        eng, occurred = self._engine_day()
        events = eng.update(_track(1, 0.53, 0.98), now=1.84, occurred_at=occurred, source_timestamp_ms=1840)
        events += eng.update(_track(1, 0.53, 0.98), now=2.04, occurred_at=occurred, source_timestamp_ms=2040)
        for c in events:
            # Must be 2026 UTC, not 1970.
            assert c["occurredAt"].startswith("2026-")
            assert "1970-01-01" not in c["occurredAt"]
            from datetime import datetime
            parsed = datetime.fromisoformat(c["occurredAt"].replace("Z", "+00:00"))
            assert parsed.tzinfo is not None

    def test_source_timestamp_ms_preserved_separately(self):
        eng, occurred = self._engine_day()
        events = eng.update(_track(1, 0.30, 0.50), now=1.84, occurred_at=occurred, source_timestamp_ms=1840)
        events += eng.update(_track(1, 0.70, 0.50), now=2.04, occurred_at=occurred, source_timestamp_ms=2040)
        assert events
        src_ms_values = {c.get("sourceTimestampMs") for c in events}
        assert 1840 in src_ms_values or 2040 in src_ms_values
        for c in events:
            assert isinstance(c.get("sourceTimestampMs"), int)
            # source-relative value is small (video position), never epoch-scale.
            assert c["sourceTimestampMs"] < 10_000_000

    def test_video_position_not_used_as_wall_clock_for_night(self):
        # night_start=20..6; a wall-clock of 12:00 must be day even if the
        # video-time 'now' is small (e.g. 1.84s would have been 1970 night).
        import datetime
        eng, _ = self._engine_day()
        occurred = datetime.datetime(2026, 8, 31, 12, 0, 0, tzinfo=datetime.timezone.utc).timestamp()
        events = eng.update(_track(1, 0.53, 0.98), now=1.84, occurred_at=occurred, source_timestamp_ms=1840)
        events += eng.update(_track(1, 0.53, 0.98), now=2.04, occurred_at=occurred, source_timestamp_ms=2040)
        assert all(e["type"] != "NIGHT_MOVEMENT" for e in events)
