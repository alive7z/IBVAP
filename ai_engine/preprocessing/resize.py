import cv2
import numpy as np

from utils.logger import get_logger

logger = get_logger("preprocessing")


def resize_frame(
    frame: np.ndarray,
    target_width: int,
    target_height: int,
    preserve_aspect: bool = True,
) -> np.ndarray:
    if frame is None or frame.size == 0:
        raise ValueError("Cannot resize empty frame")

    h, w = frame.shape[:2]

    if w == target_width and h == target_height:
        return frame

    if preserve_aspect:
        scale = min(target_width / w, target_height / h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        canvas = np.zeros((target_height, target_width, 3), dtype=np.uint8)
        y_off = (target_height - new_h) // 2
        x_off = (target_width - new_w) // 2
        canvas[y_off : y_off + new_h, x_off : x_off + new_w] = resized
        return canvas
    else:
        return cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_LINEAR)


def validate_frame(frame: np.ndarray | None) -> bool:
    return frame is not None and frame.size > 0
