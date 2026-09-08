// Socket.IO client service.
//
// The application maintains exactly ONE authenticated socket connection
// (per browser session). The socket is created only after the user is
// authenticated; the JWT is sent via the Socket.IO `auth` handshake field
// (never in the URL query string) and is never logged.
//
// Socket.IO's built-in reconnect handles temporary network/backend drops.
// REST remains authoritative for initial page data and for all mutations;
// the socket only delivers incremental realtime updates.

import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

export const SOCKET_EVENTS = {
  CONNECTION_READY: "connection:ready",
  ALERT_NEW: "alert:new",
  ALERT_UPDATED: "alert:updated",
  ALERT_ACKNOWLEDGED: "alert:acknowledged",
  ALERT_RESOLVED: "alert:resolved",
  EVENT_NEW: "event:new",
  EVENT_UPDATED: "event:updated",
  CAMERA_STATUS: "camera:status",
  CAMERA_UPDATED: "camera:updated",
  ZONE_UPDATED: "zone:updated",
  RISK_RULE_UPDATED: "risk-rule:updated",
  SYSTEM_STATUS: "system:status",
  PROFILE_UPDATED: "profile:updated",
  OPERATIONAL_DATA_CLEANED: "operational-data:cleaned",
};

// Socket base URL. Prefer the explicit VITE_WS_URL; otherwise derive the
// origin from the REST base by stripping the "/api" suffix. Never points at
// ".../api" for the socket.
function resolveSocketUrl() {
  const configured = import.meta.env?.VITE_WS_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const base = (API_BASE_URL || "http://localhost:5001/api").replace(/\/+$/, "");
  if (base.endsWith("/api")) return base.slice(0, -"/api".length);
  return base;
}

let socket = null;
let connectToken = null;
const subscriptions = new Map();

function attachSubscriptions(target) {
  subscriptions.forEach((handlers, event) => {
    handlers.forEach((handler) => target.on(event, handler));
  });
}

function flags() {
  return {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
  };
}

/**
 * Open (or return) the single app socket authenticated with `token`.
 * Reusing an existing connected socket is safe; a stale socket is replaced.
 * Returns null if no token is provided (never connects unauthenticated).
 */
export function connect(token) {
  if (!token) return null;
  connectToken = token;

  if (socket && socket.connected) {
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(resolveSocketUrl(), {
    transports: ["websocket", "polling"],
    auth: { token },
    ...flags(),
  });
  // Page effects may subscribe before RealtimeProvider's connection effect
  // runs. Attach that registry to every newly created socket.
  attachSubscriptions(socket);

  return socket;
}

/**
 * Close the socket. Use on logout or when auth is fully cleared.
 */
export function disconnect() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  connectToken = null;
}

/**
 * Register a handler for one socket event. Returns an unsubscribe function
 * so component effects can clean up on unmount (no listener leaks).
 */
export function subscribe(event, handler) {
  if (!subscriptions.has(event)) subscriptions.set(event, new Set());
  const handlers = subscriptions.get(event);
  // A React effect may be replayed in development; a Set plus explicit off
  // prevents duplicate listener registration.
  if (!handlers.has(handler)) {
    handlers.add(handler);
    if (socket) socket.on(event, handler);
  }
  return () => {
    if (socket) socket.off(event, handler);
    handlers.delete(handler);
    if (handlers.size === 0) subscriptions.delete(event);
  };
}

export function unsubscribe(event, handler) {
  if (socket) socket.off(event, handler);
  const handlers = subscriptions.get(event);
  if (handlers) {
    handlers.delete(handler);
    if (handlers.size === 0) subscriptions.delete(event);
  }
}

export function getSocket() {
  return socket;
}

// connected | connecting | disconnected | failed
export function getStatus() {
  if (!socket) return "disconnected";
  if (socket.connected) return "connected";
  if (socket.disconnected) return "disconnected";
  return "connecting";
}

export { resolveSocketUrl };
