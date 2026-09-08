export const ZONE_TYPE_COLORS = {
  "Restricted Zone": "#ef4444",
  "Monitoring Zone": "#3b82f6",
  "Virtual Fence": "#f59e0b",
};

export const isFenceType = (type) => type === "Virtual Fence";

export const clamp01 = (value) =>
  Math.max(0, Math.min(1, Number(value) || 0));

export function rotateNormalizedPoint(point, degrees = 0) {
  let x = clamp01(point?.x);
  let y = clamp01(point?.y);
  if (degrees === 90) [x, y] = [1 - y, x];
  else if (degrees === 180) [x, y] = [1 - x, 1 - y];
  else if (degrees === 270) [x, y] = [y, 1 - x];
  return { x, y };
}

// Persisted coordinates are source-frame coordinates. The AI rotates both the
// source frame and zone config clockwise; the Admin editor shows that rotated
// preview and must invert the transform before saving.
export const toDisplayCoordinates = (coordinates, rotationDegrees = 0) =>
  (Array.isArray(coordinates) ? coordinates : []).map((point) =>
    rotateNormalizedPoint(point, rotationDegrees)
  );

export const toCanonicalCoordinates = (coordinates, rotationDegrees = 0) => {
  const inverse = (360 - Number(rotationDegrees || 0)) % 360;
  return (Array.isArray(coordinates) ? coordinates : []).map((point) => {
    const canonical = rotateNormalizedPoint(point, inverse);
    return {
      x: Number(canonical.x.toFixed(6)),
      y: Number(canonical.y.toFixed(6)),
    };
  });
};

export function geometryIsValid(type, coordinates) {
  const minimum = isFenceType(type) ? 2 : 3;
  return Array.isArray(coordinates) && coordinates.length >= minimum;
}
