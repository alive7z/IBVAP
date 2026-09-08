import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Badge from "../common/Badge";
import Button from "../common/Button";
import { CameraIcon } from "../common/Icons";

/**
 * Compact camera reference with a live-camera link.
 */
function CameraLink({ camera, event }) {
  const cameraCode = event?.cameraId || event?.camera || null;
  const name =
    (camera && camera.name) || event?.cameraName || "—";
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <CameraIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Camera</h3>
      </div>
      <p className="text-base font-bold text-blue-700">{cameraCode || "—"}</p>
      <p className="text-sm text-slate-500">{name}</p>
      <div className="mt-2">
        <Badge tone={camera?.status === "online" ? "online" : "offline"}>
          {camera?.status || "Unavailable"}
        </Badge>
      </div>
      {cameraCode && (
        <Button
          as={Link}
          to={`/surveillance/${cameraCode}`}
          variant="secondary"
          size="sm"
          className="mt-4"
        >
          View Live Camera
        </Button>
      )}
    </Card>
  );
}

export default CameraLink;
