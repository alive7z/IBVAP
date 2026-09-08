import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { roleKey } from "../../utils/roles";
import Loader from "./Loader";

/**
 * Guards routes behind authentication. If the user is not logged in they
 * are redirected to /login (their intended destination is remembered so
 * they can be returned there after signing in). While a stored session is
 * being validated via /auth/me (e.g. on a direct URL refresh) a loading state
 * is shown so protected pages are not flashed before auth resolves.
 * Optional `roles` restricts access to users whose backend role is in the list
 * (e.g. ["ADMINISTRATOR"]); others are redirected to /dashboard.
 */
export function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, isChecking, user } = useAuth();
  const location = useLocation();

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-[#0f172a]">
        <Loader label="Checking session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    const to = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${to}`} replace />;
  }

  if (roles && !roles.includes(roleKey(user?.role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return children || <Outlet />;
}

export default ProtectedRoute;
