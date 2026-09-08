import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Badge from "../common/Badge";
import Button from "../common/Button";
import Loader from "../common/Loader";
import EmptyState from "../common/EmptyState";
import { BellIcon } from "../common/Icons";
import { getAlerts } from "../../services/alertApi";
import { severityTone, statusTone } from "../../utils/severity";
import { relativeTime } from "../../utils/date";
import { useRealtime } from "../../context/RealtimeContext";
import { fromSocketAlert } from "../../services/alertApi";
import { SOCKET_EVENTS } from "../../services/websocket";
import { upsertByKey, patchByKey } from "../../utils/realtime";

/**
 * Recent alerts table shown on the dashboard overview.
 * Backed by the real alerts API + realtime alert updates.
 */
function RecentAlerts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let active = true;
    getAlerts({ limit: 6 })
      .then((res) => active && setAlerts(res.data || []))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const { subscribe } = useRealtime();

  useEffect(() => {
    const applyAlert = (payload) => {
      const item = fromSocketAlert(payload?.data);
      if (!item?.id) return;
      setAlerts((prev) => {
        const next = upsertByKey(prev, item, "id");
        return next.length > 6 ? next.slice(0, 6) : next;
      });
    };
    const markStatus = (payload) => {
      const item = fromSocketAlert(payload?.data);
      if (!item?.id) return;
      setAlerts((prev) => patchByKey(prev, "id", item.id, { status: item.status }));
    };

    const offs = [
      subscribe(SOCKET_EVENTS.ALERT_NEW, applyAlert),
      subscribe(SOCKET_EVENTS.ALERT_UPDATED, applyAlert),
      subscribe(SOCKET_EVENTS.ALERT_ACKNOWLEDGED, markStatus),
      subscribe(SOCKET_EVENTS.ALERT_RESOLVED, markStatus),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe]);

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-800">Recent Alerts</h3>
        <Link
          to="/alerts"
          className="btn-focus text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          View all
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader />
        </div>
      ) : error ? (
        <EmptyState
          icon={<BellIcon size={22} />}
          tone="error"
          title="Could not load alerts"
          description="The alerts service is currently unavailable. Try again shortly."
        />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={22} />}
          title="No alerts yet"
          description="Recent alerts will appear here once detected."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Alert ID</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Camera</th>
                <th className="px-5 py-3">Zone</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-5 py-3 font-medium text-blue-700">{a.id}</td>
                  <td className="px-5 py-3 text-slate-700">{a.type}</td>
                  <td className="px-5 py-3 text-slate-600">{a.camera}</td>
                  <td className="px-5 py-3 text-slate-600">{a.zone || "—"}</td>
                  <td className="px-5 py-3">
                    <Badge
                      tone={severityTone[(a.severity || "").toLowerCase()]}
                      dot
                    >
                      {(a.severity || "").toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                    {relativeTime(a.time)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone[a.status] || "default"}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button as={Link} to={`/alerts`} variant="secondary" size="sm">
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default RecentAlerts;
