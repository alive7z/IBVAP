import React from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import { ImageIcon, PlayIcon } from "../common/Icons";
import { formatDateTime } from "../../utils/date";

/**
 * Related evidence panel (snapshot + incident clip metadata). No RTSP
 * credentials are exposed; clip playback is a placeholder.
 */
function RelatedEvidence({ alert }) {
  const ev = alert.evidence || {};
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ImageIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Related Evidence</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex h-16 items-center justify-center rounded-md bg-slate-100 text-slate-400">
            <ImageIcon size={22} />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600">Snapshot</p>
          <p className="text-xs text-slate-400">{ev.id || "EVD-00000"}</p>
          <Button variant="secondary" size="sm" className="mt-2 w-full">
            View
          </Button>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex h-16 items-center justify-center rounded-md bg-slate-100 text-slate-400">
            <PlayIcon size={22} />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600">Incident Clip</p>
          <p className="text-xs text-slate-400">00:12</p>
          <Button variant="secondary" size="sm" className="mt-2 w-full">
            Play
          </Button>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex justify-between">
          <dt>Evidence ID</dt>
          <dd className="font-medium text-slate-700">{ev.id || "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Captured At</dt>
          <dd className="font-medium text-slate-700">
            {formatDateTime(ev.capturedAt)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Camera</dt>
          <dd className="font-medium text-slate-700">
            {ev.camera || alert.camera}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export default RelatedEvidence;
