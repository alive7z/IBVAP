import React from "react";
import PageHeader from "../common/PageHeader";
import { InfoIcon } from "../common/Icons";

/**
 * Temporary stand-in for pages not built yet. Shows what the page will
 * contain so navigation stays complete.
 */
function PlaceholderPage({ title, subtitle, planned }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card flex flex-col items-start gap-4 p-8">
        <div className="flex items-center gap-2 text-slate-600">
          <InfoIcon size={18} className="text-blue-700" />
          <span className="text-sm font-medium">
            This page is planned. Final content coming after approval.
          </span>
        </div>
        <p className="text-sm text-slate-500">
          Planned sections include:{" "}
          <span className="font-medium text-slate-700">{planned}</span>
        </p>
      </div>
    </div>
  );
}

export default PlaceholderPage;
