import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import Card from "../components/common/Card";
import StatusIndicator from "../components/common/StatusIndicator";
import { AlertTriangleIcon, MapPinIcon, RefreshIcon } from "../components/common/Icons";
import MapFilters from "../components/map/MapFilters";
import MapControls from "../components/map/MapControls";
import MapLegend from "../components/map/MapLegend";
import MapLayers from "../components/map/MapLayers";
import ActiveAlertsPanel from "../components/map/ActiveAlertsPanel";
import SelectedMapItem from "../components/map/SelectedMapItem";
import CameraPopup from "../components/map/CameraPopup";
import AlertPopup from "../components/map/AlertPopup";
import ZonePopup from "../components/map/ZonePopup";
import FencePopup from "../components/map/FencePopup";
import {
  hasGeographicMapData,
  useMapInstance,
  useBorderMapLayers,
  useMapResize,
} from "../components/map/useBorderMap";
import { getBorderMapData } from "../services/mapApi";
import useCurrentLocation from "../hooks/useCurrentLocation";
import { useRealtime } from "../context/RealtimeContext";
import { SOCKET_EVENTS } from "../services/websocket";
import "../components/map/map.css";

const DEFAULT_FILTERS = { search: "", sector: "all", status: "all", severity: "all" };
const DEFAULT_LAYERS = { cameras: true, alerts: true, zones: true, fences: true, info: false };

function SummaryCard({ label, value, tone, children }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {children}
      </div>
      <p className={`mt-1.5 text-2xl font-bold ${tone || "text-slate-900"}`}>{value}</p>
    </Card>
  );
}

