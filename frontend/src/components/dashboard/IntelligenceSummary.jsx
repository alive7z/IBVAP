import React, { useEffect, useState } from "react";
import Card from "../common/Card";
import Loader from "../common/Loader";
import { BrainIcon, FileTextIcon, UserIcon, VideoIcon } from "../common/Icons";
import { getANPREvents } from "../../services/intelligenceApi";

const config = {
  "ANPR Events": FileTextIcon,
  "Face Detections": UserIcon,
  "Vehicle Events": VideoIcon,
};

/**
 * Intelligence summary mini-cards. ANPR is backed by the real plates API.
 * Face and Vehicle detections remain placeholders: no such backend ML
 * pipeline exists in this build, so they are shown as not-yet-available
 * rather than fabricated.
 */
function IntelligenceSummary() {
  const [loading, setLoading] = useState(true);
  const [anpr, setAnpr] = useState(null);

  useEffect(() => {
    let active = true;
    getANPREvents({ limit: 1 })
      .then((res) => active && setAnpr(res.meta?.total ?? 0))
      .catch(() => active && setAnpr(0))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const items = [
    { label: "ANPR Events", value: anpr, color: "blue" },
    { label: "Face Detections", value: 0, color: "info" },
    { label: "Vehicle Events", value: 0, color: "success" },
  ];

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <BrainIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">
          Intelligence Summary
        </h3>
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader />
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const Icon = config[item.label] || FileTextIcon;
            const color =
              item.color === "blue"
                ? "text-blue-700 bg-blue-50"
                : item.color === "info"
                ? "text-blue-600 bg-blue-50"
                : "text-green-700 bg-green-50";
            return (
              <div key={item.label} className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-xl font-bold text-slate-900">{item.value}</p>
                  <p className="text-xs text-slate-500">{item.label}</p>
                </div>
              </div>
            );
          })}
          <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            Face and Vehicle detections are placeholders — the AI/ML pipelines
            are not part of this build. ANPR reflects live plate detections.
          </p>
        </div>
      )}
    </Card>
  );
}

export default IntelligenceSummary;
