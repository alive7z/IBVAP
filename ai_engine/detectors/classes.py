from enum import Enum


class ObjectType(str, Enum):
    PERSON = "PERSON"
    VEHICLE = "VEHICLE"


VEHICLE_SUBTYPES = {
    "bicycle": "BICYCLE",
    "car": "CAR",
    "motorcycle": "MOTORCYCLE",
    "bus": "BUS",
    "truck": "TRUCK",
}

ALLOWED_COCO_NAMES = {
    "person": ObjectType.PERSON,
    "bicycle": ObjectType.VEHICLE,
    "car": ObjectType.VEHICLE,
    "motorcycle": ObjectType.VEHICLE,
    "bus": ObjectType.VEHICLE,
    "truck": ObjectType.VEHICLE,
}

COCO_NAME_TO_ID = {
    "person": 0,
    "bicycle": 1,
    "car": 2,
    "motorcycle": 3,
    "bus": 5,
    "truck": 7,
}

ALLOWED_CLASS_IDS = set(COCO_NAME_TO_ID.values())


def class_id_to_name(class_id: int) -> str | None:
    for name, cid in COCO_NAME_TO_ID.items():
        if cid == class_id:
            return name
    return None


def classify_object(class_name: str) -> str:
    return ALLOWED_COCO_NAMES.get(class_name, "PERSON").value


def vehicle_subtype(class_name: str) -> str | None:
    return VEHICLE_SUBTYPES.get(class_name)