function BorderMap() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const mapRef = useMapInstance(containerRef);

  const [data, setData] = useState({ cameras: [], alerts: [], zones: [], fences: [], sectors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [selected, setSelected] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { location, status: locationStatus, message: locationMessage, requestLocation } =
    useCurrentLocation();

  const selectedRef = useRef(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    getBorderMapData()
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { subscribe } = useRealtime();

  // Realtime: refresh map markers/data without recreating the Leaflet map.
  // useBorderMapLayers re-syncs layer groups whenever `data` changes identity,
  // so we patch the arrays immutably. Records without explicit geographic
  // coordinates never become map markers.
  useEffect(() => {
    const patchAlert = (payload) => {
      const id = payload?.data?.id ?? payload?.data?.alertCode;
      if (!id || !payload?.data?.status) return;
      setData((prev) => ({
        ...prev,
        alerts: ["NEW", "ACTIVE"].includes(String(payload.data.status).toUpperCase())
          ? (prev.alerts || []).map((a) =>
              a.id === id ? { ...a, status: payload.data.status } : a
            )
          : (prev.alerts || []).filter((a) => a.id !== id),
      }));
    };
    const addAlert = (payload) => {
      const d = payload?.data;
      const id = d?.id ?? d?.alertCode;
      if (!id) return;
      const la = Number(d?.lat);
      const ln = Number(d?.lng);
      // Only add a marker if a finite coordinate is present (never invent one).
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      setData((prev) => {
        if ((prev.alerts || []).some((a) => a.id === id)) return prev;
        return {
          ...prev,
          alerts: [
            {
              id,
              type: d.type || "Alert",
              severity: d.severity || "medium",
              status: d.status || "NEW",
              lat: la,
              lng: ln,
              sector: d.sector || null,
            },
            ...(prev.alerts || []),
          ],
        };
      });
    };
    const patchCamera = (payload) => {
      const id = payload?.data?.id ?? payload?.data?.cameraCode;
      if (!id) return;
      const d = payload?.data;
      setData((prev) => ({
        ...prev,
        cameras: (prev.cameras || []).map((c) => {
          if (c.id !== id) return c;
          const next = { ...c };
          if (d?.status) next.status = d.status;
          if (d?.streamStatus) next.status = d.streamStatus.toLowerCase();
          if (d?.activeAlert !== undefined) next.activeAlert = d.activeAlert;
          return next;
        }),
      }));
    };

    const offs = [
      subscribe(SOCKET_EVENTS.ALERT_NEW, addAlert),
      subscribe(SOCKET_EVENTS.ALERT_UPDATED, patchAlert),
      subscribe(SOCKET_EVENTS.ALERT_ACKNOWLEDGED, patchAlert),
      subscribe(SOCKET_EVENTS.ALERT_RESOLVED, patchAlert),
      subscribe(SOCKET_EVENTS.CAMERA_STATUS, patchCamera),
      subscribe(SOCKET_EVENTS.CAMERA_UPDATED, patchCamera),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe]);

  const handleSelect = useCallback((item) => {
    setSelected(item);
  }, []);

  const renderPopup = useCallback(
    (item) => {
      if (!item) return null;
      if (item.kind === "camera")
        return (
          <CameraPopup
            camera={item}
            onViewCamera={() => navigate(`/surveillance/${item.id}`)}
            onViewEvents={() => navigate("/events")}
          />
        );
      if (item.kind === "alert")
        return <AlertPopup alert={item} onViewAlert={() => navigate(`/alerts/${item.id}`)} />;
      if (item.kind === "zone") return <ZonePopup zone={item} />;
      if (item.kind === "fence") return <FencePopup fence={item} />;
      return null;
    },
    [navigate]
  );

  const apiRef = useBorderMapLayers({
    mapRef,
    data,
    layers,
    filters,
    selectedRef,
    onSelect: handleSelect,
    renderPopup,
    location,
  });

  useMapResize(containerRef, apiRef, `${fullscreen}:${loading}`);

  useEffect(() => {
    if (locationStatus !== "granted" || !location) return;
    const frame = requestAnimationFrame(() => apiRef.current?.centerOnLocation?.());
    return () => cancelAnimationFrame(frame);
  }, [apiRef, location, locationStatus]);

  const sectors = useMemo(() => {
    const s = new Set();
    data.cameras.forEach((c) => s.add(c.sector));
    data.alerts.forEach((a) => s.add(a.sector));
    return Array.from(s).filter(Boolean);
  }, [data]);

  const summary = useMemo(() => {
    const online = data.cameras.filter((c) => String(c.status).toLowerCase() === "online").length;
    const alerts = data.alerts.length;
    const zones = data.zones.length;
    const highRisk = data.zones.filter((z) => String(z.riskLevel).toLowerCase() === "high").length;
    return { online, total: data.cameras.length, alerts, zones, highRisk };
  }, [data]);

  const handleSearch = (term) => {
    const t = term.trim();
    if (!t) return;
    apiRef.current.search?.(t);
  };

  const toggleFullscreen = useCallback(() => {
    setFullscreen((f) => !f);
  }, []);

  const hasMappedData = useMemo(() => hasGeographicMapData(data), [data]);

  const aside = (
    <aside className={`flex w-full min-w-0 flex-col gap-4 ${fullscreen ? "min-h-0" : "lg:w-[300px]"}`}>
      <ActiveAlertsPanel
        alerts={data.alerts}
        selectedId={selected?.kind === "alert" ? selected.id : null}
        onSelect={(a) => {
          if (apiRef.current.locateAlert) apiRef.current.locateAlert(a.id);
          else handleSelect({ kind: "alert", ...a });
        }}
        className={fullscreen ? "min-h-0 flex-1" : ""}
      />
      <div className={fullscreen ? "shrink-0" : ""}>
        <SelectedMapItem
          item={selected}
          onClose={() => setSelected(null)}
          actions={{
            onViewCamera: (id) => navigate(`/surveillance/${id}`),
            onViewEvents: () => navigate("/events"),
            onViewAlert: (id) => navigate(`/alerts/${id}`),
          }}
        />
      </div>
    </aside>
  );

  const mapArea = (
    <div className={`relative min-w-0 ${fullscreen ? "flex w-full min-h-0 flex-col" : "flex-1"}`}>
      <div className={`mb-3 ${fullscreen ? "shrink-0" : ""}`}>
        <MapFilters
          filters={filters}
          onChange={setFilters}
          sectors={sectors}
          onSearch={handleSearch}
          actions={
            <MapControls
              onRefresh={loadData}
              fullscreen={fullscreen}
              onToggleFullscreen={toggleFullscreen}
              onShowLocation={requestLocation}
              locationLoading={locationStatus === "loading"}
            />
          }
        />
      </div>
      {locationMessage && (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-xs ${
            locationStatus === "loading"
              ? "bg-blue-50 text-blue-700"
              : "bg-amber-50 text-amber-800"
          }`}
          role="status"
        >
          {locationMessage}
        </p>
      )}
      <div className={`relative ${fullscreen ? "min-h-0 lg:flex-1" : ""}`}>
        <div
          ref={containerRef}
          className={`ibvap-map-container relative z-0 w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm ${fullscreen ? "h-[60vh] lg:h-full" : "h-[540px]"}`}
          role="application"
          aria-label="Surveillance border map"
        />

        {(loading || error) && (
          <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-50/90 backdrop-blur-sm">
            {loading ? (
              <>
                <Loader />
                <p className="text-sm text-slate-500">Loading surveillance map...</p>
              </>
            ) : (
              <>
                <AlertTriangleIcon size={28} className="text-red-500" />
                <p className="text-sm text-slate-600">Unable to load map data.</p>
                <Button variant="secondary" size="sm" onClick={loadData}>
                  <RefreshIcon size={15} /> Retry
                </Button>
              </>
            )}
          </div>
        )}
        {!loading && !error && !hasMappedData && !location && (
          <div className="absolute inset-0 z-[450] flex flex-col items-center justify-center rounded-xl bg-slate-50/90 px-6 text-center backdrop-blur-sm">
            <MapPinIcon size={28} className="text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-slate-700">
              No mapped cameras or zones available.
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Camera-frame boundaries are kept out of this geographic map.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={requestLocation}
              loading={locationStatus === "loading"}
            >
              {locationStatus === "loading" ? "Getting location..." : "Show My Location"}
            </Button>
          </div>
        )}
      </div>
      {!loading && !error && (
        <>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400]">
            <MapLegend />
          </div>
          <div className="pointer-events-none absolute bottom-14 right-3 z-[400]">
            <MapLayers layers={layers} onChange={setLayers} />
          </div>
        </>
      )}
    </div>
  );

  const body = fullscreen ? (
    <div className="flex-1 min-h-0 grid w-full min-w-0 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] lg:p-5">
      {mapArea}
      {aside}
    </div>
  ) : (
    <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row">
      {mapArea}
      {aside}
    </div>
  );

  return (
    <div className={fullscreen ? "ibvap-map-expanded" : "space-y-5"}>
      {!fullscreen && (
        <PageHeader title="Border Map" subtitle="Operational map of cameras, active alerts, zones and virtual fences">
          <Button variant="secondary" size="sm" onClick={loadData} aria-label="Refresh map data">
            <RefreshIcon size={15} /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen} aria-label="Toggle full screen map">
            {fullscreen ? "Exit Full Screen" : "Full Screen"}
          </Button>
        </PageHeader>
      )}

      {!fullscreen && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Cameras Online" value={`${summary.online} / ${summary.total}`} tone={summary.online ? "text-green-600" : "text-red-600"}>
            <StatusIndicator status={summary.online ? "success" : "offline"} pulse={false} />
          </SummaryCard>
          <SummaryCard label="Active Alerts" value={summary.alerts} tone={summary.alerts ? "text-red-600" : "text-slate-900"} />
          <SummaryCard label="Monitored Zones" value={summary.zones} />
          <SummaryCard label="High-Risk Sectors" value={summary.highRisk} tone="text-orange-600" />
        </div>
      )}

      {body}
    </div>
  );
}

export default BorderMap;
