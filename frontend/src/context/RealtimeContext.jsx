import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { connect, disconnect, subscribe as socketSubscribe, getStatus, SOCKET_EVENTS } from "../services/websocket";
import { useAuth } from "../hooks/useAuth";

const RealtimeContext = createContext(null);

// Server rejects with these messages when the token is unusable. In that case
// stop the connection loop and let the existing REST auth flow handle expiry.
const AUTH_FAILURE_MARKERS = [
  "Authentication required",
  "Invalid or expired token",
  "User no longer exists",
  "Account is not active",
  "Authentication failed",
];

function isAuthFailure(message) {
  return AUTH_FAILURE_MARKERS.some((m) => String(message || "").includes(m));
}

/**
 * Owns the application's SINGLE authenticated Socket.IO connection.
 *
 * Lifecycle:
 *  - after auth (login or /auth/me restore) completes   -> connect(token)
 *  - on logout / token cleared                           -> disconnect()
 *  - socket errors                                        -> reconnect (built-in);
 *     auth failures stop reconnecting (REST owns session expiry)
 *
 * The provider does NOT subscribe to events itself. Pages/components use
 * `useRealtime().subscribe(event, handler)` which returns an unsubscribe.
 */
export function RealtimeProvider({ children }) {
  const { token, isAuthenticated, isChecking, user, refreshUser } = useAuth();

  const [status, setStatus] = useState("disconnected");
  const [operationalDataEpoch, setOperationalDataEpoch] = useState(0);
  const socketRef = useRef(null);
  const subCounter = useRef(0);

  // Connect once the app is authenticated and auth init has finished.
  useEffect(() => {
    if (isChecking) return;
    if (!isAuthenticated || !token) {
      disconnect();
      socketRef.current = null;
      setStatus("disconnected");
      return;
    }

    const socket = connect(token);
    socketRef.current = socket;
    if (!socket || socket.connected) {
      setStatus(getStatus());
      return;
    }

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onConnectError = (err) => {
      if (isAuthFailure(err?.message)) {
        // Don't hammer the server with reconnect attempts for auth errors.
        disconnect();
        socketRef.current = null;
        setStatus("disconnected");
        return;
      }
      setStatus("disconnected");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    setStatus(getStatus());

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [token, isAuthenticated, isChecking]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    return socketSubscribe(SOCKET_EVENTS.PROFILE_UPDATED, (payload) => {
      if (payload?.data?.publicId === user?.publicId) {
        refreshUser().catch(() => {});
      }
    });
  }, [isAuthenticated, user?.publicId, refreshUser]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    return socketSubscribe(SOCKET_EVENTS.OPERATIONAL_DATA_CLEANED, () => {
      setOperationalDataEpoch((value) => value + 1);
    });
  }, [isAuthenticated]);

  const invalidateOperationalData = useCallback(() => {
    setOperationalDataEpoch((value) => value + 1);
  }, []);

  // Fully tear down on unmount (app close).
  useEffect(() => {
    return () => disconnect();
  }, []);

  // Stable subscribe: reads the live socket via ref; returns an unsubscribe.
  const subscribe = useCallback((event, handler) => {
    subCounter.current += 1;
    return socketSubscribe(event, handler);
  }, []);

  const value = useMemo(
    () => ({
      status,
      connected: status === "connected",
      subscribe,
      socket: socketRef.current,
      operationalDataEpoch,
      invalidateOperationalData,
    }),
    [status, subscribe, operationalDataEpoch, invalidateOperationalData]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

export default RealtimeContext;
