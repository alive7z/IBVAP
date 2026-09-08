import React, { useEffect, useMemo, useState } from "react";
import Button from "../../common/Button";
import useCameraPreviewUrl from "../../../hooks/useCameraPreviewUrl";
import {
  ZONE_TYPE_COLORS,
  clamp01,
  isFenceType,
  toCanonicalCoordinates,
  toDisplayCoordinates,
} from "./zoneGeometry";

const MAX_POLYGON_POINTS = 12;

function svgPoints(coordinates, width, height) {
  return coordinates.map((point) => `${point.x * width},${point.y * height}`).join(" ");
}

function GeometryShape({ zone, coordinates, width, height, muted = false }) {
  if (!coordinates?.length) return null;
  const color = ZONE_TYPE_COLORS[zone.type] || "#94a3b8";
  const common = {
    points: svgPoints(coordinates, width, height),
    stroke: color,
    strokeWidth: muted ? 3 : 4,
    vectorEffect: "non-scaling-stroke",
    opacity: muted ? 0.55 : 1,
  };
  return isFenceType(zone.type) ? (
    <polyline {...common} fill="none" strokeDasharray="9 6" />
  ) : (
    <polygon {...common} fill={`${color}${muted ? "18" : "30"}`} />
  );
}

/** Camera-frame geometry editor. All interaction occurs in displayed-frame
 * normalized coordinates; onChange converts back to the source-frame canonical
 * coordinates persisted by Node and consumed by ContextEngine. */
