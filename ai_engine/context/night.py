"""Night-state determination (time-based only).

Phase 9 does NOT infer darkness from image brightness. It uses a configured
local operating timezone and a [start, end) window (e.g. 20:00 -> 06:00) that
wraps across midnight correctly.
"""

from datetime import datetime

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from config import CONTEXT_TZ, NIGHT_END_HOUR, NIGHT_START_HOUR


def is_night(dt: datetime | None = None) -> bool:
    """Return True if `dt` (default: now) falls within the configured night window."""
    try:
        tz = ZoneInfo(CONTEXT_TZ)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")

    if dt is None:
        dt = datetime.now(tz)
    else:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        else:
            dt = dt.astimezone(tz)

    hour = dt.hour
    start = NIGHT_START_HOUR
    end = NIGHT_END_HOUR

    if start == end:
        # Degenerate config: treat as always-night.
        return True
    if start < end:
        # Window does not cross midnight, e.g. 22:00 -> 23:00.
        return start <= hour < end
    # Window crosses midnight, e.g. 20:00 -> 06:00.
    return hour >= start or hour < end
