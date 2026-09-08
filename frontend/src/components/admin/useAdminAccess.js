import { useAuth } from "../../hooks/useAuth";

const ADMIN_ROLE = "Administrator";
const OPERATOR_ROLE = "Security Operator";
const ANALYST_ROLE = "Auditor / Analyst";

/**
 * Role-aware access model for the Admin area.
 *
 * NOTE: this is a UI convenience only. The real security boundary is the
 * backend API, which must enforce RBAC on every request regardless of what
 * the frontend decides to show.
 *
 * Returns:
 *   role         current user's role label
 *   isAdmin      Administrator (full management)
 *   isReadOnly   Auditor/Analyst or Security Operator (view-only admin data)
 *   canManage    true only for Administrators (create/edit/disable)
 */
export function useAdminAccess() {
  const { user } = useAuth();
  const role = user?.role || OPERATOR_ROLE;
  const isAdmin = role === ADMIN_ROLE;
  const isReadOnly = !isAdmin;
  const canManage = isAdmin;

  return { role, isAdmin, isReadOnly, canManage };
}

export { ADMIN_ROLE, OPERATOR_ROLE, ANALYST_ROLE };
