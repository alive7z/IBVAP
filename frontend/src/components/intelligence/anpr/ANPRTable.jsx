import React from "react";
import ConfidenceBadge from "../ConfidenceBadge";
import { formatTime } from "../../../utils/date";

function ActionButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-focus inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      View
    </button>
  );
}

/**
 * ANPR table (desktop) + stacked cards (mobile).
 */
function ANPRTable({ events, onView }) {
  return (
    <>
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Plate Number</th>
                <th className="px-5 py-3">Vehicle Type</th>
                <th className="px-5 py-3">Camera</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">OCR Confidence</th>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-blue-700">{e.plateNumber}</td>
                  <td className="px-5 py-3 text-slate-700">{e.vehicleType || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{e.cameraId || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{e.location || "—"}</td>
                  <td className="px-5 py-3">
                    <ConfidenceBadge value={e.confidence} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                    {formatTime(e.timestamp)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ActionButton onClick={() => onView(e)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {events.map((e) => (
          <div key={e.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-blue-700">{e.plateNumber}</p>
                <p className="text-sm text-slate-700">
                  {e.vehicleType || "—"} · {e.cameraId || "—"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {e.location || "—"} · {formatTime(e.timestamp)}
                </p>
              </div>
              <ConfidenceBadge value={e.confidence} />
            </div>
            <button
              type="button"
              onClick={() => onView(e)}
              className="btn-focus mt-3 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default ANPRTable;
