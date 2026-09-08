import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  cameraIcon,
  alertIcon,
  myLocationIcon,
  openReactPopup,
} from "./leafletUtils";

const ZONE_FILL = "rgba(15, 42, 79, 0.10)";
const ZONE_BORDER = "rgba(15, 42, 79, 0.55)";
const FENCE_COLOR = "#6366f1";
const GRID_SIZE = 256;

// Only pass finite, number-like coords to Leaflet. Returns a clean [lat,lng] or
// null so every record is validated before a marker/line/polygon is created.
function toLatLng(lat, lng) {
  if (lat === null || lat === undefined || lat === "" ||
      lng === null || lng === undefined || lng === "") return null;
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && la >= -90 && la <= 90 &&
    Number.isFinite(ln) && ln >= -180 && ln <= 180
    ? [la, ln]
    : null;
}

function validLatLngArr(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every(
    (point) => Array.isArray(point) && Boolean(toLatLng(point[0], point[1]))
  );
}

const GRATICULE_TILE_URL = (() => {
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  if (!canvas) return "";
  canvas.width = GRID_SIZE;
  canvas.height = GRID_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#dde6ef";
  ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15, 42, 79, 0.07)";
  ctx.beginPath();
  for (let i = GRID_SIZE / 8; i < GRID_SIZE; i += GRID_SIZE / 8) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i, GRID_SIZE);
    ctx.moveTo(0, i);
    ctx.lineTo(GRID_SIZE, i);
  }
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(15, 42, 79, 0.14)";
  ctx.beginPath();
  ctx.moveTo(GRID_SIZE / 2, 0);
  ctx.lineTo(GRID_SIZE / 2, GRID_SIZE);
  ctx.moveTo(0, GRID_SIZE / 2);
  ctx.lineTo(GRID_SIZE, GRID_SIZE / 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15, 42, 79, 0.25)";
  ctx.strokeRect(0.5, 0.5, GRID_SIZE - 1, GRID_SIZE - 1);
  return canvas.toDataURL("image/png");
})();

// Creates the Leaflet map once per mount.
export function useMapInstance(containerRef, compact = false) {
  const mapRef = useRef(null);
  const tileRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [0, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 17,
      zoomControl: !compact,
      scrollWheelZoom: !compact,
    });

    // Layer groups
    const groups = {
      sectors: L.layerGroup().addTo(map),
      zones: L.layerGroup().addTo(map),
      fences: L.layerGroup().addTo(map),
      cameras: L.layerGroup().addTo(map),
      alerts: L.layerGroup().addTo(map),
      location: L.layerGroup().addTo(map),
    };

    mapRef.current = { map, groups, markerIndex: { cameras: {}, alerts: {} } };
    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
  }, [containerRef, compact]);

  // Base light tiles.
  useEffect(() => {
    if (!mapRef.current) return;
    const { map } = mapRef.current;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const lightUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const lightAttr =
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    tileRef.current = L.tileLayer(lightUrl, {
      attribution: lightAttr,
      maxZoom: 19,
      errorTileUrl: GRATICULE_TILE_URL,
    }).addTo(map);
  }, []);

  return mapRef;
}

/**
 * Keeps the map layers in sync with props and exposes locate helpers.
 * Returns a ref to an object with locateCamera / locateAlert / locateZone.
 */
