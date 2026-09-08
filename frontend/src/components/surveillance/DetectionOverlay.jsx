import React from "react";

const kindStyle = {
  person: { border: "#a3e635", labelBg: "#4d7c0f" },
  vehicle: { border: "#38bdf8", labelBg: "#0369a1" },
};

// Fixed pseudo-positions so the overlay looks like a real detection frame.
const positions = {
  person: [
    { left: "14%", top: "22%", w: "16%", h: "34%" },
    { left: "58%", top: "30%", w: "15%", h: "30%" },
    { left: "40%", top: "40%", w: "14%", h: "24%" },
  ],
  vehicle: [
    { left: "22%", top: "55%", w: "34%", h: "18%" },
    { left: "60%", top: "58%", w: "28%", h: "15%" },
  ],
};

/**
 * Renders simple AI detection bounding boxes with object label + track id.
 * Overlay layout only; no logic is hardcoded to a camera here — detections
 * drive which boxes render.
 */
function DetectionOverlay({ detections = [], trackId = false }) {
  const personPos = positions.person;
  const vehiclePos = positions.vehicle;
  const byKind = {
    person: detections.filter((d) => d.kind === "person"),
    vehicle: detections.filter((d) => d.kind === "vehicle"),
  };

  return (
    <>
      {byKind.person.map((d, i) => {
        const pos = personPos[i % personPos.length];
        const style = kindStyle.person;
        return (
          <Box key={i} pos={pos} style={style} label="PERSON" trackId={d.trackId} showTrack={trackId} />
        );
      })}
      {byKind.vehicle.map((d, i) => {
        const pos = vehiclePos[i % vehiclePos.length];
        const style = kindStyle.vehicle;
        return (
          <Box key={i} pos={pos} style={style} label="VEHICLE" trackId={d.trackId} showTrack={trackId} />
        );
      })}
    </>
  );
}

function Box({ pos, style, label, trackId, showTrack }) {
  return (
    <div
      className="absolute"
      style={{
        left: pos.left,
        top: pos.top,
        width: pos.w,
        height: pos.h,
        border: `2px solid ${style.border}`,
      }}
      aria-hidden="true"
    >
      <span
        className="absolute -top-5 left-0 rounded-sm px-1 text-[10px] font-bold uppercase leading-4"
        style={{ backgroundColor: style.labelBg, color: "#0b1220" }}
      >
        {label}
        {showTrack && trackId != null ? ` #${trackId}` : ""}
      </span>
    </div>
  );
}

export default DetectionOverlay;
