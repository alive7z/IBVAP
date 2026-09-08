import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Button from "../common/Button";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import AlertStatusBadge from "../alerts/AlertStatusBadge";
import { AlertTriangleIcon } from "../common/Icons";

/**
 * Links an event to its real alert. Alert workflow actions intentionally live
 * only in the Alerts section.
 */
function RelatedAlert({ event, alert }) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangleIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Associated Alert</h3>
      </div>
      {event.relatedAlertId ? (
        <div>
          <div className="mt-2 space-y-3">
            {alert ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-500">Alert ID:</span>
                  <Link
                    to={`/alerts/${alert.id}`}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {alert.id}
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Severity:</span>
                  <AlertSeverityBadge severity={alert.severity} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Status:</span>
                  <AlertStatusBadge status={alert.status} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Alert {event.relatedAlertId} — details on the Alerts page.
              </p>
            )}
            <Button as={Link} to={`/alerts/${event.relatedAlertId}`} variant="secondary" size="sm">
              View Alert
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No alert generated for this event.
        </p>
      )}
    </Card>
  );
}

export default RelatedAlert;
