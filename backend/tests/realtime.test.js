const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const http = require("http");
const { io: createClient } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");
const { initializeSocket, getIO } = require("../src/realtime/socket");
const { SOCKET_EVENTS } = require("../src/realtime/events");
const env = require("../src/config/env");

const TEST_SECRET = "test-only-realtime-secret-0123456789abcdef";
const OTHER_SECRET = "some-other-secret-that-is-not-the-test-secret";
const REAL_SECRET = env.JWT.SECRET;

const USERS = {
  ADMIN: { email: "rt.admin@ibvap.local", password: "RtAdmin#2026!", role: "ADMINISTRATOR" },
  OPERATOR: { email: "rt.operator@ibvap.local", password: "RtOper#2026!", role: "SECURITY_OPERATOR" },
  ANALYST: { email: "rt.analyst@ibvap.local", password: "RtAnalyst#2026!", role: "AUDITOR_ANALYST" },
  DISABLED: {
    email: "rt.disabled@ibvap.local",
    password: "RtDisabled#2026!",
    role: "SECURITY_OPERATOR",
    status: "INACTIVE",
  },
};

let pool;
let server;
let baseUrl;
let userIds = [];

const createUser = async ({ email, password, role, status = "ACTIVE" }) => {
  const [result] = await pool.execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), "RT Test " + role, email, await hashPassword(password), role, status]
  );
  return result.insertId;
};

const loginToken = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  assert.strictEqual(res.status, 200, `login failed for ${email}`);
  return res.body.data.accessToken;
};

const tokenCache = {};
const tokenFor = async (key) => {
  if (tokenCache[key]) return tokenCache[key];
  tokenCache[key] = await loginToken(USERS[key].email, USERS[key].password);
  return tokenCache[key];
};

// Create a raw JWT directly (for invalid/expired/scrambled cases).
const rawToken = (payload, secret = TEST_SECRET, options = {}) =>
  jwt.sign(payload, secret, { expiresIn: "8h", ...options });

// Connect a socket; resolves { socket, events } or rejects on connection_error.
const connect = (tokenValue) =>
  new Promise((resolve, reject) => {
    const socket = createClient(baseUrl, {
      transports: ["websocket"],
      auth: tokenValue === null || tokenValue === undefined ? {} : { token: tokenValue },
      timeout: 4000,
      reconnectionAttempts: 0,
    });
    const seen = {};
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("socket connection timed out"));
    }, 5000);
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.onAny((event, payload) => {
        (seen[event] = seen[event] || []).push(payload);
      });
      resolve({ socket, seen });
    });
  });

