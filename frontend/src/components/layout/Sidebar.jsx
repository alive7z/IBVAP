import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboardIcon,
  VideoIcon,
  BellIcon,
  FileTextIcon,
  BrainIcon,
  MapPinIcon,
  BarChartIcon,
  SettingsIcon,
  XIcon,
  HeartPulseIcon,
  ExternalLinkIcon,
  MenuIcon,
  ChevronLeftIcon,
} from "../common/Icons";
import Tooltip from "../common/Tooltip";
import Logo from "../common/Logo";
import { getAlertsSummary } from "../../services/alertApi";
import { getSystemStatus } from "../../services/cameraApi";
import { useAuth } from "../../hooks/useAuth";
import { useRealtime } from "../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../services/websocket";

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  {
    to: "/surveillance",
    label: "Live Surveillance",
    icon: VideoIcon,
    badge: "LIVE",
  },
  { to: "/alerts", label: "Alerts", icon: BellIcon },
  { to: "/events", label: "Events", icon: FileTextIcon },
  { to: "/intelligence", label: "Intelligence", icon: BrainIcon },
  { to: "/map", label: "Border Map", icon: MapPinIcon },
  { to: "/analytics", label: "Analytics", icon: BarChartIcon },
];

const toneDot = {
  Healthy: "bg-success",
  Online: "bg-success",
  Connected: "bg-success",
  Warning: "bg-warning",
  Offline: "bg-danger",
  Unknown: "bg-slate-400",
  HEALTHY: "bg-success",
  DEGRADED: "bg-warning",
  OFFLINE: "bg-danger",
  UNKNOWN: "bg-slate-400",
};