export function useBorderMapLayers({
  mapRef,
  data,
  layers,
  filters,
  selected,
  selectedRef,
  onSelect,
  renderPopup,
  location = null,
  autoFit = true,
}) {
  const apiRef = useRef({});
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!mapRef.current) return;
    const { map, groups, markerIndex } = mapRef.current;

    const sectorFilter = (sector) => filters.sector === "all" || sector === filters.sector;

    // Sectors
    groups.sectors.clearLayers();
    (data.sectors || []).forEach((s) => {
      if (!sectorFilter(s.name)) return;
      if (!validLatLngArr(s.coordinates)) return;
      try {
        L.polygon(s.coordinates, {
          color: "transparent",
          fillColor: s.color,
          fillOpacity: 1,
          weight: 0,
          interactive: false,
          className: "ibvap-sector",
        }).addTo(groups.sectors);
      } catch (e) {
        /* skip malformed sector geometry */
      }
    });

    // Zones
    groups.zones.clearLayers();
    if (layers.zones) {
      (data.zones || []).forEach((z) => {
        if (!sectorFilter(z.sector)) return;
        if (!validLatLngArr(z.coordinates)) return;
        try {
          const poly = L.polygon(z.coordinates, {
            color: ZONE_BORDER,
            weight: 1.5,
            dashArray: "6 6",
            fillColor: ZONE_FILL,
            fillOpacity: 1,
          })
            .addTo(groups.zones)
            .on("click", () => {
              onSelect({ kind: "zone", ...z });
              const popup = renderPopup?.({ kind: "zone", ...z });
              if (popup) openReactPopup(poly, popup, () => {});
            });
        } catch (e) {
          /* skip malformed zone geometry */
        }
      });
    }

    // Virtual fences
    groups.fences.clearLayers();
    if (layers.fences) {
      (data.fences || []).forEach((f) => {
        if (!validLatLngArr(f.coordinates)) return;
        try {
          const line = L.polyline(f.coordinates, {
            color: FENCE_COLOR,
            weight: 2.5,
            dashArray: "8 8",
          })
            .addTo(groups.fences)
            .on("click", () => {
              onSelect({ kind: "fence", ...f });
              const popup = renderPopup?.({ kind: "fence", ...f });
              if (popup) openReactPopup(line, popup, () => {});
            });
        } catch (e) {
          /* skip malformed fence geometry */
        }
      });
    }

    // Cameras
    groups.cameras.clearLayers();
    markerIndex.cameras = {};
    if (layers.cameras) {
      (data.cameras || []).forEach((cam) => {
        const ll = toLatLng(cam.lat, cam.lng);
        if (!ll) return;
        if (!sectorFilter(cam.sector)) return;
        const show =
          filters.status === "all" ||
          (filters.status === "online" && String(cam.status).toLowerCase() === "online") ||
          (filters.status === "offline" && String(cam.status).toLowerCase() === "offline") ||
          (filters.status === "alert" && Boolean(cam.activeAlert));
        if (!show) return;

        const m = L.marker(ll, {
          icon: cameraIcon(cam, selectedRef.current?.kind === "camera" && selectedRef.current.id === cam.id),
          title: `${cam.id} · ${cam.name}`,
          alt: `${cam.id} camera ${cam.status}`,
        })
          .addTo(groups.cameras)
          .on("click", () => {
            onSelect({ kind: "camera", ...cam });
            const popup = renderPopup?.({ kind: "camera", ...cam });
            if (popup) openReactPopup(m, popup, () => {});
          });
        markerIndex.cameras[cam.id] = m;
      });
    }

    // Alerts
    groups.alerts.clearLayers();
    markerIndex.alerts = {};
    if (layers.alerts) {
      (data.alerts || []).forEach((a) => {
        const ll = toLatLng(a.lat, a.lng);
        if (!ll) return;
        if (!sectorFilter(a.sector)) return;
        if (filters.severity !== "all" && String(a.severity).toLowerCase() !== filters.severity) return;
        const m = L.marker(ll, {
          icon: alertIcon(a, selectedRef.current?.kind === "alert" && selectedRef.current.id === a.id),
          title: `${a.id} · ${a.type}`,
          alt: `${a.id} active alert`,
        })
          .addTo(groups.alerts)
          .on("click", () => {
            onSelect({ kind: "alert", ...a });
            const popup = renderPopup?.({ kind: "alert", ...a });
            if (popup) openReactPopup(m, popup, () => {});
          });
        markerIndex.alerts[a.id] = m;
      });
    }

    groups.location.clearLayers();
    const locationLatLng = toLatLng(location?.lat, location?.lng);
    if (locationLatLng) {
      const popup = document.createElement("div");
      const title = document.createElement("p");
      title.className = "text-sm font-semibold";
      title.textContent = "My Current Location";
      const coordinates = document.createElement("p");
      coordinates.className = "mt-1 text-xs";
      coordinates.textContent = `Latitude: ${location.lat.toFixed(5)} · Longitude: ${location.lng.toFixed(5)}`;
      popup.append(title, coordinates);
      L.marker(locationLatLng, {
        icon: myLocationIcon(),
        title: "My Location",
        alt: "My Location",
        zIndexOffset: 1000,
      })
        .addTo(groups.location)
        .bindTooltip("My Location", { direction: "top", offset: [0, -10] })
        .bindPopup(popup);
    }

    const dataBounds = [];
    (data.cameras || []).forEach((item) => {
      const point = toLatLng(item.lat, item.lng);
      if (point) dataBounds.push(point);
    });
    (data.alerts || []).forEach((item) => {
      const point = toLatLng(item.lat, item.lng);
      if (point) dataBounds.push(point);
    });
    [...(data.zones || []), ...(data.fences || []), ...(data.sectors || [])]
      .forEach((item) => {
        if (validLatLngArr(item.coordinates)) dataBounds.push(...item.coordinates);
      });
    if (autoFit && !fittedRef.current && dataBounds.length > 0) {
      map.fitBounds(L.latLngBounds(dataBounds), { padding: [28, 28], maxZoom: 14 });
      fittedRef.current = true;
    } else if (autoFit && !fittedRef.current && locationLatLng) {
      map.setView(locationLatLng, 14);
      fittedRef.current = true;
    }

    apiRef.current.locateCamera = (id) => {
      const m = markerIndex.cameras[id];
      const cam = (data.cameras || []).find((c) => c.id === id);
      const ll = toLatLng(cam?.lat, cam?.lng);
      if (ll) {
        map.setView(ll, 14);
        if (m) {
          onSelect({ kind: "camera", ...cam });
          const popup = renderPopup?.({ kind: "camera", ...cam });
          if (popup) openReactPopup(m, popup, () => {});
        }
      }
    };
    apiRef.current.locateAlert = (id) => {
      const a = (data.alerts || []).find((x) => x.id === id);
      const ll = toLatLng(a?.lat, a?.lng);
      if (ll) {
        map.setView(ll, 13);
        const m = markerIndex.alerts[id];
        onSelect({ kind: "alert", ...a });
        const popup = renderPopup?.({ kind: "alert", ...a });
        if (m && popup) openReactPopup(m, popup, () => {});
      }
    };
    apiRef.current.locateZone = (id) => {
      const z = (data.zones || []).find((x) => x.id === id);
      if (z && validLatLngArr(z.coordinates)) {
        try {
          const bounds = L.latLngBounds(z.coordinates);
          map.fitBounds(bounds, { padding: [30, 30] });
          onSelect({ kind: "zone", ...z });
        } catch (e) {
          /* invalid zone bounds */
        }
      }
    };
    apiRef.current.search = (term) => {
      const q = String(term || "").trim().toLowerCase();
      if (!q) return false;
      const cam = (data.cameras || []).find(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          String(c.sector || "").toLowerCase().includes(q)
      );
      if (cam) {
        apiRef.current.locateCamera(cam.id);
        return true;
      }
      const alert = (data.alerts || []).find((a) => a.id.toLowerCase().includes(q));
      if (alert) {
        apiRef.current.locateAlert(alert.id);
        return true;
      }
      const sector = (data.cameras || []).find((c) => String(c.sector || "").toLowerCase() === q);
      const ll = toLatLng(sector?.lat, sector?.lng);
      if (sector && ll) {
        map.setView(ll, 11);
        return true;
      }
      return false;
    };
    apiRef.current.invalidate = () => map.invalidateSize();
    apiRef.current.centerOnLocation = () => {
      if (locationLatLng) map.setView(locationLatLng, 15);
    };
  }, [mapRef, data, layers, filters, selectedRef, onSelect, renderPopup, location, autoFit]);

  return apiRef;
}

export function useMapResize(containerRef, apiRef, resizeKey = null) {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apiRef.current?.invalidate?.());
    };
    const first = setTimeout(schedule, 80);
    const second = setTimeout(schedule, 260);
    const element = containerRef.current;
    const observer = element && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(schedule)
      : null;
    observer?.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(first);
      clearTimeout(second);
      observer?.disconnect();
    };
  }, [containerRef, apiRef, resizeKey]);
}

export function hasGeographicMapData(data) {
  return Boolean(
    (data.cameras || []).some((item) => toLatLng(item.lat, item.lng)) ||
    (data.alerts || []).some((item) => toLatLng(item.lat, item.lng)) ||
    [...(data.zones || []), ...(data.fences || []), ...(data.sectors || [])]
      .some((item) => validLatLngArr(item.coordinates))
  );
}
