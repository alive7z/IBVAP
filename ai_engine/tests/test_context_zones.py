"""Unit tests for zone presence/entry/exit with temporal confirmation."""

from context.zones import RestrictedZoneManager, ZoneState


# A restricted polygon in the bottom band that contains the stationary person
# reference point (~0.53, 1.0).
BOTTOM_BAND = [
    {"x": 0.35, "y": 0.85},
    {"x": 0.75, "y": 0.85},
    {"x": 0.75, "y": 1.00},
    {"x": 0.35, "y": 1.00},
]

ZONE = {
    "zoneCode": "ZONE-07",
    "name": "Bottom Band",
    "zoneType": "RESTRICTED",
    "riskLevel": "HIGH",
    "coordinates": BOTTOM_BAND,
    "enabled": True,
}


class TestZoneState:
    def test_requires_confirmation_for_enter(self):
        st = ZoneState(confirm_frames=2)
        assert st.submit(False) is None
        assert st.submit(True) is None  # first inside guess not yet confirmed
        assert st.submit(True) == "ENTER"

    def test_jitter_does_not_enter(self):
        st = ZoneState(confirm_frames=2)
        st.submit(True)
        st.submit(False)  # disappearance resets guess
        st.submit(True)
        assert st.submit(True) == "ENTER"  # still needs 2 consecutive

    def test_exit_requires_confirmation(self):
        st = ZoneState(confirm_frames=2)
        st.submit(True)
        st.submit(True)  # ENTER
        st.submit(False)
        assert st.submit(False) == "EXIT"


class TestRestrictedZoneManager:
    def test_enter_then_exit_emits_once_each(self):
        mgr = RestrictedZoneManager([ZONE], confirm_frames=2)

        inside = {"x": 0.53, "y": 0.98}
        outside = {"x": 0.53, "y": 0.20}

        events = []
        events += mgr.update(1, outside)
        events += mgr.update(1, inside)
        events += mgr.update(1, inside)  # enter confirmed

        enters = [e for e in events if e["transition"] == "ENTER"]
        assert len(enters) == 1
        assert enters[0]["zoneCode"] == "ZONE-07"
        assert enters[0]["zoneType"] == "RESTRICTED"

        events += mgr.update(1, outside)
        events += mgr.update(1, outside)
        exits = [e for e in events if e["transition"] == "EXIT"]
        assert len(exits) == 1

    def test_no_reentry_without_leave(self):
        mgr = RestrictedZoneManager([ZONE], confirm_frames=2)
        point = {"x": 0.53, "y": 0.98}
        # Enter.
        mgr.update(1, point)
        mgr.update(1, point)
        # Staying inside across many frames emits no further transitions.
        for _ in range(10):
            assert mgr.update(1, point) == []

    def test_disabled_zone_ignored(self):
        disabled = {**ZONE, "enabled": False}
        mgr = RestrictedZoneManager([disabled], confirm_frames=1)
        assert mgr.enabled is False

    def test_out_of_range_point_ignored(self):
        mgr = RestrictedZoneManager([ZONE], confirm_frames=1)
        assert mgr.update(1, {"x": 2.0, "y": 0.5}) == []
