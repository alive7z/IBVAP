import L from "leaflet";
import React from "react";
import { createRoot } from "react-dom/client";

// Map camera status -> marker modifier class.
export function cameraStatusClass(camera) {
  const status = String(camera.status || "").toLowerCase();
  const hasActiveAlert = Boolean(camera.activeAlert);
  if (status === "offline") return "ibvap-marker--offline";
  if (hasActiveAlert) return "ibvap-marker--alert";
  const risk = String(camera.risk || "").toLowerCase();
  if (risk === "high" || risk === "medium" || risk === "warning")
    return "ibvap-marker--warning";
  return "ibvap-marker--online";
}

// Builds a divIcon camera marker with a status-colored pin.
export function cameraIcon(camera, selected) {
  const cls = cameraStatusClass(camera);
  const sel = selected ? " ibvap-marker--selected" : "";
  return L.divIcon({
    className: `ibvap-marker ${cls}${sel}`,
    html: `<span class="ibvap-marker__pin" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -26],
    tooltipAnchor: [0, -20],
  });
}

// Builds a divIcon alert marker. Severity drives the color class.
export function alertIcon(alert, selected) {
  const sev = String(alert.severity || "medium").toLowerCase();
  const sel = selected ? " ibvap-alert-marker--selected" : "";
  return L.divIcon({
    className: `ibvap-alert-marker ibvap-alert-marker--${sev}${sel}`,
    html: `<span class="ibvap-alert-marker__dot" role="img" aria-label="Active alert ${String(
      alert.severity || ""
    ).toUpperCase()}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
    tooltipAnchor: [0, -12],
  });
}

// Browser-only device position. Deliberately distinct from camera and alert
// markers so it cannot be mistaken for operational infrastructure.
export function myLocationIcon() {
  return L.divIcon({
    className: "ibvap-my-location",
    html: '<span class="ibvap-my-location__pulse" aria-hidden="true"></span><span class="ibvap-my-location__dot" aria-hidden="true"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

// Render a React element into a Leaflet popup attached to `layer`, calling
// onFrameUpdate when the popup is closed so the page can clear its selection.
// Works for both markers (getLatLng) and shapes such as polygons/lines
// (getCenter).
export function openReactPopup(layer, element, onClose) {
  const div = document.createElement("div");
  const latlng = layer.getLatLng ? layer.getLatLng() : layer.getCenter ? layer.getCenter() : null;
  if (!latlng) return;
  const popup = L.popup({ minWidth: 240, maxWidth: 320, offset: [0, -12] })
    .setLatLng(latlng)
    .setContent(div);

  const root = createRoot(div);
  const render = () => root.render(element);
  render();

  const onCloseHandler = () => {
    onClose?.();
    // Defer unmount so we never unmount synchronously in the middle of a
    // React render (e.g. when navigating away with an open popup).
    setTimeout(() => {
      if (root) {
        try {
          root.unmount();
        } catch (e) {
          /* already unmounted */
        }
      }
    }, 0);
  };

  popup.on("remove", onCloseHandler);
  layer.bindPopup(popup);
  layer.openPopup();
}
