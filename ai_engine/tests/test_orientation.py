import numpy as np
import pytest

from preprocessing.orientation import (
    normalize_rotation_degrees,
    rotate_context_config,
    rotate_image_clockwise,
    rotate_normalized_point,
)


def test_rotate_portrait_frame_clockwise_to_landscape():
    image = np.arange(2 * 3 * 3, dtype=np.uint8).reshape((3, 2, 3))
    rotated = rotate_image_clockwise(image, 90)
    assert rotated.shape == (2, 3, 3)
    np.testing.assert_array_equal(rotated[:, -1], image[0])


@pytest.mark.parametrize(
    ("degrees", "expected"),
    [
        (0, {"x": 0.2, "y": 0.3}),
        (90, {"x": 0.7, "y": 0.2}),
        (180, {"x": 0.8, "y": 0.7}),
        (270, {"x": 0.3, "y": 0.8}),
    ],
)
def test_rotate_normalized_point_matches_image_rotation(degrees, expected):
    assert rotate_normalized_point({"x": 0.2, "y": 0.3}, degrees) == expected


def test_context_rotation_does_not_mutate_source_config():
    config = {"zones": [{"zoneCode": "Z-1", "coordinates": [{"x": 0.1, "y": 0.2}]}]}
    rotated = rotate_context_config(config, 90)
    assert rotated["zones"][0]["coordinates"] == [{"x": 0.8, "y": 0.1}]
    assert config["zones"][0]["coordinates"] == [{"x": 0.1, "y": 0.2}]


def test_invalid_rotation_is_rejected():
    with pytest.raises(ValueError):
        normalize_rotation_degrees(45)
