"""Geometry helpers for the context engine.

All coordinates are NORMALIZED image coordinates in [0, 1]. Abbreviations:
  p / a / b  — point dicts {x, y}
  poly       — list of point dicts (>= 3) forming a closed polygon
"""

from typing import Sequence


class Point:
    __slots__ = ("x", "y")

    def __init__(self, x: float, y: float):
        self.x = float(x)
        self.y = float(y)

    def as_dict(self) -> dict:
        return {"x": round(self.x, 4), "y": round(self.y, 4)}


def _px(pd) -> float:
    if isinstance(pd, Point):
        return pd.x
    return float(pd["x"])


def _py(pd) -> float:
    if isinstance(pd, Point):
        return pd.y
    return float(pd["y"])


def normalize_point(x: float, y: float, width: int, height: int) -> dict:
    """Convert pixel coordinates to normalized [0,1] coordinates."""
    if not width or not height:
        raise ValueError("width and height must be non-zero")
    nx = max(0.0, min(1.0, x / width))
    ny = max(0.0, min(1.0, y / height))
    return {"x": nx, "y": ny}


def validate_point(p) -> Point:
    if p is None or not isinstance(p, (dict, Point)):
        raise ValueError("point must be a dict {x,y} or Point")
    x, y = _px(p), _py(p)
    if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
        raise ValueError(f"point out of normalized range: {p}")
    return Point(x, y)


def validate_polygon(poly) -> list[Point]:
    if not isinstance(poly, (list, tuple)) or len(poly) < 3:
        raise ValueError("polygon must have at least 3 vertices")
    pts = [validate_point(v) for v in poly]
    return pts


def validate_segment(a, b) -> tuple[Point, Point]:
    return validate_point(a), validate_point(b)


def point_in_polygon(point, polygon) -> bool:
    """Ray-casting point-in-polygon test. Returns True for boundary points."""
    poly = validate_polygon(polygon)
    p = validate_point(point)
    x, y = p.x, p.y
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i].x, poly[i].y
        xj, yj = poly[j].x, poly[j].y
        # Boundary check (point on an edge counts as inside).
        if _point_on_segment(p, poly[j], poly[i]):
            return True
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def _cross(ox, oy, ax, ay, bx, by) -> float:
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)


def _point_on_segment(p: Point, a: Point, b: Point, eps: float = 1e-9) -> bool:
    cross = _cross(p.x, p.y, a.x, a.y, b.x, b.y)
    if abs(cross) > eps:
        return False
    if p.x < min(a.x, b.x) - eps or p.x > max(a.x, b.x) + eps:
        return False
    if p.y < min(a.y, b.y) - eps or p.y > max(a.y, b.y) + eps:
        return False
    return True


def distance_point_to_segment(point, seg_a, seg_b) -> float:
    """Shortest normalized distance from point to a segment."""
    p = validate_point(point)
    a, b = validate_segment(seg_a, seg_b)
    dx = b.x - a.x
    dy = b.y - a.y
    length_sq = dx * dx + dy * dy
    if length_sq < 1e-12:
        return ((p.x - a.x) ** 2 + (p.y - a.y) ** 2) ** 0.5
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length_sq
    t = max(0.0, min(1.0, t))
    cx = a.x + t * dx
    cy = a.y + t * dy
    return ((p.x - cx) ** 2 + (p.y - cy) ** 2) ** 0.5


def side_of_line(point, line_a, line_b) -> float:
    """Signed cross-product indicating which side of the infinite line a point
    lies on. Returns a positive/negative scalar; sign encodes side."""
    p = validate_point(point)
    a, b = validate_segment(line_a, line_b)
    return _cross(a.x, a.y, b.x, b.y, p.x, p.y)


def segments_intersect(a1, a2, b1, b2) -> bool:
    """True if segment A intersects segment B (including shared endpoints)."""
    a, b = validate_segment(a1, a2)
    c, d = validate_segment(b1, b2)
    o1 = _cross(a.x, a.y, b.x, b.y, c.x, c.y)
    o2 = _cross(a.x, a.y, b.x, b.y, d.x, d.y)
    o3 = _cross(c.x, c.y, d.x, d.y, a.x, a.y)
    o4 = _cross(c.x, c.y, d.x, d.y, b.x, b.y)
    if ((o1 > 0) != (o2 > 0)) and ((o3 > 0) != (o4 > 0)):
        return True
    if abs(o1) < 1e-9 and _point_on_segment(c, a, b):
        return True
    if abs(o2) < 1e-9 and _point_on_segment(d, a, b):
        return True
    if abs(o3) < 1e-9 and _point_on_segment(a, c, d):
        return True
    if abs(o4) < 1e-9 and _point_on_segment(b, c, d):
        return True
    return False


def midpoint(a, b) -> dict:
    pa, pb = validate_segment(a, b)
    return {"x": round((pa.x + pb.x) / 2, 4), "y": round((pa.y + pb.y) / 2, 4)}
