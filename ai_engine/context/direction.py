"""Direction analysis from trajectory points.

Uses multiple recent points to compute a displacement vector. Deliberately
returns generic left/right/up/down diagonals rather than compass directions —
image "up" does not imply "north" without camera calibration.
"""

from config import DIRECTION_HISTORY_POINTS

STATIONARY = "STATIONARY"


def _label(dx: float, dy: float) -> str:
    ax, ay = abs(dx), abs(dy)
    if ax < 1e-6 and ay < 1e-6:
        return STATIONARY
    if ay > ax * 2.0:
        return "UP" if dy < 0 else "DOWN"
    if ax > ay * 2.0:
        return "RIGHT" if dx > 0 else "LEFT"
    # Diagonal.
    if dx >= 0 and dy <= 0:
        return "UP_RIGHT"
    if dx >= 0 and dy >= 0:
        return "DOWN_RIGHT"
    if dx <= 0 and dy <= 0:
        return "UP_LEFT"
    return "DOWN_LEFT"


def compute_direction(
    points: list[dict],
    min_displacement: float = 0.0,
    history_points: int = DIRECTION_HISTORY_POINTS,
) -> dict:
    """Return {'label', 'dx', 'dy', 'angleDegrees', 'samples'}.

    Uses a fixed but small default; the displacement is only the net vector
    between the earliest and latest of the recent window.
    """
    if not points:
        return {"label": STATIONARY, "dx": 0.0, "dy": 0.0, "angleDegrees": None, "samples": 0}

    window = points[-history_points:]
    if len(window) < 2:
        return {
            "label": STATIONARY,
            "dx": 0.0,
            "dy": 0.0,
            "angleDegrees": None,
            "samples": len(window),
        }

    first = window[0]
    last = window[-1]
    dx = (last["x"] - first["x"]) if "x" in last else 0.0
    dy = (last["y"] - first["y"]) if "y" in last else 0.0

    label = _label(dx, dy) if _magnitude(dx, dy) > min_displacement else STATIONARY

    import math

    angle = None
    if label != STATIONARY:
        angle = round(math.degrees(math.atan2(dy, dx)), 1)

    return {"label": label, "dx": round(dx, 4), "dy": round(dy, 4), "angleDegrees": angle, "samples": len(window)}


def _magnitude(dx: float, dy: float) -> float:
    return (dx * dx + dy * dy) ** 0.5
