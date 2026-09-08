const env = require("./env");
const ApiError = require("../utils/ApiError");

// Allowed browser origins. The canonical origin is FRONTEND_URL, but a local
// dev browser may reach the backend from any loopback alias of the Vite dev
// server (localhost / 127.0.0.1 / [::1]) which share the same localhost:5173
// origin. Always duplicating FRONTEND_URL into these would be wrong for
// non-local FRONTEND_URL values, so only add the loopback variants when the
// base origin truly is the local dev host.
function expandLocalOrigin(origin) {
  let hostname = "";
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return [];
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  if (!loopback.has(hostname)) return [];
  const devPorts = new Set(["5173", "4173"]);
  const port = new URL(origin).port;
  if (!devPorts.has(port)) return [];
  return [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
  ];
}

const allowedOrigins = new Set([env.FRONTEND_URL, ...expandLocalOrigin(env.FRONTEND_URL)]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new ApiError(403, "Origin not allowed"));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

module.exports = corsOptions;
