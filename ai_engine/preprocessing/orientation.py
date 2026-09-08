"""Camera-frame rotation and matching normalized geometry transforms."""
from copy import deepcopy

import cv2
import numpy as np


VALID_ROTATIONS = frozenset({0, 90, 180, 270})


def normalize_rotation_degrees(value: int | str | None) -> int:
    try:
        degrees = int(value or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("rotationDegrees must be one of 0, 90, 180, or 270") from exc
    if degrees not in VALID_ROTATIONS:
        raise ValueError("rotationDegrees must be one of 0, 90, 180, or 270")
    return degrees


def rotate_image_clockwise(image: np.ndarray, degrees: int) -> np.ndarray:
    degrees = normalize_rotation_degrees(degrees)
    if degrees == 0:
        return image
    if degrees == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    if degrees == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)


def rotate_normalized_point(point: dict, degrees: int) -> dict:
    degrees = normalize_rotation_degrees(degrees)
    x = float(point["x"])
    y = float(point["y"])
    if degrees == 90:
        x, y = 1.0 - y, x
    elif degrees == 180:
        x, y = 1.0 - x, 1.0 - y
    elif degrees == 270:
        x, y = y, 1.0 - x
    return {**point, "x": x, "y": y}


def rotate_context_config(config: dict, degrees: int) -> dict:
    """Rotate stored source-space zones/fences into displayed frame space."""
    degrees = normalize_rotation_degrees(degrees)
    rotated = deepcopy(config)
    if degrees == 0:
        return rotated
    for zone in rotated.get("zones") or []:
        zone["coordinates"] = [
            rotate_normalized_point(point, degrees)
            for point in zone.get("coordinates") or []
        ]
    return rotated
