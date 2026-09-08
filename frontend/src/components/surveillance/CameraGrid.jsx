import React from "react";
import CameraCard from "./CameraCard";
import Loader from "../common/Loader";
import Button from "../common/Button";
import { CameraIcon } from "../common/Icons";

/**
 * Responsive grid of camera cards with loading / error / empty states.
 */
function CameraGrid({ cameras, loading, error, onRetry }) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader label="Loading cameras..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
        <CameraIcon size={28} className="text-slate-300" />
        <p className="text-sm font-medium text-slate-700">
          Unable to load camera feeds.
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!cameras.length) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
        <CameraIcon size={28} className="text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">No cameras found</p>
        <p className="text-sm text-slate-500">
          Try changing your filters or search query.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cameras.map((camera) => (
        <CameraCard key={camera.id} camera={camera} />
      ))}
    </div>
  );
}

export default CameraGrid;
