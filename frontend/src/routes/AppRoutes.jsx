import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { RealtimeProvider } from "../context/RealtimeContext";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import ProtectedRoute from "../components/common/ProtectedRoute";
import ErrorBoundary from "../components/common/ErrorBoundary";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import LiveSurveillance from "../pages/LiveSurveillance";
import CameraDetails from "../pages/CameraDetails";
import Alerts from "../pages/Alerts";
import AlertDetails from "../pages/AlertDetails";
import Events from "../pages/Events";
import EventDetails from "../pages/EventDetails";
import Intelligence from "../pages/Intelligence";
import BorderMap from "../pages/BorderMap";
import Analytics from "../pages/Analytics";
import Admin, { OperatorConsole } from "../pages/Admin";
import Profile from "../pages/Profile";

/**
 * App route tree. Public: /login. Everything else is protected and rendered
 * inside the dashboard layout.
 */
export default function AppRoutes() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/surveillance" element={<LiveSurveillance />} />
              <Route path="/surveillance/:cameraId" element={<CameraDetails />} />
              <Route path="/alerts" element={<ErrorBoundary message="Unable to load alerts."><Alerts /></ErrorBoundary>} />
              <Route path="/alerts/:alertId" element={<ErrorBoundary message="Unable to load alert details."><AlertDetails /></ErrorBoundary>} />
              <Route path="/events" element={<ErrorBoundary message="Unable to load events."><Events /></ErrorBoundary>} />
              <Route path="/events/:eventId" element={<ErrorBoundary message="Unable to load event details."><EventDetails /></ErrorBoundary>} />
              <Route path="/intelligence" element={<Intelligence />} />
              <Route path="/map" element={<BorderMap />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/profile" element={<Profile />} />
              <Route
                path="/operator"
                element={
                  <ProtectedRoute roles={["SECURITY_OPERATOR"]}>
                    <OperatorConsole />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={["ADMINISTRATOR"]}>
                    <Admin />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </RealtimeProvider>
    </AuthProvider>
  );
}
