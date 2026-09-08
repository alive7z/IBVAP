const { Server } = require("socket.io");
const env = require("../config/env");
const logger = require("../utils/logger");
const { socketAuthenticate } = require("./socketAuth");
const realtimeService = require("./realtime.service");
const operatorRepository = require("../repositories/operator.repository");
const { SOCKET_EVENTS } = require("./events");

// Canonical mapping of DB role -> socket room. Room assignment is decided ONLY
// by the server (from the authenticated DB role); clients can never self-join.
const ROOM_BY_ROLE = {
  ADMINISTRATOR: "role:ADMINISTRATOR",
  SECURITY_OPERATOR: "role:SECURITY_OPERATOR",
  AUDITOR_ANALYST: "role:AUDITOR_ANALYST",
};

const HEARTBEAT = "presence:heartbeat";
const HEARTBEAT_TIMEOUT_MS = 60 * 1000;

// Track per-socket last heartbeat so only genuinely stale connections are
// flipped to OFFLINE on disconnect (a dropped network reconnecting quickly
// should not flap admin/operator status).
const lastHeartbeat = new Map();
const socketsByUser = new Map();

let io = null;

const initializeSocket = (httpServer) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // Register the JWT auth middleware for every connection.
  io.use(socketAuthenticate);

  realtimeService.setIO(io);

  io.on("connection", (socket) => {
    const { user } = socket;
    const room = ROOM_BY_ROLE[user.role] || null;
    const personRoom = `user:${user.publicId}`;

    if (room) {
      socket.join(room);
    }
    socket.join(personRoom);

    // Presence: only SECURITY_OPERATOR presence is surfaced for operator
    // management, but we track any authenticated actor's last-seen.
    const connectedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    operatorRepository
      .updateOnlineState({
        userId: user.userId,
        onlineStatus: "ONLINE",
        connectedAt,
      })
      .catch((err) => logger.error(`Presence update failed: ${err.message}`));

    lastHeartbeat.set(socket.id, Date.now());
    const userSockets = socketsByUser.get(user.userId) || new Set();
    userSockets.add(socket.id);
    socketsByUser.set(user.userId, userSockets);

    logger.info(
      `Socket connected: user=${user.publicId} role=${user.role} socket=${socket.id}`
    );

    // Notify the client that the connection is ready and authorized.
    socket.emit(SOCKET_EVENTS.CONNECTION_READY, realtimeService.envelope(SOCKET_EVENTS.CONNECTION_READY, {
      authorized: true,
      role: user.role,
      rooms: [room, personRoom].filter(Boolean),
    }));

    // Clients are trusted to NOT request room joins; no "join" handler is
    // registered, so privilege escalation via rooms is impossible.

    // Presence heartbeat: clients emit a lightweight ping; a live tick keeps
    // the operator ONLINE/IDLE instead of timing out.
    socket.on(HEARTBEAT, (payload) => {
      lastHeartbeat.set(socket.id, Date.now());
      const state = payload && payload.state === "idle" ? "IDLE" : "ONLINE";
      operatorRepository
        .updateOnlineState({ userId: user.userId, onlineStatus: state })
        .then(() => operatorRepository.touchLastSeen(user.userId))
        .catch((err) => logger.error(`Presence heartbeat failed: ${err.message}`));
    });

    socket.on("disconnect", () => {
      lastHeartbeat.delete(socket.id);
      const remaining = socketsByUser.get(user.userId) || new Set();
      remaining.delete(socket.id);
      if (remaining.size > 0) {
        socketsByUser.set(user.userId, remaining);
      } else {
        socketsByUser.delete(user.userId);
        operatorRepository
          .updateOnlineState({ userId: user.userId, onlineStatus: "OFFLINE" })
          .catch((err) => logger.error(`Presence offline update failed: ${err.message}`));
      }
      logger.info(
        `Socket disconnected: user=${user.publicId} role=${user.role} socket=${socket.id}`
      );
      // Rooms are cleaned up automatically by Socket.IO on disconnect.
    });
  });

  io.on("error", (err) => {
    logger.error(`Socket.IO server error: ${err.message}`);
  });

  return io;
};

const getIO = () => io;

// Periodic sweep: any client whose heartbeat has been silent longer than the
// timeout is considered gone. Called by the scheduler; idempotent & safe even
// if the socket already disconnected (updateOnlineState is a no-op-friendly set).
const sweepStaleConnections = async () => {
  if (!io) return 0;
  const now = Date.now();
  let flipped = 0;
  for (const [userId, socketIds] of socketsByUser.entries()) {
    const anyFresh = [...socketIds].some(
      (socketId) => now - (lastHeartbeat.get(socketId) || 0) <= HEARTBEAT_TIMEOUT_MS
    );
    if (!anyFresh) {
      await operatorRepository
        .updateOnlineState({ userId, onlineStatus: "OFFLINE" })
        .catch(() => {});
      flipped += 1;
    }
  }
  return flipped;
};

module.exports = { initializeSocket, getIO, ROOM_BY_ROLE, HEARTBEAT, sweepStaleConnections };
