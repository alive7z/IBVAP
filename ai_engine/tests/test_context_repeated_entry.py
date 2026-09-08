"""Unit tests for repeated-entry detection (per single track, no ReID)."""

from context.repeated_entry import RepeatedEntryDetector


class TestRepeatedEntry:
    def test_no_trigger_below_threshold(self):
        det = RepeatedEntryDetector(count=3, window_seconds=60)
        assert det.record_entry("ZONE-07", 0.0) is False
        assert det.record_entry("ZONE-07", 10.0) is False

    def test_triggers_at_threshold(self):
        det = RepeatedEntryDetector(count=3, window_seconds=60)
        det.record_entry("ZONE-07", 0.0)
        det.record_entry("ZONE-07", 10.0)
        assert det.record_entry("ZONE-07", 20.0) is True

    def test_emits_once_then_silent(self):
        det = RepeatedEntryDetector(count=3, window_seconds=60)
        det.record_entry("ZONE-07", 0.0)
        det.record_entry("ZONE-07", 10.0)
        assert det.record_entry("ZONE-07", 20.0) is True
        det.record_entry("ZONE-07", 30.0)
        assert det.record_entry("ZONE-07", 40.0) is False

    def test_per_zone_independent(self):
        det = RepeatedEntryDetector(count=2, window_seconds=60)
        det.record_entry("ZONE-07", 0.0)
        det.record_entry("ZONE-08", 1.0)
        assert det.record_entry("ZONE-07", 2.0) is True
        # ZONE-08 independently reaches its own threshold on its 2nd entry.
        assert det.record_entry("ZONE-08", 3.0) is True

    def test_sliding_window_drops_old(self):
        det = RepeatedEntryDetector(count=3, window_seconds=10)
        det.record_entry("ZONE-07", 0.0)
        det.record_entry("ZONE-07", 1.0)
        # Oldest entry expires by 20s; only 2 remain -> no trigger.
        assert det.record_entry("ZONE-07", 20.0) is False

    def test_reset_clears(self):
        det = RepeatedEntryDetector(count=2, window_seconds=60)
        det.record_entry("ZONE-07", 0.0)
        assert det.record_entry("ZONE-07", 1.0) is True
        det.reset()
        assert det.record_entry("ZONE-07", 2.0) is False
