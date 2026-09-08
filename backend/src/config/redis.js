const env = require("./env");
const logger = require("../utils/logger");
// Redis client. Ephemeral runtime state only — degraded-by-design: an
// unavailable Redis NEVER fails a request or corrupts MySQL. MySQL remains the
// authoritative store for permanent records.
let client = null;
let healthy = false;
let warned = false;

const isEnabled = () => env.REDIS_ENABLED;

const getClient = () => {
  if (!client) {
    const { createClient } = require("redis");
    const connectingClient = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 2000,
        // One bounded attempt per runtime poll. The default infinite reconnect
        // loop keeps tests/process shutdown alive when optional Redis is down.
        reconnectStrategy: false,
      },
    });
    client = connectingClient;
    client.on("error", (err) => {
      healthy = false;
      if (!warned) {
        warned = true;
        logger.warn(`Redis runtime cache unavailable (degraded): ${err.message}`);
      }
    });
    client.on("ready", () => {
      healthy = true;
      logger.info("Redis runtime cache connected");
    });
    client
      .connect()
      .then(() => {
        healthy = true;
      })
      .catch((err) => {
        healthy = false;
        if (client === connectingClient) client = null;
        if (!warned) {
          warned = true;
          logger.warn(`Redis runtime cache connect failed (degraded): ${err.message}`);
        }
      });
  }
  return client;
};

const isHealthy = () => healthy;

const runtimeKey = (cameraCode) =>
  `${env.CAMERA_RUNTIME_KEY_PREFIX}:${cameraCode}:runtime`;

// Read the runtime payload for one camera (null if absent/unavailable/disabled).
const getCameraRuntime = async (cameraCode) => {
  if (!isEnabled()) return null;
  const runtimeClient = getClient();
  if (!isHealthy()) return null;
  try {
    const raw = await runtimeClient.get(runtimeKey(cameraCode));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Redis runtime read degraded: ${err.message}`);
    return null;
  }
};

// Read runtime payloads for all cameras (prefix scan). Never throws.
const getAllRuntime = async () => {
  if (!isEnabled()) return {};
  const runtimeClient = getClient();
  if (!isHealthy()) return {};
  try {
    const keys = await runtimeClient.keys(`${env.CAMERA_RUNTIME_KEY_PREFIX}:*:runtime`);
    if (!keys.length) return {};
    const values = await runtimeClient.mGet(keys);
    const out = {};
    keys.forEach((key, i) => {
      const match = key.match(new RegExp(`^${env.CAMERA_RUNTIME_KEY_PREFIX}:(.*?):runtime$`));
      const cameraCode = match ? match[1] : key;
      if (values[i]) {
        try {
          out[cameraCode] = JSON.parse(values[i]);
        } catch (e) {
          // skip malformed
        }
      }
    });
    return out;
  } catch (err) {
    logger.warn(`Redis runtime scan degraded: ${err.message}`);
    return {};
  }
};

const closeRedis = async () => {
  if (client) {
    try {
      await client.quit();
    } catch (e) {
      // ignore
    }
    client = null;
    healthy = false;
  }
};

// Best-effort removal of a camera's ephemeral runtime entry (camera deleted/
// disabled). Never throws — Redis absence/failure must not break the request.
const clearCameraRuntime = async (cameraCode) => {
  if (!isEnabled()) return;
  const runtimeClient = getClient();
  if (!isHealthy() || !runtimeClient) return;
  try {
    await runtimeClient.del(runtimeKey(cameraCode));
  } catch (err) {
    logger.warn(`Redis runtime clear degraded for ${cameraCode}: ${err.message}`);
  }
};

module.exports = {
  isEnabled,
  isHealthy,
  getClient,
  runtimeKey,
  getCameraRuntime,
  getAllRuntime,
  clearCameraRuntime,
  closeRedis,
};
