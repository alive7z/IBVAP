import React from "react";

function Card({ label, value }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

/**
 * Top summary row for the intelligence workspace.
 */
function IntelligenceSummary({ summary, loading = false, error = false }) {
  const value = (key) => (loading || error || !summary ? "—" : summary[key]);
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card label="ANPR Events Today" value={value("anprToday")} />
      <Card label="Face Detections Today" value={value("faceDetectionsToday")} />
      <Card label="Vehicle Events Today" value={value("vehicleEventsToday")} />
      <Card label="Active Cameras" value={value("activeCameras")} />
    </div>
  );
}

export default IntelligenceSummary;
