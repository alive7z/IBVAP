const EVENT_TYPE_LABELS = Object.freeze({
  SUSPICIOUS_ACTIVITY: "Suspicious Activity",
  PERSON_DETECTED: "Person Detected",
  NIGHT_MOVEMENT: "Night Movement",
  FACE_DETECTED: "Face Detected",
  LOITERING: "Loitering",
  VEHICLE_DETECTED: "Vehicle Detected",
  PLATE_DETECTED: "Plate Detected",
  FENCE_PROXIMITY: "Fence Proximity",
  VIRTUAL_FENCE_CROSSING: "Virtual Fence Crossing",
  RESTRICTED_ZONE_ENTRY: "Restricted Zone Entry",
});

export function formatEventTypeLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";
  const key = raw.toUpperCase();
  if (EVENT_TYPE_LABELS[key]) return EVENT_TYPE_LABELS[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function prepareEventsByType(data = []) {
  return data
    .map((item) => ({
      ...item,
      displayName: formatEventTypeLabel(item.name),
    }))
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
}

