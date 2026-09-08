import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Button from "../common/Button";
import Loader from "../common/Loader";
import { AlertTriangleIcon, MapPinIcon } from "../common/Icons";
import {
  hasGeographicMapData,
  useBorderMapLayers,
  useMapInstance,
  useMapResize,
} from "../map/useBorderMap";
import { getBorderMapData } from "../../services/mapApi";
import useCurrentLocation from "../../hooks/useCurrentLocation";
import "../map/map.css";

const LAYERS = { cameras: true, alerts: true, zones: true, fences: true, info: false };
const FILTERS = { search: "", sector: "all", status: "all", severity: "all" };
const EMPTY_DATA = { cameras: [], alerts: [], zones: [], fences: [], sectors: [] };
const NOOP = () => {};

/** Compact dashboard surface using the same Leaflet hooks and real API bundle
 * as /map. It never requests geolocation; a session-cached location is shown
 * only after the user explicitly grants it on the full map. */
function BorderMapPreview() {
  const containerRef = useRef(null);
  const selectedRef = useRef(null);
  const mapRef = useMapInstance(containerRef, true);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { location } = useCurrentLocation();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getBorderMapData()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apiRef = useBorderMapLayers({
    mapRef,
    data,
    layers: LAYERS,
    filters: FILTERS,
    selectedRef,
    onSelect: NOOP,
    renderPopup: NOOP,
    location,
  });
  useMapResize(containerRef, apiRef, loading);

  const hasMappedData = useMemo(() => hasGeographicMapData(data), [data]);

  return (
    <Card pad={false}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <MapPinIcon size={18} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">Border Zone Map</h3>
        </div>
        <Button as={Link} to="/map" variant="ghost" size="sm">
          View Full Map
        </Button>
      </div>

      <div className="p-4">
        <div className="relative h-[260px] overflow-hidden rounded-lg border border-slate-200">
          <div
            ref={containerRef}
            className="ibvap-map-container relative z-0 h-full w-full"
            role="application"
            aria-label="Border map preview"
          />

          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-50/90">
              <Loader />
            </div>
          )}
          {!loading && error && (
            <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center bg-slate-50/95 text-center">
              <AlertTriangleIcon size={24} className="text-red-500" />
              <p className="mt-2 text-xs text-slate-600">Unable to load map data.</p>
              <Button variant="ghost" size="sm" className="mt-1" onClick={load}>Retry</Button>
            </div>
          )}
          {!loading && !error && !hasMappedData && !location && (
            <div className="absolute inset-0 z-[450] flex flex-col items-center justify-center bg-slate-50/95 px-5 text-center">
              <MapPinIcon size={24} className="text-slate-400" />
              <p className="mt-2 text-xs font-semibold text-slate-700">
                No mapped cameras or zones available.
              </p>
              {(data.cameras.length > 0 || data.alerts.length > 0) && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {data.cameras.length} cameras and {data.alerts.length} active alerts loaded without geographic coordinates.
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-500">Open the full map to show your location.</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default BorderMapPreview;
