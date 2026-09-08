// Central API client.
// All frontend requests should go through this module (or dedicated services
// that use it). It talks to the real Node.js + Express REST API.
//
// - Base URL comes from VITE_API_BASE_URL (backend base that includes "/api",
//   e.g. http://localhost:5001/api).
// - Adds the Authorization: Bearer <accessToken> header when authenticated.
// - Returns the backend { success, message, data } envelope so pages keep
//   using `res.data`; dedicated service adapters map `data` into the shape
//   the components expect.
// - Normalizes errors into { status, message } for consistent UI handling.

import { getToken, clearToken, saveUser } from "../utils/token";

export const AUTH_UNAUTHORIZED_EVENT = "ibvap:auth-unauthorized";

const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:5001/api"
).replace(/\/+$/, "");

// Some services pass paths already starting with "/api". The base URL also
// ends with "/api" (per env). Collapse to avoid "/api/api/...".
function buildUrl(path) {
  let p = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL.endsWith("/api") && p.startsWith("/api")) {
    p = p.slice("/api".length) || "/";
  }
  return `${API_BASE_URL}${p}`;
}

// Normalize an arbitrary thrown value into { status, message } JSON-safe shape.
export function toApiError(err) {
  if (err && err.__normalized) return err;
  const normalized = { status: err?.status || 0, message: (err?.message) || "Unexpected error" };
  normalized.__normalized = true;
  return normalized;
}

// Called when the current session token is no longer valid (expired/revoked).
function handleUnauthorized(failedToken) {
  // A request started under an older session can finish after a new login.
  // Never let that stale 401 erase the newly issued token.
  if (!failedToken || getToken() !== failedToken) return;

  try {
    clearToken();
    saveUser(null);
  } catch {
    /* ignore storage errors */
  }
  // Let AuthProvider update React state. ProtectedRoute then performs a normal
  // client-side navigation, avoiding a full-page refresh and redirect loops.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
  }
}

async function liveRequest(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(buildUrl(url), {
      ...options,
      headers,
    });
  } catch (netErr) {
    const err = new Error(
      "Unable to reach the server. Check your connection and try again."
    );
    err.status = 0;
    err.__normalized = true;
    throw err;
  }

  const isLogin = url.includes("/auth/login");

  if (res.status === 401 && !isLogin) {
    handleUnauthorized(token);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = new Error(body?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = body?.errors || [];
    err.__normalized = true;
    throw err;
  }

  // Return the backend envelope; service adapters map `data` to the shape the
  // components expect (pages keep reading `res.data`).
  return body || { success: true, data: null };
}

export const request = (url, options = {}) => liveRequest(url, options);
export { buildUrl, API_BASE_URL };
export default request;
