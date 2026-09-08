"""Face ↔ person-track association via containment geometry.

A face is associated with a person track only when the face bbox center lies
inside the person bbox. If no person tracks contain the face, we do NOT invent
an association. Ambiguous/multi-track situations resolve to the single track
with the highest overlap; if none, None is returned (never a guess).
"""

from faces.models import FaceBBox


def face_center(face: FaceBBox) -> tuple[float, float]:
    return (face.x1 + face.x2) / 2.0, (face.y1 + face.y2) / 2.0


def box_contains_point(bbox: dict, x: float, y: float) -> bool:
    return bbox["x1"] <= x <= bbox["x2"] and bbox["y1"] <= y <= bbox["y2"]


def associate_face_to_person(face: FaceBBox, person_bboxes: dict) -> int | None:
    """Return the person trackId whose bbox contains the face center.

    `person_bboxes` maps trackId -> pixel bbox dict {x1,y1,x2,y2}.
    Returns the single best (highest-overlap) containee, else None.
    """
    if face is None:
        return None
    cx, cy = face_center(face)
    candidates = [tid for tid, bbox in person_bboxes.items() if box_contains_point(bbox, cx, cy)]
    if not candidates:
        return None
    if len(candidates) == 1:
        return int(candidates[0])
    # Multiple overlaps: pick the one with the largest area (closest enclosing).
    best = None
    best_area = -1.0
    for tid in candidates:
        bbox = person_bboxes[tid]
        area = (bbox["x2"] - bbox["x1"]) * (bbox["y2"] - bbox["y1"])
        if area > best_area:
            best_area = area
            best = tid
    return int(best) if best is not None else None
