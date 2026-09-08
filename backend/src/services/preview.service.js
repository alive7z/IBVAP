const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const env = require("../config/env");
const logger = require("../utils/logger");

// Browser-compatible live preview delivered through the backend ONLY. The
// browser never talks to the Python AI service directly and never receives raw
// RTSP. An authenticated client exchanges a short-lived HMAC token for an MJPEG
// URL; the backend then proxies the Python internal preview stream.

const signToken = (cameraCode, expiryMs) => {
  const payload = `${cameraCode}.${expiryMs}`;
  const sig = crypto
    .createHmac("sha256", env.PREVIEW_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
};

const issuePreviewUrl = (cameraCode) => {
  // Defensive: never sign a token with undefined/null/empty — a caller bug must
  // surface as a controlled error, not as a broken "undefined" preview URL.
  if (!cameraCode || typeof cameraCode !== "string" || cameraCode.trim() === "") {
    throw new Error("Preview token requires a non-empty cameraCode");
  }
  if (!env.PREVIEW_TOKEN_SECRET) {
    throw new Error("PREVIEW_TOKEN_SECRET or JWT_SECRET must be configured");
  }
  const expiryMs = Date.now() + env.PREVIEW_TOKEN_TTL_SECONDS * 1000;
  const token = signToken(cameraCode, expiryMs);
  return `/api/preview/${token}`;
};

// Validate a token and return the cameraCode it authorizes (or null).
const resolveToken = (token) => {
  if (!env.PREVIEW_TOKEN_SECRET || !token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const sep = payload.lastIndexOf(".");
  if (sep === -1) return null;
  const cameraCode = payload.slice(0, sep);
  const expiryMs = Number(payload.slice(sep + 1));
  if (!cameraCode || !Number.isFinite(expiryMs)) return null;
  if (Date.now() > expiryMs) return null;

  const expectedSig = crypto
    .createHmac("sha256", env.PREVIEW_TOKEN_SECRET)
    .update(`${cameraCode}.${expiryMs}`)
    .digest("base64url");

  // Constant-time comparison.
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return cameraCode;
};

// Stream the Python internal MJPEG preview to the caller's response.
// Returns { started: boolean } or { started: false, error }.
const proxyMJPEG = (res, cameraCode) => {
  let upstreamUrl;
  try {
    upstreamUrl = new URL(env.AI_INTERNAL_URL);
  } catch (e) {
    logger.error(`Invalid AI_INTERNAL_URL: ${e.message}`);
    return { started: false, error: "ai_url_invalid" };
  }

  if (!env.PREVIEW_ENABLED) {
    return { started: false, error: "preview_disabled" };
  }

  const path = `/internal/preview/${encodeURIComponent(cameraCode)}`;
  const lib = upstreamUrl.protocol === "https:" ? https : http;

  // If the upstream neither responds nor streams within this window, it is not
  // live — fail the preview instead of hanging the browser connection forever.
  let upstreamReq;
  let stallTimer = null;
  let downstreamClosed = false;
  const clearStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  };
  const armStallTimer = () => {
    clearStallTimer();
    stallTimer = setTimeout(() => {
      if (upstreamReq) upstreamReq.destroy();
      if (!res.headersSent && res.status) {
        res.status(502).json({ success: false, message: "Preview unavailable" });
      } else if (!res.writableEnded) {
        res.end();
      }
    }, 8000);
    stallTimer.unref();
  };

  upstreamReq = lib.get(
    {
      host: upstreamUrl.hostname,
      port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
      path,
      method: "GET",
    },
    (upstreamRes) => {
      const contentType = upstreamRes.headers["content-type"] || "";
      if (upstreamRes.statusCode !== 200) {
        logger.warn(`Preview upstream responded ${upstreamRes.statusCode}`);
        clearStallTimer();
        if (!res.headersSent) {
          res.status(502).json({ success: false, message: "Preview unavailable" });
          upstreamRes.resume();
        }
        return;
      }
      if (!contentType.includes("multipart/x-mixed-replace")) {
        logger.warn(`Preview upstream content-type ${contentType}`);
        clearStallTimer();
        if (!res.headersSent) {
          res.status(502).json({ success: false, message: "Preview format unsupported" });
          upstreamRes.resume();
        }
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentType,
        // The React app is served from a different local origin. Override
        // Helmet's default only for this validated, token-gated MJPEG stream.
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      upstreamRes.on("data", (chunk) => {
        // Each real chunk proves liveness and extends the watchdog. A stream
        // that later stalls is released instead of occupying a proxy forever.
        armStallTimer();
        if (res.writableEnded) return;
        res.write(chunk);
      });
      upstreamRes.on("error", (err) => {
        if (!downstreamClosed) logger.warn(`Preview upstream error: ${err.message}`);
        clearStallTimer();
        if (!res.writableEnded) res.end();
      });
      upstreamReq.on("close", () => {
        clearStallTimer();
        upstreamRes.destroy();
      });
    }
  );

  upstreamReq.on("error", (err) => {
    logger.warn(`Preview upstream connection failed: ${err.message}`);
    clearStallTimer();
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: "Preview unavailable" });
    } else {
      res.end();
    }
  });

  armStallTimer();
  reqOnClose(res, () => {
    downstreamClosed = true;
    clearStallTimer();
    upstreamReq.destroy();
  });
  return { started: true };
};

const reqOnClose = (res, fn) => {
  res.on("close", fn);
  res.on("error", fn);
};

module.exports = { issuePreviewUrl, resolveToken, proxyMJPEG };
