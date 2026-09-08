import React from "react";
import { LayersIcon } from "../common/Icons";

const layerDefinitions = [
  { id: "cameras", label: "Cameras", default: true },
  { id: "alerts", label: "Active Alerts", default: true },
  { id: "zones", label: "Restricted Zones", default: true },
  { id: "fences", label: "Virtual Fences", default: true },
  { id: "info", label: "Informational Events", default: false },
];

/**
 * Layer visibility toggles.
 */
function MapLayers({ layers, onChange }) {
  const toggle = (id) => onChange({ ...layers, [id]: !layers[id] });
  return (
    <div className="card pointer-events-auto p-3">
      <div className="mb-2 flex items-center gap-2">
        <LayersIcon size={15} className="text-blue-700" />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Layers
        </p>
      </div>
      <ul className="space-y-2">
        {layerDefinitions.map((l) => (
          <li key={l.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!layers[l.id]}
                onChange={() => toggle(l.id)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
              />
              {l.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MapLayers;
