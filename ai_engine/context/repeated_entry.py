"""Repeated-entry detection for a single track.

Tracks entries/exits of the SAME track id (per camera session) into a zone.
Emits REPEATED_ENTRY once a threshold number of entries occur within a sliding
window. No ReID — a different track id is treated as a different object.
"""

from config import REPEATED_ENTRY_COUNT, REPEATED_ENTRY_WINDOW_SECONDS


class RepeatedEntryDetector:
    def __init__(self, count: int = REPEATED_ENTRY_COUNT, window_seconds: float = REPEATED_ENTRY_WINDOW_SECONDS):
        self._count = count
        self._window_seconds = window_seconds
        self._zone_entries: dict[str, list[float]] = {}
        self._triggered_once: set[str] = set()

    def record_entry(self, zone_code: str, now: float) -> bool:
        """Record a zone entry. Returns True when the repeated-entry threshold is
        first crossed for that zone within the window."""
        entries = self._zone_entries.setdefault(zone_code, [])
        entries.append(now)
        # Drop entries outside the sliding window.
        self._zone_entries[zone_code] = [t for t in entries if now - t <= self._window_seconds]

        if zone_code in self._triggered_once:
            return False

        if len(self._zone_entries[zone_code]) >= self._count:
            self._triggered_once.add(zone_code)
            return True

        return False

    def reset(self) -> None:
        self._zone_entries.clear()
        self._triggered_once.clear()
