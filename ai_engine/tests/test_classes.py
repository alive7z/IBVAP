import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from detectors.classes import (
    ALLOWED_CLASS_IDS,
    COCO_NAME_TO_ID,
    class_id_to_name,
    classify_object,
    vehicle_subtype,
)


def test_allowed_classes():
    assert "person" in COCO_NAME_TO_ID
    assert {"bicycle", "car", "motorcycle", "bus", "truck"}.issubset(COCO_NAME_TO_ID)


def test_irrelevant_classes_excluded():
    # dogs/chairs/bags are not in allowed classes
    assert "dog" not in COCO_NAME_TO_ID
    assert "chair" not in COCO_NAME_TO_ID
    assert "handbag" not in COCO_NAME_TO_ID


def test_class_id_to_name():
    assert class_id_to_name(0) == "person"
    assert class_id_to_name(2) == "car"
    assert class_id_to_name(999) is None


def test_classify_person():
    assert classify_object("person") == "PERSON"


def test_classify_vehicles():
    assert classify_object("car") == "VEHICLE"
    assert classify_object("truck") == "VEHICLE"
    assert classify_object("bus") == "VEHICLE"


def test_vehicle_subtypes():
    assert vehicle_subtype("car") == "CAR"
    assert vehicle_subtype("bus") == "BUS"
    assert vehicle_subtype("truck") == "TRUCK"
    assert vehicle_subtype("person") is None


def test_allowed_class_ids():
    assert 0 in ALLOWED_CLASS_IDS  # person
    assert 2 in ALLOWED_CLASS_IDS  # car
    assert 18 not in ALLOWED_CLASS_IDS  # dog — must be excluded
