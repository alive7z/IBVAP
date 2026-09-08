"""Plate ↔ vehicle-track association via containment/overlap geometry.

A plate is associated with a vehicle track when the plate's center lies inside
the vehicle bbox (highest overlap/containment). If no track contains it, we do
NOT invent an association.
"""

from anpr.models import PlateBBox


def plate_center(plate: PlateBBox) -> tuple[float, float]:
    return (plate.x1 + plate.x2) / 2.0, (plate.y1 + plate.y2) / 2.0


def box_contains_point(bbox: dict, x: float, y: float) -> bool:
    return bbox["x1"] <= x <= bbox["x2"] and bbox["y1"] <= y <= bbox["y2"]


def associate_plate_to_track(plate_bbox: PlateBBox, vehicle_bboxes: dict) -> int | None:
    """Return the vehicle trackId whose bbox contains the plate center.

    `vehicle_bboxes` maps trackId -> pixel bbox dict {x1,y1,x2,y2}.
    Returns None when no track contains the plate (no fabricated association).
    """
    if plate_bbox is None:
        return None
    cx, cy = plate_center(plate_bbox)
    for track_id, bbox in vehicle_bboxes.items():
        if box_contains_point(bbox, cx, cy):
            return int(track_id)
    return None


def overlap_fraction(plate: PlateBBox, bbox: dict) -> float:
    """Fraction of the plate area covered by `bbox` (0..1)."""
    if plate is None or bbox is None:
        return 0.0
    ix1 = max(plate.x1, bbox["x1"])
    iy1 = max(plate.y1, bbox["y1"])
    ix2 = min(plate.x2, bbox["x2"])
    iy2 = min(plate.y2, bbox["y2"])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area = max((plate.x2 - plate.x1) * (plate.y2 - plate.y1), 1e-9)
    return min(inter / area, 1.0)
