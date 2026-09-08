import { useRealtime } from "../context/RealtimeContext";

/**
 * Convenience wrapper around RealtimeContext for components that need live
 * updates. Returns:
 *   { status, connected, subscribe }
 *
 * `subscribe(event, handler)` returns an unsubscribe function; call it in your
 * effect cleanup so listeners are never duplicated across remounts.
 */
export function useWebSocket() {
  return useRealtime();
}

export default useWebSocket;