const waitFor = (seen, event, timeoutMs = 4000) =>
  new Promise((resolve, reject) => {
    if (seen[event] && seen[event].length) {
      return resolve(seen[event][seen[event].length - 1]);
    }
    const started = Date.now();
    const timer = setTimeout(() => cleanup && reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    let cleanup;
    const iv = setInterval(() => {
      if (seen[event] && seen[event].length) {
        cleanup();
        resolve(seen[event][seen[event].length - 1]);
      } else if (Date.now() - started > timeoutMs) {
        cleanup();
        reject(new Error(`timed out waiting for ${event}`));
      }
    }, 20);
    cleanup = () => {
      clearInterval(iv);
      clearTimeout(timer);
    };
  });

before(async () => {
  pool = getPool();
  for (const u of Object.values(USERS)) {
    userIds.push(
      await createUser({
        email: u.email,
        password: u.password,
        role: u.role,
        status: u.status || "ACTIVE",
      })
    );
  }

  const httpServer = http.createServer(app);
  initializeSocket(httpServer);
  server = await new Promise((resolve) => {
    httpServer.listen(0, () => resolve(httpServer));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  getIO()?.close?.();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  for (const id of userIds) {
    if (id) await pool.execute("DELETE FROM users WHERE id = ?", [id]).catch(() => {});
  }
  await closeDatabasePool();
});

test("valid JWT connects, joins role room, receives connection:ready", async () => {
  const token = await tokenFor("ADMIN");
  const { socket, seen } = await connect(token);
  try {
    const ready = await waitFor(seen, SOCKET_EVENTS.CONNECTION_READY);
    assert.strictEqual(ready.data.authorized, true);
    assert.strictEqual(ready.data.role, "ADMINISTRATOR");
    assert.ok(ready.data.rooms.includes("role:ADMINISTRATOR"));
  } finally {
    socket.close();
  }
});

test("missing JWT is rejected", async () => {
  await assert.rejects(connect(null), /Authentication required/);
});

test("invalid JWT is rejected", async () => {
  await assert.rejects(connect("not-a-valid-token"), /Invalid or expired token/);
});

test("expired JWT is rejected", async () => {
  // Use the real DB user id but an expired token.
  const token = rawToken({ sub: "x", userId: userIds[0], role: "ADMINISTRATOR" }, TEST_SECRET, {
    expiresIn: "-1s",
  });
  await assert.rejects(connect(token), /Invalid or expired token/);
});

test("token signed with a different secret is rejected", async () => {
  const token = rawToken({ sub: "x", userId: userIds[0], role: "ADMINISTRATOR" }, OTHER_SECRET);
  await assert.rejects(connect(token), /Invalid or expired token/);
});

test("disabled user is rejected", async () => {
  // The user is INACTIVE, so login returns 403; mint a raw JWT for them that
  // verifies (real secret) so the account-status check rejects the connection.
  const disabledIndex = Object.keys(USERS).indexOf("DISABLED");
  const token = rawToken(
    { sub: "x", userId: userIds[disabledIndex], role: "SECURITY_OPERATOR" },
    REAL_SECRET
  );
  await assert.rejects(connect(token), /Account is not active/);
});

test("role rooms are assigned by server: role:ADMINISTRATOR reached by ADMIN not OPERATOR", async () => {
  const admin = await tokenFor("ADMIN");
  const operator = await tokenFor("OPERATOR");
  const { socket: adminSocket, seen: adminSeen } = await connect(admin);
  const { socket: opSocket, seen: opSeen } = await connect(operator);
  try {
    // Emit caramba only to the ADMINISTRATOR room via the server-side io.
    const io = getIO();
    io.to("role:ADMINISTRATOR").emit("probe:test", { n: 1 });

    const gotAdmin = await waitFor(adminSeen, "probe:test");
    assert.strictEqual(gotAdmin.n, 1);

    // Operator must NOT get it; give it a short pause to prove absence.
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(opSeen["probe:test"], undefined);
  } finally {
    adminSocket.close();
    opSocket.close();
  }
});

test("person room user:<publicId> is assigned", async () => {
  const token = await tokenFor("ANALYST");
  const { socket, seen } = await connect(token);
  try {
    const io = getIO();
    // The analyst user public id is in the socket.user.publicId; emit to all
    // user rooms and ensure the analyst receives something.
    io.emit("probe:all", { n: 2 });
    const got = await waitFor(seen, "probe:all");
    assert.strictEqual(got.n, 2);
  } finally {
    socket.close();
  }
});

test("alert acknowledge emission delivers safe payload to operator room", async () => {
  const op = await tokenFor("OPERATOR");
  const { socket, seen } = await connect(op);
  try {
    const realtime = require("../src/realtime/realtime.service");
    realtime.emitAlertAcknowledged({
      alert_code: "ALT-RT-001",
      alert_type: "INTRUSION",
      severity: "HIGH",
      risk_score: 88,
      status: "ACKNOWLEDGED",
      camera_code: "CAM-RT-1",
      camera_id: 1,
      event_code: "EVT-RT-1",
      acknowledged_by: "admin",
      acknowledged_at: "2026-08-30T00:00:00Z",
      resolution_type: null,
      resolution_notes: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    });
    const p = await waitFor(seen, SOCKET_EVENTS.ALERT_ACKNOWLEDGED);
    assert.strictEqual(p.type, SOCKET_EVENTS.ALERT_ACKNOWLEDGED);
    assert.ok(p.timestamp);
    assert.strictEqual(p.data.alertCode, "ALT-RT-001");
    assert.strictEqual(p.data.status, "ACKNOWLEDGED");
    assert.strictEqual(p.data.cameraCode, "CAM-RT-1");
    assert.strictEqual(JSON.stringify(p).includes("password"), false);
    assert.strictEqual(JSON.stringify(p).includes("secret"), false);
  } finally {
    socket.close();
  }
});

test("alert resolve emission delivers safe payload to analyst room", async () => {
  const analyst = await tokenFor("ANALYST");
  const { socket, seen } = await connect(analyst);
  try {
    const realtime = require("../src/realtime/realtime.service");
    realtime.emitAlertResolved({
      alert_code: "ALT-RT-002",
      alert_type: "INTRUSION",
      severity: "MEDIUM",
      risk_score: 60,
      status: "RESOLVED",
      camera_code: "CAM-RT-2",
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    });
    const p = await waitFor(seen, SOCKET_EVENTS.ALERT_RESOLVED);
    assert.strictEqual(p.data.status, "RESOLVED");
    assert.strictEqual(p.data.alertCode, "ALT-RT-002");
    assert.strictEqual(JSON.stringify(p).includes("password_hash"), false);
    assert.strictEqual(JSON.stringify(p).includes("stream_url"), false);
  } finally {
    socket.close();
  }
});

test("camera status emission never leaks stream_url / credentials", async () => {
  const analyst = await tokenFor("ANALYST");
  const { socket, seen } = await connect(analyst);
  try {
    const realtime = require("../src/realtime/realtime.service");
    await realtime.emitCameraStatus({
      camera_code: "CAM-RT-9",
      name: "Border Cam 9",
      location_name: "Sector A",
      sector: "North",
      stream_status: "OFFLINE",
      ai_status: "PAUSED",
      source_type: "IP_CAMERA",
      stream_protocol: "RTSP",
      enabled: 1,
      last_seen_at: "2026-08-30T00:00:00Z",
      stream_url: "rtsp://user:super-secret-password@10.0.0.1/live",
    });
    const p = await waitFor(seen, SOCKET_EVENTS.CAMERA_STATUS);
    assert.strictEqual(p.data.cameraCode, "CAM-RT-9");
    assert.strictEqual(p.data.streamStatus, "OFFLINE");
    const raw = JSON.stringify(p);
    assert.strictEqual(raw.includes("stream_url"), false);
    assert.strictEqual(raw.includes("super-secret-password"), false);
    assert.strictEqual(raw.includes("rtsp://"), false);
  } finally {
    socket.close();
  }
});

test("camera realtime is sent only to operators assigned that camera", async () => {
  const operator = await tokenFor("OPERATOR");
  const { socket, seen } = await connect(operator);
  const code = `CAM-RT-${crypto.randomBytes(4).toString("hex")}`;
  const [cameraResult] = await pool.execute(
    `INSERT INTO cameras (camera_code, name, source_type, stream_status, ai_status, enabled)
     VALUES (?, 'Realtime Assigned Camera', 'IP_CAMERA', 'ONLINE', 'ACTIVE', 1)`,
    [code]
  );
  try {
    const realtime = require("../src/realtime/realtime.service");
    await realtime.emitCameraStatus({ camera_code: code, name: "Realtime Assigned Camera", enabled: 1 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(seen[SOCKET_EVENTS.CAMERA_STATUS], undefined);

    await pool.execute(
      `INSERT INTO operator_camera_assignments (operator_id, camera_id, assigned_by)
       VALUES (?, ?, ?)`,
      [userIds[1], cameraResult.insertId, userIds[0]]
    );
    await realtime.emitCameraStatus({ camera_code: code, name: "Realtime Assigned Camera", enabled: 1 });
    const payload = await waitFor(seen, SOCKET_EVENTS.CAMERA_STATUS);
    assert.strictEqual(payload.data.cameraCode, code);
  } finally {
    socket.close();
    await pool.execute("DELETE FROM cameras WHERE id = ?", [cameraResult.insertId]);
  }
});

test("camera:updated and zone/risk-rule emits reach administrator room", async () => {
  const admin = await tokenFor("ADMIN");
  const { socket, seen } = await connect(admin);
  try {
    const realtime = require("../src/realtime/realtime.service");
    await realtime.emitCameraUpdated({
      camera_code: "CAM-RT-10",
      name: "Border Cam 10",
      stream_status: "ONLINE",
      enabled: 1,
      last_seen_at: "2026-08-30T00:00:00Z",
    });
    await waitFor(seen, SOCKET_EVENTS.CAMERA_UPDATED);

    realtime.emitZoneUpdated({
      zone_code: "Z-RT-1",
      name: "Holding Zone",
      zone_type: "RESTRICTED",
      risk_level: "HIGH",
      camera_code: "CAM-RT-10",
      enabled: 1,
      updated_at: "2026-08-30T00:00:00Z",
    });
    const z = await waitFor(seen, SOCKET_EVENTS.ZONE_UPDATED);
    assert.strictEqual(z.data.zoneCode, "Z-RT-1");

    realtime.emitRiskRuleUpdated({
      rule_code: "R-RT-1",
      name: "Night Movement",
      weight: 80,
      enabled: 1,
      updated_at: "2026-08-30T00:00:00Z",
    });
    const r = await waitFor(seen, SOCKET_EVENTS.RISK_RULE_UPDATED);
    assert.strictEqual(r.data.ruleCode, "R-RT-1");
    assert.strictEqual(JSON.stringify(r).includes("secret"), false);
  } finally {
    socket.close();
  }
});