function ZoneBoundaryEditor({
  camera,
  zone,
  zones = [],
  coordinates,
  onChange,
  canEdit = false,
}) {
  const cameraCode = camera?.id || camera?.cameraCode;
  const rotationDegrees = Number(camera?.rotationDegrees || 0);
  const [showAll, setShowAll] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [draggingPoint, setDraggingPoint] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [imageReady, setImageReady] = useState(false);
  const { previewUrl, reportImageError, retryNow, exhausted } = useCameraPreviewUrl(
    cameraCode,
    Boolean(cameraCode && camera?.enabled !== false)
  );

  useEffect(() => {
    setImageReady(false);
  }, [previewUrl, cameraCode]);

  useEffect(() => {
    setSelectedPoint(null);
    setDraggingPoint(null);
  }, [zone?.id, zone?.type]);

  const displayCoordinates = useMemo(
    () => toDisplayCoordinates(coordinates, rotationDegrees),
    [coordinates, rotationDegrees]
  );
  const otherZones = useMemo(
    () =>
      showAll
        ? zones
            .filter((item) => item.id !== zone.id && item.cameraId === cameraCode)
            .map((item) => ({
              ...item,
              displayCoordinates: toDisplayCoordinates(item.coordinates, rotationDegrees),
            }))
        : [],
    [cameraCode, rotationDegrees, showAll, zone.id, zones]
  );

  const viewWidth = 1000;
  const viewHeight = viewWidth / aspectRatio;

  const pointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const commitDisplayCoordinates = (next) => {
    onChange?.(toCanonicalCoordinates(next, rotationDegrees));
  };

  const addPoint = (event) => {
    const limit = isFenceType(zone.type) ? 2 : MAX_POLYGON_POINTS;
    if (!canEdit || displayCoordinates.length >= limit) return;
    commitDisplayCoordinates([...displayCoordinates, pointFromEvent(event)]);
    setSelectedPoint(displayCoordinates.length);
  };

  const movePoint = (event) => {
    if (draggingPoint === null) return;
    const point = pointFromEvent(event);
    const next = displayCoordinates.map((current, index) =>
      index === draggingPoint ? point : current
    );
    commitDisplayCoordinates(next);
  };

  const removeSelected = () => {
    const minimum = isFenceType(zone.type) ? 2 : 3;
    if (!canEdit || selectedPoint === null || displayCoordinates.length <= minimum) return;
    commitDisplayCoordinates(displayCoordinates.filter((_, index) => index !== selectedPoint));
    setSelectedPoint(null);
  };

  const selectedColor = ZONE_TYPE_COLORS[zone.type] || "#e2e8f0";
  const canRemove = selectedPoint !== null && displayCoordinates.length > (isFenceType(zone.type) ? 2 : 3);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Camera Boundary Editor</p>
          <p className="text-xs text-slate-500">
            {cameraCode || "No camera"} · rotation {rotationDegrees}° · normalized [0..1]
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
            disabled={!cameraCode}
            className="h-4 w-4 rounded border-slate-300 text-blue-700"
          />
          Show all zones for {cameraCode || "camera"}
        </label>
      </div>

      <div
        className="relative w-full touch-none overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
        style={{ aspectRatio }}
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt={`Current camera frame for ${cameraCode}`}
            onLoad={(event) => {
              const width = event.currentTarget.naturalWidth;
              const height = event.currentTarget.naturalHeight;
              if (width > 0 && height > 0) setAspectRatio(width / height);
              setImageReady(true);
            }}
            onError={() => {
              setImageReady(false);
              reportImageError();
            }}
            className="absolute inset-0 h-full w-full object-fill"
          />
        )}

        {!imageReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-center text-xs text-slate-400">
            <p>{exhausted ? "Current camera frame unavailable" : "Loading current camera frame…"}</p>
            {exhausted && (
              <Button variant="secondary" size="sm" className="mt-2" onClick={retryNow}>
                Retry preview
              </Button>
            )}
          </div>
        )}

        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-label={`Editable boundary for ${zone.id}`}
          onClick={addPoint}
          onPointerMove={movePoint}
          onPointerUp={() => setDraggingPoint(null)}
          onPointerCancel={() => setDraggingPoint(null)}
        >
          {otherZones.map((item) => (
            <GeometryShape
              key={item.id}
              zone={item}
              coordinates={item.displayCoordinates}
              width={viewWidth}
              height={viewHeight}
              muted
            />
          ))}
          <GeometryShape
            zone={zone}
            coordinates={displayCoordinates}
            width={viewWidth}
            height={viewHeight}
          />
          {displayCoordinates.map((point, index) => (
            <circle
              key={index}
              cx={point.x * viewWidth}
              cy={point.y * viewHeight}
              r={selectedPoint === index ? 11 : 8}
              fill="#ffffff"
              stroke={selectedColor}
              strokeWidth="4"
              vectorEffect="non-scaling-stroke"
              className={canEdit ? "cursor-grab active:cursor-grabbing" : ""}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedPoint(index);
              }}
              onPointerDown={(event) => {
                if (!canEdit) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                setSelectedPoint(index);
                setDraggingPoint(index);
              }}
            />
          ))}
        </svg>

        <span className="absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 text-[11px] font-semibold text-white">
          {zone.id || "New zone"} · {zone.name || "Untitled zone"}
        </span>
        <span className={`absolute right-2 top-2 rounded px-2 py-1 text-[10px] font-bold text-white ${imageReady ? "bg-red-600/90" : "bg-slate-700/90"}`}>
          {imageReady ? "LIVE / CURRENT CAMERA FRAME" : "CURRENT CAMERA FRAME"}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {canEdit
            ? isFenceType(zone.type)
              ? displayCoordinates.length < 2
                ? `Click the frame to place fence endpoint ${displayCoordinates.length + 1} of 2.`
                : "Drag the two fence endpoints. ContextEngine uses this exact segment."
              : `Drag points or click the frame to add a vertex (${displayCoordinates.length}/${MAX_POLYGON_POINTS}).`
            : `${displayCoordinates.length} stored boundary points.`}
        </p>
        {canEdit && (
          <Button variant="ghost" size="sm" disabled={!canRemove} onClick={removeSelected}>
            Remove selected point
          </Button>
        )}
      </div>

      {showAll && (
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
          {Object.entries(ZONE_TYPE_COLORS).map(([label, color]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ZoneBoundaryEditor;
