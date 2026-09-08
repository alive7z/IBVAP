import { useAuth as useAuthContext } from "../context/AuthContext";

/**
 * Convenience wrapper around AuthContext for components that only need
 * auth state. See AuthContext.jsx for the full API ({ user, token, status,
 * isAuthenticated, login, logout }).
 */
export function useAuth() {
  return useAuthContext();
}

export default useAuth;