function NavItem({ item, collapsed }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `btn-focus group relative flex h-11 items-center transition-all duration-200 ${
          collapsed
            ? "mx-auto w-10 justify-center rounded-lg"
            : "w-full gap-3 rounded-lg px-3"
        } ${
          isActive
            ? "bg-blue-600 text-white shadow-md hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
            : "text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-300"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="shrink-0 transition-transform duration-150">
            <Icon size={18} />
          </span>
          <span
            aria-hidden={collapsed}
            className={`overflow-hidden whitespace-nowrap text-left text-[15px] font-medium transition-[max-width,opacity] duration-[180ms] ease-in-out ${
              collapsed
                ? "max-w-0 opacity-0"
                : "max-w-[300px] flex-1 opacity-100 delay-100"
            }`}
          >
            {item.label}
          </span>
          {!collapsed &&
            item.badge &&
            (item.badge === "LIVE" ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-300">
                {item.badge}
              </span>
            ) : (
              <span className="inline-flex min-w-[20px] shrink-0 items-center justify-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                {item.badge}
              </span>
            ))}
          {collapsed && item.badge === "LIVE" && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          {collapsed && item.badge && item.badge !== "LIVE" && (
            <span className="absolute right-0.5 top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;
  return (
    <Tooltip
      className="flex w-full justify-center"
      label={item.label}
      side="right"
    >
      {link}
    </Tooltip>
  );
}

function SystemStatusCard({ onNavigate, collapsed }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const [status, setStatus] = useState({
    onlineCams: null,
    totalCams: null,
    healthRows: [],
  });

  useEffect(() => {
    let active = true;
    getSystemStatus()
      .then((health) => {
        if (!active) return;
        const h = health.data || {};
        const cameras = h.cameras?.recordedState || {};
        setStatus({
          onlineCams: cameras.online ?? null,
          totalCams: cameras.total ?? null,
          healthRows: [
            { name: "Backend API", status: h.backend || "UNKNOWN" },
            { name: "SQL Database", status: h.database || "UNKNOWN" },
            { name: "AI Engine", status: h.aiEngine || "UNKNOWN" },
            { name: "Socket.IO", status: h.socketIo || "UNKNOWN" },
          ],
        });
      })
      .catch(
        () =>
          active && setStatus({ onlineCams: null, totalCams: null, healthRows: [] }),
      );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const { onlineCams, totalCams, healthRows } = status;
  const overallStatus = healthRows.length === 0
    ? "UNKNOWN"
    : healthRows.some((r) => r.status === "OFFLINE")
      ? "OFFLINE"
      : healthRows.some((r) => r.status === "DEGRADED")
        ? "DEGRADED"
        : healthRows.every((r) => r.status === "HEALTHY")
          ? "HEALTHY"
          : "UNKNOWN";
  const overallLabel = overallStatus === "HEALTHY" ? "Systems Healthy" : overallStatus === "DEGRADED" ? "Systems Degraded" : overallStatus === "OFFLINE" ? "Service Offline" : "Health Unknown";
  const overallDot = toneDot[overallStatus];

  const button = collapsed ? (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="System health"
      className="btn-focus mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 transition-colors hover:bg-slate-100 dark:border-[#243247] dark:hover:bg-[#111C2C]"
    >
      <span className="relative flex h-3 w-3">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${overallDot} opacity-60 dark:opacity-50`} />
        <span className={`relative inline-flex h-3 w-3 rounded-full ${overallDot}`} />
      </span>
      <span className="sr-only">{overallLabel}</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-haspopup="dialog"
      className="btn-focus card-hover w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-[#243247] dark:bg-[#111C2C]"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${overallDot} opacity-60 dark:opacity-50`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${overallDot}`} />
        </span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {overallLabel}
        </span>
        <span className="ml-auto text-slate-400">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Tap to view system status
      </p>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      {collapsed ? (
        <Tooltip
          className="block w-full"
          side="right"
          label={
            <span className="flex flex-col items-start">
              <span className="block">{overallLabel}</span>
              <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                View system status
              </span>
            </span>
          }
        >
          {button}
        </Tooltip>
      ) : (
        button
      )}

      {open && (
        <div
          role="dialog"
          aria-label="System health"
          className="absolute bottom-0 left-full z-50 mb-0 ml-2 w-72 animate-[expandDown_0.2s_ease-out] origin-bottom-left overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
            <HeartPulseIcon
              size={16}
              className="text-blue-700 dark:text-blue-500"
            />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              System Health
            </p>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            <div className="mb-1 flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                Camera Streams
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {totalCams === null
                  ? "Loading…"
                  : `${onlineCams} / ${totalCams} Online`}
              </span>
            </div>
            {healthRows.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-slate-400">Loading…</div>
            ) : (
              healthRows.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/10"
                >
                  <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${toneDot[s.status] || toneDot.Unknown}`}
                      aria-hidden="true"
                    />
                    {s.name}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      s.status === "HEALTHY"
                        ? "text-success dark:text-green-400"
                        : s.status === "DEGRADED"
                          ? "text-warning"
                          : s.status === "OFFLINE"
                            ? "text-danger"
                            : "text-slate-500"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
              navigate("/analytics");
            }}
            className="btn-focus flex w-full items-center gap-2 border-t border-slate-200 px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-slate-800 dark:text-blue-500 dark:hover:bg-white/10"
          >
            <ExternalLinkIcon size={15} /> View System Health
          </button>
        </div>
      )}
    </div>
  );
}

export function SidebarContent({
  onNavigate,
  showClose,
  onClose,
  collapsed,
  onToggleCollapse,
}) {
  const [alertBadge, setAlertBadge] = useState("0");
  const { user } = useAuth();
  const { subscribe } = useRealtime();

  const loadBadge = React.useCallback(() => {
    let active = true;
    getAlertsSummary()
      .then((res) => {
        if (!active) return;
        setAlertBadge(String(res.data?.totalActive ?? "—"));
      })
      .catch(() => active && setAlertBadge("—"));
    return () => { active = false; };
  }, []);

  useEffect(loadBadge, [loadBadge]);
  useEffect(() => {
    const refresh = () => loadBadge();
    const offs = [SOCKET_EVENTS.ALERT_NEW, SOCKET_EVENTS.ALERT_UPDATED, SOCKET_EVENTS.ALERT_ACKNOWLEDGED, SOCKET_EVENTS.ALERT_RESOLVED].map((event) => subscribe(event, refresh));
    return () => offs.forEach((off) => off());
  }, [subscribe, loadBadge]);

  const roleItem = user?.roleKey === "ADMINISTRATOR"
    ? { to: "/admin", label: "Admin", icon: SettingsIcon }
    : user?.roleKey === "SECURITY_OPERATOR"
      ? { to: "/operator", label: "My Operations", icon: SettingsIcon }
      : null;
  const items = [...navItems, ...(roleItem ? [roleItem] : [])].map((item) =>
    item.to === "/alerts" ? { ...item, badge: alertBadge } : item,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={`relative flex h-16 shrink-0 items-center ${
          collapsed ? "justify-center" : "gap-3 px-4"
        }`}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="btn-focus absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Close navigation menu"
          >
            <XIcon size={20} />
          </button>
        )}
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/20 bg-white shadow-md sm:flex">
          <Logo size={28} rounded={false} />
        </div>
        <div
          aria-hidden={collapsed}
          className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[180ms] ease-in-out ${
            collapsed
              ? "max-w-0 opacity-0"
              : "max-w-[180px] opacity-100 delay-100"
          }`}
        >
          <p className="text-lg font-bold leading-tight tracking-tight text-black dark:text-white">
            IBVAP
          </p>
          <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
            Border Surveillance
          </p>
        </div>
      </div>

      {/* Expand / collapse control */}
      {onToggleCollapse && (
        <div
          className={`flex h-11 shrink-0 items-center ${
            collapsed ? "justify-center" : "justify-start px-3"
          }`}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`btn-focus flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              collapsed
                ? "border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-[#243247] dark:text-slate-400 dark:hover:bg-[#111C2C] dark:hover:text-slate-200"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#111C2C] dark:hover:text-slate-200"
            }`}
          >
            {collapsed ? <MenuIcon size={17} /> : <ChevronLeftIcon size={17} />}
          </button>
        </div>
      )}

      <div
        className={`shrink-0 border-t border-slate-200 dark:border-[#243247] ${
          collapsed ? "mx-2 my-2" : "mx-3 my-2"
        }`}
      />

      {/* Navigation */}
      <nav
        className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}
        aria-label="Main navigation"
      >
        {items.map((item) => (
          <div key={item.to} onClick={onNavigate}>
            <NavItem item={item} collapsed={collapsed} />
          </div>
        ))}
      </nav>

      {/* System status */}
      <div className="shrink-0 border-t border-slate-200 p-2 dark:border-[#243247]">
        <SystemStatusCard onNavigate={onNavigate} collapsed={collapsed} />
      </div>
    </div>
  );
}
