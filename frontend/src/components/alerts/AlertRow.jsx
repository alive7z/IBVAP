import React from "react";
import { Link } from "react-router-dom";
import AlertSeverityBadge from "./AlertSeverityBadge";
import AlertStatusBadge from "./AlertStatusBadge";
import RiskScoreBar from "./RiskScoreBar";
import Button from "../common/Button";
import AcknowledgeAlertButton from "./AcknowledgeAlertButton";
import { TrashIcon } from "../common/Icons";
import { formatDateTime, formatTime } from "../../utils/date";

/**
 * Single row in the alerts table. Whole row is clickable and also has a
 * focused View link for keyboard users.
 */
function AlertRow({ alert, canDelete = false, onDelete, onAlertAcknowledged }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-5 py-3">
        <AlertSeverityBadge severity={alert.severity} />
      </td>
      <td className="px-5 py-3">
        <Link
          to={`/alerts/${alert.id}`}
          className="font-medium text-blue-700 hover:underline"
        >
          {alert.id}
        </Link>
      </td>
      <td className="px-5 py-3 text-slate-700">{alert.eventType}</td>
      <td className="px-5 py-3 text-slate-600">{alert.camera}</td>
      <td className="px-5 py-3 text-slate-600">{alert.cameraName}</td>
      <td className="px-5 py-3">
        <RiskScoreBar score={alert.riskScore} />
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
        {formatTime(alert.timestamp)}
      </td>
      <td className="px-5 py-3">
        <AlertStatusBadge status={alert.status} />
        {alert.acknowledgedBy && (
          <p className="mt-1 max-w-44 text-xs text-slate-500">
            {alert.acknowledgedBy} · {formatDateTime(alert.acknowledgedAt)}
          </p>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <AcknowledgeAlertButton
            alert={alert}
            onAcknowledged={onAlertAcknowledged}
          />
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDelete(alert)}
              aria-label={`Delete alert ${alert.id}`}
            >
              <TrashIcon size={14} />
            </Button>
          )}
          <Link
            to={`/alerts/${alert.id}`}
            className="btn-focus inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            View
          </Link>
        </div>
      </td>
    </tr>
  );
}

export default AlertRow;
