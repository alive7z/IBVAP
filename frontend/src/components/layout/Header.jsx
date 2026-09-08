import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BellIcon,
  ChevronDownIcon,
  GlobeIcon,
  LogOutIcon,
  MenuIcon,
  UserIcon,
  SettingsIcon,
  ExternalLinkIcon,
} from "../common/Icons";
import Tooltip from "../common/Tooltip";
import Logo from "../common/Logo";
import { useAuth } from "../../hooks/useAuth";
import { SUPPORTED_LANGUAGES } from "../../hooks/useLanguage";
import { getAlerts, getAlertsSummary } from "../../services/alertApi";
import { useRealtime } from "../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../services/websocket";

const severityTag = (severity) => {
  if (severity === "CRITICAL") return "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40";
  if (severity === "HIGH") return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/40";
  if (severity === "MEDIUM") return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40";
  return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600";
};

const relativeTime = (value) => {
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

function ProfileDropdown({ onLogout }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const displayName = user?.fullName || user?.name || "—";
  const roleLabelText = user?.role || "—";
  const isAdmin = user?.roleKey === "ADMINISTRATOR";

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-focus flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-white dark:bg-blue-700">
          <UserIcon size={16} />
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-800 dark:text-slate-100">
            {displayName}
          </span>
          <span className="block text-xs leading-tight text-slate-500 dark:text-slate-400">
            {roleLabelText}
          </span>
        </span>
        <ChevronDownIcon size={16} className="text-slate-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-44 animate-[dropdownIn_0.16s_ease-out] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {displayName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {roleLabelText}
            </p>
          </div>
          <button
            role="menuitem"
            className="btn-focus flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/20"
            onClick={() => {
              setOpen(false);
              navigate("/profile");
            }}
          >
            <UserIcon size={16} /> Profile
          </button>
          {isAdmin && <button
            role="menuitem"
            className="btn-focus flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/20"
            onClick={() => {
              setOpen(false);
              navigate("/admin");
            }}
          >
            <SettingsIcon size={16} /> Preferences
          </button>}
          <button
            role="menuitem"
            className="btn-focus flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-500/10"
            onClick={onLogout}
          >
            <LogOutIcon size={16} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

function LanguageSelect({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-focus flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <GlobeIcon size={16} />
        <span className="hidden md:inline">{current.label}</span>
        <ChevronDownIcon size={14} className="text-slate-400" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-40 mt-2 w-32 animate-[dropdownIn_0.16s_ease-out] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              role="option"
              aria-selected={l.code === lang}
              className={`btn-focus flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/20 ${
                l.code === lang
                  ? "font-medium text-blue-700 dark:text-blue-500"
                  : "text-slate-700 dark:text-slate-200"
              }`}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationPanel({ notifications, unreadCount, error, setOpen, ref }) {
  const navigate = useNavigate();
  return (
    <div
      className="absolute right-0 top-full z-40 mt-2 w-[360px] max-w-[calc(100vw-2rem)] animate-[dropdownIn_0.16s_ease-out] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
      ref={ref}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Notifications
        </p>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-500">
          {unreadCount == null ? "—" : unreadCount} active
        </span>
      </div>
      <div className="max-h-72 overflow-auto">
        {notifications.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            {error ? "Unable to load notifications." : "No active alerts."}
          </p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            className="btn-focus w-full border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-[#162235]"
            onClick={() => {
              setOpen(false);
              navigate("/alerts");
            }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityTag(n.severity)}`}
              >
                {n.severity}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">
                {relativeTime(n.timestamp)}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
              {String(n.eventType || "Security alert").replace(/_/g, " ")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {n.camera || "Camera unavailable"}
            </p>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          navigate("/alerts");
        }}
        className="btn-focus flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-slate-800 dark:text-blue-500 dark:hover:bg-white/20"
      >
        <ExternalLinkIcon size={15} /> View All Alerts
      </button>
    </div>
  );
}

export function Header({ onMenuClick, lang, setLang }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(null);
  const [notificationError, setNotificationError] = useState(false);
  const notifRef = useRef(null);
  const { subscribe } = useRealtime();

  const loadNotifications = React.useCallback(() => {
    if (!user) return;
    Promise.all([
      getAlerts({ limit: 5, sort: "created_at:desc" }),
      getAlertsSummary(),
    ]).then(([list, summary]) => {
      setNotificationError(false);
      setNotifications(
        (list.data || []).filter((a) => ["new", "active"].includes(a.status)).slice(0, 5)
      );
      setUnreadCount(Number(summary.data?.totalActive || 0));
    }).catch(() => {
      setNotifications([]);
      setUnreadCount(null);
      setNotificationError(true);
    });
  }, [user]);

  useEffect(loadNotifications, [loadNotifications]);

  useEffect(() => {
    const refresh = () => loadNotifications();
    const offs = [
      subscribe(SOCKET_EVENTS.ALERT_NEW, refresh),
      subscribe(SOCKET_EVENTS.ALERT_UPDATED, refresh),
      subscribe(SOCKET_EVENTS.ALERT_ACKNOWLEDGED, refresh),
      subscribe(SOCKET_EVENTS.ALERT_RESOLVED, refresh),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe, loadNotifications]);

  useEffect(() => {
    if (!notifOpen) return;
    const close = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setNotifOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [notifOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="sticky top-0 z-20">
      <header
        className="flex h-16 items-center justify-between border-b border-slate-200 px-4 transition-colors lg:px-4"
        style={{
          background:
            "linear-gradient(90deg, #FF9933 0%, #FFD6AD 22%, #FFFFFF 45%, #FFFFFF 55%, #D8F0D8 78%, #138808 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMenuClick}
            className="btn-focus rounded-lg p-2 text-slate-600 transition-colors hover:bg-white/50 lg:hidden"
            aria-label="Open navigation menu"
          >
            <MenuIcon size={20} />
          </button>

          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/20 bg-white shadow-md sm:flex">
            <Logo size={28} rounded={false} />
          </div>

          <div>
            <h1 className="text-base font-semibold leading-tight text-slate-900">
              IBVAP – Intelligent Border Video Analytics Platform
            </h1>

            <p className="text-xs text-slate-600">
              Border Surveillance Command Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 lg:gap-2">
          <LanguageSelect lang={lang} setLang={setLang} />

          <div className="relative">
            <Tooltip label="Notifications" side="bottom">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="btn-focus relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/50 hover:text-slate-900"
                aria-label="Notifications"
                aria-expanded={notifOpen}
              >
                <BellIcon size={19} />

                {Number(unreadCount) > 0 && <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
                </span>}
              </button>
            </Tooltip>

            {notifOpen && (
              <NotificationPanel
                ref={notifRef}
                notifications={notifications}
                unreadCount={unreadCount}
                error={notificationError}
                setOpen={setNotifOpen}
              />
            )}
          </div>

          <ProfileDropdown onLogout={handleLogout} />
        </div>
      </header>
      <div className="h-px w-full bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}
