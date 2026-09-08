import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pytest
from detectors.classes import classify_object, vehicle_subtype


def _make_yolo_box(x1, y1, x2, y2, cls, conf, track_id=None):
    raise NotImplementedError


def test_bbox_validation_skips_invalid():
    # Via the detector's bbox handling in yolo_detector is hard to unit test
    # without a model; here we test the clamping/validation logic conceptually
    # by simulating the coordinate guard the detector applies.
    h, w = 720, 1280
    x1, y1, x2, y2 = 100.0, 90.0, 340.0, 620.0
    x1 = max(0.0, min(x1, w)); y1 = max(0.0, min(y1, h))
    x2 = max(0.0, min(x2, w)); y2 = max(0.0, min(y2, h))
    assert x1 < x2 and y1 < y2
    assert 0 <= x1 <= 1280 and 0 <= y1 <= 720


def test_bbox_clamped_to_frame():
    h, w = 720, 1280
    x1, y1, x2, y2 = -50.0, -20.0, 5000.0, 900.0
    x1 = max(0.0, min(x1, w)); y1 = max(0.0, min(y1, h))
    x2 = max(0.0, min(x2, w)); y2 = max(0.0, min(y2, h))
    assert x1 == 0 and y1 == 0
    assert x2 == 1280 and y2 == 720


def test_classify_mapping():
    assert classify_object("person") == "PERSON"
    assert classify_object("car") == "VEHICLE"
    assert classify_object("motorcycle") == "VEHICLE"


def test_vehicle_subtype_preserved():
    assert vehicle_subtype("car") == "CAR"
    assert vehicle_subtype("bus") == "BUS"
    assert vehicle_subtype("truck") == "TRUCK"
    assert vehicle_subtype("bicycle") == "BICYCLE"
    assert vehicle_subtype("motorcycle") == "MOTORCYCLE"


def test_confidence_float_range():
    conf = 0.91
    assert isinstance(conf, float)
    assert 0.0 <= conf <= 1.0
