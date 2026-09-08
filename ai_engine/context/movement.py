"""Movement magnitude and stationary detection.

Reports displacement in NORMALIZED units per second (or per frame). It does NOT
report km/h or m/s because Phase 9 has no physical camera calibration.
"""

from config import MOVEMENT_HISTORY_POINTS, MOVEMENT_MIN_DISPLACEMENT


def movement_speed(points: list[dict], seconds: float, min_displacement: float = MOVEMENT_MIN_DISPLACEMENT) -> dict:
    """Compute displacement over the recent history window.

    seconds: elapsed real seconds covered by the window (closed against 0).

    Returns {'moving': bool, 'normalizedUnitsPerSecond': float, 'dx': float, 'dy': float}.
    """
    window = points[-MOVEMENT_HISTORY_POINTS:]
    if len(window) < 2 or seconds <= 0:
        moving = False
        speed = 0.0
        dx = 0.0
        dy = 0.0
    else:
        first = window[0]
        last = window[-1]
        dx = (last["x"] - first["x"]) if "x" in last else 0.0
        dy = (last["y"] - first["y"]) if "y" in last else 0.0
        disp = (dx * dx + dy * dy) ** 0.5
        moving = disp > min_displacement
        speed = disp / seconds

    return {
        "moving": moving,
        "normalizedUnitsPerSecond": round(speed, 5),
        "pixelsPerSecond": None,  # computed by caller if pixel scale unknown? kept null.
        "dx": round(dx, 4),
        "dy": round(dy, 4),
    }


def is_stationary(points: list[dict], min_displacement: float = MOVEMENT_MIN_DISPLACEMENT, center_only: bool = True) -> bool:
    """True if the track has stayed within a small displacement across its window."""
    window = points[-MOVEMENT_HISTORY_POINTS:]
    if len(window) < 2:
        return True
    first = window[0]
    last = window[-1]
    x0 = first["x"] if "x" in first else first.get("px", 0)
    y0 = first["y"] if "y" in first else first.get("py", 0)
    x1 = last["x"] if "x" in last else last.get("px", 0)
    y1 = last["y"] if "y" in last else last.get("py", 0)
    disp = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    return disp < min_displacement
