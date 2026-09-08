// Centralized access-token storage.
// The demo app keeps the JWT in sessionStorage (cleared when the tab closes).
// Non-sensitive token key is used consistently by the API client and auth.

const TOKEN_KEY = "ibvap_token";
const USER_KEY = "ibvap_user";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveUser(user) {
  if (user === null || user === undefined) {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export { TOKEN_KEY, USER_KEY };
